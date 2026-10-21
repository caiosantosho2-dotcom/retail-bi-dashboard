-- segmentos.json. Grão: 1 linha por segmento (4). Ordem: a ordem fixa do contrato.
-- Os números vêm do RFM, do CLV e do teste de desconto do RAG (painel.rag_*); só o % em risco alto é do painel.
WITH risco AS (
    SELECT s.segmento, COUNT(r.household_key) AS com_risco, COUNT(*) FILTER (WHERE r.faixa = 'alto') AS alto
    FROM painel.rag_segmento_cliente s
    LEFT JOIN painel.cliente_risco r ON r.household_key = s.household_key
    GROUP BY s.segmento)
SELECT g.segmento,
       g.households AS clientes,
       ROUND(g.households / SUM(g.households) OVER (), 4) AS clientes_pct,
       ROUND(g.valor_total, 2) AS faturamento,
       ROUND(g.valor_total / SUM(g.valor_total) OVER (), 4) AS faturamento_pct,
       ROUND(g.ticket_medio, 2) AS ticket_medio,
       ROUND(k.clv_medio, 2) AS clv_medio,
       ROUND(risco.alto / NULLIF(risco.com_risco, 0), 4) AS risco_alto_pct,
       ROUND(g.desconto_mediano_pct, 4) AS desconto_mediano_pct
FROM painel.rag_segmentos g
LEFT JOIN painel.rag_clv_segmento k ON k.segmento = g.segmento
LEFT JOIN risco ON risco.segmento = g.segmento
ORDER BY g.ordem;
