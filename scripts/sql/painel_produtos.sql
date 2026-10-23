-- Views da aba Cestas & Marcas (spec 5.5, redesenho v3). Rodado na etapa `produtos`, depois de o Python criar
-- painel.parametros_rede(rede_subcategorias, rede_ligacoes_por_no, rede_caracteristicos) a partir do config.yaml.
-- Requer views_painel.sql. Os nós e as ligações desenhadas da rede são fixos (a janela da cesta, 26 semanas): trocar o
-- desenho a cada período desorientaria. Os números (pares, marcas, concentração) saem por período × subconjunto.

-- Concentração do faturamento nas subcategorias (no lugar da curva ABC): quantas subcategorias (departamento ×
-- COMMODITY_DESC), da maior para a menor, fazem 80% do faturamento, pela regra da classe A da antiga curva (a que cruza
-- 80% ainda conta). Grão: 1 linha por período × subconjunto de segmentos.
CREATE OR REPLACE VIEW painel.concentracao AS
WITH v AS (
    SELECT p.periodo, g.grupo, i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria, SUM(i.faturamento) AS fat
    FROM origem.vw_vendas_item i
    JOIN painel.grupo_cliente g ON g.household_key = i.household_key
    JOIN painel.periodos p ON i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY ALL),
s AS (
    SELECT v.periodo, x.subconjunto, x.ordem, v.departamento, v.subcategoria, SUM(v.fat) AS fat
    FROM v JOIN painel.subconjuntos x USING (grupo) GROUP BY ALL HAVING SUM(v.fat) > 0),
o AS (
    SELECT *, SUM(fat) OVER (PARTITION BY periodo, subconjunto ORDER BY fat DESC, departamento, subcategoria ROWS UNBOUNDED PRECEDING)
              / SUM(fat) OVER (PARTITION BY periodo, subconjunto) AS acumulado,
           fat / SUM(fat) OVER (PARTITION BY periodo, subconjunto) AS parte
    FROM s)
SELECT periodo, subconjunto, ordem, COUNT(*) FILTER (WHERE acumulado - parte < 0.80) AS subcategorias_80, COUNT(*) AS subcategorias
FROM o GROUP BY ALL;

-- Marca própria e fornecedores por período × subconjunto × departamento, com as lojas comparáveis do período para o
-- crescimento de cada marca (a regra de vw_lojas_like_for_like aplicada à janela; nas 26 semanas, a mesma de
-- origem.vw_yoy_categoria). Grão: 1 linha por período × recorte × grupo × departamento × marca × fabricante.
CREATE OR REPLACE TABLE painel.marca_recorte AS
WITH i AS (
    SELECT i.WEEK_NO, i.STORE_ID, i.DEPARTMENT AS departamento, i.BRAND AS marca, i.MANUFACTURER AS fabricante,
           i.faturamento AS fat, g.grupo
    FROM origem.vw_vendas_item i JOIN painel.grupo_cliente g ON g.household_key = i.household_key)
SELECT p.periodo, 'todas' AS recorte, i.grupo, i.departamento, i.marca, i.fabricante, SUM(i.fat) AS fat
FROM i JOIN painel.periodos p ON i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim GROUP BY ALL
UNION ALL
SELECT p.periodo, 'comparavel', i.grupo, i.departamento, i.marca, NULL, SUM(i.fat)
FROM i JOIN painel.periodos p ON i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = i.STORE_ID GROUP BY ALL
UNION ALL
SELECT p.periodo, 'ano_anterior', i.grupo, i.departamento, i.marca, NULL, SUM(i.fat)
FROM i JOIN painel.periodos p ON i.WEEK_NO BETWEEN p.semana_ini_ant AND p.semana_fim_ant
JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = i.STORE_ID GROUP BY ALL;

-- Marca própria e concentração de fornecedores por período × subconjunto × departamento. O fabricante vem anonimizado
-- (MANUFACTURER, um código); o 69 responde por 97% da marca própria (é a própria rede). Fornecedores nacionais =
-- MANUFACTURER das vendas com BRAND = 'National': fabricantes_80 = quantos, do maior para o menor, somam 80% do
-- faturamento nacional do departamento; maior_fabricante_pct = parte do maior. Crescimento de cada marca nas lojas
-- comparáveis do período (null na base inteira). Grão: 1 linha por período × subconjunto × departamento com venda.
CREATE OR REPLACE VIEW painel.marcas_departamento AS
WITH x AS (
    SELECT m.periodo, m.recorte, s.subconjunto, s.ordem, m.departamento, m.marca, m.fabricante, SUM(m.fat) AS fat
    FROM painel.marca_recorte m JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
dep AS (
    SELECT periodo, subconjunto, ordem, departamento, SUM(fat) AS fat,
           COALESCE(SUM(fat) FILTER (WHERE marca = 'Private'), 0) AS fat_mp
    FROM x WHERE recorte = 'todas' GROUP BY ALL),
nac AS (
    SELECT periodo, subconjunto, departamento, fabricante, SUM(fat) AS fat
    FROM x WHERE recorte = 'todas' AND marca = 'National' GROUP BY ALL HAVING SUM(fat) > 0),
ordem AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY periodo, subconjunto, departamento ORDER BY fat DESC, fabricante) AS posicao,
           fat / SUM(fat) OVER (PARTITION BY periodo, subconjunto, departamento) AS parte,
           SUM(fat) OVER (PARTITION BY periodo, subconjunto, departamento ORDER BY fat DESC, fabricante ROWS UNBOUNDED PRECEDING)
             / SUM(fat) OVER (PARTITION BY periodo, subconjunto, departamento) AS acumulado
    FROM nac),
conc AS (
    SELECT periodo, subconjunto, departamento, COUNT(*) AS fabricantes_nacionais,
           MIN(posicao) FILTER (WHERE acumulado >= 0.8 - 1e-12) AS fabricantes_80, MAX(parte) AS maior_fabricante_pct
    FROM ordem GROUP BY ALL),
yoy AS (
    SELECT periodo, subconjunto, departamento,
           SUM(fat) FILTER (WHERE recorte = 'comparavel' AND marca = 'Private') AS mp_atual,
           SUM(fat) FILTER (WHERE recorte = 'ano_anterior' AND marca = 'Private') AS mp_base,
           SUM(fat) FILTER (WHERE recorte = 'comparavel' AND marca = 'National') AS nac_atual,
           SUM(fat) FILTER (WHERE recorte = 'ano_anterior' AND marca = 'National') AS nac_base
    FROM x WHERE recorte <> 'todas' GROUP BY ALL)
SELECT d.periodo, d.subconjunto, d.ordem, d.departamento, d.fat AS faturamento,
       d.fat / SUM(d.fat) OVER (PARTITION BY d.periodo, d.subconjunto) AS participacao,
       d.fat_mp / NULLIF(d.fat, 0) AS marca_propria,
       y.mp_atual / NULLIF(y.mp_base, 0) - 1 AS marca_propria_crescimento,
       y.nac_atual / NULLIF(y.nac_base, 0) - 1 AS nacional_crescimento,
       c.fabricantes_nacionais, c.fabricantes_80, c.maior_fabricante_pct
FROM dep d
LEFT JOIN conc c ON c.periodo = d.periodo AND c.subconjunto = d.subconjunto AND c.departamento = d.departamento
LEFT JOIN yoy y ON y.periodo = d.periodo AND y.subconjunto = d.subconjunto AND y.departamento = d.departamento
WHERE d.fat > 0;

-- Nós da rede de cestas: as `rede_subcategorias` (80) maiores subcategorias na janela da cesta. Grão: 1 linha por nó
-- (no = 0 é a maior). Chave: departamento × subcategoria. Fixos em qualquer período.
CREATE OR REPLACE VIEW painel.rede_nos AS
SELECT no, departamento, subcategoria, faturamento FROM (
    SELECT ROW_NUMBER() OVER (ORDER BY SUM(i.faturamento) DESC, i.DEPARTMENT, i.COMMODITY_DESC) - 1 AS no,
           i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria, SUM(i.faturamento) AS faturamento
    FROM origem.vw_vendas_item i JOIN painel.janela_cesta w ON i.WEEK_NO BETWEEN w.semana_ini AND w.semana_fim
    GROUP BY i.DEPARTMENT, i.COMMODITY_DESC)
WHERE no < (SELECT rede_subcategorias FROM painel.parametros_rede);

-- Pares de nós da rede comprados na mesma cesta, por período × subconjunto de segmentos. Grão: 1 linha por período ×
-- subconjunto × par (no_a < no_b) com ao menos uma cesta. Métricas da análise de cesta (spec, seção 6), mínimo de 200
-- cestas; o total de cestas é o de todas as cestas do subconjunto no período. indice = lift do subconjunto ÷ lift com
-- todos os clientes, no mesmo período. Tabela (não view): várias consultas da etapa a usam.
CREATE OR REPLACE TABLE painel.rede_par AS
WITH cs AS (
    SELECT DISTINCT p.periodo, g.grupo, i.BASKET_ID, n.no
    FROM origem.vw_vendas_item i
    JOIN painel.rede_nos n ON n.departamento = i.DEPARTMENT AND n.subcategoria = i.COMMODITY_DESC
    JOIN painel.grupo_cliente g ON g.household_key = i.household_key
    JOIN painel.periodos p ON i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim),
n AS (
    SELECT p.periodo, g.grupo, COUNT(*) AS n FROM painel.cestas c JOIN painel.grupo_cliente g USING (household_key)
    JOIN painel.periodos p ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim GROUP BY ALL),
na AS (SELECT periodo, grupo, no, COUNT(*) AS n FROM cs GROUP BY ALL),
nab AS (SELECT a.periodo, a.grupo, a.no AS a, b.no AS b, COUNT(*) AS n
        FROM cs a JOIN cs b ON b.periodo = a.periodo AND b.BASKET_ID = a.BASKET_ID AND b.no > a.no GROUP BY ALL),
sn AS (SELECT n.periodo, s.subconjunto, s.ordem, SUM(n.n) AS n FROM n JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
sna AS (SELECT na.periodo, s.subconjunto, na.no, SUM(na.n) AS n FROM na JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
snab AS (SELECT nab.periodo, s.subconjunto, nab.a, nab.b, SUM(nab.n) AS n FROM nab JOIN painel.subconjuntos s USING (grupo) GROUP BY ALL),
p AS (
    SELECT q.periodo, q.subconjunto, sn.ordem, q.a AS no_a, q.b AS no_b, q.n AS cestas_par, sa.n AS cestas_a, sb.n AS cestas_b,
           sn.n AS cestas_total, q.n::DOUBLE * sn.n / (sa.n::DOUBLE * sb.n) AS lift,
           q.n < (SELECT valor FROM painel.parametros WHERE chave = 'minimo_cestas_par') AS amostra_pequena
    FROM snab q
    JOIN sn ON sn.periodo = q.periodo AND sn.subconjunto = q.subconjunto
    JOIN sna sa ON sa.periodo = q.periodo AND sa.subconjunto = q.subconjunto AND sa.no = q.a
    JOIN sna sb ON sb.periodo = q.periodo AND sb.subconjunto = q.subconjunto AND sb.no = q.b)
SELECT p.*, t.lift AS lift_todos, p.lift / t.lift AS indice
FROM p JOIN p t ON t.periodo = p.periodo AND t.subconjunto = 'todos' AND t.no_a = p.no_a AND t.no_b = p.no_b;

-- Ligações desenhadas no grafo: as `rede_ligacoes_por_no` (3) de maior lift de cada nó, com todos os clientes, na
-- janela da cesta (26 semanas) e sem amostra pequena. Fixas em qualquer período. Grão: 1 linha por par desenhado.
CREATE OR REPLACE VIEW painel.rede_ligacao AS
WITH t AS (SELECT no_a, no_b, lift FROM painel.rede_par WHERE periodo = '26s' AND subconjunto = 'todos' AND NOT amostra_pequena),
pontas AS (SELECT no_a AS no, no_a, no_b, lift FROM t UNION ALL SELECT no_b, no_a, no_b, lift FROM t)
SELECT DISTINCT no_a, no_b FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY no ORDER BY lift DESC, no_a, no_b) AS r FROM pontas)
WHERE r <= (SELECT rede_ligacoes_por_no FROM painel.parametros_rede);
