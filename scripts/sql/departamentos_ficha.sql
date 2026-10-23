-- departamentos_ficha_<periodo>.json. Grão: 1 linha por departamento com faturamento no período, todos os clientes.
-- Atributos do radar (painel.departamento_subconjunto, subconjunto 'todos') com o percentil entre os departamentos do
-- período (painel.departamento_percentis). O Python monta o objeto `atributos`. amostra_pequena: menos de 0,1% do
-- faturamento do período. Ordem: faturamento decrescente.
SELECT d.departamento, ROUND(d.faturamento, 2) AS faturamento, d.compradores, d.cestas,
       ROUND(d.participacao, 4) AS participacao_valor, ROUND(p.participacao, 1) AS participacao_percentil,
       ROUND(d.crescimento, 4) AS crescimento_valor, ROUND(p.crescimento, 1) AS crescimento_percentil,
       ROUND(d.penetracao, 4) AS penetracao_valor, ROUND(p.penetracao, 1) AS penetracao_percentil,
       ROUND(d.frequencia, 4) AS frequencia_valor, ROUND(p.frequencia, 1) AS frequencia_percentil,
       ROUND(d.desconto, 4) AS desconto_valor, ROUND(p.desconto, 1) AS desconto_percentil,
       ROUND(d.marca_propria, 4) AS marca_propria_valor, ROUND(p.marca_propria, 1) AS marca_propria_percentil,
       d.participacao < 0.001 AS amostra_pequena
FROM painel.departamento_subconjunto d
JOIN painel.departamento_percentis p ON p.periodo = d.periodo AND p.departamento = d.departamento
WHERE d.subconjunto = 'todos' AND d.periodo = $periodo
ORDER BY d.faturamento DESC, d.departamento;
