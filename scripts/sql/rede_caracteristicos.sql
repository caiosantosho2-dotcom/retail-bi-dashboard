-- rede_caracteristicos_<periodo>.json. Grão: 1 linha por subconjunto de segmentos (menos 'todos') × par entre os
-- `rede_caracteristicos` (15) de maior índice (lift no subconjunto ÷ lift com todos, no período), sem amostra pequena.
-- São os pares que esse grupo de clientes compra junto bem mais que a média. As duas confianças servem à frase "quem
-- compra A também leva B em X% das vezes". Ordem: subconjunto, posição.
SELECT subconjunto, posicao, no_a, no_b, cestas_par, ROUND(cestas_par::DOUBLE / cestas_a, 4) AS confianca_a_b,
       ROUND(cestas_par::DOUBLE / cestas_b, 4) AS confianca_b_a, ROUND(lift, 4) AS lift, ROUND(lift_todos, 4) AS lift_todos,
       ROUND(indice, 4) AS indice
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY subconjunto ORDER BY indice DESC, no_a, no_b) AS posicao
    FROM painel.rede_par WHERE periodo = $periodo AND subconjunto <> 'todos' AND NOT amostra_pequena)
WHERE posicao <= (SELECT rede_caracteristicos FROM painel.parametros_rede)
ORDER BY ordem, posicao;
