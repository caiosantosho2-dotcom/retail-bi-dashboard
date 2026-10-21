-- clientes/<segmento>.json e clientes_indice.json. Grão: 1 linha por cliente segmentado. Ordem: id crescente.
-- O Python separa por segmento e monta os objetos `atributos` e `risco` a partir das colunas.
WITH b AS (SELECT semana_ini, semana_fim FROM painel.periodos WHERE periodo = 'base'),
grade AS (
    SELECT s.household_key, w.range::INTEGER AS semana
    FROM painel.rag_segmento_cliente s CROSS JOIN b CROSS JOIN range(b.semana_ini, b.semana_fim + 1) w),
historico AS (
    -- Faturamento por semana, todas as lojas, alinhado com vendas_semanais.json (mesmas semanas, mesma ordem).
    SELECT g.household_key, list(ROUND(COALESCE(cs.faturamento, 0)::DOUBLE, 2) ORDER BY g.semana) AS historico_semanal
    FROM grade g
    LEFT JOIN origem.vw_cliente_semana cs ON cs.household_key = g.household_key AND cs.WEEK_NO = g.semana
    GROUP BY g.household_key),
dep AS (
    -- Gasto do cliente por departamento na janela de 26 semanas, como fração do gasto dele na janela.
    SELECT household_key, DEPARTMENT AS departamento, SUM(faturamento)::DOUBLE AS gasto
    FROM origem.vw_vendas_item WHERE periodo = 'atual' GROUP BY household_key, DEPARTMENT),
top AS (
    SELECT household_key,
           list({'departamento': departamento, 'gasto_pct': ROUND(gasto / NULLIF(total, 0), 4)} ORDER BY gasto DESC, departamento)
               FILTER (WHERE posicao <= 5) AS top_departamentos
    FROM (SELECT *, SUM(gasto) OVER (PARTITION BY household_key) AS total,
                 ROW_NUMBER() OVER (PARTITION BY household_key ORDER BY gasto DESC, departamento) AS posicao
          FROM dep)
    GROUP BY household_key)
SELECT a.household_key AS id, a.segmento,
       CAST(FLOOR(a.recencia_dias / 7) AS INTEGER) AS semanas_sem_comprar,
       ROUND(a.recencia, 0) AS recencia_valor, ROUND(p.recencia, 1) AS recencia_percentil,
       ROUND(a.frequencia, 0) AS frequencia_valor, ROUND(p.frequencia, 1) AS frequencia_percentil,
       ROUND(a.valor, 2) AS valor_valor, ROUND(p.valor, 1) AS valor_percentil,
       ROUND(a.clv, 2) AS clv_valor, ROUND(p.clv, 1) AS clv_percentil,
       ROUND(a.sensibilidade_desconto, 4) AS sensibilidade_desconto_valor,
       ROUND(p.sensibilidade_desconto, 1) AS sensibilidade_desconto_percentil,
       ROUND(a.variedade_departamentos, 0) AS variedade_departamentos_valor,
       ROUND(p.variedade_departamentos, 1) AS variedade_departamentos_percentil,
       ROUND(r.prob, 4) AS risco_score, r.faixa AS risco_faixa,
       h.historico_semanal, COALESCE(t.top_departamentos, []) AS top_departamentos
FROM painel.cliente_atributos a
JOIN painel.cliente_percentis p ON p.household_key = a.household_key
LEFT JOIN painel.cliente_risco r ON r.household_key = a.household_key
LEFT JOIN historico h ON h.household_key = a.household_key
LEFT JOIN top t ON t.household_key = a.household_key
ORDER BY a.household_key;
