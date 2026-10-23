-- rede_vizinhos_<periodo>.json (compacto). Grão: 1 linha por subconjunto de segmentos × nó × par com o nó, os 10 de maior
-- lift entre os pares do nó com 200+ cestas no período (os pares do nó selecionado na rede, redesenho v3).
-- confianca = cestas com os dois ÷ cestas com o nó ("quem compra o nó também leva o outro em X% das vezes").
-- Ordem: subconjunto, nó, lift decrescente.
WITH pontas AS (
    SELECT periodo, subconjunto, ordem, no_a AS no, no_b AS outro, cestas_par, cestas_a AS cestas_no, lift, indice, amostra_pequena FROM painel.rede_par
    UNION ALL
    SELECT periodo, subconjunto, ordem, no_b, no_a, cestas_par, cestas_b, lift, indice, amostra_pequena FROM painel.rede_par)
SELECT subconjunto, no, outro, cestas_par, ROUND(cestas_par::DOUBLE / cestas_no, 4) AS confianca, ROUND(lift, 4) AS lift,
       ROUND(indice, 4) AS indice
FROM pontas
WHERE periodo = $periodo AND NOT amostra_pequena
QUALIFY ROW_NUMBER() OVER (PARTITION BY subconjunto, no ORDER BY lift DESC, outro) <= 10
ORDER BY ordem, no, lift DESC, outro;
