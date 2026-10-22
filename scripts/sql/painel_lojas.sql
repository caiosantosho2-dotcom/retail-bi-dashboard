-- Views da aba Lojas que dependem das regiões. Rodado na etapa `lojas`, depois de scripts/regioes.py gravar
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

-- Mix de segmentos de cada loja nas 26 semanas: parte do faturamento da loja de cada segmento e a mesma parte na
-- rede inteira; indice = loja ÷ rede × 100 (100 = igual à rede). Grão: 1 linha por loja × segmento (os 4).
CREATE OR REPLACE VIEW painel.loja_mix_segmento AS
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
v AS (
    SELECT c.STORE_ID, g.grupo AS segmento, SUM(c.faturamento) AS fat
    FROM painel.cestas c JOIN painel.grupo_cliente g USING (household_key), p
    WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim AND g.grupo <> 'Sem segmento'
    GROUP BY ALL),
loja AS (SELECT STORE_ID, SUM(fat) AS fat FROM v GROUP BY STORE_ID),
rede AS (SELECT segmento, SUM(fat) / (SELECT SUM(fat) FROM v) AS pct FROM v GROUP BY segmento),
seg(segmento, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4))
SELECT l.STORE_ID, s.segmento, s.ordem,
       COALESCE(v.fat, 0) / l.fat AS pct, r.pct AS rede_pct, 100 * (COALESCE(v.fat, 0) / l.fat) / r.pct AS indice
FROM loja l CROSS JOIN seg s
JOIN rede r ON r.segmento = s.segmento
LEFT JOIN v ON v.STORE_ID = l.STORE_ID AND v.segmento = s.segmento;

-- Departamentos de cada loja nas 26 semanas: parte do faturamento da loja e a mesma parte na rede; indice = loja ÷
-- rede × 100. posicao = ordem por faturamento dentro da loja. Grão: 1 linha por loja × departamento com venda.
CREATE OR REPLACE VIEW painel.loja_mix_departamento AS
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
v AS (
    SELECT c.STORE_ID, c.departamento, SUM(c.faturamento) AS fat
    FROM painel.cesta_departamento c, p
    WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL),
rede AS (SELECT departamento, SUM(fat) / (SELECT SUM(fat) FROM v) AS pct FROM v GROUP BY departamento)
SELECT v.STORE_ID, v.departamento, v.fat / SUM(v.fat) OVER (PARTITION BY v.STORE_ID) AS pct, r.pct AS rede_pct,
       100 * (v.fat / SUM(v.fat) OVER (PARTITION BY v.STORE_ID)) / r.pct AS indice,
       ROW_NUMBER() OVER (PARTITION BY v.STORE_ID ORDER BY v.fat DESC, v.departamento) AS posicao
FROM v JOIN rede r USING (departamento);

-- Faturamento semanal de cada região nas últimas 52 semanas, todas as lojas da região. indice = semana ÷ média semanal
-- da própria região nas 52 semanas × 100 (100 = semana típica da região), para comparar ritmo e tendência entre regiões
-- de tamanhos diferentes. Grão: 1 linha por região × semana.
CREATE OR REPLACE VIEW painel.regiao_semana AS
WITH j AS (SELECT semana_fim_atual AS fim FROM origem.vw_janela),
semanas AS (SELECT d.WEEK_NO, MIN(d.data) AS semana_inicio FROM origem.dim_data d, j WHERE d.WEEK_NO BETWEEN j.fim - 51 AND j.fim GROUP BY d.WEEK_NO),
regioes AS (SELECT DISTINCT regiao FROM painel.loja_grupo),
v AS (
    SELECT g.regiao, c.WEEK_NO, SUM(c.faturamento) AS fat
    FROM painel.cestas c JOIN painel.loja_grupo g USING (STORE_ID)
    WHERE c.WEEK_NO IN (SELECT WEEK_NO FROM semanas)
    GROUP BY ALL),
grade AS (
    SELECT r.regiao, s.WEEK_NO, s.semana_inicio, COALESCE(v.fat, 0) AS fat
    FROM regioes r CROSS JOIN semanas s LEFT JOIN v ON v.regiao = r.regiao AND v.WEEK_NO = s.WEEK_NO)
SELECT regiao, WEEK_NO, semana_inicio, fat AS faturamento,
       100 * fat / NULLIF(AVG(fat) OVER (PARTITION BY regiao), 0) AS indice
FROM grade;
