# Contrato dos arquivos JSON

Versão do contrato: **1.0**. Mudou um campo? Suba a versão (1.1 para campo novo, 2.0 para campo removido ou renomeado) e atualize o schema em `contracts/`.

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
| valor | number | valor no período |
| valor_ano_anterior | number \| null | mesmo período um ano antes, só com lojas comparáveis; `null` quando não houver ano anterior na base |
| variacao_pct | number \| null | `valor / valor_ano_anterior - 1`, como fração |
| lojas_comparaveis | integer | número de lojas usadas na comparação |
| amostra_pequena | boolean | |

### vendas_semanais.json
**Grão:** 1 linha por semana da base. **Ordem:** `semana_inicio`, crescente.

| Campo | Tipo | Descrição |
|---|---|---|
| semana_inicio | string (data) | primeiro dia da semana |
| faturamento | number | |
| faturamento_ano_anterior | number \| null | mesma semana do ano anterior, lojas comparáveis |

### calor_dia_hora.json
**Grão:** 1 linha por `dia_semana` × `hora`, com 7 × 24 = 168 linhas. A hora vem de `fato_transacoes.hora` (confirmado na fase 1).

| Campo | Tipo | Descrição |
|---|---|---|
| dia_semana | integer | 1 = segunda … 7 = domingo |
| hora | integer | 0–23 |
| faturamento | number | base inteira |
| cestas | integer | |

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
| unidade | string | `pct`, `usd`, `clientes` |
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
| ticket_medio | number | |
| clv_medio | number \| null | |
| risco_alto_pct | number \| null | fração de clientes na faixa alta de risco |
| desconto_mediano_pct | number \| null | fração |

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
| semanas_sem_comprar | integer | em relação à data máxima da base |
| atributos | object | as chaves `recencia`, `frequencia`, `valor`, `clv`, `sensibilidade_desconto`, `variedade_departamentos`, cada uma `{"valor": number \| null, "percentil": number \| null}`. O percentil vai de 0 a 100 dentro da base, calculado com `PERCENT_RANK`. A recência é invertida, para que maior seja melhor. |
| risco | object | `{"score": number \| null, "faixa": "baixo" \| "medio" \| "alto" \| null}` |
| historico_semanal | array de number | faturamento por semana, alinhado com `vendas_semanais.json` (o mesmo índice representa a mesma semana) |
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

## P2 (definir quando a fase começar)

`lojas.json`, `lojas_semana.json`, `abc.json`, `marca_propria.json`, `pares_cesta.json`, `laboratorio.json`, `migracao.json`. Cada um segue as convenções gerais e ganha uma seção aqui antes de ser exportado.
