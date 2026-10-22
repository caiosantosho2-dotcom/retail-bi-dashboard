-- afinidade.json. Grão: 1 linha por segmento × departamento com faturamento nas 26 semanas (painel.afinidade).
-- Ordem: segmento (ordem fixa), participação do departamento na base decrescente, departamento.
SELECT segmento, departamento, ROUND(faturamento, 2) AS faturamento,
       ROUND(participacao_segmento, 4) AS participacao_segmento_pct, ROUND(participacao_base, 4) AS participacao_base_pct,
       ROUND(indice, 1) AS indice, compradores, amostra_pequena
FROM painel.afinidade
ORDER BY ordem, participacao_base DESC, departamento;
