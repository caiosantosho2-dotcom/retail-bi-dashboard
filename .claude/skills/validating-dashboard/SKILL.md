---
name: validating-dashboard
description: Valida o painel BI antes de qualquer fase ser dada como pronta — reconcilia cada número dos JSONs com as views DuckDB, valida schemas, abre o painel no navegador via Playwright MCP para conferir interação, console, layout e acessibilidade, e checa a higiene do repositório. Usar ao terminar uma tela, um arquivo de dados ou uma fase, antes de commit ou publicação, ou quando um número do painel parecer errado.
---

# Validação do painel

Nada está pronto até passar aqui. A validação tem três camadas, nesta ordem: **dados → tela → repositório**. Se uma camada falhar, não siga para a próxima.

## Checklist da fase

Copie e marque:

```
DADOS
- [ ] D1. Schemas: python scripts/exportar_dados.py --validar → 0 erros
- [ ] D2. Reconciliação: python scripts/reconciliar.py → 0 divergências
- [ ] D3. Orçamento: tamanhos no manifest.json dentro do limite da skill exporting-dashboard-data
TELA
- [ ] T1. Servidor local: python -m http.server 8000 --directory site
- [ ] T2. Console: 0 erros e 0 avisos de rede (404 de JSON)
- [ ] T3. Critérios de aceite da aba (docs/spec_dashboard.md) conferidos um a um
- [ ] T4. Interações: clique → painel de detalhe; filtro → gráficos; cross-filter (clique filtra, segundo clique limpa, Ctrl + clique soma); etiquetas de filtro ativo; troca de aba mantém os filtros; CSV baixa com as colunas e linhas certas
- [ ] T5. Layout em 1440×900 (sem rolagem da página) e 390×844 (empilhado, legível)
- [ ] T6. Acessibilidade: abas pelo teclado, aria nos gráficos, nenhuma informação só por cor
REPOSITÓRIO
- [ ] R1. git ls-files sem .duckdb, .parquet, config.yaml, .env, dado bruto
- [ ] R2. git grep sem chave (gsk_, api_key, token, secret)
- [ ] R3. Relatório da fase salvo em docs/validacao/<fase>.md
- [ ] R4. Servidor local encerrado (porta 8000 livre)
```

Item falhou? Corrija na skill responsável (`exporting-dashboard-data` para dados, `designing-dashboard-ui` para tela) e **refaça a camada inteira**, não só o item.

## D2 — Reconciliação (`scripts/reconciliar.py`)

O objetivo é provar que o painel mostra o mesmo número que a fonte. Para não ser circular, o script **não reaproveita** as consultas de exportação. Ele recalcula cada número direto das views de origem, com SQL próprio e simples, e compara com o JSON.

O que conferir, no mínimo:

| Verificação | Regra |
|---|---|
| KPIs | soma de `cubo_periodo` e `kpis_filtrados` (todos × todos) = consulta direta nas views de métricas do RAG, para os 4 períodos |
| Soma das partes | soma do cubo com todos os grupos e departamentos = faturamento do KPI; cubo semanal das 26 semanas = `vw_yoy_resumo` |
| Grupos | 4 segmentos + sem segmento = todos; cada subconjunto = soma dos seus segmentos |
| Departamentos | 3 sorteados (`random.seed(42)`): atributos do radar, KPIs filtrados e subcategorias contra SQL próprio e `vw_yoy_categoria` |
| Cesta | 10 pares sorteados (`random.seed(42)`): suporte, confiança e lift recontados da tabela fato |
| Segmentos | soma de `clientes` = total de clientes segmentados; soma de `clientes_pct` e `faturamento_pct` = 1; afinidade em 3 células |
| Lista de ação | faixa alta por segmento = alertas do RAG; faixa coerente com a probabilidade; ordem; 5 clientes sorteados |
| Lojas | as 214 lojas comparáveis = `vw_yoy_loja`; soma das lojas e das regiões = faturamento; região × semana = faturamento semanal; árvore de vendas fecha; 5 pares (Jaccard) recontados; regiões reprodutíveis |
| Contra o app de RAG | os números de `insights.json` = os da aba Resumo (35% dos clientes, 71% do faturamento, AUC etc.) |

**Tolerâncias:**
- contagens: exatas;
- dinheiro: ±0,01;
- frações: ±0,0001;
- índice: ±1.

**Saída esperada:** uma linha por verificação com OK ou DIVERGE, mostrando o valor esperado, o valor encontrado e o arquivo. O código de saída é 1 se houver qualquer divergência.

Uma divergência nunca se resolve ajustando o JSON ou a tolerância. Descubra qual dos dois lados está errado e corrija a consulta.

## Tela — com Playwright MCP

O Playwright MCP abre um navegador próprio, controlado pelo Claude Code. Antes de usar:
- configure o servidor para usar o navegador do Playwright, e não o Edge do sistema. Confira as opções com `npx @playwright/mcp@latest --help`;
- abra o painel por `http://localhost:8000`, nunca por `file://`, porque o `fetch` dos JSONs falha em `file://`.

**Como conferir:**
1. `browser_navigate` para `http://localhost:8000`.
2. `browser_console_messages`: zero erros.
3. `browser_snapshot` (árvore de acessibilidade) para conferir que abas, títulos, KPIs e rótulos existem e têm texto. **Prefira o snapshot à captura de tela**: é mais barato e mais preciso para conferir conteúdo.
4. `browser_click` nos elementos da interação (segmento, cliente, botão de visão) e novo `browser_snapshot` para confirmar que o painel de detalhe mudou.
5. `browser_resize` para 1440×900. `browser_evaluate` com `document.documentElement.scrollHeight <= innerHeight` precisa dar verdadeiro em cada aba.
6. `browser_resize` para 390×844 e repita o snapshot.
7. **Só agora** use `browser_take_screenshot`, uma por aba e por tamanho, para a revisão visual: rótulos sobrepostos, texto cortado, cores fora dos tokens, gráfico vazio. Avise o usuário sobre o que viu.
8. **Encerre o servidor local** ao terminar (não deixe processo em segundo plano) e confirme que a porta 8000 ficou livre.

Se o Playwright MCP não estiver disponível ou falhar duas vezes seguidas, pare e avise o usuário. Não tente outro navegador por conta própria.

## Relatório da fase (`docs/validacao/<fase>.md`)

```
# Validação — <fase> — <data>
Base: <base_hash> · Contrato: <versao_contrato>
Dados: schemas OK · reconciliação N/N OK · tamanho abertura X KB
Tela: console 0 erros · aceite N/N · 1440×900 OK · 390×844 OK
Repositório: OK
Pendências: <lista ou "nenhuma">
```

O relatório é a prova de rigor que vai para o README, do mesmo jeito que a avaliação do chat entrou no projeto de RAG.

## Erros comuns

- dar uma aba por pronta só porque "abriu sem erro";
- reconciliar usando a mesma consulta da exportação (o teste passa sempre e não prova nada);
- aumentar a tolerância para o teste passar;
- conferir só no desktop;
- tirar dezenas de capturas de tela em vez de usar o snapshot.

## Avaliações desta skill

1. "Terminei a aba Visão Geral, pode validar?" Esperado: roda as 3 camadas em ordem, para no primeiro bloco que falhar e gera o relatório.
2. "O ticket médio do painel está diferente do chat." Esperado: compara as duas consultas com a view de origem e corrige o lado errado, sem mexer na tolerância.
3. "Valide o layout no celular." Esperado: `browser_resize` para 390×844, snapshot primeiro, captura de tela só depois, e o relatório das falhas encontradas.
