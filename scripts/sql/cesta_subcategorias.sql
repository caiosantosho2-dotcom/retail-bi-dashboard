-- cesta_subcategorias_<periodo>.json, um departamento × período por vez ($dep, $ini, $fim; painel_cesta.sql).
-- Grão: 1 linha por subconjunto × departamento × par de subcategorias, os 10 de maior lift entre os pares com o mínimo
-- de cestas (200; os de amostra pequena não entram: redesenho v3, "mínimo de cestas por par continua 200").
-- Ordem: subconjunto, lift decrescente.
SELECT subconjunto, departamento, subcategoria_a, subcategoria_b, cestas_par, cestas_a, cestas_b, cestas_total,
       ROUND(suporte, 6) AS suporte, ROUND(confianca_a_b, 4) AS confianca_a_b, ROUND(confianca_b_a, 4) AS confianca_b_a,
       ROUND(lift, 4) AS lift, ordem
FROM painel.par_subcategoria($dep, $ini, $fim)
WHERE NOT amostra_pequena
QUALIFY ROW_NUMBER() OVER (PARTITION BY subconjunto ORDER BY lift DESC, subcategoria_a, subcategoria_b) <= 10
ORDER BY ordem, lift DESC, subcategoria_a, subcategoria_b;
