-- Views e tabelas do painel, numa conexão em memória com o banco do RAG anexado como `origem` (somente leitura).
-- Nada aqui altera o banco do RAG. Só métricas que o RAG não tem; as fórmulas de faturamento, desconto e valor
-- bruto continuam as de origem.vw_vendas_item.
--
-- Tabelas carregadas pelo Python antes deste arquivo (scripts/rag_modelos.py, código do RAG em modo leitura):
--   painel.parametros(chave, valor)                      limiar do modelo, corte médio, mínimo de cestas
--   painel.rag_segmento_cliente(household_key, segmento) atribuição do RFM do RAG
--   painel.rag_risco_cliente(household_key, prob)        probabilidade de pausa longa do modelo do RAG
--   painel.rag_clv_segmento(segmento, clv_medio, valor_medio)
--   painel.rag_segmentos(segmento, ordem, households, valor_total, ticket_medio, desconto_mediano_pct)

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

-- Cestas de toda a base até a última semana completa. Grão: 1 linha por cesta (BASKET_ID).
-- É a mesma agregação de origem.vw_metricas_cesta, mas sem o recorte das duas janelas do RAG, para servir à base
-- inteira. Uma cesta tem uma só loja, um só cliente e uma só semana (conferido na fase 2).
CREATE OR REPLACE TABLE painel.cestas AS
SELECT i.BASKET_ID, ANY_VALUE(i.STORE_ID) AS STORE_ID, ANY_VALUE(i.household_key) AS household_key,
       ANY_VALUE(i.WEEK_NO) AS WEEK_NO,
       SUM(i.faturamento) AS faturamento, SUM(i.quantidade) AS itens,
       SUM(i.desconto_total) AS desconto_total, SUM(i.valor_bruto) AS valor_bruto
FROM origem.vw_vendas_item i CROSS JOIN origem.vw_janela j
WHERE i.WEEK_NO <= j.semana_fim_atual
GROUP BY i.BASKET_ID;

-- Lojas comparáveis de cada período. Grão: 1 linha por período × loja.
-- Regra de origem.vw_lojas_like_for_like aplicada a cada janela: pelo menos uma cesta no período e no mesmo período um
-- ano antes. Em 26 semanas o conjunto é o da view (a reconciliação confere).
CREATE OR REPLACE TABLE painel.lojas_comparaveis AS
SELECT p.periodo, c.STORE_ID
FROM painel.periodos p
JOIN painel.cestas c
  ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim OR c.WEEK_NO BETWEEN p.semana_ini_ant AND p.semana_fim_ant
WHERE p.semana_ini_ant IS NOT NULL
GROUP BY p.periodo, c.STORE_ID
HAVING COUNT(*) FILTER (WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim) > 0
   AND COUNT(*) FILTER (WHERE c.WEEK_NO BETWEEN p.semana_ini_ant AND p.semana_fim_ant) > 0;

-- Somas de cesta por período e recorte. Grão: 1 linha por período × recorte.
-- recorte: 'todas' (todas as lojas no período), 'comparavel' (lojas comparáveis no período),
--          'ano_anterior' (as mesmas lojas comparáveis, um ano antes).
CREATE OR REPLACE VIEW painel.metricas_periodo AS
WITH r AS (
    SELECT p.periodo, 'todas' AS recorte, c.*
    FROM painel.periodos p JOIN painel.cestas c ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    UNION ALL
    SELECT p.periodo, 'comparavel', c.*
    FROM painel.periodos p JOIN painel.cestas c ON c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim
    JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = c.STORE_ID
    UNION ALL
    SELECT p.periodo, 'ano_anterior', c.*
    FROM painel.periodos p JOIN painel.cestas c ON c.WEEK_NO BETWEEN p.semana_ini_ant AND p.semana_fim_ant
    JOIN painel.lojas_comparaveis l ON l.periodo = p.periodo AND l.STORE_ID = c.STORE_ID)
SELECT periodo, recorte,
       SUM(faturamento)::DOUBLE AS faturamento, COUNT(*) AS cestas, SUM(itens)::DOUBLE AS itens,
       SUM(desconto_total)::DOUBLE AS desconto_total, SUM(valor_bruto)::DOUBLE AS valor_bruto
FROM r GROUP BY periodo, recorte;

-- Risco de pausa por cliente com a faixa. Grão: 1 linha por household da população do modelo do RAG.
-- Faixas (spec, seção 6): alto = prob >= limiar de alerta do modelo; médio = prob >= limiar ÷ 2; baixo = abaixo.
CREATE OR REPLACE VIEW painel.cliente_risco AS
SELECT r.household_key, r.prob,
       CASE WHEN r.prob >= (SELECT valor FROM painel.parametros WHERE chave = 'limiar_alerta') THEN 'alto'
            WHEN r.prob >= (SELECT valor FROM painel.parametros WHERE chave = 'corte_medio') THEN 'medio'
            ELSE 'baixo' END AS faixa
FROM painel.rag_risco_cliente r;

-- Atributos da Ficha do Cliente na janela de 26 semanas. Grão: 1 linha por household segmentado pelo RFM do RAG.
-- clv: CLV individual derivado (spec, seção 6) = CLV médio do segmento × valor do cliente ÷ valor médio do segmento,
--      que é margem × valor do cliente × razão futuro/passado do segmento; a média por segmento volta ao CLV do RAG.
-- sensibilidade_desconto: pct_desconto de vw_metricas_cliente, como fração.
-- variedade_departamentos: departamentos distintos com compra na janela (métrica nova do painel).
CREATE OR REPLACE VIEW painel.cliente_atributos AS
WITH c AS (SELECT * FROM origem.vw_metricas_cliente WHERE periodo = 'atual'),
dep AS (SELECT household_key, COUNT(DISTINCT DEPARTMENT) AS variedade
        FROM origem.vw_vendas_item WHERE periodo = 'atual' GROUP BY household_key)
SELECT s.household_key, s.segmento,
       c.recencia_dias::DOUBLE AS recencia, c.frequencia::DOUBLE AS frequencia, c.valor::DOUBLE AS valor,
       k.clv_medio * c.valor::DOUBLE / NULLIF(k.valor_medio, 0) AS clv,
       c.pct_desconto / 100.0 AS sensibilidade_desconto,
       dep.variedade::DOUBLE AS variedade_departamentos,
       c.recencia_dias
FROM painel.rag_segmento_cliente s
JOIN c ON c.household_key = s.household_key
LEFT JOIN painel.rag_clv_segmento k ON k.segmento = s.segmento
LEFT JOIN dep ON dep.household_key = s.household_key;

-- Percentil de cada atributo entre os clientes segmentados, de 0 a 100. Grão: 1 linha por household segmentado.
-- PERCENT_RANK; a recência é invertida (mais recente = percentil maior). Atributo nulo fica com percentil nulo.
CREATE OR REPLACE VIEW painel.cliente_percentis AS
SELECT household_key,
       CASE WHEN recencia IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY recencia IS NULL ORDER BY recencia DESC) END AS recencia,
       CASE WHEN frequencia IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY frequencia IS NULL ORDER BY frequencia) END AS frequencia,
       CASE WHEN valor IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY valor IS NULL ORDER BY valor) END AS valor,
       CASE WHEN clv IS NOT NULL THEN 100 * PERCENT_RANK() OVER (PARTITION BY clv IS NULL ORDER BY clv) END AS clv,
       CASE WHEN sensibilidade_desconto IS NOT NULL
            THEN 100 * PERCENT_RANK() OVER (PARTITION BY sensibilidade_desconto IS NULL ORDER BY sensibilidade_desconto) END AS sensibilidade_desconto,
       CASE WHEN variedade_departamentos IS NOT NULL
            THEN 100 * PERCENT_RANK() OVER (PARTITION BY variedade_departamentos IS NULL ORDER BY variedade_departamentos) END AS variedade_departamentos
FROM painel.cliente_atributos;
