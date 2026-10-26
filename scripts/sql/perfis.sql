-- perfis.json. Grão: 1 linha por região (as inferidas e 'Lojas pequenas') × perfil de loja (os 4 segmentos e 'Amostra
-- pequena': menos de 100 cestas nas 26 semanas, sem perfil), só as combinações com loja. Perfil pela venda da loja
-- (painel.loja_perfil). Lojas com cesta nas 26 semanas, cestas e faturamento das 26 semanas (todas as cestas da loja):
-- tudo soma entre regiões e perfis (cada loja tem uma região e um perfil; a soma é o total da rede nas 26 semanas).
-- Ordem: região (A, B, ..., 'Lojas pequenas'), a ordem fixa dos segmentos, amostra por último.
WITH ordem(perfil, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4), ('Amostra pequena', 5))
SELECT p.regiao, COALESCE(p.perfil, 'Amostra pequena') AS perfil, COUNT(*) AS lojas, SUM(p.cestas) AS cestas,
       ROUND(SUM(p.faturamento), 2) AS faturamento
FROM painel.loja_perfil p
JOIN ordem o ON o.perfil = COALESCE(p.perfil, 'Amostra pequena')
WHERE p.cestas > 0
GROUP BY p.regiao, COALESCE(p.perfil, 'Amostra pequena'), o.ordem
ORDER BY p.regiao = 'Lojas pequenas', p.regiao, o.ordem;
