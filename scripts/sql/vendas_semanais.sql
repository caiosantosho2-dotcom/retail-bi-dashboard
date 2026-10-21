-- vendas_semanais.json. Grão: 1 linha por semana, da 1 à última completa. Ordem: semana_inicio crescente.
-- As duas colunas usam só as lojas comparáveis da janela de 26 semanas (origem.vw_lojas_like_for_like), como no chat
-- (spec, decisão 3 da fase 2). Semana sem venda nessas lojas = 0; semana sem ano anterior na base = null.
WITH b AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = 'base'),
semanas AS (
    SELECT d.WEEK_NO, MIN(d.data) AS semana_inicio
    FROM origem.dim_data d CROSS JOIN b
    WHERE d.WEEK_NO BETWEEN b.semana_ini AND b.semana_fim
    GROUP BY d.WEEK_NO),
f AS (
    SELECT c.WEEK_NO, SUM(c.faturamento)::DOUBLE AS faturamento
    FROM painel.cestas c
    WHERE c.STORE_ID IN (SELECT STORE_ID FROM origem.vw_lojas_like_for_like)
    GROUP BY c.WEEK_NO),
o AS (SELECT offset_semanas FROM origem.vw_janela)
SELECT strftime(s.semana_inicio, '%Y-%m-%d') AS semana_inicio,
       ROUND(COALESCE(a.faturamento, 0), 2) AS faturamento,
       CASE WHEN s.WEEK_NO - o.offset_semanas >= (SELECT semana_ini FROM b)
            THEN ROUND(COALESCE(ant.faturamento, 0), 2) END AS faturamento_ano_anterior
FROM semanas s CROSS JOIN o
LEFT JOIN f a ON a.WEEK_NO = s.WEEK_NO
LEFT JOIN f ant ON ant.WEEK_NO = s.WEEK_NO - o.offset_semanas
ORDER BY s.WEEK_NO;
