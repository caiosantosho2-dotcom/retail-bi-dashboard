-- departamentos.json. Grão: 1 linha por departamento com venda na base inteira (lista e ordem do filtro).
-- Ordem: faturamento das 26 semanas decrescente, depois o da base inteira, depois o nome.
SELECT departamento, ROUND(faturamento_26s, 2) AS faturamento_26s, ROUND(participacao_26s, 4) AS participacao_26s_pct,
       ROUND(faturamento_base, 2) AS faturamento_base, amostra_pequena
FROM painel.departamentos
ORDER BY faturamento_26s DESC, faturamento_base DESC, departamento;
