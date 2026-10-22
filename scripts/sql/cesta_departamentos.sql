-- cesta_departamentos.json. Grão: 1 linha por subconjunto de segmentos × par não ordenado de departamentos.
-- painel.par_departamento. Suporte com 6 casas (é uma fração pequena); confiança e lift com 4.
-- Ordem: subconjunto, departamento_a, departamento_b.
SELECT subconjunto, departamento_a, departamento_b, cestas_par, cestas_a, cestas_b, cestas_total,
       ROUND(suporte, 6) AS suporte, ROUND(confianca_a_b, 4) AS confianca_a_b, ROUND(confianca_b_a, 4) AS confianca_b_a,
       ROUND(lift, 4) AS lift, amostra_pequena
FROM painel.par_departamento
ORDER BY ordem, departamento_a, departamento_b;
