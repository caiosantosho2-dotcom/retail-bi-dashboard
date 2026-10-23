-- perfis.json. Grão: 1 linha por perfil de loja (os 4 segmentos) e 'Amostra pequena' (lojas com menos de 30 clientes de
-- loja principal, sem perfil). Lojas, clientes de loja principal e faturamento das 26 semanas (todas as cestas das lojas).
-- Fixo nas 26 semanas: a loja principal é a da janela da segmentação. Ordem: a ordem fixa dos segmentos, amostra por último.
WITH l AS (
    SELECT COALESCE(p.perfil, 'Amostra pequena') AS perfil, p.clientes_principais, k.faturamento
    FROM painel.loja_perfil p JOIN painel.loja_kpis k USING (STORE_ID)),
ordem(perfil, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4), ('Amostra pequena', 5))
SELECT o.perfil, COUNT(l.perfil) AS lojas, COALESCE(SUM(l.clientes_principais), 0) AS clientes_principais,
       ROUND(COALESCE(SUM(l.faturamento), 0), 2) AS faturamento
FROM ordem o LEFT JOIN l USING (perfil)
GROUP BY o.perfil, o.ordem
ORDER BY o.ordem;
