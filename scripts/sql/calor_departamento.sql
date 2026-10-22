-- calor/<departamento>.json (o Python separa um arquivo por departamento). Grão: 1 linha por departamento × dia ×
-- hora × grupo com venda. Base inteira, todas as lojas. Só faturamento: cestas não somam entre departamentos.
SELECT c.departamento, c.dia_semana, c.hora, c.grupo, ROUND(c.faturamento, 2) AS faturamento
FROM painel.calor_departamento c JOIN painel.grupos g USING (grupo)
ORDER BY c.departamento, c.dia_semana, c.hora, g.ordem;
