-- subcategorias.json. Grão: 1 linha por departamento × subcategoria, top 10 de cada departamento (26 semanas).
-- Ordem: faturamento do departamento decrescente, depois posição.
WITH d AS (SELECT departamento, SUM(faturamento) AS fat FROM painel.subcategorias GROUP BY departamento)
SELECT s.departamento, s.subcategoria, s.posicao, ROUND(s.faturamento, 2) AS faturamento,
       ROUND(s.participacao, 4) AS participacao_pct
FROM painel.subcategorias s JOIN d USING (departamento)
WHERE s.posicao <= 10
ORDER BY d.fat DESC, s.departamento, s.posicao;
