-- departamentos_segmento.json. Grão: 1 linha por subconjunto de segmentos × departamento com faturamento nas 26
-- semanas. Os 6 atributos do subconjunto e o índice contra todos os clientes (100 = igual). Para o crescimento, o
-- índice compara os fatores: (1 + crescimento do subconjunto) ÷ (1 + crescimento de todos) × 100.
-- amostra_pequena: menos de `tamanho_minimo_grupo` (30) compradores. Ordem: subconjunto, departamento.
WITH t AS (SELECT * FROM painel.departamento_subconjunto WHERE subconjunto = 'todos')
SELECT s.subconjunto, s.departamento, ROUND(s.faturamento, 2) AS faturamento, s.compradores,
       ROUND(s.participacao, 4) AS participacao_valor, ROUND(100 * s.participacao / NULLIF(t.participacao, 0), 1) AS participacao_indice,
       ROUND(s.crescimento, 4) AS crescimento_valor,
       ROUND(100 * (1 + s.crescimento) / NULLIF(1 + t.crescimento, 0), 1) AS crescimento_indice,
       ROUND(s.penetracao, 4) AS penetracao_valor, ROUND(100 * s.penetracao / NULLIF(t.penetracao, 0), 1) AS penetracao_indice,
       ROUND(s.frequencia, 4) AS frequencia_valor, ROUND(100 * s.frequencia / NULLIF(t.frequencia, 0), 1) AS frequencia_indice,
       ROUND(s.desconto, 4) AS desconto_valor, ROUND(100 * s.desconto / NULLIF(t.desconto, 0), 1) AS desconto_indice,
       ROUND(s.marca_propria, 4) AS marca_propria_valor,
       ROUND(100 * s.marca_propria / NULLIF(t.marca_propria, 0), 1) AS marca_propria_indice,
       ROUND(s.dinheiro_em_risco, 2) AS dinheiro_em_risco, ROUND(s.dinheiro_em_risco_pct, 4) AS dinheiro_em_risco_pct,
       s.compradores < (SELECT valor FROM painel.parametros WHERE chave = 'tamanho_minimo_grupo') AS amostra_pequena
FROM painel.departamento_subconjunto s JOIN t USING (departamento)
ORDER BY s.ordem, s.departamento;
