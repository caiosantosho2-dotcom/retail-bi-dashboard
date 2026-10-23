-- Pares de subcategorias da aba Categorias (redesenho v3: todos os departamentos, por período). Rodado só na etapa
-- cesta_subcategorias, depois de views_painel.sql. A unidade é a cesta, reduzida a pares distintos cesta × subcategoria.
-- Métricas (spec, seção 6): suporte = cestas com A e B ÷ total de cestas; confianca_a_b = cestas com A e B ÷ cestas com
-- A (e a recíproca); lift = confiança ÷ (cestas com B ÷ total), simétrico.
-- amostra_pequena: menos de `minimo_cestas_par` (200) cestas com o par. Com menos de 200 cestas, o lift oscila muito
-- entre semanas: entre as duas metades da janela de 26 semanas (76-88 × 89-101), nos pares de subcategorias de GROCERY,
-- a variação mediana do lift foi de 32% com menos de 50 cestas, 15% com 50-99, 11% com 100-199, 7% com 200-399 e 4%
-- com 400 ou mais (p90: 95%, 37%, 28%, 18% e 12%). A partir de 200, 9 em cada 10 pares variam menos de 20%.

-- Cesta × subcategoria (COMMODITY_DESC), da semana 1 até a última completa, com o grupo do cliente.
-- Grão: 1 linha por cesta × departamento × subcategoria. Tabela: a etapa a lê uma vez por departamento × período.
CREATE OR REPLACE TABLE painel.cesta_subcategoria AS
SELECT DISTINCT g.grupo, i.BASKET_ID, i.WEEK_NO, i.DEPARTMENT AS departamento, i.COMMODITY_DESC AS subcategoria
FROM origem.vw_vendas_item i
JOIN painel.grupo_cliente g ON g.household_key = i.household_key
CROSS JOIN origem.vw_janela j
WHERE i.WEEK_NO <= j.semana_fim_atual;

-- Pares de subcategorias dentro de UM departamento, nas semanas ini..fim, por subconjunto de segmentos. Macro de
-- tabela para a exportação rodar um departamento × período por vez (GROCERY na base inteira passa de 10 milhões de
-- linhas antes de agregar). O total de cestas é o de todas as cestas do subconjunto nas semanas (não só as do
-- departamento). As contagens são somadas por grupo e depois por subconjunto: cada cesta tem um só cliente, então a
-- soma é exata. Grão: 1 linha por subconjunto × par não ordenado (subcategoria_a < subcategoria_b).
CREATE OR REPLACE MACRO painel.par_subcategoria(dep, ini, fim) AS TABLE
WITH cs AS (
    SELECT grupo, BASKET_ID, subcategoria FROM painel.cesta_subcategoria
    WHERE departamento = dep AND WEEK_NO BETWEEN ini AND fim),
n AS (
    SELECT g.grupo, COUNT(*) AS n FROM painel.cestas c JOIN painel.grupo_cliente g USING (household_key)
    WHERE c.WEEK_NO BETWEEN ini AND fim GROUP BY g.grupo),
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
