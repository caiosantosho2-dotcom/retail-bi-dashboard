-- Views do painel, numa conexão em memória com o banco do RAG anexado como `origem` (somente leitura).
-- Nada aqui altera o banco do RAG. Só métricas que o RAG não tem; as fórmulas de faturamento, desconto e valor
-- bruto continuam as de origem.vw_vendas_item. Cada view diz a definição de negócio e o grão.
--
-- Carregado antes deste arquivo (scripts/exportar_dados.py):
--   painel.parametros(chave, valor)                      limiar do modelo, cortes, mínimos e janelas
--   painel.rag_segmento_cliente(household_key, segmento) atribuição do RFM do RAG
--   painel.rag_risco_cliente(household_key, prob)        probabilidade de pausa longa do modelo do RAG
--   painel.rag_clv_segmento(segmento, clv_medio, valor_medio)
--   painel.rag_segmentos(segmento, ordem, households, valor_total, ticket_medio, desconto_mediano_pct)
--   painel.periodos, painel.janela_cesta                  (painel_periodos.sql)
--   painel.cesta_departamento, painel.cestas, painel.lojas_comparaveis, painel.grupo_cliente  (painel_base.sql)

-- ============================================================================ dimensões

-- Subconjuntos do filtro de segmento. Grão: 1 linha por subconjunto × grupo que ele inclui.
-- 'todos' (nenhum chip ligado) = os 4 segmentos + 'Sem segmento'. Os outros 15 são as combinações não vazias dos 4
-- segmentos, com os nomes na ordem fixa do contrato unidos por '+' (ex.: 'Fiéis+Regulares'); `ordem` é a máscara de
-- bits (Fiéis = 1, Regulares = 2, Esporádicos = 4, Em pausa = 8).
-- Cada cesta tem um só cliente e cada cliente um só grupo, então contagens de cesta e de cliente somam exatamente entre
-- grupos: o valor de um subconjunto é a soma dos seus grupos.
CREATE OR REPLACE VIEW painel.subconjuntos AS
WITH seg(grupo, bit) AS (VALUES ('Fiéis', 0), ('Regulares', 1), ('Esporádicos', 2), ('Em pausa', 3)),
nomes AS (
    SELECT m.range AS mascara, string_agg(s.grupo, '+' ORDER BY s.bit) AS subconjunto
    FROM range(1, 16) m JOIN seg s ON (m.range >> s.bit) & 1 = 1
    GROUP BY m.range)
SELECT 0 AS ordem, 'todos' AS subconjunto, g.grupo
FROM (VALUES ('Fiéis'), ('Regulares'), ('Esporádicos'), ('Em pausa'), ('Sem segmento')) g(grupo)
UNION ALL
SELECT n.mascara, n.subconjunto, s.grupo FROM nomes n JOIN seg s ON (n.mascara >> s.bit) & 1 = 1;

-- Grupos de cliente na ordem fixa do contrato: os 4 segmentos e 'Sem segmento'. Grão: 1 linha por grupo.
CREATE OR REPLACE VIEW painel.grupos AS
SELECT * FROM (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4), ('Sem segmento', 5)) g(grupo, ordem);

-- Risco de pausa por cliente com a faixa. Grão: 1 linha por household da população do modelo do RAG.
-- Faixas (spec, seção 6): alto = prob >= limiar de alerta do modelo; médio = prob >= limiar ÷ 2; baixo = abaixo.
CREATE OR REPLACE VIEW painel.cliente_risco AS
SELECT r.household_key, r.prob,
       CASE WHEN r.prob >= (SELECT valor FROM painel.parametros WHERE chave = 'limiar_alerta') THEN 'alto'
            WHEN r.prob >= (SELECT valor FROM painel.parametros WHERE chave = 'corte_medio') THEN 'medio'
            ELSE 'baixo' END AS faixa
FROM painel.rag_risco_cliente r;

-- ============================================================================ recortes por período

-- Cesta × departamento em cada período e recorte. Grão: 1 linha por período × recorte × cesta × departamento.
-- recorte: 'todas' (todas as lojas no período), 'comparavel' (lojas comparáveis do período),
--          'ano_anterior' (as mesmas lojas comparáveis, um ano antes). Base inteira só tem 'todas'.
CREATE OR REPLACE VIEW painel.recortes_departamento AS
SELECT p.periodo, 'todas' AS recorte, c.*
FROM painel.periodos p JOIN painel.cesta_departamento c ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
UNION ALL
SELECT p.periodo, 'comparavel', c.*
FROM painel.periodos p JOIN painel.cesta_departamento c ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = c.STORE_ID
UNION ALL
SELECT p.periodo, 'ano_anterior', c.*
FROM painel.periodos p JOIN painel.cesta_departamento c ON c.WEEK_NO BETWEEN p.semana_ini_ant AND p.semana_fim_ant
JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = c.STORE_ID;

-- O mesmo recorte no grão da cesta (sem departamento). Grão: 1 linha por período × recorte × cesta.
CREATE OR REPLACE VIEW painel.recortes_cesta AS
SELECT p.periodo, 'todas' AS recorte, c.*
FROM painel.periodos p JOIN painel.cestas c ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
UNION ALL
SELECT p.periodo, 'comparavel', c.*
FROM painel.periodos p JOIN painel.cestas c ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = c.STORE_ID
UNION ALL
SELECT p.periodo, 'ano_anterior', c.*
FROM painel.periodos p JOIN painel.cestas c ON c.WEEK_NO BETWEEN p.semana_ini_ant AND p.semana_fim_ant
JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = c.STORE_ID;

-- ============================================================================ Visão Geral

-- Métricas que SOMAM, por período × grupo × departamento (redesenho v2: faturamento, desconto e valor bruto, que o
-- navegador pode somar para qualquer seleção de segmentos e departamentos). Grão: 1 linha por período × grupo ×
-- departamento com venda no período ou no ano anterior. % de desconto = soma dos descontos ÷ soma do valor bruto.
-- Comparável e ano anterior: lojas comparáveis do período; null na base inteira.
CREATE OR REPLACE VIEW painel.cubo_periodo AS
WITH s AS (
    SELECT r.periodo, r.recorte, g.grupo, r.departamento,
           SUM(r.faturamento) AS fat, SUM(r.desconto_total) AS descontos, SUM(r.valor_bruto) AS bruto
    FROM painel.recortes_departamento r JOIN painel.grupo_cliente g USING (household_key)
    GROUP BY ALL),
chaves AS (SELECT DISTINCT periodo, grupo, departamento FROM s)
SELECT k.periodo, p.ordem, k.grupo, k.departamento,
       COALESCE(t.fat, 0) AS faturamento, COALESCE(t.descontos, 0) AS desconto, COALESCE(t.bruto, 0) AS valor_bruto,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(c.fat, 0) END AS faturamento_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(c.descontos, 0) END AS desconto_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(c.bruto, 0) END AS valor_bruto_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(a.fat, 0) END AS faturamento_ano_anterior,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(a.descontos, 0) END AS desconto_ano_anterior,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(a.bruto, 0) END AS valor_bruto_ano_anterior
FROM chaves k
JOIN painel.periodos p ON p.periodo = k.periodo
LEFT JOIN s t ON t.periodo = k.periodo AND t.grupo = k.grupo AND t.departamento = k.departamento AND t.recorte = 'todas'
LEFT JOIN s c ON c.periodo = k.periodo AND c.grupo = k.grupo AND c.departamento = k.departamento AND c.recorte = 'comparavel'
LEFT JOIN s a ON a.periodo = k.periodo AND a.grupo = k.grupo AND a.departamento = k.departamento AND a.recorte = 'ano_anterior';

-- Faturamento semanal das últimas 52 semanas, por grupo × departamento. Grão: 1 linha por semana × grupo ×
-- departamento com venda na semana ou na mesma semana um ano antes.
-- Lojas: as comparáveis da janela de 26 semanas (origem.vw_lojas_like_for_like), como a linha do chat (spec, decisão 3
-- da fase 2), nas duas colunas. Ano anterior = semana − 52, só nas semanas da janela de 26 semanas (as que o chat
-- compara, cujo ano anterior é a janela base do RAG); null antes dela. Motivo (decisão do usuário, 2026-10-22): o ano
-- anterior das semanas 53 a ~68 cai na entrada da base, quando os clientes ainda estavam entrando no painel (87
-- households na semana 1, ~1.280 a partir da 16), e sugeriria um crescimento que não existe.
CREATE OR REPLACE VIEW painel.cubo_semanal AS
WITH j AS (SELECT semana_fim_atual AS fim, offset_semanas AS off, semana_ini_atual AS ini FROM origem.vw_janela),
s AS (
    SELECT c.WEEK_NO, g.grupo, c.departamento, SUM(c.faturamento) AS fat
    FROM painel.cesta_departamento c JOIN painel.grupo_cliente g USING (household_key)
    WHERE c.STORE_ID IN (SELECT STORE_ID FROM origem.vw_lojas_like_for_like)
    GROUP BY ALL),
semanas AS (
    SELECT d.WEEK_NO, MIN(d.data) AS semana_inicio
    FROM origem.dim_data d, j WHERE d.WEEK_NO BETWEEN j.fim - 51 AND j.fim GROUP BY d.WEEK_NO),
chaves AS (
    SELECT DISTINCT w.WEEK_NO, s.grupo, s.departamento
    FROM semanas w CROSS JOIN j JOIN s ON s.WEEK_NO = w.WEEK_NO OR s.WEEK_NO = w.WEEK_NO - j.off)
SELECT k.WEEK_NO, w.semana_inicio, k.grupo, k.departamento,
       COALESCE(a.fat, 0) AS faturamento,
       CASE WHEN k.WEEK_NO >= j.ini THEN COALESCE(b.fat, 0) END AS faturamento_ano_anterior
FROM chaves k JOIN semanas w ON w.WEEK_NO = k.WEEK_NO CROSS JOIN j
LEFT JOIN s a ON a.WEEK_NO = k.WEEK_NO AND a.grupo = k.grupo AND a.departamento = k.departamento
LEFT JOIN s b ON b.WEEK_NO = k.WEEK_NO - j.off AND b.grupo = k.grupo AND b.departamento = k.departamento;

-- Métricas que NÃO SOMAM (uma cesta tem vários departamentos; um cliente compra em vários), pré-calculadas por
-- período × subconjunto de segmentos × departamento ('todos' ou um só). Grão: 1 linha por período × subconjunto ×
-- departamento com cesta ou cliente ativo. Definições do painel com 1 departamento (spec, seção 6):
--   cestas = cestas com o departamento; ticket = faturamento do departamento ÷ essas cestas;
--   itens por cesta = itens do departamento ÷ essas cestas;
--   clientes ativos = compraram o departamento nas últimas `cliente_ativo_semanas` (8) semanas do período, o que
--   implica ser ativo pela regra do RAG. Sem departamento ('todos'), a regra é a do RAG (vw_metricas_cliente).
-- Comparável e ano anterior: lojas comparáveis do período. Clientes ativos não dependem de loja: comparável = valor,
-- e o ano anterior é o estoque um ano antes, sem filtro de loja (spec, decisão 2 da fase 2).
CREATE OR REPLACE VIEW painel.kpis_filtrados AS
WITH cestas_grupo AS (
    SELECT r.periodo, r.recorte, g.grupo, 'todos' AS departamento,
           COUNT(*) AS cestas, SUM(r.faturamento) AS faturamento, SUM(r.itens) AS itens
    FROM painel.recortes_cesta r JOIN painel.grupo_cliente g USING (household_key)
    GROUP BY ALL
    UNION ALL
    SELECT r.periodo, r.recorte, g.grupo, r.departamento, COUNT(*), SUM(r.faturamento), SUM(r.itens)
    FROM painel.recortes_departamento r JOIN painel.grupo_cliente g USING (household_key)
    GROUP BY ALL),
j AS (
    SELECT v.semana_fim_atual AS fim, v.offset_semanas AS off, CAST(p.valor AS INTEGER) AS k
    FROM origem.vw_janela v JOIN painel.parametros p ON p.chave = 'cliente_ativo_semanas'),
ativos_grupo AS (
    SELECT CASE m.periodo WHEN 'atual' THEN 'todas' ELSE 'ano_anterior' END AS recorte, g.grupo,
           'todos' AS departamento, COUNT(*) AS clientes
    FROM origem.vw_metricas_cliente m JOIN painel.grupo_cliente g USING (household_key)
    WHERE m.cliente_ativo
    GROUP BY ALL
    UNION ALL
    SELECT q.recorte, g.grupo, c.departamento, COUNT(DISTINCT c.household_key)
    FROM painel.cesta_departamento c
    JOIN (SELECT 'todas' AS recorte, fim - k + 1 AS ini, fim AS ate FROM j
          UNION ALL
          SELECT 'ano_anterior', fim - off - k + 1, fim - off FROM j) q ON c.WEEK_NO BETWEEN q.ini AND q.ate
    JOIN painel.grupo_cliente g USING (household_key)
    GROUP BY ALL),
c AS (
    SELECT x.periodo, s.subconjunto, s.ordem AS ordem_sub, x.departamento,
           SUM(x.cestas) FILTER (WHERE x.recorte = 'todas') AS ces_t,
           SUM(x.cestas) FILTER (WHERE x.recorte = 'comparavel') AS ces_c,
           SUM(x.cestas) FILTER (WHERE x.recorte = 'ano_anterior') AS ces_a,
           SUM(x.faturamento) FILTER (WHERE x.recorte = 'todas') AS fat_t,
           SUM(x.faturamento) FILTER (WHERE x.recorte = 'comparavel') AS fat_c,
           SUM(x.faturamento) FILTER (WHERE x.recorte = 'ano_anterior') AS fat_a,
           SUM(x.itens) FILTER (WHERE x.recorte = 'todas') AS it_t,
           SUM(x.itens) FILTER (WHERE x.recorte = 'comparavel') AS it_c,
           SUM(x.itens) FILTER (WHERE x.recorte = 'ano_anterior') AS it_a
    FROM cestas_grupo x JOIN painel.subconjuntos s USING (grupo)
    GROUP BY ALL),
a AS (
    SELECT s.subconjunto, s.ordem AS ordem_sub, x.departamento,
           SUM(x.clientes) FILTER (WHERE x.recorte = 'todas') AS atv_t,
           SUM(x.clientes) FILTER (WHERE x.recorte = 'ano_anterior') AS atv_a
    FROM ativos_grupo x JOIN painel.subconjuntos s USING (grupo)
    GROUP BY ALL),
chaves AS (
    SELECT periodo, subconjunto, ordem_sub, departamento FROM c
    UNION
    SELECT p.periodo, a.subconjunto, a.ordem_sub, a.departamento FROM painel.periodos p CROSS JOIN a),
lojas AS (SELECT periodo, COUNT(*) AS lojas FROM painel.lojas_comparaveis GROUP BY periodo)
SELECT k.periodo, p.ordem, k.ordem_sub, k.subconjunto, k.departamento,
       p.semana_ini_ant IS NOT NULL AS tem_ano_anterior,
       COALESCE(c.ces_t, 0) AS cestas,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(c.ces_c, 0) END AS cestas_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(c.ces_a, 0) END AS cestas_ano_anterior,
       c.fat_t / NULLIF(c.ces_t, 0) AS ticket_medio,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN c.fat_c / NULLIF(c.ces_c, 0) END AS ticket_medio_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN c.fat_a / NULLIF(c.ces_a, 0) END AS ticket_medio_ano_anterior,
       c.it_t / NULLIF(c.ces_t, 0) AS itens_por_cesta,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN c.it_c / NULLIF(c.ces_c, 0) END AS itens_por_cesta_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN c.it_a / NULLIF(c.ces_a, 0) END AS itens_por_cesta_ano_anterior,
       COALESCE(a.atv_t, 0) AS clientes_ativos,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(a.atv_t, 0) END AS clientes_ativos_comparavel,
       CASE WHEN p.semana_ini_ant IS NOT NULL THEN COALESCE(a.atv_a, 0) END AS clientes_ativos_ano_anterior,
       lojas.lojas AS lojas_comparaveis,
       COALESCE(c.ces_t, 0) < (SELECT valor FROM painel.parametros WHERE chave = 'loja_amostra_minima_cestas') AS amostra_pequena
FROM chaves k
JOIN painel.periodos p ON p.periodo = k.periodo
LEFT JOIN c ON c.periodo = k.periodo AND c.subconjunto = k.subconjunto AND c.departamento = k.departamento
LEFT JOIN a ON a.subconjunto = k.subconjunto AND a.departamento = k.departamento
LEFT JOIN lojas ON lojas.periodo = k.periodo;

-- Faturamento por dia do ciclo semanal × hora × grupo × departamento, base inteira, todas as lojas.
-- Grão: 1 linha por dia × hora × grupo × departamento com venda. dia_semana = origem.dim_data.dia_semana (sem nome:
-- a base não tem calendário real); hora = origem.fato_transacoes.hora; faturamento = SALES_VALUE, a mesma origem de
-- origem.vw_vendas_item.faturamento (lá não há a hora).
CREATE OR REPLACE VIEW painel.calor_departamento AS
SELECT d.dia_semana, f.hora, g.grupo, pr.DEPARTMENT AS departamento, SUM(f.SALES_VALUE) AS faturamento
FROM origem.fato_transacoes f
JOIN origem.dim_data d ON d.data_id = f.data_id
JOIN origem.dim_produto pr ON pr.PRODUCT_ID = f.PRODUCT_ID
JOIN painel.grupo_cliente g ON g.household_key = f.household_key
JOIN painel.periodos b ON b.periodo = 'base' AND d.WEEK_NO BETWEEN b.semana_ini AND b.semana_fim
GROUP BY ALL;

-- O mesmo sem departamento, com as cestas (cada cesta cai numa só célula). Grão: 1 linha por dia × hora × grupo.
CREATE OR REPLACE VIEW painel.calor_grupo AS
SELECT d.dia_semana, f.hora, g.grupo, SUM(f.SALES_VALUE) AS faturamento, COUNT(DISTINCT f.BASKET_ID) AS cestas
FROM origem.fato_transacoes f
JOIN origem.dim_data d ON d.data_id = f.data_id
JOIN painel.grupo_cliente g ON g.household_key = f.household_key
JOIN painel.periodos b ON b.periodo = 'base' AND d.WEEK_NO BETWEEN b.semana_ini AND b.semana_fim
GROUP BY ALL;

-- Lista de departamentos do filtro. Grão: 1 linha por departamento com venda na base inteira.
-- amostra_pequena: menos de 0,1% do faturamento das 26 semanas, ou sem venda nelas (redesenho v2, seção 3).
CREATE OR REPLACE VIEW painel.departamentos AS
WITH d AS (
    SELECT departamento,
           SUM(faturamento) FILTER (WHERE periodo = '26s') AS fat_26s,
           SUM(faturamento) FILTER (WHERE periodo = 'base') AS fat_base
    FROM painel.cubo_periodo GROUP BY departamento)
SELECT departamento, COALESCE(fat_26s, 0) AS faturamento_26s,
       COALESCE(fat_26s, 0) / SUM(fat_26s) OVER () AS participacao_26s,
       fat_base AS faturamento_base,
       COALESCE(fat_26s, 0) / SUM(fat_26s) OVER () < 0.001 AS amostra_pequena
FROM d WHERE fat_base > 0;

-- ============================================================================ Ficha da Categoria (26 semanas)

-- Somas da janela de 26 semanas por grupo × departamento, todas as lojas (e as comparáveis para o crescimento).
-- Grão: 1 linha por grupo × departamento com venda nas 26 semanas ou no ano anterior.
-- compradores_comparaveis: compradores do departamento nas lojas comparáveis (para a penetração do RAG).
-- faturamento_risco_alto: faturamento de clientes na faixa alta de risco de pausa (painel.cliente_risco).
CREATE OR REPLACE VIEW painel.departamento_grupo AS
SELECT g.grupo, r.departamento,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'todas'), 0) AS faturamento,
       COALESCE(SUM(r.desconto_total) FILTER (WHERE r.recorte = 'todas'), 0) AS desconto,
       COALESCE(SUM(r.valor_bruto) FILTER (WHERE r.recorte = 'todas'), 0) AS valor_bruto,
       COALESCE(SUM(r.faturamento_marca_propria) FILTER (WHERE r.recorte = 'todas'), 0) AS faturamento_marca_propria,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'comparavel'), 0) AS faturamento_comparavel,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'ano_anterior'), 0) AS faturamento_ano_anterior,
       COUNT(*) FILTER (WHERE r.recorte = 'todas') AS cestas,
       COUNT(DISTINCT r.household_key) FILTER (WHERE r.recorte = 'todas') AS compradores,
       COUNT(DISTINCT r.household_key) FILTER (WHERE r.recorte = 'comparavel') AS compradores_comparaveis,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'todas' AND rk.faixa = 'alto'), 0) AS faturamento_risco_alto
FROM painel.recortes_departamento r
JOIN painel.grupo_cliente g USING (household_key)
LEFT JOIN painel.cliente_risco rk ON rk.household_key = r.household_key
WHERE r.periodo = '26s'
GROUP BY ALL;

-- Totais de cada grupo nas 26 semanas: faturamento (todas as lojas, todos os departamentos) e clientes com compra
-- nas lojas comparáveis (o denominador da penetração do RAG). Grão: 1 linha por grupo.
CREATE OR REPLACE VIEW painel.grupo_totais AS
WITH f AS (
    SELECT g.grupo, SUM(c.faturamento) AS faturamento
    FROM painel.cestas c JOIN painel.grupo_cliente g USING (household_key)
    JOIN painel.periodos p ON p.periodo = '26s' AND c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY g.grupo),
a AS (
    SELECT g.grupo, COUNT(DISTINCT r.household_key) AS clientes
    FROM painel.recortes_cesta r JOIN painel.grupo_cliente g USING (household_key)
    WHERE r.periodo = '26s' AND r.recorte = 'comparavel' GROUP BY g.grupo)
SELECT g.grupo, COALESCE(f.faturamento, 0) AS faturamento, COALESCE(a.clientes, 0) AS clientes_comparaveis
FROM (SELECT DISTINCT grupo FROM painel.grupo_cliente) g
LEFT JOIN f USING (grupo) LEFT JOIN a USING (grupo);

-- Os 6 atributos do radar da Ficha da Categoria, por subconjunto de segmentos × departamento, 26 semanas.
-- Grão: 1 linha por subconjunto × departamento com faturamento na janela. Definições (spec, seção 6):
--   participacao   = faturamento do departamento ÷ faturamento do subconjunto (todas as lojas);
--   crescimento    = faturamento nas lojas comparáveis ÷ o mesmo um ano antes − 1 (like-for-like);
--   penetracao     = a do RAG (vw_yoy_categoria, glossário METRICAS): clientes que compraram o departamento ÷
--                    clientes com qualquer compra no período, os dois nas lojas comparáveis (decisão do usuário,
--                    2026-10-22, no lugar de "% dos clientes ativos" do redesenho, para não ter duas definições);
--   frequencia     = cestas com o departamento ÷ clientes que compraram o departamento;
--   desconto       = descontos ÷ valor bruto do departamento;
--   marca_propria  = faturamento com BRAND = 'Private' ÷ faturamento do departamento.
-- dinheiro_em_risco: faturamento do departamento vindo de clientes na faixa alta de risco de pausa.
CREATE OR REPLACE VIEW painel.departamento_subconjunto AS
WITH x AS (
    SELECT s.subconjunto, s.ordem, d.departamento,
           SUM(d.faturamento) AS faturamento, SUM(d.desconto) AS desconto, SUM(d.valor_bruto) AS valor_bruto,
           SUM(d.faturamento_marca_propria) AS faturamento_marca_propria,
           SUM(d.faturamento_comparavel) AS faturamento_comparavel, SUM(d.faturamento_ano_anterior) AS faturamento_ano_anterior,
           SUM(d.cestas) AS cestas, SUM(d.compradores) AS compradores, SUM(d.compradores_comparaveis) AS compradores_comparaveis,
           SUM(d.faturamento_risco_alto) AS faturamento_risco_alto
    FROM painel.departamento_grupo d JOIN painel.subconjuntos s USING (grupo)
    GROUP BY ALL),
tot AS (
    SELECT s.subconjunto, SUM(t.faturamento) AS faturamento, SUM(t.clientes_comparaveis) AS clientes_comparaveis
    FROM painel.grupo_totais t JOIN painel.subconjuntos s USING (grupo)
    GROUP BY s.subconjunto)
SELECT x.subconjunto, x.ordem, x.departamento, x.faturamento, x.compradores, x.cestas,
       x.faturamento / NULLIF(tot.faturamento, 0) AS participacao,
       x.faturamento_comparavel / NULLIF(x.faturamento_ano_anterior, 0) - 1 AS crescimento,
       x.compradores_comparaveis / NULLIF(tot.clientes_comparaveis, 0) AS penetracao,
       x.cestas / NULLIF(x.compradores, 0) AS frequencia,
       x.desconto / NULLIF(x.valor_bruto, 0) AS desconto,
       x.faturamento_marca_propria / NULLIF(x.faturamento, 0) AS marca_propria,
       x.faturamento_risco_alto AS dinheiro_em_risco,
       x.faturamento_risco_alto / NULLIF(x.faturamento, 0) AS dinheiro_em_risco_pct
FROM x JOIN tot USING (subconjunto)
WHERE x.faturamento > 0;

-- Percentil de cada atributo entre os departamentos, todos os clientes, de 0 a 100 (PERCENT_RANK).
-- Grão: 1 linha por departamento com faturamento nas 26 semanas. Atributo nulo fica com percentil nulo.
CREATE OR REPLACE VIEW painel.departamento_percentis AS
SELECT departamento,
       CASE WHEN participacao IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY participacao IS NULL ORDER BY participacao) END AS participacao,
       CASE WHEN crescimento IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY crescimento IS NULL ORDER BY crescimento) END AS crescimento,
       CASE WHEN penetracao IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY penetracao IS NULL ORDER BY penetracao) END AS penetracao,
       CASE WHEN frequencia IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY frequencia IS NULL ORDER BY frequencia) END AS frequencia,
       CASE WHEN desconto IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY desconto IS NULL ORDER BY desconto) END AS desconto,
       CASE WHEN marca_propria IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY marca_propria IS NULL ORDER BY marca_propria) END AS marca_propria
FROM painel.departamento_subconjunto
WHERE subconjunto = 'todos';

-- Subcategorias (COMMODITY_DESC) de cada departamento, 26 semanas, todas as lojas.
-- Grão: 1 linha por departamento × subcategoria. posicao = ordem por faturamento dentro do departamento.
CREATE OR REPLACE VIEW painel.subcategorias AS
WITH v AS (
    SELECT i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria, SUM(i.faturamento) AS faturamento
    FROM origem.vw_vendas_item i JOIN painel.periodos p ON p.periodo = '26s' AND i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL)
SELECT departamento, subcategoria, faturamento,
       faturamento / SUM(faturamento) OVER (PARTITION BY departamento) AS participacao,
       ROW_NUMBER() OVER (PARTITION BY departamento ORDER BY faturamento DESC, subcategoria) AS posicao
FROM v;

-- ============================================================================ análise de cesta

-- Cesta × departamento na janela da cesta, com o grupo do cliente. Grão: 1 linha por cesta × departamento.
CREATE OR REPLACE VIEW painel.cesta_grupo AS
SELECT g.grupo, c.BASKET_ID, c.departamento
FROM painel.cesta_departamento c
JOIN painel.grupo_cliente g USING (household_key)
JOIN painel.janela_cesta w ON c.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim;

-- Departamentos com pelo menos `corte_departamento_pct` (10%) do faturamento na janela da cesta: só dentro deles se
-- calculam pares de subcategorias (redesenho v2, D5). Grão: 1 linha por departamento.
CREATE OR REPLACE VIEW painel.departamentos_foco AS
SELECT departamento, participacao FROM (
    SELECT c.departamento, SUM(c.faturamento) / SUM(SUM(c.faturamento)) OVER () AS participacao
    FROM painel.cesta_departamento c JOIN painel.janela_cesta w ON c.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim
    GROUP BY c.departamento)
WHERE participacao >= (SELECT valor FROM painel.parametros WHERE chave = 'corte_departamento_pct');

-- Pares de departamentos comprados na mesma cesta, por subconjunto de segmentos. Grão: 1 linha por subconjunto × par
-- não ordenado (departamento_a < departamento_b) com pelo menos uma cesta. A unidade é a cesta, já reduzida a pares
-- distintos cesta × departamento (painel.cesta_departamento). Métricas (spec, seção 6):
--   suporte = cestas com A e B ÷ total de cestas; confianca_a_b = cestas com A e B ÷ cestas com A (e a recíproca);
--   lift = confiança ÷ (cestas com B ÷ total), simétrico.
-- amostra_pequena: menos de `minimo_cestas_par` (200) cestas com o par. Com menos de 200 cestas, o lift oscila muito
-- entre semanas: entre as duas metades da janela de 26 semanas (76-88 × 89-101), nos pares de subcategorias de GROCERY,
-- a variação mediana do lift foi de 32% com menos de 50 cestas, 15% com 50-99, 11% com 100-199, 7% com 200-399 e 4%
-- com 400 ou mais (p90: 95%, 37%, 28%, 18% e 12%). A partir de 200, 9 em cada 10 pares variam menos de 20%.
-- As contagens são somadas por grupo e depois por subconjunto: cada cesta tem um só cliente, então a soma é exata.
CREATE OR REPLACE VIEW painel.par_departamento AS
WITH n AS (SELECT grupo, COUNT(DISTINCT BASKET_ID) AS n FROM painel.cesta_grupo GROUP BY grupo),
na AS (SELECT grupo, departamento, COUNT(*) AS n FROM painel.cesta_grupo GROUP BY ALL),
nab AS (
    SELECT a.grupo, a.departamento AS a, b.departamento AS b, COUNT(*) AS n
    FROM painel.cesta_grupo a JOIN painel.cesta_grupo b ON b.BASKET_ID = a.BASKET_ID AND b.departamento > a.departamento
    GROUP BY ALL),
sn AS (SELECT s.subconjunto, s.ordem, SUM(n.n) AS n FROM n JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
sna AS (SELECT s.subconjunto, na.departamento, SUM(na.n) AS n FROM na JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
snab AS (SELECT s.subconjunto, nab.a, nab.b, SUM(nab.n) AS n FROM nab JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL)
SELECT p.subconjunto, sn.ordem, p.a AS departamento_a, p.b AS departamento_b,
       p.n AS cestas_par, sa.n AS cestas_a, sb.n AS cestas_b, sn.n AS cestas_total,
       p.n::DOUBLE / sn.n AS suporte, p.n::DOUBLE / sa.n AS confianca_a_b, p.n::DOUBLE / sb.n AS confianca_b_a,
       p.n::DOUBLE * sn.n / (sa.n::DOUBLE * sb.n) AS lift,
       p.n < (SELECT valor FROM painel.parametros WHERE chave = 'minimo_cestas_par') AS amostra_pequena
FROM snab p
JOIN sn ON sn.subconjunto = p.subconjunto
JOIN sna sa ON sa.subconjunto = p.subconjunto AND sa.departamento = p.a
JOIN sna sb ON sb.subconjunto = p.subconjunto AND sb.departamento = p.b;

-- Pares de subcategorias (COMMODITY_DESC) dentro de UM departamento de painel.departamentos_foco, por subconjunto.
-- É uma macro de tabela para a exportação rodar um departamento por vez (GROCERY gera 3,4 milhões de linhas antes de
-- agregar). Mesmas métricas e o mesmo mínimo de painel.par_departamento; o total de cestas é o de todas as cestas do
-- subconjunto na janela, como nos pares de departamentos. Grão: 1 linha por subconjunto × par não ordenado.
CREATE OR REPLACE MACRO painel.par_subcategoria(dep) AS TABLE
WITH cs AS (
    SELECT DISTINCT g.grupo, i.BASKET_ID, i.COMMODITY_DESC AS subcategoria
    FROM origem.vw_vendas_item i
    JOIN painel.grupo_cliente g ON g.household_key = i.household_key
    JOIN painel.janela_cesta w ON i.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim
    WHERE i.DEPARTMENT = dep AND dep IN (SELECT departamento FROM painel.departamentos_foco)),
n AS (SELECT grupo, COUNT(DISTINCT BASKET_ID) AS n FROM painel.cesta_grupo GROUP BY grupo),
na AS (SELECT grupo, subcategoria, COUNT(*) AS n FROM cs GROUP BY ALL),
nab AS (
    SELECT a.grupo, a.subcategoria AS a, b.subcategoria AS b, COUNT(*) AS n
    FROM cs a JOIN cs b ON b.BASKET_ID = a.BASKET_ID AND b.subcategoria > a.subcategoria
    GROUP BY ALL),
sn AS (SELECT s.subconjunto, s.ordem, SUM(n.n) AS n FROM n JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
sna AS (SELECT s.subconjunto, na.subcategoria, SUM(na.n) AS n FROM na JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
snab AS (SELECT s.subconjunto, nab.a, nab.b, SUM(nab.n) AS n FROM nab JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL)
SELECT p.subconjunto, sn.ordem, dep AS departamento, p.a AS subcategoria_a, p.b AS subcategoria_b,
       p.n AS cestas_par, sa.n AS cestas_a, sb.n AS cestas_b, sn.n AS cestas_total,
       p.n::DOUBLE / sn.n AS suporte, p.n::DOUBLE / sa.n AS confianca_a_b, p.n::DOUBLE / sb.n AS confianca_b_a,
       p.n::DOUBLE * sn.n / (sa.n::DOUBLE * sb.n) AS lift,
       p.n < (SELECT valor FROM painel.parametros WHERE chave = 'minimo_cestas_par') AS amostra_pequena
FROM snab p
JOIN sn ON sn.subconjunto = p.subconjunto
JOIN sna sa ON sa.subconjunto = p.subconjunto AND sa.subcategoria = p.a
JOIN sna sb ON sb.subconjunto = p.subconjunto AND sb.subcategoria = p.b;

-- ============================================================================ Segmentos (26 semanas)

-- Afinidade segmento × departamento: quanto o departamento pesa no faturamento do segmento, contra o peso na base.
-- indice = (faturamento do segmento no departamento ÷ faturamento do segmento)
--          ÷ (faturamento do departamento ÷ faturamento total) × 100; 100 = igual à média.
-- amostra_pequena: menos de `tamanho_minimo_grupo` (30) clientes do segmento compraram o departamento
-- (analises.clv.tamanho_minimo_grupo do RAG; decisão do usuário, 2026-10-22).
-- Grão: 1 linha por segmento (4) × departamento com faturamento nas 26 semanas.
CREATE OR REPLACE VIEW painel.afinidade AS
WITH seg(segmento, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4)),
d AS (SELECT grupo AS segmento, departamento, faturamento, compradores FROM painel.departamento_grupo
      WHERE grupo <> 'Sem segmento' AND faturamento > 0),
deps AS (SELECT departamento, SUM(faturamento) AS fat FROM d GROUP BY departamento),
segs AS (SELECT segmento, SUM(faturamento) AS fat FROM d GROUP BY segmento),
tot AS (SELECT SUM(faturamento) AS fat FROM d)
SELECT s.segmento, s.ordem, k.departamento,
       COALESCE(d.faturamento, 0) AS faturamento,
       COALESCE(d.faturamento, 0) / sg.fat AS participacao_segmento,
       k.fat / tot.fat AS participacao_base,
       100 * (COALESCE(d.faturamento, 0) / sg.fat) / (k.fat / tot.fat) AS indice,
       COALESCE(d.compradores, 0) AS compradores,
       COALESCE(d.compradores, 0) < (SELECT valor FROM painel.parametros WHERE chave = 'tamanho_minimo_grupo') AS amostra_pequena
FROM seg s CROSS JOIN deps k CROSS JOIN tot
JOIN segs sg ON sg.segmento = s.segmento
LEFT JOIN d ON d.segmento = s.segmento AND d.departamento = k.departamento;

-- Lista de ação: clientes na faixa alta ou média de risco de pausa (decisão do usuário, 2026-10-22).
-- faturamento_em_risco = probabilidade de pausa × faturamento do cliente nas 26 semanas (vw_metricas_cliente.valor).
-- semanas_sem_comprar = floor(recencia_dias / 7), em relação ao fim da janela (semana 101).
-- Grão: 1 linha por cliente com risco alto ou médio.
CREATE OR REPLACE VIEW painel.lista_acao AS
SELECT r.household_key AS id, s.segmento, r.faixa, r.prob,
       CAST(FLOOR(m.recencia_dias / 7) AS INTEGER) AS semanas_sem_comprar,
       m.valor::DOUBLE AS faturamento_26s,
       r.prob * m.valor::DOUBLE AS faturamento_em_risco
FROM painel.cliente_risco r
JOIN painel.rag_segmento_cliente s ON s.household_key = r.household_key
JOIN origem.vw_metricas_cliente m ON m.household_key = r.household_key AND m.periodo = 'atual'
WHERE r.faixa IN ('alto', 'medio');
