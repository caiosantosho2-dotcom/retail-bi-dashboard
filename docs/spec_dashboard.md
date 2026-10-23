# Spec — Painel BI de Varejo (Dunnhumby)

> Fonte única das regras deste projeto. Se o código, uma skill ou um prompt contradizer este arquivo, este arquivo vence. Mudou uma regra? Mude aqui primeiro, depois no código.
>
> Os itens que dependiam do projeto de RAG foram resolvidos na fase 1 e a resposta está registrada onde antes havia **[A CONFIRMAR]**, com o arquivo de origem.
>
> **Redesenho v3 (2026-10-23, em execução por etapas):** as decisões de `docs/mudancas/redesenho_v3.md` entram aqui etapa por etapa (plano em `docs/mudancas/plano_v3.md`; dúvidas e escolhas feitas sem o Caio em `docs/mudancas/pendencias_v3.md`). Princípio: o painel serve para **acompanhar**; cada gráfico passa no teste dos 5 segundos. **V1 (feita):** modelo único de seleção, período em todas as abas, Laboratório fora das abas (página "Metodologia e validação"). **V2 (feita):** Visão Geral; contrato 3.0.
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
| Recrutador técnico | Rigor por trás dos números | "Metodologia e validação" (link no rodapé), "Sobre os dados" |

## 4. Escopo e prioridades

| Prioridade | Aba | Entra no MVP |
|---|---|---|
| P1 | Visão Geral (com filtros globais e clique que filtra) | Sim |
| P1 | Ficha da Categoria (substitui a Ficha do Cliente, redesenho v2) | Sim |
| P1 | Segmentos (com matriz de afinidade e lista de ação; sem a matriz de migração) | Sim |
| P2 | Lojas (regiões pela clientela, ranking e ficha da loja) | Sim (2026-10-22) |
| P2 | Produtos (curva ABC, marca própria e fornecedores, rede de cestas com comparação entre segmentos) | Sim (2026-10-22) |
| P2 | Laboratório (curva ROC, matriz de confusão, CLV com backtest, teste de desconto) | Sim (2026-10-22). **Redesenho v3:** saiu das abas; é a página "Metodologia e validação" (`site/metodologia.html`), aberta pelo link do rodapé |
| P2 | Matriz de migração de segmentos (aba Segmentos, alternando com a Roda) | Sim (2026-10-22) |

**Fora do escopo:** mapa geográfico (a base não tem localização das lojas; o "mapa de clientela" da aba Lojas não é geográfico, ver 5.4); chat embutido no painel; login; atualização em tempo real; olhar cliente por cliente (a gestão decide por categoria, loja e segmento; os clientes aparecem só na lista de ação). **Fase futura:** dados de encarte e ponta de gôndola (`causal_data`). **Não existem na base:** share de gôndola e ruptura.

## 5. Abas: conteúdo e critérios de aceite

Elementos comuns a todas as abas:
- barra superior com o nome do painel, o período da base e as abas;
- **linha de filtros globais** (redesenho v2), de cima para baixo e numa linha só, acima dos gráficos: **Período** (últimas 4 semanas, 13 semanas, 26 semanas, base inteira) | **Segmento** | **Departamento** | **Limpar tudo**;
- rodapé "Sobre os dados": o link "Metodologia e validação" (redesenho v3), fonte, período, data de geração e hash da base.

### 5.0 Filtros globais e clique que filtra (todas as abas)

- **Segmento:** 4 chips liga/desliga com o rótulo **"Segmento atual do cliente"**. Cada clique soma ou tira um segmento; Ctrl + clique também funciona. Nenhum chip ligado = todos os clientes, inclusive os sem segmento (ver seção 6). Funciona no celular, pelo toque.
- **Departamento:** lista com busca, seleção múltipla e ordem pelo faturamento das 26 semanas.
- **Filtros ativos** viram etiquetas removíveis: "Segmento: Fiéis, Regulares ✕" e "Departamento: GROCERY ✕". **Limpar tudo** apaga os dois (o período volta a 26 semanas).
- **Estado único:** os filtros são um só objeto, compartilhado entre as abas. Trocar de aba mantém a seleção.
- **Período em todas as abas (redesenho v3, 0.2):** o botão de período nunca fica desabilitado. O que não muda com ele continua fixo, com uma nota curta no bloco: o **segmento do cliente** (atributo do cliente, calculado nas 26 semanas), o **risco de pausa** (foto do momento) e a **matriz de migração** (dois semestres fixos). Os dados por período carregam sob demanda, por aba e por período. *Durante a execução do v3,* a aba que ainda não ganhou os dados por período diz na nota que usa só as 26 semanas.
- **Filtro que não se aplica** fica desabilitado, com uma nota (hoje: segmento e departamento na aba Lojas).
- **Modelo único de seleção (redesenho v3, 0.1; `site/js/selecao.js`)**, o mesmo em todo gráfico e toda lista clicável:
  - **clique** num item = seleciona;
  - **clique no item já selecionado** = desfaz e volta ao total;
  - **Ctrl (ou ⌘) + clique** = soma ou tira da seleção;
  - **Esc**, ou **clique no fundo vazio do gráfico** = limpa a seleção daquele gráfico (o último usado na aba). Onde o clique abre um detalhe (card e Roda de Segmentos), o primeiro Esc fecha o detalhe e o segundo limpa;
  - o item selecionado fica destacado, e os outros com opacidade 0,35;
  - toda seleção que vira filtro aparece como etiqueta removível na linha de filtros. As seleções de uma aba só (região, perfil, subcategoria) aparecem só nela, e "Limpar tudo" também as apaga. A loja escolhida para a ficha não é filtro: não tem etiqueta.

  Os gráficos que filtram estão listados em cada aba; o teste dos 4 gestos (`tests/gestos.js`) passa em todos.

**Aceite:**
- [x] Clique filtra, o segundo clique limpa e Ctrl + clique soma, nos gráficos indicados em cada aba.
- [x] As etiquetas de filtro ativo aparecem, e o ✕ remove o filtro.
- [x] Trocar de aba mantém os filtros.
- [x] Filtro que não se aplica fica desabilitado, com a nota.

### 5.1 Visão Geral (P1)

**Conteúdo:**
- Linha de 6 KPIs, cada um com o valor do período e a variação contra o ano anterior (*like-for-like*): faturamento, cestas, ticket médio, itens por cesta, % de desconto, clientes ativos. Todos respondem aos filtros de segmento e departamento:
  - **somam** (faturamento, desconto, valor bruto): somados no navegador a partir de `cubo_periodo`; % de desconto = soma dos descontos ÷ soma do valor bruto, nunca a média das porcentagens;
  - **não somam** (cestas, ticket médio, itens por cesta, clientes ativos): pré-calculados para cada período × subconjunto de segmentos × departamento (todos ou um só), em `kpis_filtrados`. Com **2 ou mais departamentos** selecionados, esses cards mostram "—" com a nota "selecione um departamento para ver este indicador". Sem aproximação.
- Faturamento semanal: sempre as **últimas 52 semanas**, com o período selecionado **sombreado**; linha do período atual e linha do ano anterior em cinza tracejado, no mesmo eixo. Responde a segmento e departamento. Clicar num ponto não filtra.
- **Faturamento por segmento** (redesenho v3, no lugar do card de insights): barra 100% empilhada com a % e o valor de cada segmento (e "Sem segmento" quando houver, na base inteira), com rótulo direto numa lista ao lado da cor. Responde a período e departamento; o filtro de segmento destaca. O segmento é fixo (atributo do cliente, nota). **Clicar num segmento aplica o filtro de segmento.**
- **Faturamento por departamento**: barras horizontais ordenadas, top 10, com o restante somado em "Outros", e **um traço fino do ano anterior em cada barra** (redesenho v3). Com ano anterior (4, 13 e 26 semanas), as barras são das **lojas comparáveis do período** e o traço é das mesmas lojas um ano antes: comparar o total de todas as lojas com o ano anterior das comparáveis misturaria loja nova com crescimento. Na base inteira, todas as lojas e sem traço. **Clicar numa barra aplica o filtro de departamento.**
- **O que puxou a variação** (redesenho v3, no lugar do mapa de calor dia × hora): barras horizontais com a diferença em US$ contra o ano anterior por departamento, nas lojas comparáveis do período; os 10 maiores em módulo e o resto em "Outros", da maior alta à maior queda; verde com ▲ para alta e vermelho com ▼ para queda; rótulo com a diferença e a variação do departamento (em tela estreita, só a diferença). A soma das barras é a variação total do faturamento, escrita no subtítulo. Departamento com menos de 0,1% do faturamento leva ⚠ (amostra pequena; ex.: CHEF SHOPPE, ▲ 2.749%). Base inteira: aviso no lugar do gráfico. **Clicar numa barra aplica o filtro de departamento.**
- *Saíram no redesenho v3:* o mapa de calor dia × hora e os 3 cards de insight (frases fixas que não respondiam aos filtros; os links levavam ao Laboratório). O "136" da previsão de pausas fica no manifest e na reconciliação; o texto está em `pendencias_v3.md`, P1.

**Aceite:**
- [x] Os 6 KPIs batem com as views do DuckDB para os 4 períodos, sem filtro (era o aceite da fase 3, agora a partir de `cubo_periodo` e `kpis_filtrados`).
- [x] Com filtro de segmento e/ou de 1 departamento, os KPIs batem com a reconciliação em 3 combinações conferidas na tela.
- [x] Com 2 ou mais departamentos, os 4 cards que não somam mostram "—" com a nota.
- [x] A linha semanal mostra 52 semanas, com o período sombreado.
- [x] Nenhum gráfico usa dois eixos Y.
- [x] (v3) A soma das contribuições dos departamentos é a variação total do faturamento, nos 3 períodos com ano anterior (reconciliação contra SQL na tabela fato).
- [x] (v3) Os grupos do faturamento por segmento somam o total do período.
- [x] (v3) Os 4 gestos de seleção nos 3 gráficos clicáveis (segmento, departamento, variação); o ponto da linha não filtra.

### 5.2 Ficha da Categoria (P1)

Substitui a Ficha do Cliente (redesenho v2, D1): a gestão de varejo decide por categoria, no nível de departamento. A aba usa a janela de 26 semanas da segmentação; o filtro de período fica desabilitado, com a nota.

**Conteúdo:**
- **Lista (esquerda):** departamentos com busca e ordem por faturamento, crescimento ou % de desconto. Cada item mostra o faturamento e a variação dos segmentos selecionados. Departamentos com menos de 0,1% do faturamento ficam no fim, com o aviso de amostra pequena. Clicar num item troca o filtro global de departamento por ele. A lista mostra sempre todos os departamentos (com o filtro, a ficha abre o maior dos filtrados e os outros ficam marcados "no filtro"); se nenhum dos filtrados vendeu nas 26 semanas, a ficha diz isso e não mostra outro departamento. *Ajuste da R3: "a lista mostra só os filtrados" esvaziaria a lista a cada clique.*
- **Card da categoria (centro):**
  - cabeçalho: nome do departamento, participação no faturamento e variação contra o ano anterior (*like-for-like*);
  - **radar** com 6 atributos em percentil entre os departamentos (0 a 100), e a tabela dos valores reais ao lado: participação no faturamento; crescimento contra o ano anterior (lojas comparáveis); penetração (a do RAG, ver seção 6); frequência (cestas com o departamento ÷ clientes compradores); % de desconto; % de marca própria (`BRAND`);
  - **faturamento semanal** do departamento nas últimas 52 semanas, com uma linha por segmento selecionado. Com os 4 segmentos, 4 pequenos gráficos lado a lado, no mesmo eixo Y;
  - **quem compra:** barra 100% empilhada com a divisão do faturamento entre os segmentos, com rótulo direto;
  - **top 10 subcategorias** (commodity) do departamento, em barras horizontais;
  - **compra junto com:** os 5 departamentos de maior *lift*. Nos departamentos com 10% ou mais do faturamento (hoje GROCERY e DRUG GM), também os 5 pares de subcategorias de maior *lift* dentro dele. Respeita o filtro de segmento. Pares com amostra pequena não entram no top 5;
  - **dinheiro em risco:** faturamento do departamento vindo de clientes na faixa alta de risco de pausa, em US$ e em %.
- **Comparação (direita):** o departamento dentro dos segmentos selecionados × o departamento com todos os clientes. Para cada atributo do radar, o valor de todos com o percentil (é a tabela de valores reais do radar, logo ao lado dele), o valor dos selecionados e o índice (100 = igual). Exemplo: "GROCERY entre Fiéis e Regulares × GROCERY total".
- **Disposição em 1440×900 (validação da R3):** esquerda = lista + dinheiro em risco; centro = cabeçalho com os números e "quem compra", top 10 subcategorias ao lado do radar, faturamento semanal; direita = valores reais e comparação, compra junto com. No celular, o dinheiro em risco vai para o fim.
- **Ao abrir:** a aba começa no maior departamento (GROCERY), nunca vazia.

**Aceite:**
- [x] Abre em GROCERY, nunca vazia.
- [x] O radar sempre vem com a tabela dos valores reais; os 6 percentis ficam entre 0 e 100.
- [x] Os valores do card batem com a reconciliação para 3 departamentos sorteados.
- [x] "Compra junto com" respeita o filtro de segmento e não mostra par com amostra pequena.
- [x] A comparação da direita mostra o índice contra todos os clientes, e 100 quando nenhum segmento está selecionado.

### 5.3 Segmentos (P1)

O equivalente à aba "Tipos" da Pokédex. Usa a janela de 26 semanas da segmentação; o filtro de período fica desabilitado, com a nota.

> **Histórico:** em 2026-10-21 a análise segmento × departamento saiu do escopo inteira. O redesenho v2 (2026-10-22) a trouxe de volta como Matriz de afinidade, com os 5 maiores departamentos (decisão do usuário).

**Layout desktop (1440×900, sem rolagem):**
- **Topo:** 4 cards de segmento, clicáveis e ligados ao filtro global de segmento, com % de clientes, % do faturamento e ticket médio.
- **Meio, à esquerda (1/3):** a **Roda**, menor: os segmentos em círculo, com tamanho proporcional ao faturamento.
- **Meio, à direita (2/3):** a **Matriz de afinidade** segmento × departamento, com os **5 maiores departamentos** do faturamento das 26 semanas mais os que estiverem no filtro. Índice 100 = média. Escala divergente. Clicar numa célula aplica o filtro daquele segmento e daquele departamento.
- **Embaixo, à esquerda:** a evolução semanal por segmento (52 semanas), em 4 pequenos gráficos no mesmo eixo Y. Responde ao filtro de departamento.
- **Embaixo, à direita: lista de ação.** Clientes em risco de pausa (faixas alta e média), filtrados pelos segmentos selecionados, com as colunas ID, segmento, faixa de risco, semanas sem comprar, faturamento em 26 semanas e faturamento em risco. Ordenada pelo faturamento em risco. Botão **"Baixar CSV"**. Texto de apoio: "lista para campanha de reativação".
- **Painel de detalhe** do segmento: abre ao clicar na Roda ou num card, com % de clientes, % do faturamento, ticket médio, CLV médio, % em risco de pausa e desconto mediano. Fecha com Esc. *Validação da R4:* card e Roda seguem a regra do clique que filtra (o segundo clique limpa o filtro e fecha o detalhe; Esc fecha só o detalhe). No desktop o detalhe abre por cima da Roda, para não cobrir a matriz nem o botão "Baixar CSV" da lista de ação; no celular, logo abaixo dos cards.
- **Celular:** os pequenos múltiplos viram uma grade 2 × 2; os nomes da matriz giram 40°; a lista de ação esconde a coluna de faturamento em 26 semanas (que continua no CSV), para "Em risco", a ordem da lista, ficar visível.
- **CSV:** colunas `id; segmento; faixa_risco; probabilidade_pausa; semanas_sem_comprar; faturamento_26s; faturamento_em_risco`, UTF-8 com BOM, separador `;` e vírgula decimal (abre direto no Excel em português); nome `lista_acao_<segmentos>.csv`.
- **P2 — Matriz de migração:** de qual segmento para qual os clientes mudaram entre o semestre
  anterior (semanas 50–75) e a janela atual (76–101), com "Sem compra na janela" como quinto grupo dos dois lados.
  *Contexto (fase 1):* o RAG reajusta o K-Means a cada janela (`rfm.ajustar_segmentos`, `rfm.py:231`), então os
  segmentos de dois períodos só são comparáveis com uma decisão. *Decisão (usuário, 2026-10-22):* a segmentação do RAG
  refeita no semestre anterior com o K atual e os segmentos casados pelo nome (`rfm.base_rfm` + `clv._segmentar`), que
  é a mesma que o backtest do CLV do RAG já faz nessa janela; medido: concorda em 98,75% dos clientes com a régua do
  semestre atual (centróides atuais), e as duas dão quase a mesma matriz. Na tela, uma matriz de calor que alterna com
  a Roda no mesmo painel: linha = segmento antes, coluna = agora, célula = clientes e % da linha, diagonal (ficaram) em
  destaque, faturamento dos dois semestres no tooltip; clique na célula filtra o segmento atual. Células com menos de
  30 clientes levam o aviso de amostra pequena.

**Aceite da migração:**
- [x] As 25 células somam os 2.500 households e cada linha soma 100%.
- [x] O semestre anterior bate com o backtest do CLV do RAG (clientes e gasto por segmento), e o atual com `segmentos.json`.
- [x] A matriz alterna com a Roda sem a aba rolar em 1440×900, e o clique numa célula aplica o filtro de segmento.

**Aceite:**
- [x] A soma do % de clientes e do % do faturamento dos segmentos dá 100% (±0,1 p.p.).
- [x] O painel de detalhe mostra o segmento clicado na Roda ou no card e fecha com Esc.
- [x] Clicar numa célula da matriz aplica o filtro de segmento e de departamento.
- [x] A lista de ação respeita o filtro de segmento, e o CSV baixa com as colunas certas e o mesmo número de linhas da tela.

### 5.4 Lojas (P2)

Para operações e regionais: quais lojas e quais "regiões" puxam ou derrubam o resultado. Usa a janela de 26 semanas; o
filtro de período fica desabilitado, e os de segmento e departamento não se aplicam (nota).

> **Decisão do usuário (2026-10-22):** a base não tem localização das lojas (`dim_loja` só tem `STORE_ID`), então um
> mapa geográfico seria inventado. No lugar, **regiões inferidas pela clientela em comum** (seção 6): duas lojas que
> dividem muitos clientes provavelmente estão perto. A Arena e o faturamento semanal da loja, que estavam aqui, ficam
> fora (podem voltar como P2). O mapa de calor loja × semana virou região × semana.

**Conteúdo:**
- **Mapa de clientela:** cada loja do universo (100+ cestas na base inteira) é uma bolha com área proporcional ao
  faturamento das 26 semanas; lojas que dividem clientes ficam perto, com linhas finas nas 3 ligações mais fortes de cada
  uma. Cada região é uma área sombreada com o nome e a variação escritos por cima (clicar no nome destaca a região); a
  **cor da bolha é o crescimento *like-for-like*** (escala divergente; cinza = sem comparação). Aviso fixo e visível:
  **"não é geografia: perto = clientes em comum"**.
  *Validação da L2:* a cor por região (prevista no plano, com seletor) saiu. Pelo validador da skill `dataviz`, numa
  dispersão em que todas as cores ficam vizinhas só 3 cores categóricas passam; 6 regiões em 6 cores reprovariam.
  A região é dada pela área e pelo nome, como num mapa impresso.
- **Mapa de calor região × semana:** as regiões nas últimas 52 semanas, índice da semana contra a média da própria
  região (100 = semana típica), escala divergente; tooltip com o faturamento.
- **Ranking:** lojas comparáveis pelo crescimento *like-for-like*, com faturamento e cestas, **sem as de amostra
  pequena** (regra do RAG para ranking de loja).
- **Ficha da loja:** KPIs das 26 semanas com a variação *like-for-like*; **árvore de vendas** (faturamento = clientes
  × idas por cliente × ticket médio, com a variação de cada fator); **mix** de segmentos e top 5 departamentos, cada um
  com o índice contra a rede (100 = igual). Abre na maior loja (367), nunca vazia.
- Clicar numa bolha ou no ranking abre a ficha da loja; clicar no nome de uma região (ou na área dela) ou numa linha do mapa de calor destaca a região (as outras lojas a 0,35, o ranking só com as dela); o segundo clique ou Esc limpa.

**Aceite:**
- [x] O aviso "não é geografia" aparece junto do mapa de clientela, e cada região tem o número de lojas e a variação.
- [x] Os KPIs e as variações da ficha batem com `vw_yoy_loja` para todas as lojas comparáveis.
- [x] A árvore de vendas fecha (clientes × idas × ticket = faturamento) e o mix de segmentos soma 100%.
- [x] O ranking não mostra loja com amostra pequena.
- [x] Clicar numa bolha ou no ranking troca a ficha; clicar numa região destaca as lojas dela.

### 5.5 Produtos (P2)

Para comercial e category management: onde o faturamento se concentra, quanto é marca própria, quem fornece e o que
cada grupo de clientes compra junto. Janela de 26 semanas (período desabilitado, com nota). O filtro de segmento vale
para a rede de cestas; o de departamento destaca os itens dele.

> **Decisões do usuário (2026-10-22):** ABC no nível de subcategoria (as 298; produto, com 49 mil itens, não se lê);
> fabricante como **concentração de fornecedores por departamento**, porque a base só traz um código (`MANUFACTURER`)
> e o fabricante 69 é a própria marca própria (97% dela); rede de cestas como **grafo + pares característicos do
> segmento**.

**Conteúdo:**
- **Curva ABC (Pareto) das subcategorias:** a linha acumulada no eixo de 0 a 100%, com as faixas A (até 80%), B (até
  95%) e C, as contagens de cada classe e, no tooltip, a participação, a marca própria e o crescimento *like-for-like*
  da subcategoria. Com filtro de departamento, as subcategorias dele aparecem como pontos sobre a curva.
  *Validação da P2:* as barras de participação saíram. No eixo de 0 a 100% (a regra do Pareto, sem segundo eixo), a
  maior das 321 subcategorias tem 4% e as barras sumiam; a participação de cada uma fica no tooltip e na tabela.
- **Marca própria e fornecedores por departamento:** % de marca própria, crescimento da marca própria × da nacional, e a
  concentração dos fornecedores nacionais (quantos fazem 80% do faturamento nacional e a parte do maior).
- **Rede de cestas:** as 80 maiores subcategorias (73% do faturamento) como nós agrupados por departamento (áreas com o
  nome, como no mapa de clientela), tamanho = faturamento; as ligações são as 3 de maior *lift* de cada nó. Segue o filtro
  de segmento: com segmentos ligados, a ligação mostra o *lift* deles e a cor compara com o de todos (vermelho = mais,
  azul = menos); ligação com amostra pequena fica tracejada e cinza, sem cor de índice.
  *Validação da P2:* o maior departamento (GROCERY, 47 dos 80 nós) fica no centro e os outros em volta, no ângulo que os
  dados dão (`layout.posicoes_em_dois_niveis(compacto=True)`); sem isso, departamentos pouco ligados iam para longe e
  GROCERY virava um novelo num canto. Os nomes de subcategoria que colidem somem (no celular, só os de departamento).
- **Pares característicos:** para os segmentos selecionados, os 15 pares cujo *lift* mais supera o de todos os clientes
  (índice = *lift* do recorte ÷ *lift* de todos), sem amostra pequena.

**Aceite:**
- [x] A curva ABC fecha em 100%, e as classes seguem a regra da participação acumulada.
- [x] O crescimento das subcategorias e o das marcas batem com `vw_yoy_categoria`.
- [x] A rede responde ao filtro de segmento, e os pares característicos nunca têm amostra pequena.
- [x] A curva ABC usa um só eixo, de 0 a 100% (sem segundo eixo Y).

### 5.6 Laboratório (P2) — página "Metodologia e validação" desde o redesenho v3
*Redesenho v3:* saiu das abas. O código é o mesmo (`site/js/tabs/laboratorio.js`), aberto em `site/metodologia.html` pelo
link "Metodologia e validação" do rodapé, sem a linha de filtros (nenhum filtro se aplica ali).

**Para quem:** o recrutador técnico (o rigor por trás dos números). **Pergunta:** os modelos do RAG são bons o bastante,
e o que eles dizem? Todos os números são os das funções do RAG; o painel só os reorganiza (a curva ROC é a única
reprodução, conferida contra o RAG).

- **Curva ROC do modelo de risco de pausa contra a regra simples** (AUC 0,85 × 0,74, com o IC de 95% do RAG por
  household), no conjunto de teste do RAG (2 fotos, 4.425 linhas). Os pontos de operação marcados: o modelo no limiar
  0,17 e a regra simples em 4 semanas sem compra.
- **Matriz de confusão** do modelo e da regra simples nesses pontos: no mesmo nível de falso alarme (8% e 7,5%), o
  modelo acha 136 das 283 pausas e a regra, 94.
- **CLV por segmento:** o CLV médio por household com o IC de 95% do RAG, o total por segmento, e o backtest de 26
  semanas do próprio RAG (erro do método contra a regra ingênua por segmento). A margem de 25% aparece como premissa.
- **Teste de desconto:** as 6 diferenças de mediana entre segmentos com o IC de 95% (bootstrap do RAG) contra a faixa
  de ±1 ponto percentual que o RAG considera relevante, ao lado do Kruskal-Wallis (p) e do η²: estatisticamente
  significativo, mas pequeno demais para mudar a política.

*Decisões (usuário, 2026-10-22):* a ROC é reproduzida com o código do RAG (o RAG só devolve a AUC); o CLV fica como
média com intervalo e backtest (o RAG não calcula CLV por cliente); a matriz de confusão entra. Calibração e principais
fatores ficam de fora.

**Filtros:** período e departamento não se aplicam (nota na barra). O filtro de segmento destaca o segmento no CLV e no
teste de desconto, sem recalcular nada.

**Layout 1440×900:** linha 1 = curva ROC (7 col.) | matriz de confusão (5 col.); linha 2 = CLV (6 col.) | teste de
desconto (6 col.). Celular: empilhado.

**Aceite:**
- [x] A área da curva ROC publicada é a AUC do RAG (0,8531 e 0,7378), e os pontos de operação estão na curva.
- [x] A matriz de confusão, o CLV, o backtest e o teste de desconto são os números do RAG; o % de desconto por household
  bate com o SQL na tabela fato.
- [x] O teste de desconto mostra a significância (p) e o tamanho do efeito (η² e diferenças com IC contra a faixa
  relevante) lado a lado.
- [x] A margem de 25% aparece como premissa ao lado do CLV.

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
| Região inferida (aba Lojas) | agrupamento das lojas pela clientela em comum | Universo: lojas com 100+ cestas na base inteira (113; as outras ficam em "Lojas pequenas", ~1% do faturamento). Semelhança = Jaccard dos clientes de duas lojas (`painel.loja_par`). Grupos: `SpectralClustering` do scikit-learn, `random_state = 42`, k = a maior silhueta entre 3 e 8 (deu 6). Nomes "Região A … F" em ordem de faturamento. **É hipótese, não geografia:** 66% da clientela em comum fica dentro das regiões, contra 19% numa divisão ao acaso com os mesmos tamanhos, mas a silhueta é baixa (0,08), porque a maioria dos pares não divide quase ninguém. Código em `scripts/regioes.py`; parâmetros no manifest (`parametros_regioes`) |
| Posição no mapa de clientela | em dois níveis: (1) cada região é um disco com área proporcional ao número de lojas, os centros saem de um MDS sobre −log da semelhança média entre regiões e são afastados o mínimo para os discos não se sobreporem; (2) dentro do disco, as lojas ficam pelo MDS sobre a distância no grafo dos 8 vizinhos mais fortes, comprimento −log(Jaccard) | Na L1, o MDS sobre todas as lojas juntas venceu o embedding espectral (11 × 526 pares sobrepostos), mas na tela da L2 as regiões ficavam misturadas (contornos cruzados, nomes sobrepostos). Com os dois níveis, a distância média dentro da região ÷ entre regiões caiu de 0,37 para 0,16. Perto na tela = clientes em comum, nunca quilômetros |
| Índice semanal da região | faturamento da semana ÷ média semanal da própria região nas 52 semanas × 100 | 100 = semana típica da região; compara ritmo e tendência entre regiões de tamanhos diferentes |
| Contribuição para a variação (Visão Geral, v3) | faturamento nas lojas comparáveis do período − o das mesmas lojas um ano antes, por departamento | Soma de `cubo_periodo` (`faturamento_comparavel − faturamento_ano_anterior`), que já tem o grão período × grupo × departamento: nenhum arquivo novo. A soma dos departamentos = a variação total (reconciliação). Variação do departamento = comparável ÷ ano anterior − 1 |
| Árvore de vendas | faturamento = clientes × idas por cliente × ticket médio | Definição `arvore_de_vendas` do RAG, com os números de `vw_yoy_loja` (atual × ano anterior, só lojas comparáveis) |
| Curva ABC (aba Produtos) | subcategorias (departamento × `COMMODITY_DESC`, 22 nomes repetem entre departamentos) em ordem de faturamento, 26 semanas | Classe pela participação acumulada **antes** da subcategoria: A < 80%, B < 95%, C o resto (a que cruza 80% ainda é A). Hoje: 101 A, 74 B, 146 C |
| Fabricante | `MANUFACTURER` é um código anonimizado; o 69 é 97% da marca própria | Mostrado só como concentração por departamento: fabricantes nacionais, quantos somam 80% do faturamento nacional e a parte do maior. Nunca um nome inventado |
| Rede de cestas (aba Produtos) | as `cesta.rede_subcategorias` (80) maiores subcategorias da janela da cesta; pares com as métricas de 5.2 (suporte, *lift*, mínimo de 200 cestas) por subconjunto de segmentos | Ligações desenhadas: as `rede_ligacoes_por_no` (3) de maior *lift* de cada nó, com todos os clientes. Posições pelo mesmo método de dois níveis do mapa de clientela (`scripts/layout.py`), com os departamentos como grupos e o Jaccard das cestas como semelhança |
| Par característico | índice = *lift* no subconjunto ÷ *lift* com todos os clientes | Os `rede_caracteristicos` (15) de maior índice em cada subconjunto, sem amostra pequena. Recorte sem nenhum par com 200+ cestas (ex.: só Em pausa) fica sem lista, com o aviso |
| Curva ROC (aba Laboratório) | taxa de verdadeiros × falsos positivos em cada corte, no conjunto de teste do RAG | Reproduzida com as funções do próprio RAG (`scripts/rag_modelos.py`, `curvas_roc`): a exportação para se a AUC (na 4ª casa, como o RAG arredonda) ou as matrizes de confusão não forem iguais às de `churn._calcular`. Regra simples: nota = semanas sem compra |
| Matriz de confusão | no limiar do RAG (0,17, maior F1 na validação) e no k da regra simples (4 semanas) | Os números de `churn._calcular`; precisão = VP ÷ alertas, recall = VP ÷ pausas |
| Migração de segmentos | segmento no semestre anterior (as 26 semanas antes da janela) × segmento na janela | O RFM do RAG refeito na janela anterior com o K atual, casado pelo nome (`clv._segmentar`, o mesmo do backtest do CLV); quem não foi segmentado numa janela (sem compra ou valor líquido ≤ 0) fica em "Sem compra na janela". "Ficaram" = mesmo segmento nos dois; o % de quem ficou conta só quem tinha segmento antes (63%) |
| Teste de desconto | o de `src/nucleo/teste_desconto.py`: % de desconto por household nas 26 semanas, Kruskal-Wallis, Mann-Whitney com ajuste, IC das diferenças de mediana por bootstrap | Veredito do RAG: significativo (p < 0,05) mas desprezível (η² < 0,01 e nenhum par com IC fora de zero e diferença ≥ 1 p.p.). Diferenças em fração (0,01 = 1 ponto percentual) |
| `amostra_pequena` da loja | nas lojas comparáveis, a de `vw_yoy_loja`: menos de 100 cestas em **qualquer** um dos dois períodos | Nas outras, menos de 100 cestas nas 26 semanas. Ranking de loja nunca mostra amostra pequena (glossário do RAG). Exemplo: a loja 33923 tem 460 cestas agora e 1 um ano antes (+10.830%): fica fora do ranking |

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
- **Mapa de calor** continua na base inteira e responde a segmento e departamento: um arquivo por departamento, carregado só quando há filtro de departamento. *(Saiu no redesenho v3.)*
- **Pares de cesta** são não ordenados (o lift é simétrico) e levam as duas confianças. Os pares de subcategorias guardam os 20 primeiros por subconjunto e departamento; a tela mostra 5.
- **Insights** não respondem a filtro (nota no painel). *(Saíram no redesenho v3.)*

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
  - linha de filtros numa linha só em 1440×900 e 1366×768: o botão "Alto contraste" fica na barra superior, e o botão de departamento corta nomes longos com reticências (o nome inteiro fica na dica e na etiqueta).

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
  site/metodologia.html      # página "Metodologia e validação" (o antigo Laboratório)
  site/js/{app.js, filtros.js, selecao.js, tabs/*.js, charts/*.js}
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
7. **Publicação:** GitHub Pages, README com link e capturas de tela. Repositório público `caiosantosho2-dotcom/retail-bi-dashboard`, ramo `main`; o workflow `.github/workflows/pages.yml` publica a pasta `site/` a cada mudança nela.
8. **P2**, na ordem do redesenho (D8):
   - **Lojas** (5.4): **L1** dados (regiões pela clientela, contrato 2.1, reconciliação); **L2** a tela *(feitas)*;
   - **Produtos** (5.5): **P1** dados (ABC, marcas e fornecedores, rede de cestas, contrato 2.2, reconciliação); **P2** a tela *(feitas)*;
   - **Laboratório** (5.6): **LB1** dados (ROC reproduzida e conferida, contrato 2.3, reconciliação); **LB2** a tela *(feitas)*;
   - **Matriz de migração** (5.3): **M1** dados (segmentação do RAG no semestre anterior, contrato 2.4, reconciliação); **M2** a tela *(feitas)*. Com isso, a P2 está completa.
9. **Redesenho v3** (`docs/mudancas/redesenho_v3.md`, execução sem supervisão; plano em `docs/mudancas/plano_v3.md`):
   - **V0:** o número 136 (só investigação; `pendencias_v3.md`, P1) *(feita)*;
   - **V1:** modelo único de seleção, período em todas as abas, Laboratório fora das abas *(feita)*;
   - **V2:** Visão Geral (variação por departamento, marcador do ano anterior, faturamento por segmento; contrato 3.0) *(feita)*;
   - **V3:** Categorias; **V4:** Clientes & Lojas; **V5:** Cestas & Marcas;
   - **V6** (publicação e README com as 4 abas): só depois da aprovação do Caio.

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
