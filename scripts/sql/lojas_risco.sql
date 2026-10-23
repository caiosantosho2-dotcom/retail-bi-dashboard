-- lojas_risco.json. Grão: 1 linha por loja × segmento com cliente na faixa alta de risco de pausa cuja loja principal é
-- ela (painel.loja_risco). valor_em_risco: faturamento de 26 semanas desses clientes (todas as lojas). Fixo: o risco é
-- uma foto do momento. Ordem: loja, segmento na ordem fixa.
SELECT r.STORE_ID AS loja, r.segmento, r.clientes, ROUND(r.valor_em_risco, 2) AS valor_em_risco
FROM painel.loja_risco r JOIN painel.grupos g ON g.grupo = r.segmento
ORDER BY r.STORE_ID, g.ordem;
