-- lojas_ficha_<periodo>.json. Grão: 1 linha por loja com cesta no período. Ordem: faturamento decrescente.
-- KPIs do período (todas as cestas da loja) e, nas lojas comparáveis do período, as variações e a árvore de vendas
-- (definição arvore_de_vendas do RAG: faturamento = clientes × idas por cliente × ticket médio), com a regra de
-- origem.vw_yoy_loja aplicada à janela (nas 26 semanas, é a própria vw_yoy_loja: a reconciliação confere). Mix de
-- segmentos (os 4) e top 5 departamentos com o índice contra a rede no período. O Python monta a árvore.
WITH k AS (SELECT * FROM painel.loja_periodo_subconjunto WHERE periodo = $periodo AND subconjunto = 'todos' AND cestas > 0),
m AS (SELECT valor AS minimo FROM painel.parametros WHERE chave = 'loja_amostra_minima_cestas'),
seg AS (
    SELECT STORE_ID, list({'segmento': segmento, 'pct': ROUND(pct, 4), 'rede_pct': ROUND(rede_pct, 4), 'indice': ROUND(indice, 1)}
                          ORDER BY ordem) AS segmentos
    FROM painel.loja_mix_segmento WHERE periodo = $periodo GROUP BY STORE_ID),
dep AS (
    SELECT STORE_ID, list({'departamento': departamento, 'pct': ROUND(pct, 4), 'rede_pct': ROUND(rede_pct, 4), 'indice': ROUND(indice, 1)}
                          ORDER BY posicao) AS departamentos
    FROM painel.loja_mix_departamento WHERE periodo = $periodo AND posicao <= 5 GROUP BY STORE_ID)
SELECT k.STORE_ID AS id, ROUND(k.faturamento, 2) AS faturamento, k.cestas, k.clientes,
       ROUND(k.faturamento / k.cestas, 2) AS ticket_medio, ROUND(k.itens / k.cestas, 4) AS itens_por_cesta,
       ROUND(k.desconto / NULLIF(k.valor_bruto, 0), 4) AS desconto_pct, k.comparavel,
       CASE WHEN k.comparavel THEN k.cestas_comparavel < m.minimo OR k.cestas_ano_anterior < m.minimo ELSE k.cestas < m.minimo END AS amostra_pequena,
       CASE WHEN k.comparavel THEN ROUND(k.cestas_comparavel::DOUBLE / NULLIF(k.cestas_ano_anterior, 0) - 1, 4) END AS cestas_variacao_pct,
       -- Árvore de vendas (atual e um ano antes, nas lojas comparáveis).
       CASE WHEN k.comparavel THEN ROUND(k.faturamento_comparavel, 2) END AS faturamento_atual,
       CASE WHEN k.comparavel THEN ROUND(k.faturamento_ano_anterior, 2) END AS faturamento_base,
       CASE WHEN k.comparavel THEN ROUND(k.faturamento_comparavel / NULLIF(k.faturamento_ano_anterior, 0) - 1, 4) END AS faturamento_variacao_pct,
       CASE WHEN k.comparavel THEN k.clientes_comparavel END AS clientes_atual,
       CASE WHEN k.comparavel THEN k.clientes_ano_anterior END AS clientes_base,
       CASE WHEN k.comparavel THEN ROUND(k.clientes_comparavel::DOUBLE / NULLIF(k.clientes_ano_anterior, 0) - 1, 4) END AS clientes_variacao_pct,
       CASE WHEN k.comparavel THEN ROUND(k.cestas_comparavel::DOUBLE / k.clientes_comparavel, 4) END AS idas_por_cliente_atual,
       CASE WHEN k.comparavel THEN ROUND(k.cestas_ano_anterior::DOUBLE / NULLIF(k.clientes_ano_anterior, 0), 4) END AS idas_por_cliente_base,
       CASE WHEN k.comparavel THEN ROUND((k.cestas_comparavel::DOUBLE / k.clientes_comparavel)
                                         / NULLIF(k.cestas_ano_anterior::DOUBLE / NULLIF(k.clientes_ano_anterior, 0), 0) - 1, 4) END AS idas_por_cliente_variacao_pct,
       CASE WHEN k.comparavel THEN ROUND(k.faturamento_comparavel / k.cestas_comparavel, 2) END AS ticket_medio_atual,
       CASE WHEN k.comparavel THEN ROUND(k.faturamento_ano_anterior / NULLIF(k.cestas_ano_anterior, 0), 2) END AS ticket_medio_base,
       CASE WHEN k.comparavel THEN ROUND((k.faturamento_comparavel / k.cestas_comparavel)
                                         / NULLIF(k.faturamento_ano_anterior / NULLIF(k.cestas_ano_anterior, 0), 0) - 1, 4) END AS ticket_medio_variacao_pct,
       seg.segmentos, dep.departamentos
FROM k CROSS JOIN m
LEFT JOIN seg ON seg.STORE_ID = k.STORE_ID
LEFT JOIN dep ON dep.STORE_ID = k.STORE_ID
ORDER BY k.faturamento DESC, k.STORE_ID;
