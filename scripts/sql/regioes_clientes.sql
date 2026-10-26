-- regioes_clientes.json (compacto). Grão: 1 linha por subconjunto de regiões (painel.regiao_subconjunto) × segmento
-- (os 4) com cesta nas lojas do subconjunto nas 26 semanas. Para a Roda e os cards de Clientes & Lojas quando há
-- região no filtro: clientes = quantos clientes do segmento compraram em alguma loja do subconjunto (um cliente que
-- compra em duas regiões conta uma vez em cada uma, e uma vez só na combinação delas: por isso o arquivo traz as
-- combinações em vez de somar regiões); faturamento e cestas = só as cestas nessas lojas. Fixo nas 26 semanas, como a
-- Roda. Ordem: subconjunto (máscara), segmento na ordem fixa.
WITH p AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = '26s'),
c AS (
    SELECT c.STORE_ID, c.household_key, c.faturamento, s.segmento
    FROM painel.cestas c CROSS JOIN p
    JOIN painel.rag_segmento_cliente s ON s.household_key = c.household_key
    WHERE c.WEEK_NO BETWEEN p.semana_ini AND p.semana_fim),
seg(segmento, ordem) AS (VALUES ('Fiéis', 1), ('Regulares', 2), ('Esporádicos', 3), ('Em pausa', 4))
SELECT x.subconjunto, c.segmento, COUNT(DISTINCT c.household_key) AS clientes,
       ROUND(SUM(c.faturamento), 2) AS faturamento, COUNT(*) AS cestas
FROM painel.regiao_subconjunto x
JOIN painel.loja_grupo g ON g.regiao = x.regiao
JOIN c ON c.STORE_ID = g.STORE_ID
JOIN seg ON seg.segmento = c.segmento
GROUP BY x.ordem, x.subconjunto, c.segmento, seg.ordem
ORDER BY x.ordem, seg.ordem;
