-- marcas_<periodo>.json. Grão: 1 linha por subconjunto de segmentos × departamento com venda no período
-- (painel.marcas_departamento). amostra_pequena: menos de 0,1% do faturamento do subconjunto (a regra do departamento).
-- Ordem: subconjunto (máscara), faturamento decrescente.
SELECT subconjunto, departamento, ROUND(faturamento, 2) AS faturamento, ROUND(participacao, 4) AS participacao_pct,
       ROUND(marca_propria, 4) AS marca_propria_pct,
       ROUND(marca_propria_crescimento, 4) AS marca_propria_crescimento_pct, ROUND(nacional_crescimento, 4) AS nacional_crescimento_pct,
       fabricantes_nacionais, fabricantes_80, ROUND(maior_fabricante_pct, 4) AS maior_fabricante_pct,
       participacao < 0.001 AS amostra_pequena
FROM painel.marcas_departamento
WHERE periodo = $periodo
ORDER BY ordem, faturamento DESC, departamento;
