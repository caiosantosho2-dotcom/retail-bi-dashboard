-- lojas.json (cadastro da aba Clientes & Lojas). Grão: 1 linha por loja com cesta na base inteira. Ordem: faturamento das
-- 26 semanas decrescente. regiao: a inferida pela clientela, ou 'Lojas pequenas'. Perfil pela clientela (loja principal,
-- painel.loja_perfil): null sem cliente principal ou com menos de 30 (amostra_pequena_perfil). indices: os 4 segmentos,
-- parte deles entre os clientes de loja principal da loja e da rede, e o índice (100 = igual à rede).
WITH ind AS (
    SELECT STORE_ID, list({'segmento': segmento, 'pct': ROUND(pct, 4), 'rede_pct': ROUND(rede_pct, 4), 'indice': ROUND(indice, 1)}
                          ORDER BY ordem) AS indices
    FROM painel.loja_perfil_segmento GROUP BY STORE_ID)
SELECT k.STORE_ID AS id, k.regiao, p.perfil, COALESCE(p.clientes_principais, 0) AS clientes_principais,
       COALESCE(p.clientes_principais, 0) < (SELECT valor FROM painel.parametros WHERE chave = 'tamanho_minimo_grupo') AS amostra_pequena_perfil,
       ind.indices
FROM painel.loja_kpis k
LEFT JOIN painel.loja_perfil p ON p.STORE_ID = k.STORE_ID
LEFT JOIN ind ON ind.STORE_ID = k.STORE_ID
ORDER BY k.faturamento DESC, k.STORE_ID;
