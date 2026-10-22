# Validação — Aba Laboratório, LB2 (tela) — 2026-10-22
Base: ddb4d8032cc2 · Contrato: 2.3
Dados: schemas OK (67 arquivos, 0 erros) · reconciliação 539/539 OK (4 checagens novas: `pausas` e `taxa_falso_alarme`)
Tela: console 0 erros · aceite 5.6 4/4 · 1440×900 OK · 390×844 OK · regressão das 6 abas OK
Repositório: OK · servidor local encerrado
Pendências: nenhuma desta sub-fase

## Tela (Playwright MCP, mouse nas coordenadas reais do canvas)
| Item | Resultado |
|---|---|
| Curva ROC | modelo (AUC 0,85) e regra simples (0,74, um ponto por semana sem compra) contra a diagonal; pontos de operação "risco ≥ 0,17: 136 de 283" e "4+ semanas sem compra: 94 de 283"; tooltip pelo mouse no ponto do modelo: "136 das 283 pausas (48,1%) · 8,1% de alarme falso"; tabela gêmea com AUC 0,8531 e 0,7378 |
| Matriz de confusão | 136/147/337/3.805 e 94/189/311/3.831 (= `lab_modelo.json`); encontra, acerta e alarme falso; conclusão do RAG |
| CLV | 5 grupos com o IC de 95%, total US$ 1.103.220 (IC 1.063.210 a 1.143.641), margem de 25% como premissa; backtest com o erro do método e o da regra ingênua; tabela gêmea = `lab_clv.json` |
| Teste de desconto | p = 0,0085 (existe diferença), η² = 0,0036 (não importa), maior diferença 1,2 p.p.; 6 pares com IC contra a faixa de ±1 p.p.; ponto cheio só em Regulares − Esporádicos (único significativo par a par); tabela gêmea = `lab_desconto.json` |
| Filtros | período e departamento desabilitados, com nota; Fiéis destaca o ponto dos Fiéis, apaga 4 linhas do backtest e mantém os 3 pares com Fiéis; Limpar tudo volta; voltando à Visão Geral, os filtros reabilitam |
| Layout | 1440×900 sem rolagem; 390×844 empilhado, sem rolagem horizontal |
| Regressão | as 6 abas em 1440×900 e 390×844, nenhum gráfico vazio, console 0 |

## Encontrado e corrigido
1. **Precisão 28,7% em vez de 28,8%** (136 ÷ 473 = 28,75%): 0,2875 × 100 = 28,749999… no ponto flutuante. `fmt.pct`, `fmt.pp` e `fmt.variacao` limpam o ruído (12 dígitos) antes de arredondar; só muda valor exatamente em ,5.
2. Taxa de alarme falso e número de pausas eram contas do navegador: passaram para `lab_modelo.json` (`taxa_falso_alarme`, `pausas`), com reconciliação.
3. Descrição do modelo com "0.17": vírgula decimal.
4. CLV: total com o formato compacto dava "US$ 1,1 mi (IC US$ 1,1 mi a US$ 1,1 mi)"; agora em dólares inteiros. Nomes do eixo sumiam por falta de altura: a segunda linha da aba ficou mais alta e os nomes aparecem todos.
5. ROC: nome do eixo Y cobria a legenda; no celular a legenda quebra em duas linhas e o gráfico desce.
6. Eixo do desconto em pontos inteiros (era −2,9 p.p.); rótulos que colidem somem no celular; valores do backtest sem quebra de linha.
