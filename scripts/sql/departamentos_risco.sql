-- departamentos_risco.json. Grão: 1 linha por subconjunto de segmentos × departamento (ou 'todos') com faturamento nas
-- 26 semanas. Dinheiro em risco = faturamento do departamento vindo de clientes na faixa alta de risco de pausa, e a
-- parte dele no faturamento do departamento. Fixo nas 26 semanas: o risco é uma foto do momento (redesenho v3, 0.2).
-- Ordem: subconjunto, departamento.
SELECT subconjunto, departamento, ROUND(dinheiro_em_risco, 2) AS dinheiro_em_risco,
       ROUND(dinheiro_em_risco_pct, 4) AS dinheiro_em_risco_pct
FROM painel.departamento_subconjunto
WHERE periodo = '26s'
ORDER BY ordem, departamento = 'todos' DESC, departamento;
