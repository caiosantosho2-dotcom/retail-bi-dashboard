-- lojas.json. Grão: 1 linha por loja com cesta nas 26 semanas ou do universo das regiões. Ordem: faturamento decrescente.
-- Indicadores das 26 semanas (painel.loja_kpis); variações like-for-like da view do RAG origem.vw_yoy_loja (só as
-- lojas comparáveis; null nas outras). x, y: posição no mapa de clientela (null nas lojas pequenas).
-- amostra_pequena: nas lojas comparáveis, a da view do RAG (menos de 100 cestas em QUALQUER um dos dois períodos: uma
-- loja com 460 cestas agora e 1 um ano antes não entra em ranking de crescimento); nas outras, menos de 100 cestas nas
-- 26 semanas (painel.loja_kpis).
SELECT k.STORE_ID AS id, k.regiao, ROUND(k.x, 4) AS x, ROUND(k.y, 4) AS y,
       ROUND(k.faturamento, 2) AS faturamento, k.cestas, k.clientes,
       ROUND(k.faturamento / NULLIF(k.cestas, 0), 2) AS ticket_medio,
       ROUND(k.itens / NULLIF(k.cestas, 0), 4) AS itens_por_cesta,
       ROUND(k.desconto / NULLIF(k.valor_bruto, 0), 4) AS desconto_pct,
       yy.STORE_ID IS NOT NULL AS comparavel,
       ROUND(yy.faturamento_base, 2) AS faturamento_ano_anterior,
       ROUND(yy.var_faturamento_pct / 100, 4) AS faturamento_variacao_pct,
       ROUND(yy.var_cestas_pct / 100, 4) AS cestas_variacao_pct,
       ROUND(yy.var_clientes_pct / 100, 4) AS clientes_variacao_pct,
       ROUND(yy.var_ticket_pct / 100, 4) AS ticket_variacao_pct,
       COALESCE(yy.amostra_pequena, k.amostra_pequena) AS amostra_pequena
FROM painel.loja_kpis k
LEFT JOIN origem.vw_yoy_loja yy ON yy.STORE_ID = k.STORE_ID
WHERE k.cestas > 0 OR k.x IS NOT NULL
ORDER BY k.faturamento DESC, k.STORE_ID;
