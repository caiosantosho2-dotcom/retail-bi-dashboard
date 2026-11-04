# Contrato dos arquivos JSON

Versão do contrato: **5.1**. Os schemas valem como fonte: `contracts/` é uma cópia igual byte a byte dos contratos do lakehouse, e mudança de contrato acontece lá (decisão G38 do lakehouse).

**5.1 (2026-11-04, blocos de decisão, decisões G45 a G49 do lakehouse):** só acréscimo. Entram `acionamento_crm` e os 3 `departamentos_quadrante_<periodo>` (abertura; a base inteira não tem arquivo).

**5.0 (2026-10-30, painel v4, decisões G36 a G38 do lakehouse):** o painel passa a consumir os JSONs do lakehouse. Sai `cubo_faturamento` e entram os 4 `faturamento_tempo_<periodo>` (abertura). Saem os arquivos da aba Clientes & Lojas: `segmentos`, `lista_acao`, `migracao`, `migracao_segmentos`, `lojas`, `regioes`, `regioes_segmento`, `regioes_clientes`, `perfis`, `lojas_risco`, `lojas_ranking_<periodo>`, `lojas_ficha_<periodo>`. No manifest: `rag_commit`/`rag_sujo` viram `lakehouse_commit`/`lakehouse_sujo`, entra `silver_versoes`, saem `parametros_regioes`, `parametros_migracao` e `minimo_cestas_loja`, e a aba `clientes` sai das cargas e de `bytes_por_aba`.

**4.0 (2026-10-26, decisões das pendências do v3):** sai a regra da loja principal. `lista_acao.loja_principal` vira `lojas` (as lojas em que o cliente comprou nas 26 semanas, com faturamento e cestas em cada uma); `lojas.clientes_principais` vira `cestas` (26 semanas) e o perfil passa a vir da venda da loja (amostra pequena abaixo de 100 cestas); `perfis` passa a ser por região × perfil (com `cestas`, sem `clientes_principais`); `lojas_risco` passa a ser o faturamento da loja vindo dos clientes em risco alto; entra `regioes_clientes` (combinações de regiões × segmento, para a região filtrar a página); no manifest, `minimo_clientes` vira `minimo_cestas_loja` e `modelo` ganha `clientes_ativos`.

**3.0 (2026-10-23, redesenho v3, em etapas):** arquivos por período (`<nome>_<periodo>.json`, com `periodo` em `4s`, `13s`, `26s`, `base`), carregados quando a aba abre naquele período; o manifest ganha `arquivos[].periodo` e `bytes_por_aba` passa a ser por aba × período. **V2:** saem `calor_dia_hora.json`, `calor/*.json` e `insights.json` (a Visão Geral nova sai toda de `cubo_periodo`, sem arquivo novo); a carga `sob_demanda` deixa de existir. **V5:** a aba Produtos vira Cestas & Marcas: entram `concentracao` e `rede_vizinhos_<periodo>`; `marcas`, `rede_pares` e `rede_caracteristicos` passam a ser por período (e `marcas` por subconjunto; os característicos ganham as duas confianças); sai `abc.json`. **V4:** as abas Segmentos e Lojas viram Clientes & Lojas (carga `clientes`): entram `regioes_segmento`, `perfis`, `lojas_risco`, `lojas_ranking_<periodo>` e `lojas_ficha_<periodo>`; `lojas.json` vira o cadastro (região e perfil); `regioes` ganha `x` e `y`; `lista_acao` ganha `loja_principal`; saem `afinidade`, `lojas_pares`, `regioes_semana` e `lojas_ficha`; no manifest, `minimo_compradores_afinidade` vira `minimo_clientes`. **V3:** a aba Categorias passa a ser por período (`departamentos_ficha`, `departamentos_segmento`, `subcategorias` e `cesta_subcategorias` com `_<periodo>`; `departamentos_segmento` e `subcategorias` ganham a linha `todos`); o dinheiro em risco sai para `departamentos_risco.json` (fixo, 26 semanas); saem `cesta_departamentos.json`, a regra dos 10% (`manifest.departamentos_10pct`, `parametros_cesta.corte_departamento_pct`) e o `amostra_pequena` dos pares (só entram pares com 200+ cestas).

**2.2 (2026-10-22, aba Produtos, spec 5.5):** arquivos novos `abc`, `marcas`, `rede_nos`, `rede_pares` e `rede_caracteristicos` (carga `produtos`); manifest com `parametros_rede` e `bytes_por_aba.produtos`. Nenhum campo removido.

**2.1 (2026-10-22, aba Lojas, spec 5.4):** arquivos novos `lojas`, `lojas_pares`, `regioes`, `regioes_semana` e `lojas_ficha` (carga `lojas`); manifest com `parametros_regioes` e `bytes_por_aba.lojas`. Nenhum campo removido.

**2.0 (2026-10-22, redesenho v2, spec seção 6):** saem `kpis.json`, `vendas_semanais.json`, `clientes_indice.json`, `clientes/*.json` e `medias_segmento.json` (a Ficha do Cliente saiu). Entram os cubos (`cubo_faturamento`, `cubo_periodo`), `kpis_filtrados`, `calor/<departamento>.json`, os arquivos da Ficha da Categoria, os pares de cesta, `afinidade` e `lista_acao`. `calor_dia_hora` e `departamentos` mudam de grão. Nasce o **formato compacto**. O manifest ganha `carga` por arquivo, `parametros_cesta`, `departamentos_10pct`, `minimo_compradores_afinidade` e `bytes_por_aba`.

**1.1 (2026-10-21):** `kpis.valor_comparavel`; `insights.unidade` aceita `pp`; manifest com `janelas`, `rag_commit`, `rag_sujo` e `modelo`.

## Sumário
- Convenções gerais (inclui o formato compacto e os subconjuntos de segmento)
- Abertura (Visão Geral): departamentos, faturamento_tempo_<periodo>, cubo_periodo, kpis_filtrados
- Categorias: departamentos_ficha_<periodo>, departamentos_segmento_<periodo>, subcategorias_<periodo>, cesta_subcategorias_<periodo>, departamentos_risco
- Cestas & Marcas: concentracao, rede_nos, marcas_<periodo>, rede_pares_<periodo>, rede_vizinhos_<periodo>, rede_caracteristicos_<periodo>
- Metodologia: lab_roc, lab_modelo, lab_clv, lab_desconto, lab_desconto_segmentos
- manifest.json

## Convenções gerais

- `periodo` é sempre um destes valores: `"4s"`, `"13s"`, `"26s"`, `"base"`. As janelas terminam na última semana completa (hoje a 101). `"base"` quer dizer **base inteira**, semanas 1 a 101 (decisão G1 do lakehouse).
- `segmento` é um de: `"Fiéis"`, `"Regulares"`, `"Esporádicos"`, `"Em pausa"`, com a grafia exata da origem (`src/nucleo/rfm.py`, `LADO[3]` + `NOME_PAUSA`).
- `grupo` é um segmento ou `"Sem segmento"` (clientes sem compra na janela de 26 semanas; spec, seção 6). Ordem fixa: os 4 segmentos e depois `"Sem segmento"`.
- `subconjunto` é `"todos"` (nenhum chip ligado: os 4 segmentos + Sem segmento) ou os nomes dos segmentos ligados, **na ordem fixa**, unidos por `+`: `"Fiéis"`, `"Fiéis+Regulares"`, …, `"Fiéis+Regulares+Esporádicos+Em pausa"`. São 16. O front monta a chave assim a partir dos chips.
- `departamento` é o nome como na origem (`DEPARTMENT`). Em `kpis_filtrados`, `"todos"` = sem filtro de departamento.
- **Lista de objetos:** `{"grao": "...", "linhas": [{...}, ...]}`, para o grão viajar junto com o dado.
- **Formato compacto** (arquivos grandes, marcados abaixo): `{"grao", "dimensoes", "colunas", "linhas"}`. `colunas` dá a ordem dos valores de cada linha; `linhas` é uma lista de listas; nas colunas que estão em `dimensoes`, o valor é o **índice** na lista `dimensoes[coluna]` (na ordem da primeira aparição). O front expande para objetos em `dados.js` (`linhas()`).
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

### faturamento_tempo_<periodo>.json (compacto)
**Grão:** 1 linha por ponto × grupo × departamento com venda. O ponto é um dia em `4s` (28) e uma semana nos demais (13, 26 e 101). **Dimensões:** `inicio`, `grupo`, `departamento`. Só métricas que somam. Decisões G2, G3 e G37 do lakehouse.
Lojas: em `4s`, `13s` e `26s`, as comparáveis do próprio período, nas duas colunas; em `base`, todas as lojas.

| Campo | Tipo | Descrição |
|---|---|---|
| inicio | string (data) | o dia, ou o primeiro dia da semana |
| grupo | string | |
| departamento | string | |
| faturamento | number | |
| faturamento_ano_anterior | number \| null | mesmo dia − 364 no diário; semana − 52 no semanal; `null` em `base` |

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

---

## Categorias (carregados ao abrir a aba; por período, contrato 3.0)

Os arquivos `_<periodo>` saem para `4s`, `13s`, `26s` e `base`; a aba baixa só os do período selecionado.

### departamentos_ficha_<periodo>.json
**Grão:** 1 linha por departamento com faturamento no período, todos os clientes. **Ordem:** faturamento decrescente.

| Campo | Tipo | Descrição |
|---|---|---|
| departamento | string | |
| faturamento | number | todas as lojas |
| compradores, cestas | integer | |
| atributos | object | chaves `participacao`, `crescimento`, `penetracao`, `frequencia`, `desconto`, `marca_propria`; cada uma `{"valor": number \| null, "percentil": number \| null}`. Valor: frações com 4 casas (frequência em cestas por cliente). Percentil 0–100 entre os departamentos do período (`PERCENT_RANK`), 1 casa. Na base inteira, crescimento e penetração são null. Definições: spec, seção 6 |
| amostra_pequena | boolean | menos de 0,1% do faturamento do período |

### departamentos_segmento_<periodo>.json
**Grão:** 1 linha por subconjunto × departamento com faturamento no período, mais a linha `departamento = "todos"` (o total dos departamentos, para "Todos os departamentos"). **Ordem:** subconjunto (máscara), `todos`, departamento.

| Campo | Tipo | Descrição |
|---|---|---|
| subconjunto, departamento | string | |
| faturamento | number | |
| compradores | integer | em `todos`, clientes distintos com compra no período |
| atributos | object | as mesmas 6 chaves; cada uma `{"valor", "indice"}`. Índice = valor ÷ valor com `todos` × 100 (1 casa); no crescimento, (1 + valor) ÷ (1 + valor de todos) × 100 |
| amostra_pequena | boolean | menos de 30 compradores (`analises.clv.tamanho_minimo_grupo` do RAG) |

### subcategorias_<periodo>.json
**Grão:** 1 linha por departamento (ou `todos`) × subcategoria, as 10 maiores de cada um. **Campos:** `departamento`, `subcategoria` (`COMMODITY_DESC`), `departamento_origem` (só em `todos`: de qual departamento é a subcategoria; null nas outras), `posicao` (1–10), `faturamento`, `participacao_pct` (fração do departamento, ou do total em `todos`).

### departamentos_risco.json (fixo, 26 semanas)
**Grão:** 1 linha por subconjunto × departamento (ou `todos`) com faturamento nas 26 semanas. **Campos:** `subconjunto`, `departamento`, `dinheiro_em_risco` (faturamento de clientes na faixa alta de risco), `dinheiro_em_risco_pct` (fração do faturamento do departamento). Fixo: o risco é uma foto do momento.

### cesta_subcategorias_<periodo>.json (compacto)
**Grão:** 1 linha por subconjunto × departamento × par **não ordenado** de subcategorias (`subcategoria_a < subcategoria_b`), os **10 de maior lift** entre os pares com 200+ cestas (`cesta.minimo_cestas_par`), em todos os departamentos. **Dimensões:** `subconjunto`, `departamento`, `subcategoria_a`, `subcategoria_b`. **Ordem:** subconjunto, departamento pelo faturamento do período, lift decrescente.

| Campo | Tipo | Descrição |
|---|---|---|
| cestas_par, cestas_a, cestas_b, cestas_total | integer | cestas com A e B, com A, com B, e todas as do subconjunto no período |
| suporte | number | cestas_par ÷ cestas_total, 6 casas |
| confianca_a_b, confianca_b_a | number | cestas_par ÷ cestas_a (e ÷ cestas_b) |
| lift | number | confiança ÷ (cestas do consequente ÷ total); simétrico |

---

## Cestas & Marcas (carregados ao abrir a aba; contrato 3.0)

Fixos: `concentracao`, `rede_nos`. Por período: `marcas_<periodo>`, `rede_pares_<periodo>`, `rede_vizinhos_<periodo>`,
`rede_caracteristicos_<periodo>`.

### concentracao.json
**Grão:** 1 linha por período × subconjunto com venda. **Campos:** `periodo`, `subconjunto`, `subcategorias_80` (quantas, da maior para a menor, fazem 80% do faturamento; a que cruza 80% conta), `subcategorias` (com venda).

### marcas_<periodo>.json
**Grão:** 1 linha por subconjunto × departamento com venda no período. **Ordem:** subconjunto, faturamento decrescente. **Campos:** `subconjunto`, `departamento`, `faturamento`, `participacao_pct`, `marca_propria_pct`, `marca_propria_crescimento_pct` e `nacional_crescimento_pct` (lojas comparáveis do período; null na base inteira; nas 26 semanas = `vw_yoy_categoria`), `fabricantes_nacionais`, `fabricantes_80`, `maior_fabricante_pct`, `amostra_pequena` (menos de 0,1% do faturamento do subconjunto).

### rede_nos.json
**Grão:** 1 linha por nó da rede (as 80 maiores subcategorias da janela da cesta). **Campos:** `no` (0 = a maior), `departamento`, `subcategoria`, `faturamento`, `x`, `y` (posição de 0 a 1). Fixo.

### rede_pares_<periodo>.json (compacto)
**Grão:** 1 linha por subconjunto × ligação desenhada (as 3 de maior lift de cada nó, com todos os clientes, nas 26 semanas; fixas) com ao menos uma cesta no subconjunto e no período. **Dimensões:** `subconjunto`. **Campos:** `no_a`, `no_b`, `cestas_par`, `lift`, `indice` (lift ÷ lift com todos, no período), `amostra_pequena`.

### rede_vizinhos_<periodo>.json (compacto)
**Grão:** 1 linha por subconjunto × nó × par com o nó, os 10 de maior lift entre os de 200+ cestas. **Dimensões:** `subconjunto`. **Campos:** `no`, `outro`, `cestas_par`, `confianca` (cestas com os dois ÷ cestas com o nó), `lift`, `indice`.

### rede_caracteristicos_<periodo>.json
**Grão:** 1 linha por subconjunto (menos `todos`) × par entre os 15 de maior índice, sem amostra pequena. **Campos:** `subconjunto`, `posicao`, `no_a`, `no_b`, `cestas_par`, `confianca_a_b`, `confianca_b_a`, `lift`, `lift_todos`, `indice`.

---

## Metodologia (carregados ao abrir a página; modelos do lakehouse)

Os modelos rodam no lakehouse, trazidos do projeto de RAG e conferidos (decisões G5 e G6 do lakehouse).
Percentuais são frações; diferenças em pontos percentuais também (0,01 = 1 p.p.).

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

### acionamento_crm.json
**Grão:** 1 linha por capacidade × objetivo × método (24). **Campos:** `capacidade`, `objetivo` (`pausas`, `valor`), `metodo` (`modelo`, `regra_simples`), `pausas_esperadas`, `faturamento_26s_em_jogo` (não é o dinheiro em risco), `mix_segmentos`, `precisao_historica`, `pausas_capturadas_historica`, `valor_capturado_historico`, `fracao_valor_capturado_historica`, `pausas_esperadas_historicas`, `pausas_reais_historicas`. Na regra simples, as colunas da semana e da calibração são `null`.

### departamentos_quadrante_<periodo>.json
**Períodos:** `4s`, `13s`, `26s`. **Grão:** 1 linha por subconjunto × departamento, só sem amostra pequena; um recorte pode não ter linha. **Campos:** `subconjunto`, `departamento`, `participacao`, `crescimento`, `corte_participacao`, `corte_crescimento`, `quadrante` (`investir`, `manter`, `defender`, `rever`), `valor_gap`, `destaque` (1 a 3 ou `null`).

---

## manifest.json (5.1)

Além de `versao_contrato`, `gerado_em`, `base_hash` (12 primeiros caracteres do sha256 de `silver_versoes`), `periodo_base` e `arquivos` (`nome`, `carga`, `linhas`, `bytes`, `sha256`):

| Campo | Tipo | Descrição |
|---|---|---|
| janelas | object | por período: `{"semana_ini", "semana_fim", "data_ini", "data_fim"}` |
| lakehouse_commit, lakehouse_sujo | string, boolean | commit do lakehouse usado e se havia mudança não commitada |
| silver_versoes | object | versão Delta das 4 tabelas da silver que a gold lê |
| modelo | object | `limiar_alerta`, `corte_medio`, `auc_modelo`, `auc_regra_simples`, `pausas_esperadas`, `clientes_ativos`, `alertas`, `risco_por_segmento` |
| parametros_cesta | object | `semana_ini`, `semana_fim`, `minimo_cestas_par` |
| bytes_abertura | integer | soma dos arquivos com `carga = "abertura"` (≤ 1,5 MB) |
| parametros_rede | object | nós, ligações por nó, característicos, cobertura do faturamento, ligações desenhadas, método das posições |
| parametros_laboratorio | object | `risco` (definição, teste, prevalência, diferença de AUC com IC, conclusão), `clv` (total com IC, margem, horizonte, método, backtest total), `desconto` (Kruskal-Wallis, η², limites de relevância, veredito, impacto, conclusão) |
| bytes_por_aba | object | por aba (`categoria`, `produtos`, `laboratorio`) × período (`4s`, `13s`, `26s`, `base`): os arquivos fixos da aba mais os do período, ≤ 1,5 MB cada |
| arquivos[].periodo | string | só nos arquivos por período |
| arquivos[].carga | string | `abertura`, `categoria`, `produtos` ou `laboratorio` (a página "Metodologia e validação") |

## Arquivos novos

Todo arquivo novo nasce na gold do lakehouse, segue as convenções gerais e ganha uma seção aqui quando o contrato for copiado.
