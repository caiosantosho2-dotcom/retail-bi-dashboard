# Validação — Aba Laboratório, LB1 (spec, contrato 2.3, dados e reconciliação) — 2026-10-22
Base: ddb4d8032cc2 · Contrato: 2.3
Dados: schemas OK (67 arquivos, 0 erros) · reconciliação 535/535 OK · aba Laboratório 26 KB (limite 1,5 MB)
Tela: regressão das 5 abas (sem mudança de front nesta sub-fase): console 0, 1440×900 sem rolagem, nenhum gráfico vazio
Repositório: OK · servidor local encerrado
Pendências: a tela (LB2)

## O que o RAG devolve (medido)
- Risco de pausa: AUC, IC, matriz de confusão, curva de limiar (8 cortes), calibração e fatores, mas **não os pontos da curva ROC**.
- CLV: média por segmento com IC de 95% e o backtest de 26 semanas; **não há CLV por household**.
- Teste de desconto: quartis por segmento, Kruskal-Wallis (H 11,68, p 0,0085, η² 0,0036), Mann-Whitney com ajuste e o IC das 6 diferenças de mediana; veredito "diferença desprezível".

## Decisões do usuário
Reproduzir a ROC com o código do RAG; CLV como média com intervalo + backtest; matriz de confusão (calibração e fatores ficam de fora).

## Curva ROC reproduzida
`rag_modelos._reproduzir` repete os passos de `churn._calcular` (o mesmo treino que já dava o risco por cliente) e guarda as notas do teste; `curvas_roc` monta as curvas e **para a exportação** se a AUC (na 4ª casa, como o RAG arredonda), as matrizes de confusão ou o k da regra simples não forem iguais aos do RAG.
- AUC 0,85308 → 0,8531 e 0,73777 → 0,7378, iguais às do RAG; matrizes (3.805, 337, 147, 136) e (3.831, 311, 189, 94), iguais.
- O risco por cliente saiu idêntico ao já exportado (a refatoração não mudou nada).
- 469 pontos para o modelo e 9 para a regra simples (um por número de semanas sem compra).

## Reconciliação (103 checagens novas)
- Modelo e regra simples: todos os campos = `churn._calcular`; matriz soma as 4.425 linhas do teste; alertas, precisão, recall e prevalência saem da matriz.
- Curva ROC: de (0,0) a (1,1), sem voltar; **área dos pontos publicados = AUC do RAG**; ponto de operação na curva (vértice no k = 4 da regra; trecho reto no limiar 0,17 do modelo); diferença de AUC com IC = RAG.
- CLV: todos os campos = `clv._calcular`; médio × households = total de cada segmento; segmentos somam o CLV total (US$ 1.103.220) e os 2.500 households; erro do backtest = previsto ÷ real − 1.
- Desconto: todos os campos = `teste_desconto._calcular`; **% de desconto por household recontado em SQL na tabela fato** (households, quartis, taxa ponderada e desconto total por segmento); diferença = mediana a − mediana b; "IC exclui zero" coerente; veredito pela regra do RAG aplicada aos números publicados.
- **Teste de mutação:** 5 erros plantados (um tpr da curva +0,02, VP 136 → 140, CLV médio dos Regulares +1%, "exclui zero" trocado, mediana de Em pausa +0,1 p.p.) → 15 divergências; dados restaurados.
- Etapas `rag` e `laboratorio` rodadas de novo: os 9 arquivos (5 `lab_*` e 4 parquets do RAG) idênticos byte a byte; RAG intocado.

## Ajustes
- `conferir` em `reconciliar.py` compara listas com tolerância elemento a elemento (antes só valores únicos).
