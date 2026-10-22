-- calor_dia_hora.json. Grão: 1 linha por dia do ciclo × hora × grupo com venda. Base inteira, todas as lojas.
-- Sem nome de dia: a base não tem calendário real (spec, decisão 5 da fase 2). Ordem: dia, hora, grupo.
SELECT c.dia_semana, c.hora, c.grupo, ROUND(c.faturamento, 2) AS faturamento, c.cestas
FROM painel.calor_grupo c JOIN painel.grupos g USING (grupo)
ORDER BY c.dia_semana, c.hora, g.ordem;
