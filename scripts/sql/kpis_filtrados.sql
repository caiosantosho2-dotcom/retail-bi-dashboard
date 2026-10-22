-- kpis_filtrados.json. Grão: 1 linha por período × subconjunto de segmentos × departamento ('todos' ou um só).
-- Métricas que não somam (painel.kpis_filtrados). variacao = comparável ÷ ano anterior − 1, como fração.
-- Ordem: período, subconjunto (máscara), 'todos' primeiro e depois os departamentos em ordem alfabética.
SELECT periodo, subconjunto, departamento,
       cestas, cestas_comparavel, cestas_ano_anterior,
       ROUND(cestas_comparavel / NULLIF(cestas_ano_anterior, 0) - 1, 4) AS cestas_variacao_pct,
       ROUND(ticket_medio, 2) AS ticket_medio, ROUND(ticket_medio_comparavel, 2) AS ticket_medio_comparavel,
       ROUND(ticket_medio_ano_anterior, 2) AS ticket_medio_ano_anterior,
       ROUND(ticket_medio_comparavel / NULLIF(ticket_medio_ano_anterior, 0) - 1, 4) AS ticket_medio_variacao_pct,
       ROUND(itens_por_cesta, 4) AS itens_por_cesta, ROUND(itens_por_cesta_comparavel, 4) AS itens_por_cesta_comparavel,
       ROUND(itens_por_cesta_ano_anterior, 4) AS itens_por_cesta_ano_anterior,
       ROUND(itens_por_cesta_comparavel / NULLIF(itens_por_cesta_ano_anterior, 0) - 1, 4) AS itens_por_cesta_variacao_pct,
       clientes_ativos, clientes_ativos_comparavel, clientes_ativos_ano_anterior,
       ROUND(clientes_ativos_comparavel / NULLIF(clientes_ativos_ano_anterior, 0) - 1, 4) AS clientes_ativos_variacao_pct,
       lojas_comparaveis, amostra_pequena
FROM painel.kpis_filtrados
ORDER BY ordem, ordem_sub, departamento <> 'todos', departamento;
