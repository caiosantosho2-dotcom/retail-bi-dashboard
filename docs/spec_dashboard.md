# Spec — Painel BI de Varejo (Dunnhumby)

> Fonte única das regras deste projeto. Se o código, uma skill ou um prompt contradizer este arquivo, este arquivo vence. Mudou uma regra? Mude aqui primeiro, depois no código.
>
> Os itens que dependiam do projeto de RAG foram resolvidos na fase 1 e a resposta está registrada onde antes havia **[A CONFIRMAR]**, com o arquivo de origem.
>
> **Redesenho v2 (2026-10-22):** as decisões de `docs/mudancas/redesenho_v2.md` estão aplicadas aqui (seções 3, 4, 5, 6, 8, 9 e 10). A Ficha do Cliente virou Ficha da Categoria; os clientes viraram uma lista de ação em Segmentos; entraram filtros globais de segmento e departamento, o clique que filtra e a análise de cesta. Onde o redesenho conflitou com a spec ou com os dados, a decisão do usuário está registrada em "Decisões do redesenho v2" (seção 6).

## Sumário
1. Princípios (não negociáveis)
2. O quê e por quê
3. Quem usa
4. Escopo e prioridades
5. Abas: conteúdo e critérios de aceite
6. Regras de negócio e métricas
7. Design
8. Plano técnico
9. Fases de entrega
10. Definição de pronto

---

## 1. Princípios (não negociáveis)

1. **Uma definição por métrica.** Todo número vem das views do DuckDB do projeto de RAG. O painel nunca recalcula uma fórmula por conta própria. Painel e chat não podem dar dois números diferentes para a mesma pergunta.
2. **Dado pré-agregado.** O navegador só recebe JSONs pequenos e agregados. Nenhuma linha de transação bruta sai do DuckDB.
3. **Comparação justa.** Toda variação contra o ano anterior usa só lojas que existiam nos dois períodos (*like-for-like*). Recortes com amostra pequena levam o aviso `amostra_pequena`.
4. **Conclusão primeiro.** Cada aba abre pelo que importa para decidir. O detalhe vem logo abaixo ou sob demanda.
5. **Visão geral → filtro → detalhe sob demanda.** Toda aba segue esse fluxo: o usuário vê o todo, filtra, e clica para abrir um painel de detalhe (padrão de Shneiderman).
6. **Cor tem função.** Cada segmento tem sempre a mesma cor, em qualquer gráfico. Cores de status (bom, atenção, crítico) são reservadas e nunca representam uma série.
7. **Nada é verdade até ser validado.** Cada número do painel é conferido contra o DuckDB por script, e cada tela é aberta e conferida no navegador antes de a fase ser dada como pronta.
8. **Segredos fora.** Sem chaves, sem dado bruto, sem `.duckdb` ou `.parquet` no repositório.

## 2. O quê e por quê

**O quê:** um painel de BI em uma única página web, tema escuro, com abas, que mostra a saúde do varejo, quem são os clientes e o que fazer com cada grupo. Ele é a continuação visual do projeto "Assistente Comercial + Análise de Clientes".

**Por quê:** o chat responde perguntas pontuais. A gerência precisa também de uma visão que se explora em poucos cliques, sem pedir relatório ao BI. O painel é uma peça de portfólio publicada com link aberto, para qualquer pessoa abrir no navegador ou no celular.

**Referência de experiência:** a Pokédex em Power BI de Kelven Cardoso. O que se copia dela:
- abas no topo, cada uma com uma experiência diferente;
- clicar num item e um painel lateral de detalhe responder;
- o mesmo dado em visões diferentes (na Pokédex, Roda / Matriz / Ranking; aqui, na aba Segmentos, a Roda e a Matriz de afinidade lado a lado, ver 5.3);
- uma "ficha" de destaque com atributos em radar (aqui, a ficha da categoria);
- clique que filtra o painel inteiro, como no Power BI;
- tema escuro com cores fixas por categoria.

## 3. Quem usa

| Perfil | O que quer | Onde encontra |
|---|---|---|
| Diretoria / gerência comercial | Saúde do negócio em 10 segundos | Visão Geral |
| Comercial / category management | Que categoria cresce, quem a compra, o que vai junto na cesta | Ficha da Categoria |
| CRM / marketing | Quem são os clientes, quem está saindo, o que cada grupo compra, quem reativar | Segmentos (com a lista de ação) |
| Operações / regionais | Quais lojas puxam ou derrubam o resultado | Lojas |
| Recrutador técnico | Rigor por trás dos números | Laboratório, "Sobre os dados" |

## 4. Escopo e prioridades

| Prioridade | Aba | Entra no MVP |
|---|---|---|
| P1 | Visão Geral (com filtros globais e clique que filtra) | Sim |
| P1 | Ficha da Categoria (substitui a Ficha do Cliente, redesenho v2) | Sim |
| P1 | Segmentos (com matriz de afinidade e lista de ação; sem a matriz de migração) | Sim |
| P2 | Lojas (ficha da loja + Arena), a próxima depois do redesenho | Não |
| P2 | Produtos (rede de cestas completa, comparação entre segmentos, marca própria, fabricante) | Não |
| P2 | Laboratório | Não |
| P2 | Matriz de migração de segmentos | Não |

**Fora do escopo:** mapa (a base não tem localização das lojas); chat embutido no painel; login; atualização em tempo real; olhar cliente por cliente (a gestão decide por categoria, loja e segmento; os clientes aparecem só na lista de ação). **Fase futura:** dados de encarte e ponta de gôndola (`causal_data`). **Não existem na base:** share de gôndola e ruptura.

## 5. Abas: conteúdo e critérios de aceite

Elementos comuns a todas as abas:
- barra superior com o nome do painel, o período da base e as abas;
- **linha de filtros globais** (redesenho v2), de cima para baixo e numa linha só, acima dos gráficos: **Período** (últimas 4 semanas, 13 semanas, 26 semanas, base inteira) | **Segmento** | **Departamento** | **Limpar tudo**;
- rodapé "Sobre os dados": fonte, período, data de geração e hash da base.

### 5.0 Filtros globais e clique que filtra (todas as abas)

- **Segmento:** 4 chips liga/desliga com o rótulo **"Segmento atual do cliente"**. Cada clique soma ou tira um segmento; Ctrl + clique também funciona. Nenhum chip ligado = todos os clientes, inclusive os sem segmento (ver seção 6). Funciona no celular, pelo toque.
- **Departamento:** lista com busca, seleção múltipla e ordem pelo faturamento das 26 semanas.
- **Filtros ativos** viram etiquetas removíveis: "Segmento: Fiéis, Regulares ✕" e "Departamento: GROCERY ✕". **Limpar tudo** apaga os dois (o período volta a 26 semanas).
- **Estado único:** os filtros são um só objeto, compartilhado entre as abas. Trocar de aba mantém a seleção.
- **Filtro que não se aplica** fica desabilitado, com uma nota. Exemplo: o período em Segmentos e na Ficha da Categoria, que usam a janela de 26 semanas da segmentação.
- **Clique que filtra (cross-filter):** clicar numa barra, célula ou fatia aplica o filtro daquele item. Clicar de novo no único item selecionado limpa a seleção, e Ctrl + clique soma itens. O item selecionado fica destacado, e os outros ficam com opacidade 0,35. Os gráficos que filtram estão listados em cada aba.

**Aceite:**
- [ ] Clique filtra, o segundo clique limpa e Ctrl + clique soma, nos gráficos indicados em cada aba.
- [ ] As etiquetas de filtro ativo aparecem, e o ✕ remove o filtro.
- [ ] Trocar de aba mantém os filtros.
- [ ] Filtro que não se aplica fica desabilitado, com a nota.

### 5.1 Visão Geral (P1)

**Conteúdo:**
- Linha de 6 KPIs, cada um com o valor do período e a variação contra o ano anterior (*like-for-like*): faturamento, cestas, ticket médio, itens por cesta, % de desconto, clientes ativos. Todos respondem aos filtros de segmento e departamento:
  - **somam** (faturamento, desconto, valor bruto): somados no navegador a partir de `cubo_periodo`; % de desconto = soma dos descontos ÷ soma do valor bruto, nunca a média das porcentagens;
  - **não somam** (cestas, ticket médio, itens por cesta, clientes ativos): pré-calculados para cada período × subconjunto de segmentos × departamento (todos ou um só), em `kpis_filtrados`. Com **2 ou mais departamentos** selecionados, esses cards mostram "—" com a nota "selecione um departamento para ver este indicador". Sem aproximação.
- Faturamento semanal: sempre as **últimas 52 semanas**, com o período selecionado **sombreado**; linha do período atual e linha do ano anterior em cinza tracejado, no mesmo eixo. Responde a segmento e departamento. Clicar num ponto não filtra.
- Mapa de calor dia da semana × hora da compra, na base inteira (o filtro de período não se aplica a ele; nota no painel). Responde a segmento e departamento. Clicar numa célula não filtra, só mostra o tooltip. *Resolvido (fase 1):* `TRANS_TIME` não está na fato, mas `fato_transacoes.hora` (INTEGER 0–23) existe, derivada de `TRANS_TIME` no ETL (`src/etl.py:283`). O dia da semana vem de `dim_data`.
- Faturamento por departamento: barras horizontais ordenadas, top 10, com o restante somado em "Outros". **Clicar numa barra aplica o filtro de departamento** (cross-filter).
- 3 cards de insight vindos das análises já validadas (Fiéis × faturamento, clientes em risco de pausa, desconto entre segmentos), cada um com a frase de conclusão e o número que a sustenta. Não respondem a filtro (nota). O card de risco fala de clientes, com a frase da aba de risco do RAG ("Cerca de 136 clientes ativos devem passar 8 semanas sem comprar…") e as pausas esperadas, e leva à lista de ação na aba Segmentos.

**Aceite:**
- [ ] Os 6 KPIs batem com as views do DuckDB para os 4 períodos, sem filtro (era o aceite da fase 3, agora a partir de `cubo_periodo` e `kpis_filtrados`).
- [ ] Com filtro de segmento e/ou de 1 departamento, os KPIs batem com a reconciliação em 3 combinações conferidas na tela.
- [ ] Com 2 ou mais departamentos, os 4 cards que não somam mostram "—" com a nota.
- [ ] A linha semanal mostra 52 semanas, com o período sombreado.
- [ ] Clicar numa barra de departamento filtra o painel; a célula do mapa de calor e o ponto da linha não filtram.
- [ ] Nenhum gráfico usa dois eixos Y.
- [ ] Os cards de insight mostram os mesmos números da aba Resumo do app de RAG.

### 5.2 Ficha da Categoria (P1)

Substitui a Ficha do Cliente (redesenho v2, D1): a gestão de varejo decide por categoria, no nível de departamento. A aba usa a janela de 26 semanas da segmentação; o filtro de período fica desabilitado, com a nota.

**Conteúdo:**
- **Lista (esquerda):** departamentos com busca e ordem por faturamento, crescimento ou % de desconto. Cada item mostra o faturamento e a variação. Departamentos com menos de 0,1% do faturamento ficam no fim, com o aviso de amostra pequena. Clicar num item troca o filtro global de departamento por ele. Com vários departamentos no filtro, a lista mostra só esses.
- **Card da categoria (centro):**
  - cabeçalho: nome do departamento, participação no faturamento e variação contra o ano anterior (*like-for-like*);
  - **radar** com 6 atributos em percentil entre os departamentos (0 a 100), e a tabela dos valores reais ao lado: participação no faturamento; crescimento contra o ano anterior (lojas comparáveis); penetração (a do RAG, ver seção 6); frequência (cestas com o departamento ÷ clientes compradores); % de desconto; % de marca própria (`BRAND`);
  - **faturamento semanal** do departamento nas últimas 52 semanas, com uma linha por segmento selecionado. Com os 4 segmentos, 4 pequenos gráficos lado a lado, no mesmo eixo Y;
  - **quem compra:** barra 100% empilhada com a divisão do faturamento entre os segmentos, com rótulo direto;
  - **top 10 subcategorias** (commodity) do departamento, em barras horizontais;
  - **compra junto com:** os 5 departamentos de maior *lift*. Nos departamentos com 10% ou mais do faturamento (hoje GROCERY e DRUG GM), também os 5 pares de subcategorias de maior *lift* dentro dele. Respeita o filtro de segmento. Pares com amostra pequena não entram no top 5;
  - **dinheiro em risco:** faturamento do departamento vindo de clientes na faixa alta de risco de pausa, em US$ e em %.
- **Comparação (direita):** o departamento dentro dos segmentos selecionados × o departamento com todos os clientes. Para cada atributo do radar, o valor dos selecionados, o de todos e o índice (100 = igual). Exemplo: "GROCERY entre Fiéis e Regulares × GROCERY total".
- **Ao abrir:** a aba começa no maior departamento (GROCERY), nunca vazia.

**Aceite:**
- [ ] Abre em GROCERY, nunca vazia.
- [ ] O radar sempre vem com a tabela dos valores reais; os 6 percentis ficam entre 0 e 100.
- [ ] Os valores do card batem com a reconciliação para 3 departamentos sorteados.
- [ ] "Compra junto com" respeita o filtro de segmento e não mostra par com amostra pequena.
- [ ] A comparação da direita mostra o índice contra todos os clientes, e 100 quando nenhum segmento está selecionado.

### 5.3 Segmentos (P1)

O equivalente à aba "Tipos" da Pokédex. Usa a janela de 26 semanas da segmentação; o filtro de período fica desabilitado, com a nota.

> **Histórico:** em 2026-10-21 a análise segmento × departamento saiu do escopo inteira. O redesenho v2 (2026-10-22) a trouxe de volta como Matriz de afinidade, com os 5 maiores departamentos (decisão do usuário).

**Layout desktop (1440×900, sem rolagem):**
- **Topo:** 4 cards de segmento, clicáveis e ligados ao filtro global de segmento, com % de clientes, % do faturamento e ticket médio.
- **Meio, à esquerda (1/3):** a **Roda**, menor: os segmentos em círculo, com tamanho proporcional ao faturamento.
- **Meio, à direita (2/3):** a **Matriz de afinidade** segmento × departamento, com os **5 maiores departamentos** do faturamento das 26 semanas mais os que estiverem no filtro. Índice 100 = média. Escala divergente. Clicar numa célula aplica o filtro daquele segmento e daquele departamento.
- **Embaixo, à esquerda:** a evolução semanal por segmento (52 semanas), em 4 pequenos gráficos no mesmo eixo Y. Responde ao filtro de departamento.
- **Embaixo, à direita: lista de ação.** Clientes em risco de pausa (faixas alta e média), filtrados pelos segmentos selecionados, com as colunas ID, segmento, faixa de risco, semanas sem comprar, faturamento em 26 semanas e faturamento em risco. Ordenada pelo faturamento em risco. Botão **"Baixar CSV"**. Texto de apoio: "lista para campanha de reativação".
- **Painel de detalhe** do segmento: abre ao clicar na Roda ou num card, com % de clientes, % do faturamento, ticket médio, CLV médio, % em risco de pausa e desconto mediano. Fecha com Esc.
- **P2 — Matriz de migração:** de qual segmento para qual os clientes mudaram entre o primeiro e o segundo semestre da janela. *Resolvido (fase 1):* a segmentação **não** reaproveita centróides. `rfm.base_rfm(cur, semana_ini, semana_fim)` monta R/F/V de qualquer janela (`src/nucleo/rfm.py:86`), mas `rfm.ajustar_segmentos` reajusta o K-Means a cada janela (`rfm.py:231`; o CLV faz o mesmo na janela base, `src/nucleo/clv.py:72`). Os segmentos de dois períodos não são comparáveis sem uma decisão nova, então a matriz de migração continua fora do MVP.

**Aceite:**
- [ ] A soma do % de clientes e do % do faturamento dos segmentos dá 100% (±0,1 p.p.).
- [ ] O painel de detalhe mostra o segmento clicado na Roda ou no card e fecha com Esc.
- [ ] Clicar numa célula da matriz aplica o filtro de segmento e de departamento.
- [ ] A lista de ação respeita o filtro de segmento, e o CSV baixa com as colunas certas e o mesmo número de linhas da tela.

### 5.4 Lojas (P2, a próxima depois do redesenho)
- Ficha da loja.
- Ranking de lojas pelo crescimento *like-for-like*, com faturamento e número de cestas.
- Mapa de calor loja × semana para as 30 maiores lojas.
- **Arena:** duas lojas lado a lado com os mesmos KPIs e a diferença entre elas.

### 5.5 Produtos (P2)
- Curva ABC (Pareto) de produtos ou de categorias.
- Marca própria × marca nacional por departamento (campo `BRAND`) e fabricante.
- Rede de cestas completa (todas as subcategorias) e comparação entre segmentos. Os pares de departamentos e os pares de subcategorias dos departamentos com 10% ou mais do faturamento já estão na Ficha da Categoria (5.2).

### 5.6 Laboratório (P2)
- Curva ROC do modelo de risco de pausa contra a regra simples (AUC 0,85 × 0,74).
- Distribuição do CLV por segmento.
- Teste de desconto: diferenças entre segmentos com intervalo e tamanho do efeito, mostrando que é estatisticamente significativo, mas pequeno demais para mudar a política.

## 6. Regras de negócio e métricas

As fórmulas vivem nas views do DuckDB do projeto de RAG e não são reescritas aqui. Esta seção só aponta onde cada uma está.

| Métrica | Origem | Observação |
|---|---|---|
| Faturamento | `SALES_VALUE` (já líquido) | Views `vw_metricas_cesta` (grão cesta) e `vw_yoy_resumo` (atual × ano anterior). Fonte: `src/views.py` do RAG |
| Ticket médio | faturamento ÷ cestas distintas | `vw_metricas_cesta`, `vw_yoy_resumo.ticket_atual` |
| Itens por cesta | soma de `QUANTITY` ÷ cestas distintas | `vw_metricas_loja_semana.itens_por_cesta`; `vw_metricas_cesta.itens` |
| % de desconto | soma dos descontos ÷ valor bruto | desconto vira valor positivo: `-(RETAIL_DISC + COUPON_DISC + COUPON_MATCH_DISC)`; valor bruto = `SALES_VALUE` + desconto (`vw_vendas_item`, `src/views.py:64`) |
| Cliente ativo | ≥ 1 compra nas últimas **8 semanas** do período | `vw_metricas_cliente.cliente_ativo`; parâmetro `metricas.cliente_ativo_semanas` em `RAG/config.yaml` |
| Segmento | resultado do RFM + K-Means | 4 segmentos, grafia exata: **Fiéis, Regulares, Esporádicos, Em pausa** (K=3 ativos + Em pausa; `src/nucleo/rfm.py:22-29`, confirmado no `README.md` do RAG). Não está no DuckDB: o RAG calcula em Python e guarda só em memória (`src/nucleo/cache.py`). Ver "Origem dos dados por cliente" |
| CLV | por segmento no RAG (`src/nucleo/clv.py`): margem 25% × valor médio da janela × razão futuro/passado do segmento um ano antes | O painel mostra o CLV médio por segmento (`segmentos.json`). O CLV individual derivado da fase 1 saiu com a Ficha do Cliente (redesenho v2) |
| Risco de pausa | probabilidade de pausa longa (8 semanas sem comprar) da regressão logística de `src/nucleo/churn.py`, calculada em memória por household (`prob_f`) | Limiar de alerta do RAG: 0,17. **Faixas (decisão do usuário, fase 1):** alto = prob ≥ limiar; médio = entre metade do limiar e o limiar; baixo = abaixo da metade. Os cortes saem do limiar do modelo e são gravados no manifest |
| Período | relativo à última semana completa da base, não à data de hoje | A janela termina na `WEEK_NO` 101 (a 102 tem 6 dias; `RAG/config.yaml`, `janela`). A data máxima 2017-12-11 é da semana 102. O período mostrado vem de `vw_janela.data_fim_atual`. Filtros: 4 semanas (`semana_ini_ultimo_mes`), 13 semanas (`semana_ini_ultimo_trimestre`) e 26 semanas (janela atual) vêm de `vw_janela`; "base inteira" não tem view no RAG e sai de view nova do painel, **sem** comparação com o ano anterior |
| Comparação com o ano anterior | *like-for-like* | `vw_lojas_like_for_like`; base = `WEEK_NO − 52` |
| `amostra_pequena` | loja com menos de 100 cestas na janela (`metricas.loja_amostra_minima_cestas`) | O mesmo corte de 100 cestas vale para cada combinação de `kpis_filtrados`. Departamento: menos de 0,1% do faturamento das 26 semanas (redesenho v2). Segmento × departamento (afinidade, comparação da Ficha): menos de 30 clientes compradores (`analises.clv.tamanho_minimo_grupo` do RAG; decisão do usuário, 2026-10-22). Par de cesta: menos de 200 cestas com o par |
| Segmento atual × histórico | o segmento do cliente na janela de 26 semanas | Vale para todo o histórico do cliente (ano anterior, base inteira, linha de 52 semanas). O rótulo do filtro é "Segmento atual do cliente" |
| Sem segmento | clientes que compraram na base, mas não nas 26 semanas: o RFM do RAG não os segmenta | 79 clientes, US$ 39,7 mil na base inteira. Entram em "todos" (nenhum chip ligado), mas não viram chip; nos períodos de 4, 13 e 26 semanas o grupo é zero (decisão do usuário, 2026-10-22). Grupo `painel.grupo_cliente` |
| Somam × não somam | **somam:** faturamento, faturamento do ano anterior, desconto e valor bruto; **não somam:** cestas, ticket médio, itens por cesta e clientes ativos | As que somam vão para os cubos e são somadas no navegador. As que não somam são pré-calculadas por período × subconjunto de segmentos (16) × departamento (todos ou um), em `painel.kpis_filtrados`. Entre segmentos elas somam (cada cliente tem um só segmento), o que a reconciliação confere |
| KPIs com 1 departamento | definições do painel (`painel.kpis_filtrados`) | cestas = cestas com o departamento; ticket = faturamento do departamento ÷ essas cestas; itens por cesta = itens do departamento ÷ essas cestas; clientes ativos = compraram o departamento nas últimas 8 semanas do período (o que já os faz ativos pela regra do RAG) |
| Penetração | a do RAG: % dos clientes com compra no período que compraram a categoria, nas lojas comparáveis | Glossário `METRICAS` e `vw_yoy_categoria` (`src/views.py`), aplicada ao departamento. **Decisão do usuário (2026-10-22):** no lugar de "% dos clientes ativos" do redesenho, para não haver duas definições (princípio 1) |
| Frequência do departamento | cestas com o departamento ÷ clientes que o compraram | É o `idas_por_cliente` do RAG restrito ao departamento |
| Crescimento do departamento | faturamento nas lojas comparáveis ÷ o mesmo um ano antes − 1 | Bate com `vw_yoy_categoria` somado por departamento |
| Marca própria | faturamento com `BRAND = 'Private'` ÷ faturamento | A base só tem `Private` e `National` |
| Percentil do radar | `PERCENT_RANK` entre os departamentos com venda nas 26 semanas, de 0 a 100 | Atributo nulo (ex.: sem ano anterior) fica com percentil nulo |
| Índice da comparação | valor dos segmentos selecionados ÷ valor com todos os clientes × 100 | No crescimento, compara os fatores: (1 + crescimento dos selecionados) ÷ (1 + crescimento de todos) × 100 |
| Análise de cesta | a unidade é a cesta, reduzida a pares distintos cesta × departamento (ou cesta × subcategoria) | suporte = cestas com A e B ÷ total de cestas; confiança A→B = cestas com A e B ÷ cestas com A; **lift** = confiança ÷ (cestas com B ÷ total). Janela: as 26 semanas da segmentação (`cesta.semanas` no `config.yaml`). Pares de subcategorias só **dentro** dos departamentos com 10% ou mais do faturamento (`cesta.corte_departamento_pct`; a lista vai para o manifest). Por segmento, o mesmo cálculo nas cestas dos clientes de cada segmento; os 16 subconjuntos saem no export, nunca no navegador |
| Mínimo de 200 cestas por par | `cesta.minimo_cestas_par` | Medido nesta base: entre as duas metades da janela, a variação mediana do lift dos pares de subcategorias de GROCERY é 32% com menos de 50 cestas, 11% com 100 a 199 e 7% com 200 a 399 (p90: 95%, 28% e 18%). O comentário de `painel.par_departamento` traz a tabela |
| Afinidade segmento × departamento | índice = (faturamento do segmento no departamento ÷ faturamento do segmento) ÷ (faturamento do departamento ÷ faturamento total) × 100 | 100 = igual à média; 26 semanas, todas as lojas (`painel.afinidade`) |
| Lista de ação | clientes nas faixas alta e média de risco de pausa (464) | **Faturamento em risco** = probabilidade de pausa × faturamento do cliente nas 26 semanas; é o critério de ordem (decisão do usuário, 2026-10-22). O CSV é gerado no navegador a partir de `lista_acao.json` |
| Dinheiro em risco | faturamento do departamento (26 semanas) vindo de clientes na faixa alta de risco | Em US$ e em % do faturamento do departamento |

### Origem dos dados por cliente (decisão do usuário, fase 1)

Segmento, CLV e risco por cliente não existem como tabela ou view no DuckDB. A exportação importa o código do RAG, **só para leitura**:
- `sys.dont_write_bytecode = True` antes do import; nada é criado ou alterado em `rag_dir`; o banco abre em modo somente leitura;
- mesmas sementes e parâmetros do RAG (K-Means, bootstrap, modelo), sem alteração; chamam-se as funções não decoradas (`rfm._resultado`, `churn._calcular`, `clv._calcular`) para não gravar `logs/chamadas.jsonl` no RAG;
- as dependências do RAG entram no `requirements.txt` do painel, nas mesmas versões do `requirements.txt` do RAG;
- o caminho do RAG fica em `config.yaml` (`rag_dir`);
- o `manifest.json` grava o commit do RAG usado (`git rev-parse HEAD` em `rag_dir`);
- a reconciliação confere os agregados contra o app: Fiéis = 35% dos clientes e 71% do faturamento; AUC 0,85 do modelo contra 0,74 da regra simples; **136 clientes** = pausas esperadas (soma das probabilidades, `README.md` do RAG, linha 381), que não são os **243 alertas** acima do limiar 0,17 (linha 385). Se não bater, parar e avisar;
- o README do painel documenta que regenerar os dados exige o repositório do RAG, mas o site publicado roda sozinho com os JSONs já exportados.

### Decisões da fase 2 (usuário, 2026-10-21)
1. **KPIs: valor total, variação nas lojas comparáveis.** `valor` = todas as lojas (igual ao "Faturamento total" do Resumo do app). `valor_comparavel` = lojas comparáveis no período atual; `valor_ano_anterior` = as mesmas lojas um ano antes; `variacao_pct = valor_comparavel ÷ valor_ano_anterior − 1`. Lojas comparáveis de cada período = lojas com pelo menos uma cesta no período e no mesmo período um ano antes: é a regra de `vw_lojas_like_for_like` aplicada a cada janela (4, 13 e 26 semanas). Em 26 semanas o conjunto é o mesmo da view (214 lojas). Contrato 1.1.
2. **Clientes ativos: definição do RAG.** Estoque no fim do período: comprou nas últimas 8 semanas (`vw_metricas_cliente.cliente_ativo`), comparado com o ano anterior sem filtro de loja, como no Resumo (2.205 contra 2.138). Como 4, 13 e 26 semanas terminam na semana 101, o número é o mesmo nos três; o painel explica isso numa dica. Na base inteira não há ano anterior.
3. **Faturamento semanal nas lojas do chat.** As duas linhas (semana e mesma semana um ano antes) usam só as lojas comparáveis da janela de 26 semanas (`vw_lojas_like_for_like`). A linha não soma o total de todas as lojas: soma o `valor_comparavel` do KPI de 26 semanas.
4. **Base inteira = semanas 1 a 101**, até a última semana completa, como o histórico do RAG (`vw_cliente_semana`). A semana 102 (6 dias) fica fora; a semana 1 (5 dias, início dos dados) entra.
5. **Dia da semana sem nome.** A data da base é inventada (`data_base` arbitrária no `config.yaml` do RAG), então os nomes dos dias de `dim_data.dia_semana` não são confiáveis: o pico de vendas cai em "segunda e terça". O mapa de calor usa `dim_data.dia_semana` (a definição do RAG), mas mostra "Dia 1 … Dia 7" e a nota "a base não tem calendário real; os dias formam um ciclo, sem nome".
6. **Faixa de risco por cliente e "% em risco" do segmento.** Clientes fora da população do modelo (sem compra nas últimas 8 semanas ou com menos de 16 semanas de histórico, como todo o segmento Em pausa) ficam com risco `null`. `risco_alto_pct` do segmento = clientes na faixa alta ÷ clientes do segmento com risco calculado; `null` se nenhum tiver.

### Decisões do redesenho v2 (usuário, 2026-10-22)
1. **Sem segmento** é um grupo dos dados: entra em "todos", não vira chip. A reconciliação confere que 4 segmentos + sem segmento = todos.
2. **Lista de ação** = faixas alta e média (464 clientes), ordenadas pelo faturamento em risco (probabilidade × faturamento em 26 semanas).
3. **A Matriz de afinidade volta**, com os 5 maiores departamentos mais os filtrados, e mínimo de 30 compradores.
4. **Penetração = a do RAG** (lojas comparáveis, clientes com compra no período), e não "% dos clientes ativos".
5. **Memória:** a exportação roda em etapas, um processo por etapa, com `memory_limit = 1GB` e `threads = 2` (`config.yaml`, `memoria`), e não 2 GB como no redesenho: o notebook tem 3,9 GB no total. O excedente vai para `data/tmp/duck`, fora do git. Medido: pico de cerca de 200 MB por etapa.

Decisões recomendadas e aceitas com o plano:
- **Ficha da Categoria e Segmentos** ficam fixas em 26 semanas (a janela da segmentação e da cesta), com o filtro de período desabilitado.
- **Linha semanal de 52 semanas** nas lojas comparáveis da janela de 26 semanas, mantendo a decisão 3 da fase 2.
- **Ano anterior só nas 26 semanas (decisão do usuário, 2026-10-22, achado na validação da R1):** a linha tracejada aparece só nas semanas 76 a 101, onde o chat compara. O ano anterior das semanas 53 a ~68 cai na entrada da base, quando os clientes ainda estavam entrando no painel (87 households na semana 1 e US$ 5 mil, contra ~1.280 households e ~US$ 80 mil por semana a partir da 16), e sugeriria um crescimento de +1.000% que não existe. Nas semanas 50 a 75 a linha fica vazia, com nota.
- **Mapa de calor** continua na base inteira e responde a segmento e departamento: um arquivo por departamento, carregado só quando há filtro de departamento.
- **Pares de cesta** são não ordenados (o lift é simétrico) e levam as duas confianças. Os pares de subcategorias guardam os 20 primeiros por subconjunto e departamento; a tela mostra 5.
- **Insights** não respondem a filtro (nota no painel).

### Identificador da base
`base_hash` = `meta.versao_base` do DuckDB (`ddb4d8032cc2`), não o SHA-256 do arquivo. É `md5(md5 de cada CSV + parâmetros que afetam o resultado + ETL_VERSAO)[:12]` (`src/etl.py:109-124`) e é o valor que a barra lateral do app mostra (`app/app.py:227`). O arquivo de origem é `data/processed/dunnhumby.duckdb`, o definido em `RAG/config.yaml` (`banco.arquivo`). O `base_0172e110bd0c.duckdb` é outra carga (`versao_base` 0172e110bd0c) e não é usado.

## 7. Design

Detalhado na skill `designing-dashboard-ui`. Resumo das decisões:
- **Tema escuro único.** Fundo da página `#0d0f13`, painéis `#171b22`.
- **Cores dos segmentos (fixas):** Fiéis `#3987e5` (azul), Regulares `#d95926` (laranja), Esporádicos `#199e70` (verde-água), Em pausa `#c98500` (amarelo). A paleta foi validada no fundo `#171b22`: aprovada em pares vizinhos. Com os 4 juntos em dispersão ou radar sobreposto, rótulo direto é obrigatório.
- **Destaque de interface** (aba e botão selecionados): pílula clara `#e8e6df` com texto escuro. Não é amarelo, para não ser confundida com o segmento Em pausa.
- **Status:** bom `#0ca30c`, atenção `#fab219`, crítico `#d03b3b`, sempre com ícone e texto.
- **Tipografia:** sans do sistema; números alinhados em tabelas.
- **Layout desktop:** cada aba cabe em uma tela de 1440×900 sem rolagem. No celular, os blocos empilham.
- **Decisões da fase 3 (validador de paleta da skill `dataviz`, fundo `#171b22`):**
  - os 4 segmentos passam em pares vizinhos, mas **Regulares × Em pausa** reprova quando os 4 aparecem juntos (ΔE 10,6 na visão normal, 4,8 em deuteranopia). Toda marca de segmento leva o nome em rótulo direto; na Roda, a ordem fixa deixa os dois em lados opostos; o radar da Ficha da Categoria tem uma série só (o departamento), sem cor de segmento;
  - `--seq-1` e `--seq-2` são próximos demais (ΔL 0,047): o mapa de calor usa `--seq-1, --seq-3, --seq-4, --seq-5, --seq-6`, sem mudar os tokens;
  - série única sem segmento (faturamento semanal, departamentos) usa `--seq-4`; "Outros" usa `--seg-outros`; o ano anterior usa `--text-muted` tracejado;
  - a variação do % de desconto leva ▲/▼ sem cor de status: mais desconto não é bom nem ruim por si;
  - todo gráfico tem uma tabela gêmea (botão "Tabela") e uma descrição em português para leitor de tela (`aria.label.description`); a descrição automática do ECharts sai em inglês.
- **Decisões do redesenho v2:**
  - chips de segmento com o ponto de cor e o nome (nunca só a cor); ligado = pílula `--accent`, como os botões pressionados;
  - cross-filter: o item selecionado mantém a cor e os outros ficam com opacidade 0,35 (a mesma convenção para barras, células e fatias);
  - vários segmentos no mesmo gráfico de linha: até 3 numa série cada, com rótulo direto; com os 4, pequenos múltiplos no mesmo eixo Y (regra da paleta: Regulares × Em pausa não ficam juntos sem rótulo);
  - Matriz de afinidade em escala **divergente** `--div-*` com `--div-mid` no índice 100; célula com amostra pequena a 0,45 de opacidade e ⚠ no tooltip e na tabela;
  - faixa de risco na lista de ação com ícone e texto (⚠ alto, ◐ médio), nunca só cor.

## 8. Plano técnico

| Camada | Escolha | Motivo |
|---|---|---|
| Dados | Python + DuckDB, anexando o banco do projeto de RAG em somente leitura. Métricas novas do painel (cubos, KPIs filtrados, atributos e percentis de departamento, pares de cesta, afinidade, faixas de risco, lista de ação) ficam em `scripts/sql/views_painel.sql`; as tabelas-base (cesta × departamento, cestas, lojas comparáveis, grupo do cliente), em `scripts/sql/painel_base.sql`. Nada altera o banco de origem | Uma definição por métrica |
| Exportação | `scripts/exportar_dados.py` → `site/data/*.json` + `manifest.json`, em etapas (um processo por etapa) | Pré-agregado, versionado, pequeno e leve para um notebook de 4 GB |
| Front-end | HTML + CSS + JavaScript puro (módulos ES), sem build | Simples de gerar e manter pelo Claude Code |
| Gráficos | Apache ECharts, versão exata fixada via CDN | Radar, mapa de calor, grafo, Pareto e acessibilidade (`aria`) nativos |
| Publicação | GitHub Pages servindo a pasta `site/` | Link público e grátis |
| Validação | `scripts/reconciliar.py`, validação de schema, Playwright MCP | Princípio 7 |

**Repositório:** novo, `retail-bi-dashboard`. O caminho do arquivo DuckDB do projeto de RAG fica em `config.yaml`, que não vai para o repositório. Um `config.example.yaml` mostra o formato.

**Estrutura:**
```
retail-bi-dashboard/
  docs/spec_dashboard.md
  .claude/skills/{designing-dashboard-ui, exporting-dashboard-data, validating-dashboard}/
  docs/validacao/            # relatório de validação de cada fase
  scripts/sql/               # consultas de exportação + painel_periodos.sql, painel_base.sql e views_painel.sql
  scripts/exportar_dados.py
  scripts/reconciliar.py
  contracts/*.schema.json
  site/index.html
  site/css/tokens.css
  site/css/app.css
  site/js/{app.js, tabs/*.js, charts/*.js}
  site/data/*.json
  tests/
```

**Orçamento:** o total de JSON carregado na abertura (Visão Geral) fica abaixo de 1,5 MB, e o de cada aba carregada sob demanda (Ficha da Categoria, Segmentos) também. O mapa de calor por departamento carrega um arquivo pequeno por departamento filtrado. A primeira tela abre em menos de 2 s localmente. Medido no redesenho v2: abertura 314 KB, Ficha da Categoria 435 KB, Segmentos 87 KB.

**Execução em etapas (memória):** `python scripts/exportar_dados.py` roda cada etapa num processo novo, para a memória do sklearn e do DuckDB voltar ao sistema ao fim de cada uma: `rag` (análises do RAG → `data/tmp/rag_*.parquet`), `base` (tabelas-base → `data/tmp/*.parquet`), `cubos`, `kpis_filtrados`, `cesta_departamentos`, `cesta_subcategorias` (um departamento por vez), `ficha_categoria`, `segmentos` e `manifest`. O DuckDB roda com `memory_limit` e `threads` do `config.yaml` (1 GB e 2) e grava o excedente em `data/tmp/duck`. `--etapa <nome>` roda uma só. Pares de cesta nunca são calculados no navegador.

**MCP no desenvolvimento:**
- **DuckDB** (servidor próprio do projeto de RAG, ou `mcp-server-motherduck` em modo somente leitura): consultar a base e conferir números;
- **Playwright MCP:** abrir o painel e conferir as telas;
- **Context7:** consultar a documentação atual do ECharts.

## 9. Fases de entrega

Cada fase termina com a validação da skill `validating-dashboard` aprovada e um commit.

1. **Fundação:** resolver os **[A CONFIRMAR]**, criar o repositório, `tokens.css`, a estrutura das abas e o rodapé "Sobre os dados". *(feita)*
2. **Dados do MVP:** exportar Visão Geral, Segmentos e Clientes, com os schemas, a reconciliação e o manifest. *(feita)*
3. **Visão Geral.** *(feita)*
4. **Segmentos.** *(feita)*
5. **Ficha do Cliente.** *(feita; substituída no redesenho v2)*
6. **Redesenho v2** (`docs/mudancas/redesenho_v2.md`):
   - **R1:** spec, contrato 2.0 e dados (exportação em etapas e reconciliação);
   - **R2:** filtros globais, cross-filter e Visão Geral;
   - **R3:** Ficha da Categoria;
   - **R4:** Segmentos (cards, matriz, pequenos múltiplos, lista de ação com CSV).
7. **Publicação:** GitHub Pages, README com link e capturas de tela.
8. **P2**, na ordem do redesenho (D8): Lojas (ficha da loja + Arena), Produtos, depois Laboratório e matriz de migração.

## 10. Definição de pronto

- [ ] Todos os critérios de aceite das abas da fase estão marcados.
- [ ] `reconciliar.py` passa sem nenhuma divergência.
- [ ] Todos os JSONs passam no schema.
- [ ] Zero erros no console do navegador.
- [ ] Telas conferidas em 1440×900 e 390×844.
- [ ] `git ls-files` sem dado bruto, `.duckdb`, `.parquet`, `config.yaml` ou chave.
- [ ] O servidor local foi encerrado depois da validação.

Acréscimos do redesenho v2 à reconciliação (seção 7 do redesenho):
- para cada período, a soma do cubo com todos os grupos e departamentos = faturamento dos KPIs, e o cubo semanal das 26 semanas = `vw_yoy_resumo`;
- 4 segmentos + sem segmento = todos; cada subconjunto = soma dos seus segmentos (cestas e clientes ativos);
- `kpis_filtrados` com todos os segmentos e departamentos = os KPIs da fase 2 (mesmas views do RAG);
- 10 pares sorteados (`random.seed(42)`; 7 de departamentos e 3 de subcategorias) com suporte, confiança e lift recontados da tabela fato, com SQL independente;
- radar: 6 atributos em cada departamento, percentis entre 0 e 100, e 3 departamentos sorteados contra SQL próprio e `vw_yoy_categoria`;
- lista de ação: faixa alta por segmento = alertas do RAG, faixa coerente com a probabilidade, ordem e 5 clientes sorteados;
- tela: cross-filter (clique filtra, segundo clique limpa, Ctrl + clique soma), etiquetas de filtro ativo, troca de aba mantendo os filtros, CSV baixando com as colunas certas.
