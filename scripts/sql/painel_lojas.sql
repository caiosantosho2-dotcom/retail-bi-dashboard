-- Views da aba Clientes & Lojas que dependem das regiões. Rodado na etapa `lojas`, depois de scripts/regioes.py gravar
-- painel.loja_regiao(STORE_ID, regiao, x, y) (data/tmp/loja_regiao.parquet). Requer views_painel.sql.

-- Grupo de cada loja: a região inferida pela clientela, ou 'Lojas pequenas' (menos de 100 cestas na base inteira).
-- Grão: 1 linha por loja com cesta na base. x e y: posição no mapa de clientela (null nas lojas pequenas).
CREATE OR REPLACE VIEW painel.loja_grupo AS
SELECT s.STORE_ID, COALESCE(r.regiao, 'Lojas pequenas') AS regiao, r.x, r.y
FROM (SELECT DISTINCT STORE_ID FROM painel.cestas) s
LEFT JOIN painel.loja_regiao r ON r.STORE_ID = s.STORE_ID;

-- Indicadores de cada loja nas 26 semanas, todas as cestas da loja. Grão: 1 linha por loja com cesta na base.
-- amostra_pequena: menos de `loja_amostra_minima_cestas` (100) cestas nas 26 semanas, a regra do RAG.
CREATE OR REPLACE VIEW painel.loja_kpis AS
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
c AS (SELECT c.* FROM painel.cestas c, p WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim)
SELECT g.STORE_ID, g.regiao, g.x, g.y,
       COALESCE(SUM(c.faturamento), 0) AS faturamento, COUNT(c.BASKET_ID) AS cestas,
       COUNT(DISTINCT c.household_key) AS clientes, SUM(c.itens) AS itens,
       SUM(c.desconto_total) AS desconto, SUM(c.valor_bruto) AS valor_bruto,
       COUNT(c.BASKET_ID) < (SELECT valor FROM painel.parametros WHERE chave = 'loja_amostra_minima_cestas') AS amostra_pequena
FROM painel.loja_grupo g LEFT JOIN c ON c.STORE_ID = g.STORE_ID
GROUP BY ALL;

-- Cada loja em cada período, por grupo de cliente e recorte (redesenho v3: a aba Clientes & Lojas responde ao período).
-- todas = todas as cestas da loja no período; comparavel e ano_anterior = só nas lojas comparáveis do período (a regra de
-- vw_lojas_like_for_like aplicada à janela, painel.lojas_comparaveis), agora e um ano antes. Na base inteira só há
-- 'todas'. Contagens de cesta e de cliente somam entre grupos (cada cliente tem um grupo só).
-- Grão: 1 linha por período × loja × grupo com cesta no período ou no ano anterior.
CREATE OR REPLACE VIEW painel.loja_periodo_grupo AS
SELECT r.periodo, r.STORE_ID, g.grupo,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'todas'), 0) AS faturamento,
       COUNT(*) FILTER (WHERE r.recorte = 'todas') AS cestas,
       COUNT(DISTINCT r.household_key) FILTER (WHERE r.recorte = 'todas') AS clientes,
       COALESCE(SUM(r.itens) FILTER (WHERE r.recorte = 'todas'), 0) AS itens,
       COALESCE(SUM(r.desconto_total) FILTER (WHERE r.recorte = 'todas'), 0) AS desconto,
       COALESCE(SUM(r.valor_bruto) FILTER (WHERE r.recorte = 'todas'), 0) AS valor_bruto,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'comparavel'), 0) AS faturamento_comparavel,
       COUNT(*) FILTER (WHERE r.recorte = 'comparavel') AS cestas_comparavel,
       COUNT(DISTINCT r.household_key) FILTER (WHERE r.recorte = 'comparavel') AS clientes_comparavel,
       COALESCE(SUM(r.faturamento) FILTER (WHERE r.recorte = 'ano_anterior'), 0) AS faturamento_ano_anterior,
       COUNT(*) FILTER (WHERE r.recorte = 'ano_anterior') AS cestas_ano_anterior,
       COUNT(DISTINCT r.household_key) FILTER (WHERE r.recorte = 'ano_anterior') AS clientes_ano_anterior
FROM painel.recortes_cesta r JOIN painel.grupo_cliente g USING (household_key)
GROUP BY ALL;

-- O mesmo por subconjunto de segmentos (a soma dos grupos dele), com a marca de loja comparável no período.
-- Grão: 1 linha por período × subconjunto × loja com cesta no período ou no ano anterior.
CREATE OR REPLACE VIEW painel.loja_periodo_subconjunto AS
SELECT x.periodo, s.subconjunto, s.ordem, x.STORE_ID,
       SUM(x.faturamento) AS faturamento, SUM(x.cestas) AS cestas, SUM(x.clientes) AS clientes, SUM(x.itens) AS itens,
       SUM(x.desconto) AS desconto, SUM(x.valor_bruto) AS valor_bruto,
       SUM(x.faturamento_comparavel) AS faturamento_comparavel, SUM(x.cestas_comparavel) AS cestas_comparavel,
       SUM(x.clientes_comparavel) AS clientes_comparavel,
       SUM(x.faturamento_ano_anterior) AS faturamento_ano_anterior, SUM(x.cestas_ano_anterior) AS cestas_ano_anterior,
       SUM(x.clientes_ano_anterior) AS clientes_ano_anterior,
       ANY_VALUE(lc.STORE_ID) IS NOT NULL AS comparavel
FROM painel.loja_periodo_grupo x
JOIN painel.subconjuntos s USING (grupo)
LEFT JOIN painel.lojas_comparaveis lc ON lc.periodo = x.periodo AND lc.STORE_ID = x.STORE_ID
GROUP BY x.periodo, s.subconjunto, s.ordem, x.STORE_ID;

-- Mix de segmentos de cada loja em cada período: parte do faturamento da loja de cada segmento e a mesma parte na rede;
-- indice = loja ÷ rede × 100 (100 = igual à rede). Só os 4 segmentos (sem 'Sem segmento'). Grão: 1 linha por período ×
-- loja × segmento (os 4).
CREATE OR REPLACE VIEW painel.loja_mix_segmento AS
WITH v AS (SELECT periodo, STORE_ID, grupo AS segmento, faturamento AS fat FROM painel.loja_periodo_grupo
           WHERE grupo <> 'Sem segmento' AND cestas > 0),
loja AS (SELECT periodo, STORE_ID, SUM(fat) AS fat FROM v GROUP BY periodo, STORE_ID),
rede AS (SELECT periodo, segmento, SUM(fat) / SUM(SUM(fat)) OVER (PARTITION BY periodo) AS pct FROM v GROUP BY periodo, segmento),
seg(segmento, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4))
SELECT l.periodo, l.STORE_ID, s.segmento, s.ordem,
       COALESCE(v.fat, 0) / NULLIF(l.fat, 0) AS pct, COALESCE(r.pct, 0) AS rede_pct,
       100 * (COALESCE(v.fat, 0) / NULLIF(l.fat, 0)) / NULLIF(r.pct, 0) AS indice
FROM loja l CROSS JOIN seg s
-- Segmento sem venda no período (Em pausa nas últimas 4 semanas, por definição): parte 0 na rede e índice nulo.
LEFT JOIN rede r ON r.periodo = l.periodo AND r.segmento = s.segmento
LEFT JOIN v ON v.periodo = l.periodo AND v.STORE_ID = l.STORE_ID AND v.segmento = s.segmento;

-- Departamentos de cada loja em cada período: parte do faturamento da loja e a mesma parte na rede; indice = loja ÷ rede
-- × 100. posicao = ordem por faturamento dentro da loja. Grão: 1 linha por período × loja × departamento com venda.
CREATE OR REPLACE VIEW painel.loja_mix_departamento AS
WITH v AS (
    SELECT periodo, STORE_ID, departamento, SUM(faturamento) AS fat
    FROM painel.recortes_departamento WHERE recorte = 'todas'
    GROUP BY ALL),
rede AS (SELECT periodo, departamento, SUM(fat) / SUM(SUM(fat)) OVER (PARTITION BY periodo) AS pct FROM v GROUP BY periodo, departamento)
SELECT v.periodo, v.STORE_ID, v.departamento, v.fat / SUM(v.fat) OVER (PARTITION BY v.periodo, v.STORE_ID) AS pct, r.pct AS rede_pct,
       100 * (v.fat / SUM(v.fat) OVER (PARTITION BY v.periodo, v.STORE_ID)) / r.pct AS indice,
       ROW_NUMBER() OVER (PARTITION BY v.periodo, v.STORE_ID ORDER BY v.fat DESC, v.departamento) AS posicao
FROM v JOIN rede r ON r.periodo = v.periodo AND r.departamento = v.departamento;
