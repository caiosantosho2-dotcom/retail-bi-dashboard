# Contrato dos arquivos JSON

Versão do contrato: **1.1**. Mudou um campo? Suba a versão (1.1 para campo novo, 2.0 para campo removido ou renomeado) e atualize o schema em `contracts/`.

**1.1 (2026-10-21, decisões da fase 2 na spec, seção 6):** campo novo `kpis.valor_comparavel`; `kpis.lojas_comparaveis` aceita `null`; `insights.unidade` aceita `pp`; manifest ganha `janelas`, `rag_commit`, `rag_sujo` e `modelo`. Nenhum campo foi removido; `afinidade.json` saiu antes de existir.

## Sumário
- Convenções gerais
- Visão Geral: kpis.json, vendas_semanais.json, calor_dia_hora.json, departamentos.json, insights.json
- Segmentos: segmentos.json
- Ficha do Cliente: clientes_indice.json, clientes/<segmento>.json, medias_segmento.json
- P2 (definir quando a fase começar)

## Convenções gerais

- `periodo` é sempre um destes valores: `"4s"`, `"13s"`, `"26s"`, `"base"`. As janelas terminam na última semana completa (`vw_janela.semana_fim_atual`, hoje a 101), como no chat. Aqui `"base"` quer dizer **base inteira**; não confundir com o `periodo = 'base'` das views do RAG, que é o ano anterior.
- `segmento` é um de: `"Fiéis"`, `"Regulares"`, `"Esporádicos"`, `"Em pausa"`, com a grafia exata da origem (`src/nucleo/rfm.py`, `LADO[3]` + `NOME_PAUSA`).
- Arquivos que são listas usam a forma `{"grao": "...", "linhas": [...]}`, para o grão viajar junto com o dado.

---

## Visão Geral

### kpis.json
**Grão:** 1 linha por `periodo` × `metrica`. São 4 × 6 = 24 linhas.
**Ordem:** período (4s, 13s, 26s, base), depois métrica na ordem abaixo.

| Campo | Tipo | Descrição |
|---|---|---|
| periodo | string | ver convenções |
| metrica | string | `faturamento`, `cestas`, `ticket_medio`, `itens_por_cesta`, `desconto_pct`, `clientes_ativos` |
| valor | number | valor no período, **todas as lojas** |
| valor_comparavel | number \| null | o mesmo período, só nas lojas comparáveis; `null` na base inteira. Em `clientes_ativos` é igual a `valor` (a métrica não depende de loja) |
| valor_ano_anterior | number \| null | mesmo período um ano antes, nas mesmas lojas comparáveis; `null` quando não houver ano anterior (base inteira) |
| variacao_pct | number \| null | `valor_comparavel / valor_ano_anterior - 1`, como fração |
| lojas_comparaveis | integer \| null | lojas com cesta no período e no mesmo período um ano antes; `null` na base inteira e em `clientes_ativos` |
| amostra_pequena | boolean | `true` se o período tem menos cestas que `metricas.loja_amostra_minima_cestas` do RAG |

Arredondamento: dinheiro com 2 casas, contagens inteiras, `itens_por_cesta` e frações com 4 casas.

### vendas_semanais.json
**Grão:** 1 linha por semana da base, da 1 à última completa (101 linhas). **Ordem:** `semana_inicio`, crescente.
As duas colunas usam só as lojas comparáveis da janela de 26 semanas (`vw_lojas_like_for_like`), como no chat.

| Campo | Tipo | Descrição |
|---|---|---|
| semana_inicio | string (data) | primeiro dia da semana |
| faturamento | number | lojas comparáveis |
| faturamento_ano_anterior | number \| null | mesma semana um ano antes (semana − 52), mesmas lojas; `null` nas semanas 1 a 52 |

### calor_dia_hora.json
**Grão:** 1 linha por `dia_semana` × `hora`, com 7 × 24 = 168 linhas. A hora vem de `fato_transacoes.hora` (confirmado na fase 1).

| Campo | Tipo | Descrição |
|---|---|---|
| dia_semana | integer | 1 … 7, de `dim_data.dia_semana`. **Sem nome:** a base não tem calendário real; o front mostra "Dia 1 … Dia 7" (spec, decisão 5 da fase 2) |
| hora | integer | 0–23 |
| faturamento | number | base inteira (semanas 1 a 101), todas as lojas |
| cestas | integer | cestas distintas na célula |

### departamentos.json
**Grão:** 1 linha por `periodo` × `departamento`, com top 10 + `"Outros"` por período. **Ordem:** período, depois faturamento decrescente, com "Outros" por último.

| Campo | Tipo | Descrição |
|---|---|---|
| periodo | string | |
| departamento | string | nome como na origem, ou `"Outros"` |
| faturamento | number | |
| participacao_pct | number | fração do faturamento do período |

### insights.json
**Grão:** 1 linha por insight, no máximo 3.

| Campo | Tipo | Descrição |
|---|---|---|
| id | string | `fieis_faturamento`, `risco_pausa`, `desconto_segmentos` |
| conclusao | string | frase curta, igual à da aba de origem no app de RAG |
| numero | number | número que sustenta a frase |
| unidade | string | `pct` (fração), `pp` (pontos percentuais, como fração: 0,012 = 1,2 p.p.; com 6 casas, para não arredondar duas vezes), `usd`, `clientes` |
| aba_destino | string | aba do painel que detalha o insight |

---

## Segmentos

### segmentos.json
**Grão:** 1 linha por segmento (4). **Ordem:** a ordem fixa da convenção.

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

Estes números vêm do código do RAG, importado só para leitura (spec, "Origem dos dados por cliente"). A janela é a de 26 semanas.

> `afinidade.json` (segmento × departamento) saiu do contrato antes de qualquer exportação: a análise saiu do escopo (spec, 5.3).

---

## Ficha do Cliente

### clientes_indice.json
**Grão:** 1 linha por cliente. É leve: serve para a lista e a busca. **Ordem:** `id` crescente.

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer | `household_key` |
| segmento | string | |
| faturamento_total | number | janela de análise |
| risco_faixa | string \| null | `baixo`, `medio`, `alto` |

### clientes/<segmento>.json
Um arquivo por segmento, com o nome do arquivo em slug sem acento: `fieis.json`, `regulares.json`, `esporadicos.json`, `em_pausa.json`. Carregado sob demanda.
**Grão:** 1 linha por cliente do segmento. **Ordem:** `id` crescente.

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer | |
| segmento | string | |
| semanas_sem_comprar | integer | `floor(recencia_dias / 7)`, em relação ao fim da janela de 26 semanas (semana 101) |
| atributos | object | as chaves `recencia` (dias), `frequencia` (cestas), `valor` (US$), `clv` (US$), `sensibilidade_desconto` (fração do valor bruto), `variedade_departamentos` (departamentos distintos), todas na janela de 26 semanas; cada uma `{"valor": number \| null, "percentil": number \| null}`. O percentil vai de 0 a 100 entre os clientes segmentados, calculado com `PERCENT_RANK`. A recência é invertida, para que maior seja melhor. |
| risco | object | `{"score": number \| null, "faixa": "baixo" \| "medio" \| "alto" \| null}`. `score` = probabilidade de pausa longa do modelo do RAG; faixas pelos cortes em `manifest.modelo` |
| historico_semanal | array de number | faturamento do cliente por semana, todas as lojas, alinhado com `vendas_semanais.json` (o mesmo índice representa a mesma semana; 101 valores; semana sem compra = 0) |
| top_departamentos | array | até 5 itens `{"departamento": string, "gasto_pct": number}` |

### medias_segmento.json
**Grão:** 1 linha por segmento × atributo, com 4 × 6 = 24 linhas.

| Campo | Tipo | Descrição |
|---|---|---|
| segmento | string | |
| atributo | string | as mesmas chaves de `atributos` |
| valor_medio | number \| null | |
| percentil_medio | number \| null | 0–100 |

---

## manifest.json (1.1)

Além do formato da skill (`versao_contrato`, `gerado_em`, `base_hash`, `periodo_base`, `arquivos`):

| Campo | Tipo | Descrição |
|---|---|---|
| janelas | object | por período (`4s`, `13s`, `26s`, `base`): `{"semana_ini", "semana_fim", "data_ini", "data_fim"}` |
| rag_commit | string | `git rev-parse HEAD` do repositório do RAG usado na exportação |
| rag_sujo | boolean | o repositório do RAG tinha mudanças não commitadas |
| modelo | object | `limiar_alerta`, `corte_medio` (= limiar ÷ 2), `auc_modelo`, `auc_regra_simples`, `pausas_esperadas`, `alertas` e `risco_por_segmento`, tirados do risco de pausa do RAG |
| bytes_abertura | integer | soma dos arquivos carregados na abertura (todos menos `clientes/*`) |

## P2 (definir quando a fase começar)

`lojas.json`, `lojas_semana.json`, `abc.json`, `marca_propria.json`, `pares_cesta.json`, `laboratorio.json`, `migracao.json`. Cada um segue as convenções gerais e ganha uma seção aqui antes de ser exportado.
