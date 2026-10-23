-- lojas_ranking_<periodo>.json (compacto). Grão: 1 linha por subconjunto de segmentos × loja com cesta do subconjunto
-- no período. Para o ranking de Clientes & Lojas: faturamento e cestas (todas as cestas da loja dos clientes do
-- subconjunto), ticket médio, e o crescimento like-for-like nas lojas comparáveis do período (a regra de vw_yoy_loja:
-- faturamento agora ÷ um ano antes − 1; null nas não comparáveis e na base inteira).
-- amostra_pequena (a regra do RAG para loja): comparável, menos de 100 cestas em qualquer um dos dois períodos; senão,
-- menos de 100 cestas no período. faturamento_sem_segmento: só em 'todos' (o pedaço dos clientes sem segmento).
-- Ordem: subconjunto, faturamento decrescente, loja.
WITH m AS (SELECT valor AS minimo FROM painel.parametros WHERE chave = 'loja_amostra_minima_cestas'),
sem AS (SELECT STORE_ID, faturamento FROM painel.loja_periodo_grupo WHERE periodo = $periodo AND grupo = 'Sem segmento')
SELECT x.subconjunto, x.STORE_ID AS loja, ROUND(x.faturamento, 2) AS faturamento, x.cestas,
       ROUND(x.faturamento / NULLIF(x.cestas, 0), 2) AS ticket_medio, x.comparavel,
       CASE WHEN x.comparavel THEN ROUND(x.faturamento_comparavel / NULLIF(x.faturamento_ano_anterior, 0) - 1, 4) END AS faturamento_variacao_pct,
       CASE WHEN x.comparavel THEN x.cestas_comparavel < m.minimo OR x.cestas_ano_anterior < m.minimo ELSE x.cestas < m.minimo END AS amostra_pequena,
       CASE WHEN x.subconjunto = 'todos' THEN ROUND(COALESCE(sem.faturamento, 0), 2) END AS faturamento_sem_segmento
FROM painel.loja_periodo_subconjunto x CROSS JOIN m
LEFT JOIN sem ON sem.STORE_ID = x.STORE_ID
WHERE x.periodo = $periodo AND x.cestas > 0
ORDER BY x.ordem, x.faturamento DESC, x.STORE_ID;
