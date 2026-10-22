-- Tabelas-base do painel, criadas uma vez na etapa `base` e gravadas em data/tmp/*.parquet para as outras etapas.
-- Nada aqui altera o banco do RAG: as fórmulas de faturamento, desconto e valor bruto são as de origem.vw_vendas_item.
-- Requer painel.periodos e painel.rag_segmento_cliente.

-- Cesta × departamento, da semana 1 até a última completa. Grão: 1 linha por cesta (BASKET_ID) × departamento.
-- Uma cesta tem uma só loja, um só cliente e uma só semana (conferido na fase 2).
-- faturamento_marca_propria: a parte do faturamento com BRAND = 'Private' (a base só tem 'Private' e 'National').
CREATE OR REPLACE TABLE painel.cesta_departamento AS
SELECT i.BASKET_ID, ANY_VALUE(i.STORE_ID) AS STORE_ID, ANY_VALUE(i.household_key) AS household_key,
       ANY_VALUE(i.WEEK_NO) AS WEEK_NO, i.DEPARTMENT AS departamento,
       SUM(i.faturamento) AS faturamento, SUM(i.quantidade) AS itens,
       SUM(i.desconto_total) AS desconto_total, SUM(i.valor_bruto) AS valor_bruto,
       COALESCE(SUM(i.faturamento) FILTER (WHERE i.BRAND = 'Private'), 0) AS faturamento_marca_propria
FROM origem.vw_vendas_item i CROSS JOIN origem.vw_janela j
WHERE i.WEEK_NO <= j.semana_fim_atual
GROUP BY i.BASKET_ID, i.DEPARTMENT;

-- Cestas de toda a base até a última semana completa. Grão: 1 linha por cesta.
-- É a mesma agregação de origem.vw_metricas_cesta, sem o recorte das duas janelas do RAG, para servir à base inteira.
CREATE OR REPLACE TABLE painel.cestas AS
SELECT BASKET_ID, ANY_VALUE(STORE_ID) AS STORE_ID, ANY_VALUE(household_key) AS household_key,
       ANY_VALUE(WEEK_NO) AS WEEK_NO,
       SUM(faturamento) AS faturamento, SUM(itens) AS itens,
       SUM(desconto_total) AS desconto_total, SUM(valor_bruto) AS valor_bruto
FROM painel.cesta_departamento
GROUP BY BASKET_ID;

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

-- Grupo de cada cliente. Grão: 1 linha por household com compra na base.
-- O segmento é o atual (janela de 26 semanas do RFM do RAG) e vale para todo o histórico do cliente (redesenho v2).
-- Quem não comprou na janela não é segmentado pelo RAG e fica em 'Sem segmento' (decisão do usuário, 2026-10-22).
CREATE OR REPLACE TABLE painel.grupo_cliente AS
SELECT h.household_key, COALESCE(s.segmento, 'Sem segmento') AS grupo
FROM (SELECT DISTINCT household_key FROM painel.cestas) h
LEFT JOIN painel.rag_segmento_cliente s ON s.household_key = h.household_key;
