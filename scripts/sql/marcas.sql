-- marcas.json. Grão: 1 linha por departamento com venda nas 26 semanas (painel.marcas_departamento).
-- Ordem: faturamento decrescente. amostra_pequena: menos de 0,1% do faturamento (a regra da Ficha da Categoria).
SELECT departamento, ROUND(faturamento, 2) AS faturamento, ROUND(participacao, 4) AS participacao_pct,
       ROUND(marca_propria, 4) AS marca_propria_pct,
       ROUND(marca_propria_crescimento, 4) AS marca_propria_crescimento_pct, ROUND(nacional_crescimento, 4) AS nacional_crescimento_pct,
       fabricantes_nacionais, fabricantes_80, ROUND(maior_fabricante_pct, 4) AS maior_fabricante_pct,
       participacao < 0.001 AS amostra_pequena
FROM painel.marcas_departamento
ORDER BY faturamento DESC, departamento;
