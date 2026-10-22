-- regioes_semana.json (compacto). Grão: 1 linha por região × semana (últimas 52), todas as lojas (painel.regiao_semana).
-- indice = semana ÷ média semanal da própria região nas 52 semanas × 100. Ordem: semana, região.
SELECT strftime(semana_inicio, '%Y-%m-%d') AS semana_inicio, regiao, ROUND(faturamento, 2) AS faturamento,
       ROUND(indice, 1) AS indice
FROM painel.regiao_semana
ORDER BY WEEK_NO, regiao = 'Lojas pequenas', regiao;
