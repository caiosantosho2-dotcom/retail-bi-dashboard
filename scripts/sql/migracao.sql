-- migracao.json. Grão: 1 linha por segmento no semestre anterior × segmento no atual (5 × 5, com zeros).
-- Ordem: a ordem fixa dos grupos, primeiro a linha (anterior), depois a coluna (atual).
-- clientes_pct_linha = clientes da célula ÷ clientes do segmento anterior (a linha soma 1). amostra_pequena: célula com
-- menos de tamanho_minimo_grupo clientes (o mesmo mínimo do CLV e da afinidade).
WITH celula AS (
    SELECT segmento_anterior, segmento_atual, COUNT(*) AS clientes,
           SUM(faturamento_anterior) AS faturamento_anterior, SUM(faturamento_atual) AS faturamento_atual
    FROM painel.migracao_cliente GROUP BY ALL),
minimo AS (SELECT valor FROM painel.parametros WHERE chave = 'tamanho_minimo_grupo')
SELECT a.segmento AS segmento_anterior, b.segmento AS segmento_atual,
       COALESCE(c.clientes, 0) AS clientes,
       ROUND(COALESCE(c.clientes, 0) / NULLIF(SUM(COALESCE(c.clientes, 0)) OVER (PARTITION BY a.segmento), 0), 4) AS clientes_pct_linha,
       ROUND(COALESCE(c.faturamento_anterior, 0), 2) AS faturamento_anterior,
       ROUND(COALESCE(c.faturamento_atual, 0), 2) AS faturamento_atual,
       COALESCE(c.clientes, 0) < (SELECT valor FROM minimo) AS amostra_pequena
FROM painel.migracao_grupos a CROSS JOIN painel.migracao_grupos b
LEFT JOIN celula c ON c.segmento_anterior = a.segmento AND c.segmento_atual = b.segmento
ORDER BY a.ordem, b.ordem;
