-- subcategorias_<periodo>.json. Grão: 1 linha por departamento (ou 'todos') × subcategoria, as 10 maiores de cada um no
-- período. departamento_origem: só nas linhas de 'todos' (de qual departamento é a subcategoria).
-- Ordem: 'todos' primeiro, depois o faturamento do departamento decrescente, depois a posição.
WITH s AS (SELECT * FROM painel.subcategorias WHERE periodo = $periodo),
d AS (SELECT departamento, SUM(faturamento) AS fat FROM s GROUP BY departamento)
SELECT s.departamento, s.subcategoria, s.departamento_origem, s.posicao, ROUND(s.faturamento, 2) AS faturamento,
       ROUND(s.participacao, 4) AS participacao_pct
FROM s JOIN d USING (departamento)
WHERE s.posicao <= 10
ORDER BY s.departamento = 'todos' DESC, d.fat DESC, s.departamento, s.posicao;
