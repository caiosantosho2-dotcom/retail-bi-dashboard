-- migracao_segmentos.json. Grão: 1 linha por grupo da migração (os 4 segmentos e 'Sem compra na janela'), na ordem fixa.
-- clientes_anterior / clientes_atual: tamanho do grupo em cada semestre; ficaram: no mesmo grupo nos dois;
-- ficaram_pct = ficaram ÷ clientes_anterior; entraram = clientes_atual − ficaram; sairam = clientes_anterior − ficaram.
-- faturamento_anterior e faturamento_atual: o do grupo em cada semestre (os clientes de cada lado).
WITH m AS (SELECT * FROM painel.migracao_cliente)
SELECT g.segmento,
       (SELECT COUNT(*) FROM m WHERE segmento_anterior = g.segmento) AS clientes_anterior,
       (SELECT COUNT(*) FROM m WHERE segmento_atual = g.segmento) AS clientes_atual,
       (SELECT COUNT(*) FROM m WHERE segmento_anterior = g.segmento AND segmento_atual = g.segmento) AS ficaram,
       ROUND((SELECT COUNT(*) FROM m WHERE segmento_anterior = g.segmento AND segmento_atual = g.segmento)
             / NULLIF((SELECT COUNT(*) FROM m WHERE segmento_anterior = g.segmento), 0), 4) AS ficaram_pct,
       (SELECT COUNT(*) FROM m WHERE segmento_atual = g.segmento AND segmento_anterior <> g.segmento) AS entraram,
       (SELECT COUNT(*) FROM m WHERE segmento_anterior = g.segmento AND segmento_atual <> g.segmento) AS sairam,
       ROUND((SELECT SUM(faturamento_anterior) FROM m WHERE segmento_anterior = g.segmento), 2) AS faturamento_anterior,
       ROUND((SELECT SUM(faturamento_atual) FROM m WHERE segmento_atual = g.segmento), 2) AS faturamento_atual
FROM painel.migracao_grupos g
ORDER BY g.ordem;
