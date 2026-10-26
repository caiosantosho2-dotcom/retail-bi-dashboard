-- lojas.json (cadastro da aba Clientes & Lojas). Grão: 1 linha por loja com cesta na base inteira. Ordem: faturamento das
-- 26 semanas decrescente. regiao: a inferida pela clientela, ou 'Lojas pequenas'. Perfil pela venda da loja
-- (painel.loja_perfil): null com menos de 100 cestas nas 26 semanas (amostra_pequena_perfil). cestas: as das 26 semanas.
-- indices: os 4 segmentos, parte deles no faturamento da loja e da rede nas 26 semanas, e o índice (100 = igual à rede);
-- null sem cesta nas 26 semanas.
WITH ind AS (
    SELECT STORE_ID, list({'segmento': segmento, 'pct': ROUND(pct, 4), 'rede_pct': ROUND(rede_pct, 4), 'indice': ROUND(indice, 1)}
                          ORDER BY ordem) AS indices
    FROM painel.loja_mix_segmento WHERE periodo = '26s' GROUP BY STORE_ID)
SELECT p.STORE_ID AS id, p.regiao, p.perfil, p.cestas, p.amostra_pequena AS amostra_pequena_perfil, ind.indices
FROM painel.loja_perfil p
LEFT JOIN ind ON ind.STORE_ID = p.STORE_ID
ORDER BY p.faturamento DESC, p.STORE_ID;
