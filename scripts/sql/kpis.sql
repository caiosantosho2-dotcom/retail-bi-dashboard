-- kpis.json. Grão: 1 linha por período × métrica (4 × 6 = 24). Ordem: período, depois métrica na ordem do contrato.
-- valor = todas as lojas; valor_comparavel e valor_ano_anterior = lojas comparáveis do período (spec, decisão 1 da fase 2).
-- clientes_ativos = definição do RAG (vw_metricas_cliente.cliente_ativo), estoque no fim do período (decisão 2).
WITH w AS (
    SELECT p.periodo, p.ordem, p.semana_ini_ant IS NOT NULL AS tem_ano_anterior,
           t.faturamento AS fat_t, c.faturamento AS fat_c, a.faturamento AS fat_a,
           t.cestas AS ces_t, c.cestas AS ces_c, a.cestas AS ces_a,
           t.itens AS it_t, c.itens AS it_c, a.itens AS it_a,
           t.desconto_total AS dt_t, c.desconto_total AS dt_c, a.desconto_total AS dt_a,
           t.valor_bruto AS vb_t, c.valor_bruto AS vb_c, a.valor_bruto AS vb_a,
           CASE WHEN p.semana_ini_ant IS NOT NULL
                THEN (SELECT COUNT(*) FROM painel.lojas_comparaveis l WHERE l.periodo = p.periodo) END AS lojas
    FROM painel.periodos p
    LEFT JOIN painel.metricas_periodo t ON t.periodo = p.periodo AND t.recorte = 'todas'
    LEFT JOIN painel.metricas_periodo c ON c.periodo = p.periodo AND c.recorte = 'comparavel'
    LEFT JOIN painel.metricas_periodo a ON a.periodo = p.periodo AND a.recorte = 'ano_anterior'),
ativos AS (
    SELECT COUNT(*) FILTER (WHERE periodo = 'atual' AND cliente_ativo)::DOUBLE AS atual,
           COUNT(*) FILTER (WHERE periodo = 'base' AND cliente_ativo)::DOUBLE AS ano_anterior
    FROM origem.vw_metricas_cliente),
k AS (
    SELECT periodo, ordem, 1 AS ordem_metrica, 'faturamento' AS metrica, 2 AS casas,
           fat_t AS valor, fat_c AS valor_comparavel, fat_a AS valor_ano_anterior, lojas, ces_t FROM w
    UNION ALL
    SELECT periodo, ordem, 2, 'cestas', 0, ces_t, ces_c, ces_a, lojas, ces_t FROM w
    UNION ALL
    SELECT periodo, ordem, 3, 'ticket_medio', 2,
           fat_t / NULLIF(ces_t, 0), fat_c / NULLIF(ces_c, 0), fat_a / NULLIF(ces_a, 0), lojas, ces_t FROM w
    UNION ALL
    SELECT periodo, ordem, 4, 'itens_por_cesta', 4,
           it_t / NULLIF(ces_t, 0), it_c / NULLIF(ces_c, 0), it_a / NULLIF(ces_a, 0), lojas, ces_t FROM w
    UNION ALL
    SELECT periodo, ordem, 5, 'desconto_pct', 4,
           dt_t / NULLIF(vb_t, 0), dt_c / NULLIF(vb_c, 0), dt_a / NULLIF(vb_a, 0), lojas, ces_t FROM w
    UNION ALL
    SELECT periodo, ordem, 6, 'clientes_ativos', 0,
           ativos.atual,
           CASE WHEN tem_ano_anterior THEN ativos.atual END,
           CASE WHEN tem_ano_anterior THEN ativos.ano_anterior END,
           NULL, ces_t
    FROM w CROSS JOIN ativos)
SELECT periodo, metrica,
       ROUND(valor, casas) AS valor,
       ROUND(valor_comparavel, casas) AS valor_comparavel,
       ROUND(valor_ano_anterior, casas) AS valor_ano_anterior,
       ROUND(valor_comparavel / NULLIF(valor_ano_anterior, 0) - 1, 4) AS variacao_pct,
       lojas AS lojas_comparaveis,
       ces_t < (SELECT valor FROM painel.parametros WHERE chave = 'loja_amostra_minima_cestas') AS amostra_pequena
FROM k
ORDER BY ordem, ordem_metrica;
