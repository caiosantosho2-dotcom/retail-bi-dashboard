-- concentracao.json. Grão: 1 linha por período × subconjunto de segmentos (painel.concentracao): quantas subcategorias
-- fazem 80% do faturamento (a linha de texto do topo da aba Cestas & Marcas, no lugar da curva ABC) e quantas têm venda.
-- Ordem: período, subconjunto (máscara).
SELECT c.periodo, c.subconjunto, c.subcategorias_80, c.subcategorias
FROM painel.concentracao c JOIN painel.periodos p USING (periodo)
ORDER BY p.ordem, c.ordem;
