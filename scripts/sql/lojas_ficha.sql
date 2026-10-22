-- lojas_ficha.json. Grão: 1 linha por loja com cesta nas 26 semanas. Ordem: faturamento decrescente.
-- Árvore de vendas (definição arvore_de_vendas do RAG: faturamento = clientes × idas por cliente × ticket médio), com os
-- números de origem.vw_yoy_loja (atual × ano anterior, só lojas comparáveis; null nas outras). O Python monta os objetos.
-- Mix de segmentos (os 4) e top 5 departamentos com o índice contra a rede (painel.loja_mix_*).
WITH seg AS (
    SELECT STORE_ID, list({'segmento': segmento, 'pct': ROUND(pct, 4), 'rede_pct': ROUND(rede_pct, 4), 'indice': ROUND(indice, 1)}
                          ORDER BY ordem) AS segmentos
    FROM painel.loja_mix_segmento GROUP BY STORE_ID),
dep AS (
    SELECT STORE_ID, list({'departamento': departamento, 'pct': ROUND(pct, 4), 'rede_pct': ROUND(rede_pct, 4), 'indice': ROUND(indice, 1)}
                          ORDER BY posicao) AS departamentos
    FROM painel.loja_mix_departamento WHERE posicao <= 5 GROUP BY STORE_ID),
a AS (
    SELECT STORE_ID,
           faturamento_atual::DOUBLE AS fat_a, faturamento_base::DOUBLE AS fat_b,
           clientes_atual::DOUBLE AS cli_a, clientes_base::DOUBLE AS cli_b,
           cestas_atual::DOUBLE / clientes_atual AS idas_a, cestas_base::DOUBLE / clientes_base AS idas_b,
           ticket_atual AS tic_a, ticket_base AS tic_b
    FROM origem.vw_yoy_loja)
SELECT k.STORE_ID AS id,
       ROUND(a.fat_a, 2) AS faturamento_atual, ROUND(a.fat_b, 2) AS faturamento_base, ROUND(a.fat_a / a.fat_b - 1, 4) AS faturamento_variacao_pct,
       a.cli_a::INTEGER AS clientes_atual, a.cli_b::INTEGER AS clientes_base, ROUND(a.cli_a / a.cli_b - 1, 4) AS clientes_variacao_pct,
       ROUND(a.idas_a, 4) AS idas_por_cliente_atual, ROUND(a.idas_b, 4) AS idas_por_cliente_base, ROUND(a.idas_a / a.idas_b - 1, 4) AS idas_por_cliente_variacao_pct,
       ROUND(a.tic_a, 2) AS ticket_medio_atual, ROUND(a.tic_b, 2) AS ticket_medio_base, ROUND(a.tic_a / a.tic_b - 1, 4) AS ticket_medio_variacao_pct,
       seg.segmentos, dep.departamentos
FROM painel.loja_kpis k
LEFT JOIN a ON a.STORE_ID = k.STORE_ID
LEFT JOIN seg ON seg.STORE_ID = k.STORE_ID
LEFT JOIN dep ON dep.STORE_ID = k.STORE_ID
WHERE k.cestas > 0
ORDER BY k.faturamento DESC, k.STORE_ID;
