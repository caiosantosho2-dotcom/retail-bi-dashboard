-- cesta_subcategorias.json, um departamento por vez ($dep, de painel.departamentos_foco).
-- Grão: 1 linha por subconjunto × departamento × par de subcategorias, os 20 primeiros por (amostra_pequena, lift
-- decrescente): primeiro os pares com o mínimo de cestas; os de amostra pequena só completam a lista.
-- Ordem: subconjunto, posição.
SELECT subconjunto, departamento, subcategoria_a, subcategoria_b, cestas_par, cestas_a, cestas_b, cestas_total,
       ROUND(suporte, 6) AS suporte, ROUND(confianca_a_b, 4) AS confianca_a_b, ROUND(confianca_b_a, 4) AS confianca_b_a,
       ROUND(lift, 4) AS lift, amostra_pequena
FROM painel.par_subcategoria($dep)
QUALIFY ROW_NUMBER() OVER (PARTITION BY subconjunto ORDER BY amostra_pequena, lift DESC, subcategoria_a, subcategoria_b) <= 20
ORDER BY ordem, amostra_pequena, lift DESC, subcategoria_a, subcategoria_b;
