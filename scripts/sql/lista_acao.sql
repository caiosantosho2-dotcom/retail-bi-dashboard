-- lista_acao.json. Grão: 1 linha por cliente com risco alto ou médio (painel.lista_acao). lojas: as lojas em que ele
-- comprou nas 26 semanas, com o faturamento e as cestas dele em cada uma, da maior para a menor (painel.lista_acao_loja;
-- a fonte do CSV "clientes em risco desta loja" da ficha da loja). Ordem: faturamento em risco decrescente, depois id.
WITH l AS (
    SELECT id, list({'loja': STORE_ID, 'faturamento': ROUND(faturamento, 2), 'cestas': cestas} ORDER BY faturamento DESC, STORE_ID) AS lojas
    FROM painel.lista_acao_loja GROUP BY id)
SELECT a.id, a.segmento, a.faixa, ROUND(a.prob, 4) AS prob, a.semanas_sem_comprar,
       ROUND(a.faturamento_26s, 2) AS faturamento_26s, ROUND(a.faturamento_em_risco, 2) AS faturamento_em_risco,
       COALESCE(l.lojas, []) AS lojas
FROM painel.lista_acao a
LEFT JOIN l ON l.id = a.id
ORDER BY a.faturamento_em_risco DESC, a.id;
