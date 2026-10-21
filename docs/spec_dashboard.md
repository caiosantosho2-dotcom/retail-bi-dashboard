# Spec — Painel BI de Varejo (Dunnhumby)

> Fonte única das regras deste projeto. Se o código, uma skill ou um prompt contradizer este arquivo, este arquivo vence. Mudou uma regra? Mude aqui primeiro, depois no código.
>
> Itens marcados **[A CONFIRMAR]** dependem do que existe no projeto de RAG. O Claude Code deve resolvê-los lendo o repositório de origem antes de implementar, e registrar a resposta aqui.

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
- o mesmo dado em visões alternáveis (Roda / Matriz / Ranking);
- uma "ficha" de destaque com atributos em radar;
- tema escuro com cores fixas por categoria.

## 3. Quem usa

| Perfil | O que quer | Onde encontra |
|---|---|---|
| Diretoria / gerência comercial | Saúde do negócio em 10 segundos | Visão Geral |
| CRM / marketing | Quem são os clientes, quem está saindo, o que cada grupo compra | Ficha do Cliente, Segmentos |
| Operações / regionais | Quais lojas puxam ou derrubam o resultado | Lojas |
| Recrutador técnico | Rigor por trás dos números | Laboratório, "Sobre os dados" |

## 4. Escopo e prioridades

| Prioridade | Aba | Entra no MVP |
|---|---|---|
| P1 | Visão Geral | Sim |
| P1 | Ficha do Cliente | Sim |
| P1 | Segmentos | Sim (sem a matriz de migração) |
| P2 | Lojas (com Arena) | Não |
| P2 | Produtos | Não |
| P2 | Laboratório | Não |
| P2 | Matriz de migração de segmentos | Não |

**Fora do escopo:** mapa (a base não tem localização das lojas); dados de encarte e exposição (`causal_data`); chat embutido no painel; login; atualização em tempo real.

## 5. Abas: conteúdo e critérios de aceite

Elementos comuns a todas as abas:
- barra superior com o nome do painel, o período da base e as abas;
- filtro global de período (últimas 4 semanas, 13 semanas, 26 semanas, base inteira) numa linha só, acima dos gráficos;
- rodapé "Sobre os dados": fonte, período, data de geração e hash da base.

### 5.1 Visão Geral (P1)

**Conteúdo:**
- Linha de 6 KPIs, cada um com o valor do período e a variação contra o ano anterior (*like-for-like*): faturamento, cestas, ticket médio, itens por cesta, % de desconto, clientes ativos.
- Faturamento semanal: linha do período atual e linha do ano anterior em cinza tracejado, no mesmo eixo.
- Mapa de calor dia da semana × hora da compra. **[A CONFIRMAR]** se o horário da transação (`TRANS_TIME`) foi carregado na tabela fato. Se não foi, trocar por faturamento por dia da semana.
- Faturamento por departamento: barras horizontais ordenadas, top 10, com o restante somado em "Outros".
- 3 cards de insight vindos das análises já validadas (Fiéis × faturamento, dinheiro em risco de pausa, desconto entre segmentos), cada um com a frase de conclusão e o número que a sustenta.

**Aceite:**
- [ ] Os 6 KPIs batem com as views do DuckDB para os 4 períodos do filtro.
- [ ] Mudar o filtro de período atualiza KPIs, linha semanal e departamentos.
- [ ] Nenhum gráfico usa dois eixos Y.
- [ ] Os cards de insight mostram os mesmos números da aba Resumo do app de RAG.

### 5.2 Ficha do Cliente (P1)

A "Pokédex" do varejo.

**Conteúdo:**
- **Coluna de seleção (esquerda):** busca por ID do cliente, filtro por segmento e botão "sortear cliente". Lista dos clientes filtrados, com o ponto de cor do segmento.
- **Ficha (centro):**
  - cabeçalho: ID do cliente, segmento (etiqueta com a cor do segmento), há quantas semanas não compra;
  - radar de 6 atributos em percentil de 0 a 100 dentro da base: recência (invertida, para que maior seja melhor), frequência, valor, CLV, sensibilidade a desconto, variedade de departamentos. Ao lado do radar, uma tabela com os valores reais de cada atributo;
  - medidor de risco de pausa, com o rótulo da faixa (baixo, médio ou alto) e não só a cor;
  - histórico de faturamento semanal do cliente (linha fina);
  - top 5 departamentos do cliente, com a % do gasto dele.
- **Painel de contexto (direita):** como esse cliente se compara à média do seu segmento em cada atributo.

**Aceite:**
- [ ] Com o arquivo do segmento já carregado, qualquer cliente abre em menos de 300 ms depois do clique.
- [ ] Os valores da ficha batem com as views de cliente (RFM, CLV, risco) para uma amostra de 20 clientes sorteados.
- [ ] O radar sempre vem acompanhado da tabela com os valores reais.
- [ ] Clientes sem demografia não quebram a ficha.

### 5.3 Segmentos (P1)

O equivalente à aba "Tipos" da Pokédex. Um seletor alterna entre três visões do mesmo dado: **Roda**, **Matriz** e **Ranking**.

**Conteúdo:**
- **Matriz:** segmento × departamento, com o índice de afinidade = (% do gasto do segmento no departamento) ÷ (% do gasto da base no departamento) × 100. Escala divergente centrada em 100, com cinza neutro no centro.
- **Ranking:** para o segmento selecionado, os departamentos ordenados pelo índice de afinidade.
- **Roda:** os segmentos dispostos em círculo, com o tamanho proporcional ao faturamento. Clicar num segmento destaca os departamentos em que ele mais compra acima da média.
- **Painel de detalhe (direita), ao clicar num segmento:** % de clientes, % do faturamento, ticket médio, CLV médio, % em risco de pausa, desconto mediano e top 3 departamentos por afinidade.
- **P2 — Matriz de migração:** de qual segmento para qual segmento os clientes mudaram entre o primeiro e o segundo semestre da janela. **[A CONFIRMAR]** se a segmentação pode ser reaplicada por período com os mesmos centróides. Se não puder, a matriz fica fora.

**Aceite:**
- [ ] A soma do % de clientes e do % do faturamento dos segmentos dá 100% (±0,1 p.p.).
- [ ] O índice de afinidade de cada departamento, ponderado pelo gasto de todos os segmentos, volta a 100 (±1).
- [ ] O segmento selecionado continua o mesmo ao trocar entre Roda, Matriz e Ranking.

### 5.4 Lojas (P2)
- Ranking de lojas pelo crescimento *like-for-like*, com faturamento e número de cestas.
- Mapa de calor loja × semana para as 30 maiores lojas.
- **Arena:** duas lojas lado a lado com os mesmos KPIs e a diferença entre elas.

### 5.5 Produtos (P2)
- Curva ABC (Pareto) de produtos ou de categorias.
- Marca própria × marca nacional por departamento (campo `BRAND`).
- Pares de departamentos comprados na mesma cesta, com o *lift* (quanto a dupla aparece além do esperado ao acaso).

### 5.6 Laboratório (P2)
- Curva ROC do modelo de risco de pausa contra a regra simples (AUC 0,85 × 0,74).
- Distribuição do CLV por segmento.
- Teste de desconto: diferenças entre segmentos com intervalo e tamanho do efeito, mostrando que é estatisticamente significativo, mas pequeno demais para mudar a política.

## 6. Regras de negócio e métricas

As fórmulas vivem nas views do DuckDB do projeto de RAG e não são reescritas aqui. Esta seção só aponta onde cada uma está.

| Métrica | Origem | Observação |
|---|---|---|
| Faturamento | `SALES_VALUE` (já líquido) | **[A CONFIRMAR]** nome da view |
| Ticket médio | faturamento ÷ cestas distintas | view de métricas de cesta |
| Itens por cesta | soma de `QUANTITY` ÷ cestas distintas | idem |
| % de desconto | soma dos descontos ÷ valor bruto | conferir o sinal dos campos de desconto, como no projeto de RAG |
| Cliente ativo | **[A CONFIRMAR]** a definição na view | |
| Segmento | resultado do RFM + K-Means | 4 segmentos: Fiéis, Regulares, Esporádicos, Em pausa |
| CLV | **[A CONFIRMAR]** a view ou tabela de CLV por cliente | |
| Risco de pausa | **[A CONFIRMAR]** a tabela de scores do modelo | faixas baixo/médio/alto com os cortes documentados |
| Período | relativo à data máxima da base (2017-12-11), não à data de hoje | igual ao chat |
| Comparação com o ano anterior | *like-for-like* | igual ao chat |

## 7. Design

Detalhado na skill `designing-dashboard-ui`. Resumo das decisões:
- **Tema escuro único.** Fundo da página `#0d0f13`, painéis `#171b22`.
- **Cores dos segmentos (fixas):** Fiéis `#3987e5` (azul), Regulares `#d95926` (laranja), Esporádicos `#199e70` (verde-água), Em pausa `#c98500` (amarelo). A paleta foi validada no fundo `#171b22`: aprovada em pares vizinhos. Com os 4 juntos em dispersão ou radar sobreposto, rótulo direto é obrigatório.
- **Destaque de interface** (aba e botão selecionados): pílula clara `#e8e6df` com texto escuro. Não é amarelo, para não ser confundida com o segmento Em pausa.
- **Status:** bom `#0ca30c`, atenção `#fab219`, crítico `#d03b3b`, sempre com ícone e texto.
- **Tipografia:** sans do sistema; números alinhados em tabelas.
- **Layout desktop:** cada aba cabe em uma tela de 1440×900 sem rolagem. No celular, os blocos empilham.

## 8. Plano técnico

| Camada | Escolha | Motivo |
|---|---|---|
| Dados | Python + DuckDB, anexando o banco do projeto de RAG em somente leitura. Métricas novas do painel (afinidade, percentis) ficam em `scripts/sql/views_painel.sql`, sem alterar o banco de origem | Uma definição por métrica |
| Exportação | `scripts/exportar_dados.py` → `site/data/*.json` + `manifest.json` | Pré-agregado, versionado e pequeno |
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
  scripts/sql/               # consultas de exportação + views_painel.sql
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

**Orçamento:** o total de JSON carregado na abertura fica abaixo de 1,5 MB. Os dados da Ficha do Cliente carregam por segmento, sob demanda. A primeira tela abre em menos de 2 s localmente.

**MCP no desenvolvimento:**
- **DuckDB** (servidor próprio do projeto de RAG, ou `mcp-server-motherduck` em modo somente leitura): consultar a base e conferir números;
- **Playwright MCP:** abrir o painel e conferir as telas;
- **Context7:** consultar a documentação atual do ECharts.

## 9. Fases de entrega

Cada fase termina com a validação da skill `validating-dashboard` aprovada e um commit.

1. **Fundação:** resolver os **[A CONFIRMAR]**, criar o repositório, `tokens.css`, a estrutura das abas e o rodapé "Sobre os dados".
2. **Dados do MVP:** exportar Visão Geral, Segmentos e Clientes, com os schemas, a reconciliação e o manifest.
3. **Visão Geral.**
4. **Segmentos.**
5. **Ficha do Cliente.**
6. **Publicação:** GitHub Pages, README com link e capturas de tela.
7. **P2**, na ordem: Laboratório, Lojas, Produtos e matriz de migração.

## 10. Definição de pronto

- [ ] Todos os critérios de aceite das abas da fase estão marcados.
- [ ] `reconciliar.py` passa sem nenhuma divergência.
- [ ] Todos os JSONs passam no schema.
- [ ] Zero erros no console do navegador.
- [ ] Telas conferidas em 1440×900 e 390×844.
- [ ] `git ls-files` sem dado bruto, `.duckdb`, `.parquet`, `config.yaml` ou chave.
