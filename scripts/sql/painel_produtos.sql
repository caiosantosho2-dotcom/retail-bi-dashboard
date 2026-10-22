-- Views da aba Produtos (spec 5.5). Rodado na etapa `produtos`, depois de o Python criar
-- painel.parametros_rede(rede_subcategorias, rede_ligacoes_por_no, rede_caracteristicos) a partir do config.yaml.
-- Requer views_painel.sql. Janela: as 26 semanas da segmentação (ABC e marcas) e a janela da cesta (rede).

-- Curva ABC das subcategorias (COMMODITY_DESC) nas 26 semanas, todas as lojas. Grão: 1 linha por departamento ×
-- subcategoria (22 nomes de subcategoria existem em mais de um departamento: o par é a chave).
-- classe: pela participação acumulada ANTES da subcategoria, em ordem de faturamento: A < 80%, B < 95%, C o resto
-- (a subcategoria que cruza 80% ainda é A). marca_propria: faturamento com BRAND = 'Private' ÷ faturamento.
CREATE OR REPLACE VIEW painel.abc AS
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
v AS (
    SELECT i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria, SUM(i.faturamento) AS fat,
           COALESCE(SUM(i.faturamento) FILTER (WHERE i.BRAND = 'Private'), 0) AS fat_mp
    FROM origem.vw_vendas_item i, p
    WHERE i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL),
o AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY fat DESC, departamento, subcategoria) AS posicao,
           fat / SUM(fat) OVER () AS participacao,
           SUM(fat) OVER (ORDER BY fat DESC, departamento, subcategoria ROWS UNBOUNDED PRECEDING) / SUM(fat) OVER () AS acumulado
    FROM v)
SELECT departamento, subcategoria, posicao, fat AS faturamento, participacao, acumulado,
       CASE WHEN acumulado - participacao < 0.80 THEN 'A' WHEN acumulado - participacao < 0.95 THEN 'B' ELSE 'C' END AS classe,
       fat_mp / fat AS marca_propria
FROM o;

-- Marca própria e concentração de fornecedores por departamento, 26 semanas, todas as lojas.
-- Grão: 1 linha por departamento com venda. O fabricante vem anonimizado (MANUFACTURER, um código); o 69 responde por
-- 97% da marca própria (é a própria rede). Fornecedores nacionais = MANUFACTURER das vendas com BRAND = 'National':
-- fabricantes_80 = quantos, do maior para o menor, somam 80% do faturamento nacional do departamento;
-- maior_fabricante_pct = parte do maior. Crescimento like-for-like de cada marca: soma de origem.vw_yoy_categoria.
CREATE OR REPLACE VIEW painel.marcas_departamento AS
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
v AS (
    SELECT i.DEPARTMENT AS departamento, i.BRAND AS marca, i.MANUFACTURER AS fabricante, SUM(i.faturamento) AS fat
    FROM origem.vw_vendas_item i, p
    WHERE i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL),
dep AS (
    SELECT departamento, SUM(fat) AS fat,
           COALESCE(SUM(fat) FILTER (WHERE marca = 'Private'), 0) AS fat_mp,
           COALESCE(SUM(fat) FILTER (WHERE marca = 'National'), 0) AS fat_nac
    FROM v GROUP BY departamento),
nac AS (
    SELECT departamento, fabricante, SUM(fat) AS fat FROM v WHERE marca = 'National' GROUP BY ALL HAVING SUM(fat) > 0),
ordem AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY departamento ORDER BY fat DESC, fabricante) AS posicao,
           fat / SUM(fat) OVER (PARTITION BY departamento) AS parte,
           SUM(fat) OVER (PARTITION BY departamento ORDER BY fat DESC, fabricante ROWS UNBOUNDED PRECEDING)
             / SUM(fat) OVER (PARTITION BY departamento) AS acumulado
    FROM nac),
conc AS (
    SELECT departamento, COUNT(*) AS fabricantes_nacionais, MIN(posicao) FILTER (WHERE acumulado >= 0.8 - 1e-12) AS fabricantes_80,
           MAX(parte) AS maior_fabricante_pct
    FROM ordem GROUP BY departamento),
yoy AS (
    SELECT DEPARTMENT AS departamento,
           SUM(faturamento_atual) FILTER (WHERE marca = 'Private')::DOUBLE AS mp_atual,
           SUM(faturamento_base) FILTER (WHERE marca = 'Private')::DOUBLE AS mp_base,
           SUM(faturamento_atual) FILTER (WHERE marca = 'National')::DOUBLE AS nac_atual,
           SUM(faturamento_base) FILTER (WHERE marca = 'National')::DOUBLE AS nac_base
    FROM origem.vw_yoy_categoria GROUP BY DEPARTMENT)
SELECT d.departamento, d.fat AS faturamento, d.fat / SUM(d.fat) OVER () AS participacao,
       d.fat_mp / d.fat AS marca_propria,
       y.mp_atual / NULLIF(y.mp_base, 0) - 1 AS marca_propria_crescimento,
       y.nac_atual / NULLIF(y.nac_base, 0) - 1 AS nacional_crescimento,
       c.fabricantes_nacionais, c.fabricantes_80, c.maior_fabricante_pct
FROM dep d LEFT JOIN conc c USING (departamento) LEFT JOIN yoy y USING (departamento);

-- Nós da rede de cestas: as `rede_subcategorias` (80) maiores subcategorias na janela da cesta. Grão: 1 linha por nó
-- (no = 0 é a maior). Chave: departamento × subcategoria.
CREATE OR REPLACE VIEW painel.rede_nos AS
SELECT no, departamento, subcategoria, faturamento FROM (
    SELECT ROW_NUMBER() OVER (ORDER BY SUM(i.faturamento) DESC, i.DEPARTMENT, i.COMMODITY_DESC) - 1 AS no,
           i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria, SUM(i.faturamento) AS faturamento
    FROM origem.vw_vendas_item i JOIN painel.janela_cesta w ON i.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim
    GROUP BY i.DEPARTMENT, i.COMMODITY_DESC)
WHERE no < (SELECT rede_subcategorias FROM painel.parametros_rede);

-- Pares de nós da rede comprados na mesma cesta, por subconjunto de segmentos. Grão: 1 linha por subconjunto × par
-- (no_a < no_b) com ao menos uma cesta. Mesmas métricas e mesmo mínimo (200 cestas) de painel.par_departamento; o total
-- de cestas é o de todas as cestas do subconjunto na janela. indice = lift do subconjunto ÷ lift com todos os clientes.
-- Tabela (não view): quatro consultas da etapa a usam, e recalcular os pares a cada uma custava ~1 min.
CREATE OR REPLACE TABLE painel.rede_par AS
WITH cs AS (
    SELECT DISTINCT g.grupo, i.BASKET_ID, n.no
    FROM origem.vw_vendas_item i
    JOIN painel.rede_nos n ON n.departamento = i.DEPARTMENT AND n.subcategoria = i.COMMODITY_DESC
    JOIN painel.grupo_cliente g ON g.household_key = i.household_key
    JOIN painel.janela_cesta w ON i.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim),
n AS (SELECT grupo, COUNT(DISTINCT BASKET_ID) AS n FROM painel.cesta_grupo GROUP BY grupo),
na AS (SELECT grupo, no, COUNT(*) AS n FROM cs GROUP BY ALL),
nab AS (SELECT a.grupo, a.no AS a, b.no AS b, COUNT(*) AS n FROM cs a JOIN cs b ON b.BASKET_ID = a.BASKET_ID AND b.no > a.no GROUP BY ALL),
sn AS (SELECT s.subconjunto, s.ordem, SUM(n.n) AS n FROM n JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
sna AS (SELECT s.subconjunto, na.no, SUM(na.n) AS n FROM na JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
snab AS (SELECT s.subconjunto, nab.a, nab.b, SUM(nab.n) AS n FROM nab JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
p AS (
    SELECT q.subconjunto, sn.ordem, q.a AS no_a, q.b AS no_b, q.n AS cestas_par, sa.n AS cestas_a, sb.n AS cestas_b, sn.n AS cestas_total,
           q.n::DOUBLE * sn.n / (sa.n::DOUBLE * sb.n) AS lift,
           q.n < (SELECT valor FROM painel.parametros WHERE chave = 'minimo_cestas_par') AS amostra_pequena
    FROM snab q
    JOIN sn ON sn.subconjunto = q.subconjunto
    JOIN sna sa ON sa.subconjunto = q.subconjunto AND sa.no = q.a
    JOIN sna sb ON sb.subconjunto = q.subconjunto AND sb.no = q.b)
SELECT p.*, t.lift AS lift_todos, p.lift / t.lift AS indice
FROM p JOIN p t ON t.subconjunto = 'todos' AND t.no_a = p.no_a AND t.no_b = p.no_b;

-- Ligações desenhadas no grafo: as `rede_ligacoes_por_no` (3) de maior lift de cada nó, com todos os clientes e sem
-- amostra pequena. Grão: 1 linha por par desenhado.
CREATE OR REPLACE VIEW painel.rede_ligacao AS
WITH t AS (SELECT no_a, no_b, lift FROM painel.rede_par WHERE subconjunto = 'todos' AND NOT amostra_pequena),
pontas AS (SELECT no_a AS no, no_a, no_b, lift FROM t UNION ALL SELECT no_b, no_a, no_b, lift FROM t)
SELECT DISTINCT no_a, no_b FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY no ORDER BY lift DESC, no_a, no_b) AS r FROM pontas)
WHERE r <= (SELECT rede_ligacoes_por_no FROM painel.parametros_rede);
