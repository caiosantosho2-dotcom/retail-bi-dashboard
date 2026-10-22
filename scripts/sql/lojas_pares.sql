-- lojas_pares.json. Grão: 1 linha por par de lojas entre as 3 ligações mais fortes (mais clientes em comum) de cada
-- loja do universo (painel.loja_pares, gravado por scripts/regioes.py a partir de painel.loja_par). Ordem: loja_a, loja_b.
SELECT loja_a, loja_b, comuns, ROUND(jaccard, 4) AS jaccard
FROM painel.loja_pares
ORDER BY loja_a, loja_b;
