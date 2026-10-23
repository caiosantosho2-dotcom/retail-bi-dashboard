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
--   painel.rag_segmento_anterior(household_key, segmento) o RFM do RAG refeito no semestre anterior à janela
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

-- ============================================================================ Categorias (por período, redesenho v3)

-- Somas de cada período por grupo × departamento, todas as lojas (e as comparáveis para o crescimento), e a linha
-- 'todos' (o total dos departamentos, para "Todos os departamentos"). Grão: 1 linha por período × grupo × departamento
-- (ou 'todos') com venda no período ou no ano anterior.
-- cestas: no departamento, cestas com ele (uma linha de cesta × departamento cada); em 'todos', cestas distintas.
-- compradores_comparaveis: compradores nas lojas comparáveis (para a penetração do RAG); na base inteira não há
-- comparáveis, e a penetração e o crescimento ficam nulos.
-- faturamento_risco_alto: faturamento de clientes na faixa alta de risco de pausa (painel.cliente_risco); o painel só o
-- mostra nas 26 semanas (o risco é uma foto do momento: departamentos_risco.sql).
CREATE OR REPLACE VIEW painel.departamento_grupo AS
WITH r AS (
    SELECT r.*, g.grupo, rk.faixa
    FROM painel.recortes_departamento r
    JOIN painel.grupo_cliente g USING (household_key)
    LEFT JOIN painel.cliente_risco rk ON rk.household_key = r.household_key)
SELECT periodo, grupo, departamento,
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'todas'), 0) AS faturamento,
       COALESCE(SUM(desconto_total) FILTER (WHERE recorte = 'todas'), 0) AS desconto,
       COALESCE(SUM(valor_bruto) FILTER (WHERE recorte = 'todas'), 0) AS valor_bruto,
       COALESCE(SUM(faturamento_marca_propria) FILTER (WHERE recorte = 'todas'), 0) AS faturamento_marca_propria,
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'comparavel'), 0) AS faturamento_comparavel,
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'ano_anterior'), 0) AS faturamento_ano_anterior,
       COUNT(*) FILTER (WHERE recorte = 'todas') AS cestas,
       COUNT(DISTINCT household_key) FILTER (WHERE recorte = 'todas') AS compradores,
       COUNT(DISTINCT household_key) FILTER (WHERE recorte = 'comparavel') AS compradores_comparaveis,
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'todas' AND faixa = 'alto'), 0) AS faturamento_risco_alto
FROM r GROUP BY ALL
UNION ALL
SELECT periodo, grupo, 'todos',
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'todas'), 0),
       COALESCE(SUM(desconto_total) FILTER (WHERE recorte = 'todas'), 0),
       COALESCE(SUM(valor_bruto) FILTER (WHERE recorte = 'todas'), 0),
       COALESCE(SUM(faturamento_marca_propria) FILTER (WHERE recorte = 'todas'), 0),
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'comparavel'), 0),
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'ano_anterior'), 0),
       COUNT(DISTINCT BASKET_ID) FILTER (WHERE recorte = 'todas'),
       COUNT(DISTINCT household_key) FILTER (WHERE recorte = 'todas'),
       COUNT(DISTINCT household_key) FILTER (WHERE recorte = 'comparavel'),
       COALESCE(SUM(faturamento) FILTER (WHERE recorte = 'todas' AND faixa = 'alto'), 0)
FROM r GROUP BY periodo, grupo;

-- Totais de cada grupo em cada período: faturamento (todas as lojas, todos os departamentos) e clientes com compra nas
-- lojas comparáveis (o denominador da penetração do RAG). Grão: 1 linha por período × grupo.
CREATE OR REPLACE VIEW painel.grupo_totais AS
WITH f AS (
    SELECT p.periodo, g.grupo, SUM(c.faturamento) AS faturamento
    FROM painel.cestas c JOIN painel.grupo_cliente g USING (household_key)
    JOIN painel.periodos p ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL),
a AS (
    SELECT r.periodo, g.grupo, COUNT(DISTINCT r.household_key) AS clientes
    FROM painel.recortes_cesta r JOIN painel.grupo_cliente g USING (household_key)
    WHERE r.recorte = 'comparavel' GROUP BY ALL)
SELECT p.periodo, g.grupo, COALESCE(f.faturamento, 0) AS faturamento, COALESCE(a.clientes, 0) AS clientes_comparaveis
FROM painel.periodos p CROSS JOIN (SELECT DISTINCT grupo FROM painel.grupo_cliente) g
LEFT JOIN f ON f.periodo = p.periodo AND f.grupo = g.grupo
LEFT JOIN a ON a.periodo = p.periodo AND a.grupo = g.grupo;

-- Os 6 atributos do radar, por período × subconjunto de segmentos × departamento (e 'todos'). Grão: 1 linha por período
-- × subconjunto × departamento com faturamento no período. Definições (spec, seção 6):
--   participacao   = faturamento do departamento ÷ faturamento do subconjunto (todas as lojas);
--   crescimento    = faturamento nas lojas comparáveis ÷ o mesmo um ano antes − 1 (like-for-like; nulo na base inteira);
--   penetracao     = a do RAG (vw_yoy_categoria, glossário METRICAS): clientes que compraram o departamento ÷
--                    clientes com qualquer compra no período, os dois nas lojas comparáveis (nula na base inteira);
--   frequencia     = cestas com o departamento ÷ clientes que compraram o departamento;
--   desconto       = descontos ÷ valor bruto do departamento;
--   marca_propria  = faturamento com BRAND = 'Private' ÷ faturamento do departamento.
-- dinheiro_em_risco: faturamento do departamento vindo de clientes na faixa alta de risco de pausa.
CREATE OR REPLACE VIEW painel.departamento_subconjunto AS
WITH x AS (
    SELECT d.periodo, s.subconjunto, s.ordem, d.departamento,
           SUM(d.faturamento) AS faturamento, SUM(d.desconto) AS desconto, SUM(d.valor_bruto) AS valor_bruto,
           SUM(d.faturamento_marca_propria) AS faturamento_marca_propria,
           SUM(d.faturamento_comparavel) AS faturamento_comparavel, SUM(d.faturamento_ano_anterior) AS faturamento_ano_anterior,
           SUM(d.cestas) AS cestas, SUM(d.compradores) AS compradores, SUM(d.compradores_comparaveis) AS compradores_comparaveis,
           SUM(d.faturamento_risco_alto) AS faturamento_risco_alto
    FROM painel.departamento_grupo d JOIN painel.subconjuntos s USING (grupo)
    GROUP BY ALL),
tot AS (
    SELECT t.periodo, s.subconjunto, SUM(t.faturamento) AS faturamento, SUM(t.clientes_comparaveis) AS clientes_comparaveis
    FROM painel.grupo_totais t JOIN painel.subconjuntos s USING (grupo)
    GROUP BY ALL)
SELECT x.periodo, x.subconjunto, x.ordem, x.departamento, x.faturamento, x.compradores, x.cestas,
       x.faturamento / NULLIF(tot.faturamento, 0) AS participacao,
       x.faturamento_comparavel / NULLIF(x.faturamento_ano_anterior, 0) - 1 AS crescimento,
       x.compradores_comparaveis / NULLIF(tot.clientes_comparaveis, 0) AS penetracao,
       x.cestas / NULLIF(x.compradores, 0) AS frequencia,
       x.desconto / NULLIF(x.valor_bruto, 0) AS desconto,
       x.faturamento_marca_propria / NULLIF(x.faturamento, 0) AS marca_propria,
       x.faturamento_risco_alto AS dinheiro_em_risco,
       x.faturamento_risco_alto / NULLIF(x.faturamento, 0) AS dinheiro_em_risco_pct
FROM x JOIN tot ON tot.periodo = x.periodo AND tot.subconjunto = x.subconjunto
WHERE x.faturamento > 0;

-- Percentil de cada atributo entre os departamentos de cada período, todos os clientes, de 0 a 100 (PERCENT_RANK).
-- Grão: 1 linha por período × departamento com faturamento (sem a linha 'todos'). Atributo nulo fica com percentil nulo.
CREATE OR REPLACE VIEW painel.departamento_percentis AS
SELECT periodo, departamento,
       CASE WHEN participacao IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY periodo, participacao IS NULL ORDER BY participacao) END AS participacao,
       CASE WHEN crescimento IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY periodo, crescimento IS NULL ORDER BY crescimento) END AS crescimento,
       CASE WHEN penetracao IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY periodo, penetracao IS NULL ORDER BY penetracao) END AS penetracao,
       CASE WHEN frequencia IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY periodo, frequencia IS NULL ORDER BY frequencia) END AS frequencia,
       CASE WHEN desconto IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY periodo, desconto IS NULL ORDER BY desconto) END AS desconto,
       CASE WHEN marca_propria IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY periodo, marca_propria IS NULL ORDER BY marca_propria) END AS marca_propria
FROM painel.departamento_subconjunto
WHERE subconjunto = 'todos' AND departamento <> 'todos';

-- Subcategorias (COMMODITY_DESC) de cada departamento em cada período, todas as lojas, e as do total ('todos', em que
-- departamento_origem diz de qual departamento é a subcategoria: 22 nomes existem em mais de um).
-- Grão: 1 linha por período × departamento (ou 'todos') × subcategoria. posicao = ordem por faturamento no grupo.
CREATE OR REPLACE VIEW painel.subcategorias AS
WITH v AS (
    SELECT p.periodo, i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria, SUM(i.faturamento) AS faturamento
    FROM origem.vw_vendas_item i JOIN painel.periodos p ON i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL)
SELECT periodo, departamento, subcategoria, NULL AS departamento_origem, faturamento,
       faturamento / SUM(faturamento) OVER (PARTITION BY periodo, departamento) AS participacao,
       ROW_NUMBER() OVER (PARTITION BY periodo, departamento ORDER BY faturamento DESC, subcategoria) AS posicao
FROM v
UNION ALL
SELECT periodo, 'todos', subcategoria, departamento, faturamento,
       faturamento / SUM(faturamento) OVER (PARTITION BY periodo),
       ROW_NUMBER() OVER (PARTITION BY periodo ORDER BY faturamento DESC, departamento, subcategoria)
FROM v;

-- ============================================================================ análise de cesta

-- Cesta × departamento na janela da cesta, com o grupo do cliente. Grão: 1 linha por cesta × departamento.
-- (Serve à rede de cestas da aba Produtos. Os pares de subcategorias da aba Categorias, por período, estão em
-- painel_cesta.sql, que só a etapa cesta_subcategorias carrega.)
CREATE OR REPLACE VIEW painel.cesta_grupo AS
SELECT g.grupo, c.BASKET_ID, c.departamento
FROM painel.cesta_departamento c
JOIN painel.grupo_cliente g USING (household_key)
JOIN painel.janela_cesta w ON c.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim;

-- ============================================================================ Clientes & Lojas (redesenho v3)

-- Loja principal de cada cliente (regra obrigatória do redesenho v3, spec seção 6): a loja em que ele mais gastou nas
-- 26 semanas (empate: mais cestas, depois o menor STORE_ID). Um cliente compra em várias lojas; para o perfil da loja e o
-- valor em risco por loja, ele conta uma vez só, na principal. Grão: 1 linha por household com cesta nas 26 semanas.
CREATE OR REPLACE VIEW painel.loja_principal AS
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
v AS (
    SELECT c.household_key, c.STORE_ID, SUM(c.faturamento) AS faturamento, COUNT(*) AS cestas
    FROM painel.cestas c, p WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL)
SELECT household_key, STORE_ID, faturamento AS faturamento_na_loja
FROM v
QUALIFY ROW_NUMBER() OVER (PARTITION BY household_key ORDER BY faturamento DESC, cestas DESC, STORE_ID) = 1;

-- Lista de clientes em risco: faixa alta ou média de risco de pausa (decisão do usuário, 2026-10-22), com a loja
-- principal (o CSV da ficha da loja, redesenho v3). faturamento_em_risco = probabilidade de pausa × faturamento do
-- cliente nas 26 semanas (vw_metricas_cliente.valor). semanas_sem_comprar = floor(recencia_dias / 7), em relação ao fim
-- da janela (semana 101). Grão: 1 linha por cliente com risco alto ou médio.
CREATE OR REPLACE VIEW painel.lista_acao AS
SELECT r.household_key AS id, s.segmento, r.faixa, r.prob,
       CAST(FLOOR(m.recencia_dias / 7) AS INTEGER) AS semanas_sem_comprar,
       m.valor::DOUBLE AS faturamento_26s,
       r.prob * m.valor::DOUBLE AS faturamento_em_risco,
       lp.STORE_ID AS loja_principal
FROM painel.cliente_risco r
JOIN painel.rag_segmento_cliente s ON s.household_key = r.household_key
JOIN origem.vw_metricas_cliente m ON m.household_key = r.household_key AND m.periodo = 'atual'
LEFT JOIN painel.loja_principal lp ON lp.household_key = r.household_key
WHERE r.faixa IN ('alto', 'medio');

-- Valor em risco por loja × segmento (redesenho v3): faturamento de 26 semanas (vw_metricas_cliente.valor, todas as
-- lojas) dos clientes na faixa ALTA de risco de pausa, na loja principal deles. Fixo nas 26 semanas: o risco é uma foto.
-- A soma das lojas é o total em risco (cada cliente numa loja só). Grão: 1 linha por loja × segmento com cliente.
CREATE OR REPLACE VIEW painel.loja_risco AS
SELECT lp.STORE_ID, s.segmento, COUNT(*) AS clientes, SUM(m.valor)::DOUBLE AS valor_em_risco
FROM painel.cliente_risco r
JOIN painel.rag_segmento_cliente s ON s.household_key = r.household_key
JOIN origem.vw_metricas_cliente m ON m.household_key = r.household_key AND m.periodo = 'atual'
JOIN painel.loja_principal lp ON lp.household_key = r.household_key
WHERE r.faixa = 'alto'
GROUP BY ALL;

-- Perfil da loja pela clientela (redesenho v3): entre os clientes de loja principal, a parte de cada segmento na loja ÷ a
-- mesma parte na rede × 100. O perfil é o segmento de maior índice (empate: a ordem fixa dos segmentos); menos de
-- `tamanho_minimo_grupo` (30) clientes = amostra pequena, sem perfil. Clientes sem segmento (valor líquido <= 0, fora do
-- RFM do RAG) não entram. Grão: 1 linha por loja com cliente de loja principal × segmento (os 4).
CREATE OR REPLACE VIEW painel.loja_perfil_segmento AS
WITH c AS (SELECT lp.STORE_ID, s.segmento FROM painel.loja_principal lp JOIN painel.rag_segmento_cliente s USING (household_key)),
loja AS (SELECT STORE_ID, COUNT(*) AS n FROM c GROUP BY STORE_ID),
rede AS (SELECT segmento, COUNT(*)::DOUBLE / (SELECT COUNT(*) FROM c) AS pct FROM c GROUP BY segmento),
k AS (SELECT STORE_ID, segmento, COUNT(*) AS n FROM c GROUP BY ALL),
seg(segmento, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4))
SELECT l.STORE_ID, s.segmento, s.ordem, l.n AS clientes_principais, COALESCE(k.n, 0) AS clientes,
       COALESCE(k.n, 0)::DOUBLE / l.n AS pct, r.pct AS rede_pct, 100 * (COALESCE(k.n, 0)::DOUBLE / l.n) / r.pct AS indice
FROM loja l CROSS JOIN seg s
JOIN rede r ON r.segmento = s.segmento
LEFT JOIN k ON k.STORE_ID = l.STORE_ID AND k.segmento = s.segmento;

-- O perfil de cada loja. Grão: 1 linha por loja com cliente de loja principal.
CREATE OR REPLACE VIEW painel.loja_perfil AS
SELECT STORE_ID, ANY_VALUE(clientes_principais) AS clientes_principais,
       CASE WHEN ANY_VALUE(clientes_principais) >= (SELECT valor FROM painel.parametros WHERE chave = 'tamanho_minimo_grupo')
            THEN FIRST(segmento ORDER BY indice DESC, ordem) END AS perfil
FROM painel.loja_perfil_segmento
GROUP BY STORE_ID;

-- ============================================================================ Lojas: regiões pela clientela

-- Clientela de cada loja na base inteira. Grão: 1 linha por loja × household com cesta na loja.
CREATE OR REPLACE VIEW painel.loja_clientela AS
SELECT STORE_ID, household_key, COUNT(*) AS cestas, SUM(faturamento) AS faturamento
FROM painel.cestas
GROUP BY ALL;

-- Universo das regiões: lojas com pelo menos `loja_amostra_minima_cestas` (100) cestas na base inteira, a regra de
-- amostra pequena do RAG. Grão: 1 linha por loja. As outras ficam no grupo "Lojas pequenas".
CREATE OR REPLACE VIEW painel.lojas_universo AS
SELECT STORE_ID, SUM(cestas) AS cestas, COUNT(*) AS clientes, SUM(faturamento) AS faturamento
FROM painel.loja_clientela
GROUP BY STORE_ID
HAVING SUM(cestas) >= (SELECT valor FROM painel.parametros WHERE chave = 'loja_amostra_minima_cestas');

-- Pares de lojas do universo com pelo menos um cliente em comum (spec, seção 6, "Região inferida").
-- jaccard = clientes em comum ÷ clientes de uma ou de outra (comuns ÷ (clientes_a + clientes_b − comuns)).
-- A base não tem localização das lojas: duas lojas que dividem muitos clientes provavelmente estão perto.
-- Grão: 1 linha por par não ordenado (loja_a < loja_b).
CREATE OR REPLACE VIEW painel.loja_par AS
WITH c AS (
    SELECT l.STORE_ID, l.household_key
    FROM painel.loja_clientela l JOIN painel.lojas_universo u USING (STORE_ID))
SELECT a.STORE_ID AS loja_a, b.STORE_ID AS loja_b, COUNT(*) AS comuns,
       COUNT(*)::DOUBLE / (ua.clientes + ub.clientes - COUNT(*)) AS jaccard
FROM c a
JOIN c b ON b.household_key = a.household_key AND b.STORE_ID > a.STORE_ID
JOIN painel.lojas_universo ua ON ua.STORE_ID = a.STORE_ID
JOIN painel.lojas_universo ub ON ub.STORE_ID = b.STORE_ID
GROUP BY a.STORE_ID, b.STORE_ID, ua.clientes, ub.clientes;


-- ============================================================================ migração de segmentos

-- Segmento de cada household no semestre anterior (semanas migracao_semana_ini a _fim de painel.parametros) e no
-- atual (a janela de 26 semanas), com o faturamento em cada um. Grão: 1 linha por household de dim_household (todos):
-- quem não foi segmentado numa janela (sem compra, ou valor líquido <= 0, as exclusões do RFM do RAG) fica em
-- 'Sem compra na janela', o nome do grupo no CLV do RAG. Faturamento de vw_cliente_semana, a definição do RAG.
CREATE OR REPLACE VIEW painel.migracao_cliente AS
WITH par AS (SELECT MAX(valor) FILTER (WHERE chave = 'migracao_semana_ini')::INTEGER AS ini,
                    MAX(valor) FILTER (WHERE chave = 'migracao_semana_fim')::INTEGER AS fim FROM painel.parametros),
atual AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
gasto AS (
    SELECT c.household_key,
           SUM(c.faturamento) FILTER (WHERE c.WEEK_NO BETWEEN par.ini AND par.fim) AS faturamento_anterior,
           SUM(c.faturamento) FILTER (WHERE c.WEEK_NO BETWEEN atual.semana_ini AND atual.semana_fim) AS faturamento_atual
    FROM origem.vw_cliente_semana c CROSS JOIN par CROSS JOIN atual
    GROUP BY c.household_key)
SELECT h.household_key,
       COALESCE(a.segmento, 'Sem compra na janela') AS segmento_anterior,
       COALESCE(s.segmento, 'Sem compra na janela') AS segmento_atual,
       COALESCE(g.faturamento_anterior, 0)::DOUBLE AS faturamento_anterior,
       COALESCE(g.faturamento_atual, 0)::DOUBLE AS faturamento_atual
FROM origem.dim_household h
LEFT JOIN painel.rag_segmento_anterior a ON a.household_key = h.household_key
LEFT JOIN painel.rag_segmento_cliente s ON s.household_key = h.household_key
LEFT JOIN gasto g ON g.household_key = h.household_key;

-- Os 5 grupos da migração na ordem fixa. Grão: 1 linha por grupo.
CREATE OR REPLACE VIEW painel.migracao_grupos AS
SELECT * FROM (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4), ('Sem compra na janela', 5)) g(segmento, ordem);

