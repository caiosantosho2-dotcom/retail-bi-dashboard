-- medias_segmento.json. Grão: 1 linha por segmento × atributo (4 × 6 = 24). Ordem: segmento (ordem fixa), atributo
-- na ordem do contrato. Média do valor real e do percentil dos clientes do segmento (painel de contexto da Ficha).
WITH m AS (
    SELECT a.segmento,
           AVG(a.recencia) AS recencia_v, AVG(p.recencia) AS recencia_p,
           AVG(a.frequencia) AS frequencia_v, AVG(p.frequencia) AS frequencia_p,
           AVG(a.valor) AS valor_v, AVG(p.valor) AS valor_p,
           AVG(a.clv) AS clv_v, AVG(p.clv) AS clv_p,
           AVG(a.sensibilidade_desconto) AS sensibilidade_desconto_v, AVG(p.sensibilidade_desconto) AS sensibilidade_desconto_p,
           AVG(a.variedade_departamentos) AS variedade_departamentos_v, AVG(p.variedade_departamentos) AS variedade_departamentos_p
    FROM painel.cliente_atributos a JOIN painel.cliente_percentis p ON p.household_key = a.household_key
    GROUP BY a.segmento),
l AS (
    SELECT segmento, 1 AS ordem_atributo, 'recencia' AS atributo, ROUND(recencia_v, 2) AS valor_medio, recencia_p AS percentil_medio FROM m
    UNION ALL SELECT segmento, 2, 'frequencia', ROUND(frequencia_v, 2), frequencia_p FROM m
    UNION ALL SELECT segmento, 3, 'valor', ROUND(valor_v, 2), valor_p FROM m
    UNION ALL SELECT segmento, 4, 'clv', ROUND(clv_v, 2), clv_p FROM m
    UNION ALL SELECT segmento, 5, 'sensibilidade_desconto', ROUND(sensibilidade_desconto_v, 4), sensibilidade_desconto_p FROM m
    UNION ALL SELECT segmento, 6, 'variedade_departamentos', ROUND(variedade_departamentos_v, 2), variedade_departamentos_p FROM m)
SELECT l.segmento, l.atributo, l.valor_medio, ROUND(l.percentil_medio, 1) AS percentil_medio
FROM l JOIN painel.rag_segmentos g ON g.segmento = l.segmento
ORDER BY g.ordem, l.ordem_atributo;
