-- abc.json. Grão: 1 linha por departamento × subcategoria com venda nas 26 semanas (painel.abc). Ordem: posição.
-- crescimento_pct: variação like-for-like da subcategoria na view do RAG origem.vw_yoy_categoria (marca = 'TODAS');
-- null se a subcategoria não vendeu no ano anterior nas lojas comparáveis.
SELECT a.departamento, a.subcategoria, a.posicao, ROUND(a.faturamento, 2) AS faturamento,
       ROUND(a.participacao, 6) AS participacao_pct, ROUND(a.acumulado, 6) AS acumulado_pct, a.classe,
       ROUND(a.marca_propria, 4) AS marca_propria_pct,
       ROUND(y.var_faturamento_pct / 100, 4) AS crescimento_pct
FROM painel.abc a
LEFT JOIN origem.vw_yoy_categoria y ON y.DEPARTMENT = a.departamento AND y.COMMODITY_DESC = a.subcategoria AND y.marca = 'TODAS'
ORDER BY a.posicao;
