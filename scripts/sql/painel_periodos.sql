-- Janelas do painel. Rodado em toda etapa da exportação, antes de tudo (só views sobre origem.vw_janela).
-- Requer painel.parametros (carregado pelo Python, etapa rag).

-- Períodos do filtro global. Grão: 1 linha por período.
-- 4, 13 e 26 semanas terminam na última semana completa (vw_janela) e comparam com as mesmas semanas − 52.
-- Base inteira: semanas 1 até a última completa, sem ano anterior (spec, decisão 4 da fase 2).
CREATE OR REPLACE VIEW painel.periodos AS
WITH j AS (SELECT * FROM origem.vw_janela),
inicio AS (SELECT MIN(WEEK_NO) AS semana FROM origem.dim_data)
SELECT '4s' AS periodo, 1 AS ordem, semana_ini_ultimo_mes AS semana_ini, semana_fim_atual AS semana_fim,
       semana_ini_ultimo_mes - offset_semanas AS semana_ini_ant, semana_fim_atual - offset_semanas AS semana_fim_ant FROM j
UNION ALL
SELECT '13s', 2, semana_ini_ultimo_trimestre, semana_fim_atual,
       semana_ini_ultimo_trimestre - offset_semanas, semana_fim_atual - offset_semanas FROM j
UNION ALL
SELECT '26s', 3, semana_ini_atual, semana_fim_atual, semana_ini_base, semana_fim_base FROM j
UNION ALL
SELECT 'base', 4, inicio.semana, semana_fim_atual, NULL, NULL FROM j, inicio;

-- Janela da análise de cesta (spec, seção 6): as últimas `cesta.semanas` semanas completas do config.yaml do painel.
-- Com 26, é a janela da segmentação. Grão: 1 linha.
CREATE OR REPLACE VIEW painel.janela_cesta AS
SELECT j.semana_fim_atual - CAST(p.valor AS INTEGER) + 1 AS semana_ini, j.semana_fim_atual AS semana_fim
FROM origem.vw_janela j JOIN painel.parametros p ON p.chave = 'cesta_semanas';
