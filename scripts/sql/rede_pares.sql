-- rede_pares_<periodo>.json (compacto). Grão: 1 linha por subconjunto de segmentos × ligação desenhada (painel.rede_ligacao,
-- fixas) com ao menos uma cesta no subconjunto e no período. Ordem: subconjunto (máscara), no_a, no_b.
SELECT p.subconjunto, p.no_a, p.no_b, p.cestas_par, ROUND(p.lift, 4) AS lift, ROUND(p.indice, 4) AS indice, p.amostra_pequena
FROM painel.rede_par p JOIN painel.rede_ligacao l USING (no_a, no_b)
WHERE p.periodo = $periodo
ORDER BY p.ordem, p.no_a, p.no_b;
