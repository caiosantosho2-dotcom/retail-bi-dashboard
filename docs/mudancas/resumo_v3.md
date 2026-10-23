# Resumo da execução do redesenho v3 (2026-10-23)

Execução sem supervisão, etapa por etapa, com o plano em `plano_v3.md` e as escolhas feitas sem o Caio em
`pendencias_v3.md`. **V0 a V4 feitas, validadas e commitadas. A V5 (Cestas & Marcas) não foi feita:** o limite de uso da
sessão chegou antes. A V6 não foi executada (como pedido): nada de publicação, `git push` ou GitHub Pages.

## Etapas e commits
| Etapa | Commit | O que foi feito | Validação |
|---|---|---|---|
| V0 | `1929561` | Investigação do 136 e plano | `docs/validacao/v0.md` |
| V1 | `f276a44` | `selecao.js` (modelo único de seleção), período em todas as abas, Laboratório virou a página "Metodologia e validação" | gestos 13/13, `v1.md` |
| V2 | `e39b42e` | Visão Geral: "O que puxou a variação", traço do ano anterior nos departamentos, faturamento por segmento; saem calor e insights; contrato 3.0 | 589/589, gestos 15/15, `v2.md` |
| V3 | `d05d769` | Categorias por período, "Todos os departamentos", pares de subcategoria em todos os departamentos com frase de confiança | 801/801, gestos 15/15, `v3.md` |
| V4 | `77df422` | Clientes & Lojas (junção de Segmentos e Lojas): regiões × segmento, perfil das lojas, ranking com 4 métricas, ficha lateral com CSV | 937/937, gestos 14/14, `v4.md` |
| V5 | — | **Não feita** | — |

Cada etapa teve teste de mutação (os erros plantados foram pegos), reconciliação sem divergência, schemas sem erro,
console limpo, 1440×900 sem rolagem e 390×844 sem rolagem horizontal. O RAG ficou intocado.

## Resultado da V0
Os dois 136 são números **diferentes que coincidem**: a previsão (135,95 = soma das probabilidades de pausa dos 2.203
ativos) e o acerto do teste (136 verdadeiros positivos em 283 pausas). Não há erro de cálculo, mas há risco de confusão,
inclusive na página de metodologia, que junta as duas frases. Nenhum texto foi alterado. Detalhes e sugestões: P1.

## O que falta (V5, Cestas & Marcas)
A aba "Produtos" continua como estava (curva ABC, rede, pares, marcas, fixa em 26 semanas, com a nota provisória). O que
precisa ser feito, conforme o plano:
- linha de texto "N subcategorias fazem 80% do faturamento" no lugar da curva ABC;
- rede com clique no nó (filtro de subcategoria, vizinhos acesos, rótulos só nos 15 maiores e nos vizinhos);
- pares característicos pelo nó e pelo segmento, com a frase de confiança;
- marca própria por segmento;
- dados por período e por segmento.

## Pendências para o Caio decidir (`pendencias_v3.md`)
- **P1**, o texto do 136.
- **V4.1**, prioritária: só 20 lojas têm perfil com o mínimo de 30 clientes de loja principal.
- As demais por etapa:
  - Visão Geral: barras nas lojas comparáveis;
  - Categorias: direção da frase do par e poucos departamentos com pares;
  - Clientes & Lojas: CSV com faixa média, ranking só com as maiores altas, região sem filtrar o perfil;
  - opacidade 0,35 nas listas;
  - a V5 inteira.

## Como abrir o painel localmente
```
cd C:\retail-bi-dashboard
venv\Scripts\python.exe -m http.server 8000 --directory site
```
Abra http://localhost:8000. A metodologia está no link do rodapé. Encerre o servidor (Ctrl+C) ao terminar. Para conferir os
dados: `venv\Scripts\python.exe scripts\exportar_dados.py --validar` e `venv\Scripts\python.exe scripts\reconciliar.py`.
O teste dos gestos roda no Playwright MCP com `tests/gestos.js`.
