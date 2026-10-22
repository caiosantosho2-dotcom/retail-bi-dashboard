-- rede_nos.json. Grão: 1 linha por nó da rede (as 80 maiores subcategorias na janela da cesta). Ordem: no.
-- x, y: posição no grafo (scripts/layout.py, em dois níveis com os departamentos como grupos; perto = cestas em comum).
SELECT n.no, n.departamento, n.subcategoria, ROUND(n.faturamento, 2) AS faturamento, ROUND(p.x, 4) AS x, ROUND(p.y, 4) AS y
FROM painel.rede_nos n JOIN painel.rede_posicao p USING (no)
ORDER BY n.no;
