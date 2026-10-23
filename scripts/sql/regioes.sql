-- regioes.json. Grão: 1 linha por região inferida + 'Lojas pequenas'. Ordem: A, B, ..., 'Lojas pequenas' por último.
-- 26 semanas, todas as lojas. lojas = lojas do grupo com cesta nas 26 semanas; ancora = a de maior faturamento;
-- variação like-for-like = soma do faturamento atual ÷ soma do ano anterior das lojas comparáveis do grupo
-- (origem.vw_yoy_loja) − 1. x, y: o centro da região no mapa de clientela (média das posições das lojas dela; null nas
-- lojas pequenas), para a visão de uma bolha por região (redesenho v3).
WITH k AS (SELECT * FROM painel.loja_kpis),
p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
cli AS (
    SELECT g.regiao, COUNT(DISTINCT c.household_key) AS clientes
    FROM painel.cestas c JOIN painel.loja_grupo g USING (STORE_ID), p
    WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim GROUP BY g.regiao),
lfl AS (
    SELECT g.regiao, SUM(yy.faturamento_atual)::DOUBLE AS fa, SUM(yy.faturamento_base)::DOUBLE AS fb, COUNT(*) AS n
    FROM origem.vw_yoy_loja yy JOIN painel.loja_grupo g USING (STORE_ID) GROUP BY g.regiao),
anc AS (SELECT regiao, arg_max(STORE_ID, faturamento) AS ancora FROM k GROUP BY regiao),
r AS (SELECT regiao, COUNT(*) FILTER (WHERE cestas > 0) AS lojas, SUM(faturamento) AS faturamento, AVG(x) AS x, AVG(y) AS y
      FROM k GROUP BY regiao)
SELECT r.regiao, r.lojas, CASE WHEN r.regiao <> 'Lojas pequenas' THEN anc.ancora END AS ancora,
       ROUND(r.faturamento, 2) AS faturamento, ROUND(r.faturamento / SUM(r.faturamento) OVER (), 4) AS participacao_pct,
       cli.clientes, COALESCE(lfl.n, 0) AS lojas_comparaveis, ROUND(lfl.fa / NULLIF(lfl.fb, 0) - 1, 4) AS faturamento_variacao_pct,
       ROUND(r.x, 4) AS x, ROUND(r.y, 4) AS y
FROM r JOIN anc USING (regiao) LEFT JOIN cli USING (regiao) LEFT JOIN lfl USING (regiao)
ORDER BY r.regiao = 'Lojas pequenas', r.regiao;
