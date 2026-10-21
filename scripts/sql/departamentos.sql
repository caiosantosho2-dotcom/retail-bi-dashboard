-- departamentos.json. Grão: 1 linha por período × departamento, top 10 + "Outros". Ordem: período, faturamento
-- decrescente, "Outros" por último. Todas as lojas; a soma de cada período é o faturamento (valor) do KPI.
WITH d AS (
    SELECT p.periodo, p.ordem, i.DEPARTMENT AS departamento, SUM(i.faturamento)::DOUBLE AS faturamento
    FROM painel.periodos p
    JOIN origem.vw_vendas_item i ON i.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    GROUP BY p.periodo, p.ordem, i.DEPARTMENT),
r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY periodo ORDER BY faturamento DESC, departamento) AS posicao FROM d),
agrupado AS (
    SELECT periodo, ordem, CASE WHEN posicao <= 10 THEN departamento ELSE 'Outros' END AS departamento,
           CASE WHEN posicao <= 10 THEN posicao ELSE 11 END AS posicao, SUM(faturamento) AS faturamento
    FROM r GROUP BY ALL)
SELECT periodo, departamento, ROUND(faturamento, 2) AS faturamento,
       ROUND(faturamento / SUM(faturamento) OVER (PARTITION BY periodo), 4) AS participacao_pct
FROM agrupado
ORDER BY ordem, posicao;
