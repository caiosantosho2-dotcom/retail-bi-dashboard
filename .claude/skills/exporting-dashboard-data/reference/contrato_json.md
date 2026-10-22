# Contrato dos arquivos JSON

Versão do contrato: **2.2**. Mudou um campo? Suba a versão (x.1 para campo novo, (x+1).0 para campo removido ou renomeado) e atualize o schema em `contracts/`.

**2.2 (2026-10-22, aba Produtos, spec 5.5):** arquivos novos `abc`, `marcas`, `rede_nos`, `rede_pares` e `rede_caracteristicos` (carga `produtos`); manifest com `parametros_rede` e `bytes_por_aba.produtos`. Nenhum campo removido.

**2.1 (2026-10-22, aba Lojas, spec 5.4):** arquivos novos `lojas`, `lojas_pares`, `regioes`, `regioes_semana` e `lojas_ficha` (carga `lojas`); manifest com `parametros_regioes` e `bytes_por_aba.lojas`. Nenhum campo removido.

**2.0 (2026-10-22, redesenho v2, spec seção 6):** saem `kpis.json`, `vendas_semanais.json`, `clientes_indice.json`, `clientes/*.json` e `medias_segmento.json` (a Ficha do Cliente saiu). Entram os cubos (`cubo_faturamento`, `cubo_periodo`), `kpis_filtrados`, `calor/<departamento>.json`, os arquivos da Ficha da Categoria, os pares de cesta, `afinidade` e `lista_acao`. `calor_dia_hora` e `departamentos` mudam de grão. Nasce o **formato compacto**. O manifest ganha `carga` por arquivo, `parametros_cesta`, `departamentos_10pct`, `minimo_compradores_afinidade` e `bytes_por_aba`.

**1.1 (2026-10-21):** `kpis.valor_comparavel`; `insights.unidade` aceita `pp`; manifest com `janelas`, `rag_commit`, `rag_sujo` e `modelo`.

## Sumário
- Convenções gerais (inclui o formato compacto e os subconjuntos de segmento)
- Abertura (Visão Geral): departamentos, cubo_faturamento, cubo_periodo, kpis_filtrados, calor_dia_hora, insights
- Sob demanda: calor/<departamento>.json
- Ficha da Categoria: departamentos_ficha, departamentos_segmento, subcategorias, cesta_departamentos, cesta_subcategorias
- Segmentos: segmentos, afinidade, lista_acao
- manifest.json
- P2

## Convenções gerais

- `periodo` é sempre um destes valores: `"4s"`, `"13s"`, `"26s"`, `"base"`. As janelas terminam na última semana completa (`vw_janela.semana_fim_atual`, hoje a 101), como no chat. Aqui `"base"` quer dizer **base inteira**; não confundir com o `periodo = 'base'` das views do RAG, que é o ano anterior.
- `segmento` é um de: `"Fiéis"`, `"Regulares"`, `"Esporádicos"`, `"Em pausa"`, com a grafia exata da origem (`src/nucleo/rfm.py`, `LADO[3]` + `NOME_PAUSA`).
- `grupo` é um segmento ou `"Sem segmento"` (clientes sem compra na janela de 26 semanas; spec, seção 6). Ordem fixa: os 4 segmentos e depois `"Sem segmento"`.
- `subconjunto` é `"todos"` (nenhum chip ligado: os 4 segmentos + Sem segmento) ou os nomes dos segmentos ligados, **na ordem fixa**, unidos por `+`: `"Fiéis"`, `"Fiéis+Regulares"`, …, `"Fiéis+Regulares+Esporádicos+Em pausa"`. São 16. O front monta a chave assim a partir dos chips.
- `departamento` é o nome como na origem (`DEPARTMENT`). Em `kpis_filtrados`, `"todos"` = sem filtro de departamento.
- **Lista de objetos:** `{"grao": "...", "linhas": [{...}, ...]}`, para o grão viajar junto com o dado.
- **Formato compacto** (arquivos grandes, marcados abaixo): `{"grao", "dimensoes", "colunas", "linhas"}`. `colunas` dá a ordem dos valores de cada linha; `linhas` é uma lista de listas; nas colunas que estão em `dimensoes`, o valor é o **índice** na lista `dimensoes[coluna]` (na ordem da primeira aparição). O front expande para objetos em `dados.js` (`linhas()`); a validação e a reconciliação fazem o mesmo.
- Linha ausente num cubo = sem venda naquela combinação (o front soma zero).

---

## Abertura (Visão Geral)

### departamentos.json
**Grão:** 1 linha por departamento com venda na base inteira. **Ordem:** faturamento das 26 semanas decrescente, depois o da base inteira, depois o nome. Serve à lista e à ordem do filtro de departamento.

| Campo | Tipo | Descrição |
|---|---|---|
| departamento | string | |
| faturamento_26s | number | 26 semanas, todas as lojas (0 se não vendeu) |
| participacao_26s_pct | number | fração do faturamento das 26 semanas |
| faturamento_base | number | base inteira, todas as lojas |
| amostra_pequena | boolean | menos de 0,1% do faturamento das 26 semanas |

### cubo_faturamento.json (compacto)
**Grão:** 1 linha por semana (as últimas 52) × grupo × departamento com venda. **Dimensões:** `semana_inicio`, `grupo`, `departamento`. **Ordem:** semana, grupo, departamento. Só métricas que somam.
Lojas: as comparáveis da janela de 26 semanas (`vw_lojas_like_for_like`), nas duas colunas, como a linha do chat.

| Campo | Tipo | Descrição |
|---|---|---|
| semana_inicio | string (data) | primeiro dia da semana |
| grupo | string | |
| departamento | string | |
| faturamento | number | |
| faturamento_ano_anterior | number \| null | mesma semana um ano antes (semana − 52), só nas semanas da janela de 26 semanas; `null` antes dela (o ano anterior cairia na entrada da base; spec, seção 6) |

### cubo_periodo.json (compacto)
**Grão:** 1 linha por período × grupo × departamento com venda no período ou no ano anterior. **Dimensões:** `periodo`, `grupo`, `departamento`. **Ordem:** período, grupo, departamento. Só métricas que somam: o front soma para qualquer seleção e calcula o % de desconto como soma dos descontos ÷ soma do valor bruto.

| Campo | Tipo | Descrição |
|---|---|---|
| periodo, grupo, departamento | string | |
| faturamento, desconto, valor_bruto | number | todas as lojas |
| faturamento_comparavel, desconto_comparavel, valor_bruto_comparavel | number \| null | lojas comparáveis do período; `null` na base inteira |
| faturamento_ano_anterior, desconto_ano_anterior, valor_bruto_ano_anterior | number \| null | as mesmas lojas, um ano antes; `null` na base inteira |

### kpis_filtrados.json (compacto)
**Grão:** 1 linha por período × subconjunto × departamento (`"todos"` ou um) com cesta ou cliente ativo. **Dimensões:** `periodo`, `subconjunto`, `departamento`. **Ordem:** período, subconjunto (máscara de bits: Fiéis 1, Regulares 2, Esporádicos 4, Em pausa 8; `todos` primeiro), `"todos"` e depois departamentos em ordem alfabética. Métricas que **não somam**; com 2 ou mais departamentos o front mostra "—".

Para cada métrica `m` em `cestas`, `ticket_medio`, `itens_por_cesta`, `clientes_ativos`: `m` (todas as lojas), `m_comparavel` (lojas comparáveis; `null` na base inteira), `m_ano_anterior` (as mesmas lojas um ano antes; `null` na base inteira), `m_variacao_pct` (`m_comparavel ÷ m_ano_anterior − 1`, fração). Em `clientes_ativos`, comparável = valor (não depende de loja) e o ano anterior não tem filtro de loja. Definições com 1 departamento: spec, seção 6.

| Campo extra | Tipo | Descrição |
|---|---|---|
| lojas_comparaveis | integer \| null | lojas comparáveis do período; `null` na base inteira |
| amostra_pequena | boolean | menos de 100 cestas (`metricas.loja_amostra_minima_cestas`) |

Arredondamento: dinheiro 2 casas, contagens inteiras, `itens_por_cesta` e frações 4 casas.

### calor_dia_hora.json (compacto)
**Grão:** 1 linha por dia do ciclo × hora × grupo com venda, base inteira, todas as lojas. **Dimensões:** `grupo`. **Ordem:** dia, hora, grupo.

| Campo | Tipo | Descrição |
|---|---|---|
| dia_semana | integer | 1 … 7, de `dim_data.dia_semana`, **sem nome** (spec, decisão 5 da fase 2) |
| hora | integer | 0–23, de `fato_transacoes.hora` |
| grupo | string | |
| faturamento | number | |
| cestas | integer | cestas distintas (cada cesta cai numa só célula; soma entre grupos) |

### insights.json
**Grão:** 1 linha por insight, no máximo 3. Não responde a filtro.

| Campo | Tipo | Descrição |
|---|---|---|
| id | string | `fieis_faturamento`, `risco_pausa`, `desconto_segmentos` |
| conclusao | string | frase curta, igual à da aba de origem no app de RAG |
| numero | number | número que sustenta a frase |
| unidade | string | `pct` (fração), `pp` (pontos percentuais como fração, 6 casas), `usd`, `clientes` |
| aba_destino | string | `visao_geral`, `categoria` ou `segmentos` (o de risco leva à lista de ação, em `segmentos`) |

## Sob demanda

### calor/<slug>.json (compacto)
Um arquivo por departamento, com o nome em slug sem acento (`DRUG GM` → `drug_gm.json`; `comum.slug`). Carregado só quando há filtro de departamento; com vários, o front soma os arquivos (o faturamento soma).
**Grão:** 1 linha por dia × hora × grupo com venda, base inteira. **Campos:** `dia_semana`, `hora`, `grupo`, `faturamento` (sem cestas: não somam entre departamentos).

---

## Ficha da Categoria (carregados ao abrir a aba; janela de 26 semanas)

### departamentos_ficha.json
**Grão:** 1 linha por departamento com faturamento nas 26 semanas, todos os clientes. **Ordem:** faturamento decrescente.

| Campo | Tipo | Descrição |
|---|---|---|
| departamento | string | |
| faturamento | number | todas as lojas |
| compradores, cestas | integer | |
| atributos | object | chaves `participacao`, `crescimento`, `penetracao`, `frequencia`, `desconto`, `marca_propria`; cada uma `{"valor": number \| null, "percentil": number \| null}`. Valor: frações com 4 casas (frequência em cestas por cliente). Percentil 0–100 entre os departamentos (`PERCENT_RANK`), 1 casa. Definições: spec, seção 6 |
| dinheiro_em_risco | number | faturamento de clientes na faixa alta de risco de pausa |
| dinheiro_em_risco_pct | number \| null | fração do faturamento do departamento |
| amostra_pequena | boolean | menos de 0,1% do faturamento |

### departamentos_segmento.json
**Grão:** 1 linha por subconjunto × departamento com faturamento nas 26 semanas. **Ordem:** subconjunto (máscara), departamento. Para a comparação da direita.

| Campo | Tipo | Descrição |
|---|---|---|
| subconjunto, departamento | string | |
| faturamento | number | |
| compradores | integer | |
| atributos | object | as mesmas 6 chaves; cada uma `{"valor", "indice"}`. Índice = valor ÷ valor com `todos` × 100 (1 casa); no crescimento, (1 + valor) ÷ (1 + valor de todos) × 100 |
| dinheiro_em_risco, dinheiro_em_risco_pct | number, number \| null | |
| amostra_pequena | boolean | menos de 30 compradores (`analises.clv.tamanho_minimo_grupo` do RAG) |

### subcategorias.json
**Grão:** 1 linha por departamento × subcategoria, top 10 por departamento. **Campos:** `departamento`, `subcategoria` (`COMMODITY_DESC`), `posicao` (1–10), `faturamento`, `participacao_pct` (fração do departamento).

### cesta_departamentos.json (compacto)
**Grão:** 1 linha por subconjunto × par **não ordenado** de departamentos (`departamento_a < departamento_b`) com pelo menos uma cesta. **Dimensões:** `subconjunto`, `departamento_a`, `departamento_b`.

| Campo | Tipo | Descrição |
|---|---|---|
| cestas_par, cestas_a, cestas_b, cestas_total | integer | cestas com A e B, com A, com B, e todas as do subconjunto na janela |
| suporte | number | cestas_par ÷ cestas_total, 6 casas |
| confianca_a_b, confianca_b_a | number | cestas_par ÷ cestas_a (e ÷ cestas_b) |
| lift | number | confiança ÷ (cestas do consequente ÷ total); simétrico |
| amostra_pequena | boolean | menos de 200 cestas com o par (`cesta.minimo_cestas_par`); não entra no top 5 |

### cesta_subcategorias.json (compacto)
**Grão:** 1 linha por subconjunto × departamento (só os de `manifest.departamentos_10pct`) × par não ordenado de subcategorias, os **20 primeiros** por (amostra_pequena, lift decrescente). **Dimensões:** `subconjunto`, `departamento`, `subcategoria_a`, `subcategoria_b`. Mesmos campos e regras de `cesta_departamentos`; o total de cestas é o de todas as cestas do subconjunto.

---

## Segmentos (carregados ao abrir a aba; janela de 26 semanas)

### segmentos.json
**Grão:** 1 linha por segmento (4). **Ordem:** a ordem fixa da convenção. Sem mudança desde a 1.1.

| Campo | Tipo | Descrição |
|---|---|---|
| segmento | string | |
| clientes | integer | |
| clientes_pct | number | fração |
| faturamento | number | janela de análise do RFM |
| faturamento_pct | number | fração |
| ticket_medio | number | média do ticket dos clientes do segmento, como no RFM do RAG (`ticket_medio_usd`) |
| clv_medio | number \| null | `clv_medio` do CLV do RAG (margem em 52 semanas) |
| risco_alto_pct | number \| null | clientes na faixa alta ÷ clientes do segmento com risco calculado; `null` se nenhum tiver (Em pausa) |
| desconto_mediano_pct | number \| null | mediana do % de desconto por cliente, do teste de desconto do RAG, como fração |

### afinidade.json
**Grão:** 1 linha por segmento × departamento com faturamento nas 26 semanas (4 × 26). **Ordem:** segmento, participação do departamento na base decrescente.

| Campo | Tipo | Descrição |
|---|---|---|
| segmento, departamento | string | |
| faturamento | number | do segmento no departamento |
| participacao_segmento_pct | number | fração do faturamento do segmento |
| participacao_base_pct | number | fração do faturamento dos 4 segmentos |
| indice | number | participacao_segmento ÷ participacao_base × 100, 1 casa; 100 = média |
| compradores | integer | clientes do segmento que compraram o departamento |
| amostra_pequena | boolean | menos de 30 compradores |

### lista_acao.json
**Grão:** 1 linha por cliente nas faixas alta ou média de risco de pausa. **Ordem:** `faturamento_em_risco` decrescente, depois `id`. O CSV ("Baixar CSV") é gerado no navegador a partir deste arquivo.

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer | `household_key` (ID pseudônimo da base pública) |
| segmento | string | |
| faixa | string | `alto` ou `medio` (cortes em `manifest.modelo`) |
| prob | number | probabilidade de pausa longa do modelo do RAG, 4 casas |
| semanas_sem_comprar | integer | `floor(recencia_dias / 7)` no fim da janela |
| faturamento_26s | number | `vw_metricas_cliente.valor` |
| faturamento_em_risco | number | prob × faturamento_26s |

---

## Lojas (carregados ao abrir a aba; janela de 26 semanas)

### lojas.json
**Grão:** 1 linha por loja com cesta nas 26 semanas ou do universo das regiões. **Ordem:** faturamento decrescente.

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer | `STORE_ID` |
| regiao | string | "Região A" … ou "Lojas pequenas" (spec, seção 6) |
| x, y | number \| null | posição no mapa de clientela, de 0 a 1; null nas lojas pequenas |
| faturamento, cestas, clientes | number, integer, integer | 26 semanas, todas as cestas da loja |
| ticket_medio, itens_por_cesta, desconto_pct | number \| null | |
| comparavel | boolean | está em `vw_yoy_loja` |
| faturamento_ano_anterior, faturamento_variacao_pct, cestas_variacao_pct, clientes_variacao_pct, ticket_variacao_pct | number \| null | de `vw_yoy_loja`, frações; null se não comparável |
| amostra_pequena | boolean | comparável: a de `vw_yoy_loja` (algum período com menos de 100 cestas); senão, menos de 100 cestas nas 26 semanas |

### lojas_pares.json
**Grão:** 1 linha por par (`loja_a < loja_b`) entre as 3 ligações mais fortes de cada loja do universo. **Campos:** `loja_a`, `loja_b`, `comuns` (clientes em comum na base inteira), `jaccard` (4 casas).

### regioes.json
**Grão:** 1 linha por região + "Lojas pequenas" (por último). **Campos:** `regiao`, `lojas` (com cesta nas 26 semanas), `ancora` (a de maior faturamento; null nas pequenas), `faturamento`, `participacao_pct`, `clientes` (distintos), `lojas_comparaveis`, `faturamento_variacao_pct` (soma atual ÷ soma ano anterior das comparáveis − 1).

### regioes_semana.json (compacto)
**Grão:** 1 linha por região × semana (últimas 52), todas as lojas. **Dimensões:** `semana_inicio`, `regiao`. **Campos:** `faturamento`, `indice` (semana ÷ média semanal da região × 100).

### lojas_ficha.json
**Grão:** 1 linha por loja com cesta nas 26 semanas. **Campos:** `id`; `arvore` (null se não comparável) com `faturamento`, `clientes`, `idas_por_cliente`, `ticket_medio`, cada um `{"atual", "base", "variacao_pct"}`; `segmentos` (os 4: `segmento`, `pct`, `rede_pct`, `indice`); `departamentos` (top 5: `departamento`, `pct`, `rede_pct`, `indice`).

---

## Produtos (carregados ao abrir a aba; 26 semanas e janela da cesta)

### abc.json
**Grão:** 1 linha por departamento × subcategoria com venda nas 26 semanas. **Ordem:** `posicao` (faturamento decrescente). **Campos:** `departamento`, `subcategoria`, `posicao`, `faturamento`, `participacao_pct` e `acumulado_pct` (frações, 6 casas), `classe` (`A`, `B`, `C`; spec, seção 6), `marca_propria_pct`, `crescimento_pct` (de `vw_yoy_categoria`, `marca = 'TODAS'`; null sem ano anterior).

### marcas.json
**Grão:** 1 linha por departamento com venda nas 26 semanas. **Ordem:** faturamento decrescente. **Campos:** `departamento`, `faturamento`, `participacao_pct`, `marca_propria_pct`, `marca_propria_crescimento_pct` e `nacional_crescimento_pct` (soma de `vw_yoy_categoria` por marca), `fabricantes_nacionais`, `fabricantes_80`, `maior_fabricante_pct`, `amostra_pequena` (menos de 0,1% do faturamento).

### rede_nos.json
**Grão:** 1 linha por nó da rede (as 80 maiores subcategorias da janela da cesta). **Campos:** `no` (0 = a maior), `departamento`, `subcategoria`, `faturamento`, `x`, `y` (posição de 0 a 1).

### rede_pares.json (compacto)
**Grão:** 1 linha por subconjunto × ligação desenhada (as 3 de maior lift de cada nó, com todos os clientes) com ao menos uma cesta no subconjunto. **Dimensões:** `subconjunto`. **Campos:** `no_a`, `no_b`, `cestas_par`, `lift`, `indice` (lift ÷ lift com todos), `amostra_pequena`.

### rede_caracteristicos.json
**Grão:** 1 linha por subconjunto (menos `todos`) × par entre os 15 de maior índice, sem amostra pequena. **Campos:** `subconjunto`, `posicao`, `no_a`, `no_b`, `cestas_par`, `lift`, `lift_todos`, `indice`.

---

## Laboratório (carregados ao abrir a aba; resultados do RAG, contrato 2.3)

Nada é recalculado: a etapa `laboratorio` reorganiza o que a etapa `rag` guardou em `data/tmp/laboratorio.json`.
Percentuais do RAG (0 a 100) viram frações; diferenças em pontos percentuais também (0,01 = 1 p.p.).

### lab_roc.json (compacto)
**Grão:** 1 linha por classificador (`modelo`, `regra_simples`) × ponto da curva ROC no teste do RAG. **Dimensões:** `classificador`. **Campos:** `ponto` (ordem), `fpr`, `tpr` (6 casas), `corte` (a nota mínima do ponto; null no primeiro, que é o infinito do `roc_curve`). Pontos colineares saem (`drop_intermediate`).

### lab_modelo.json
**Grão:** 1 linha por classificador. **Campos:** `classificador`, `descricao`, `corte` (limiar 0,17 ou k = 4), `auc`, `auc_ic_inf`, `auc_ic_sup`, `auc_pr`, `precisao`, `recall`, `f1`, `alertas`, `tn`, `fp`, `fn`, `tp`, `pausas` (VP + FN), `taxa_falso_alarme` (FP ÷ (FP + VN)).

### lab_clv.json
**Grão:** 1 linha por segmento do CLV do RAG (os 4 e "Sem compra na janela"). **Campos:** `segmento`, `households`, `clv_medio`, `clv_ic_inf`, `clv_ic_sup`, `clv_total`, `receita_esperada`, `backtest_households`, `backtest_real`, `backtest_metodo`, `backtest_ingenuo`, `backtest_erro_metodo_pct`, `backtest_erro_ingenuo_pct` (previsto ÷ real − 1).

### lab_desconto.json
**Grão:** 1 linha por par de segmentos (6), na ordem do RAG. **Campos:** `segmento_a`, `segmento_b`, `diferenca_pp` (mediana a − mediana b), `ic_inf`, `ic_sup`, `exclui_zero`, `p_ajustado` (Mann-Whitney com ajuste do RAG), `significativo`.

### lab_desconto_segmentos.json
**Grão:** 1 linha por segmento (4). **Campos:** `segmento`, `households`, `mediana_pct`, `q25_pct`, `q75_pct`, `bigode_inf_pct`, `bigode_sup_pct`, `taxa_ponderada_pct`, `desconto_total`, `valor_bruto`.

---

## manifest.json (2.3)

Além do formato da skill (`versao_contrato`, `gerado_em`, `base_hash`, `periodo_base`, `arquivos`):

| Campo | Tipo | Descrição |
|---|---|---|
| janelas | object | por período: `{"semana_ini", "semana_fim", "data_ini", "data_fim"}` |
| rag_commit, rag_sujo | string, boolean | commit do RAG usado e se havia mudança não commitada |
| modelo | object | `limiar_alerta`, `corte_medio`, `auc_modelo`, `auc_regra_simples`, `pausas_esperadas`, `alertas`, `risco_por_segmento` |
| parametros_cesta | object | `semana_ini`, `semana_fim`, `minimo_cestas_par`, `corte_departamento_pct` |
| departamentos_10pct | array | `{"departamento", "participacao_pct"}` dos departamentos com pares de subcategorias |
| minimo_compradores_afinidade | integer | 30 |
| bytes_abertura | integer | soma dos arquivos com `carga = "abertura"` (≤ 1,5 MB) |
| parametros_rede | object | nós, ligações por nó, característicos, cobertura do faturamento, ligações desenhadas, método das posições |
| parametros_regioes | object | universo, algoritmo, k, silhueta, semente, tamanhos, concentração dentro × ao acaso, ligações por loja, método das posições |
| parametros_laboratorio | object | `risco` (definição, teste, prevalência, diferença de AUC com IC, conclusão), `clv` (total com IC, margem, horizonte, método, backtest total), `desconto` (Kruskal-Wallis, η², limites de relevância, veredito, impacto, conclusão) |
| bytes_por_aba | object | `categoria`, `segmentos`, `lojas`, `produtos`, `laboratorio` (≤ 1,5 MB cada) e `calor_departamento_max` |
| arquivos[].carga | string | `abertura`, `categoria`, `segmentos`, `lojas`, `produtos`, `laboratorio` ou `sob_demanda` |

## P2 (definir quando a fase começar)

`migracao.json`. Cada um segue as convenções gerais e ganha uma seção aqui antes de ser exportado.
