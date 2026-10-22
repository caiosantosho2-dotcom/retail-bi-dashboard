-- lista_acao.json. Grão: 1 linha por cliente com risco alto ou médio (painel.lista_acao).
-- Ordem: faturamento em risco decrescente, depois id.
SELECT id, segmento, faixa, ROUND(prob, 4) AS prob, semanas_sem_comprar,
       ROUND(faturamento_26s, 2) AS faturamento_26s, ROUND(faturamento_em_risco, 2) AS faturamento_em_risco
FROM painel.lista_acao
ORDER BY faturamento_em_risco DESC, id;
