-- regioes_segmento.json. Grão: 1 linha por período × região (as inferidas e 'Lojas pequenas') × grupo de cliente com
-- venda. Faturamento de todas as cestas das lojas da região no período, aberto pelo segmento atual do cliente (que é fixo:
-- atributo do cliente). Para "Regiões: quem compra em cada área". Ordem: período, região, grupo.
SELECT x.periodo, g.regiao, x.grupo, ROUND(SUM(x.faturamento), 2) AS faturamento
FROM painel.loja_periodo_grupo x
JOIN painel.loja_grupo g USING (STORE_ID)
JOIN painel.periodos p ON p.periodo = x.periodo
JOIN painel.grupos o ON o.grupo = x.grupo
WHERE x.cestas > 0
GROUP BY x.periodo, p.ordem, g.regiao, x.grupo, o.ordem
ORDER BY p.ordem, g.regiao = 'Lojas pequenas', g.regiao, o.ordem;
