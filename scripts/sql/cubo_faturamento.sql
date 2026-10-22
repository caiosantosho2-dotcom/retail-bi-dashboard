-- cubo_faturamento.json. Grão: 1 linha por semana (últimas 52) × grupo × departamento. Só métricas que somam.
-- Lojas comparáveis da janela de 26 semanas nas duas colunas (painel.cubo_semanal). Ordem: semana, grupo, departamento.
SELECT strftime(c.semana_inicio, '%Y-%m-%d') AS semana_inicio, c.grupo, c.departamento,
       ROUND(c.faturamento, 2) AS faturamento, ROUND(c.faturamento_ano_anterior, 2) AS faturamento_ano_anterior
FROM painel.cubo_semanal c JOIN painel.grupos g USING (grupo)
ORDER BY c.WEEK_NO, g.ordem, c.departamento;
