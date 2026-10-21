-- calor_dia_hora.json. Grão: 1 linha por dia_semana × hora (7 × 24 = 168). Ordem: dia_semana, hora.
-- Base inteira (semanas 1 a 101), todas as lojas. dia_semana = origem.dim_data.dia_semana; a base não tem calendário
-- real, então o front não dá nome aos dias (spec, decisão 5 da fase 2). hora = origem.fato_transacoes.hora.
-- Faturamento = SALES_VALUE, a mesma origem de origem.vw_vendas_item.faturamento (lá não há a hora).
WITH b AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = 'base'),
v AS (
    SELECT d.dia_semana, f.hora, SUM(f.SALES_VALUE)::DOUBLE AS faturamento, COUNT(DISTINCT f.BASKET_ID) AS cestas
    FROM origem.fato_transacoes f
    JOIN origem.dim_data d ON d.data_id = f.data_id
    CROSS JOIN b
    WHERE d.WEEK_NO BETWEEN b.semana_ini AND b.semana_fim
    GROUP BY d.dia_semana, f.hora),
grade AS (SELECT dia.range::INTEGER AS dia_semana, h.range::INTEGER AS hora FROM range(1, 8) dia CROSS JOIN range(0, 24) h)
SELECT g.dia_semana, g.hora, ROUND(COALESCE(v.faturamento, 0), 2) AS faturamento, COALESCE(v.cestas, 0) AS cestas
FROM grade g LEFT JOIN v ON v.dia_semana = g.dia_semana AND v.hora = g.hora
ORDER BY g.dia_semana, g.hora;
