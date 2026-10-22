-- cubo_periodo.json. Grão: 1 linha por período × grupo × departamento. Só métricas que somam (painel.cubo_periodo).
-- Ordem: período, grupo, departamento.
SELECT c.periodo, c.grupo, c.departamento,
       ROUND(c.faturamento, 2) AS faturamento, ROUND(c.desconto, 2) AS desconto, ROUND(c.valor_bruto, 2) AS valor_bruto,
       ROUND(c.faturamento_comparavel, 2) AS faturamento_comparavel, ROUND(c.desconto_comparavel, 2) AS desconto_comparavel,
       ROUND(c.valor_bruto_comparavel, 2) AS valor_bruto_comparavel,
       ROUND(c.faturamento_ano_anterior, 2) AS faturamento_ano_anterior, ROUND(c.desconto_ano_anterior, 2) AS desconto_ano_anterior,
       ROUND(c.valor_bruto_ano_anterior, 2) AS valor_bruto_ano_anterior
FROM painel.cubo_periodo c JOIN painel.grupos g USING (grupo)
ORDER BY c.ordem, g.ordem, c.departamento;
