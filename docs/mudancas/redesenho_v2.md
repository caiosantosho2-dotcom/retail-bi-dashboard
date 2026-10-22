# Redesenho v2 — mudanças pedidas depois da revisão do MVP

> Documento de mudança. O Claude Code aplica estas decisões em `docs/spec_dashboard.md` (seções 4, 5, 6 e 10), em `.claude/skills/exporting-dashboard-data/reference/contrato_json.md` e, se preciso, nas skills. A spec continua sendo a fonte única. Este arquivo registra **o que mudou e por quê**.

## Por que mudar

Revisão do Caio, que tem experiência em comercial de varejo e em category management na P&G:
- A gestão de varejo decide olhando **categoria, loja e segmento**. Olhar cliente por cliente não ajuda ninguém a decidir.
- A Visão Geral precisa de filtros e de **clique que filtra**, como no Power BI.
- A aba Segmentos está magra: só a Roda e um resumo.
- Combinação de categorias na cesta é uma pergunta clássica de category management.

## Decisões

| # | Decisão |
|---|---|
| D1 | A aba **Ficha do Cliente vira Ficha da Categoria**, no nível de departamento. |
| D2 | Os clientes individuais saem do centro e viram uma **lista de ação** (clientes em risco, com CSV) dentro de Segmentos. |
| D3 | **Filtros globais** de segmento e de departamento, com seleção múltipla, valendo para todas as abas onde fizer sentido. |
| D4 | **Clique filtra (cross-filter):** clicar numa barra, célula ou fatia filtra o painel. Clicar de novo limpa. **Ctrl + clique** soma itens à seleção. |
| D5 | **Análise de cesta**: pares de departamentos para todos, e pares de subcategorias (commodity) **só dentro dos departamentos com 10% ou mais do faturamento** (hoje GROCERY e DRUG GM). Isso evita o cálculo pesado de 100 subcategorias e foca onde o faturamento está concentrado. |
| D6 | MEAT e MEAT-PCKGD **continuam separados**: são comportamentos de compra diferentes (carne fresca × embalada). |
| D7 | `causal_data` (encarte e ponta de gôndola) fica para uma fase futura. Share de gôndola e ruptura **não existem na base**. O README deve dizer isso. |
| D8 | Ordem: este redesenho agora; depois a aba **Lojas** (ficha da loja + Arena); depois a aba **Produtos** (rede de cestas completa, comparação entre segmentos, marca própria, fabricante). |

## 1. Filtros globais (todas as abas)

- Linha de filtros, de cima para baixo: **Período** | **Segmento** (chips com seleção múltipla) | **Departamento** (lista com busca, seleção múltipla, ordenada por faturamento) | **Limpar tudo**.
- **Chips de segmento são liga/desliga:** cada clique soma ou tira um segmento. Ctrl + clique também funciona. Nenhum chip ligado = todos. Funciona no celular.
- **Filtros ativos** aparecem como etiquetas removíveis: "Segmento: Fiéis, Regulares ✕" e "Departamento: GROCERY ✕".
- Rótulo do filtro: **"Segmento atual do cliente"**. O segmento é calculado na janela de 26 semanas e aplicado ao histórico do cliente.
- O estado dos filtros é **um só**, compartilhado entre as abas. Trocar de aba mantém a seleção.
- Onde um filtro não se aplica (exemplo: período fixo de 26 semanas em Segmentos), ele fica desabilitado, com uma nota, como já é hoje.

## 2. Visão Geral

**Mudanças:**
- Todos os gráficos respondem aos filtros globais.
- **Cross-filter:** clicar numa barra de "Faturamento por departamento" aplica o filtro de departamento. Clicar numa célula do mapa de calor não filtra, só mostra o tooltip. Clicar num ponto da linha semanal não filtra.
- **Linha semanal:** mostra sempre as últimas 52 semanas e **sombreia o período selecionado**. Hoje, com "4 semanas", a linha fica com 4 pontos e perde o contexto.
- O item selecionado fica destacado no gráfico, e os outros ficam com opacidade de 0,35.

**Regra técnica obrigatória: métricas que se somam × que não se somam**
- **Somam** (podem ser somadas no navegador a partir de um cubo agregado): faturamento, faturamento do ano anterior, valor de desconto e valor bruto.
- **Não somam** (uma cesta tem vários departamentos e um cliente compra em vários): cestas, ticket médio, itens por cesta e clientes ativos. Elas são **pré-calculadas** para cada combinação de:
  - período (4);
  - subconjunto de segmentos (16: as 15 combinações não vazias + todos);
  - departamento (todos + cada departamento individual).
- Com **2 ou mais departamentos** selecionados, os cards que não somam mostram "—" com a nota "selecione um departamento para ver este indicador". Não inventar aproximação.
- % de desconto = soma dos descontos ÷ soma do valor bruto. Calcule a partir das somas, nunca pela média das porcentagens.

## 3. Ficha da Categoria (substitui a Ficha do Cliente)

**Esquerda:** a lista de departamentos, com busca e ordenação por faturamento, crescimento ou % de desconto. Cada item mostra o faturamento e a variação. Departamentos com menos de 0,1% do faturamento ficam no fim, com o aviso de amostra pequena.

**Centro, o card da categoria:**
- Cabeçalho: nome do departamento, participação no faturamento e variação contra o ano anterior (*like-for-like*).
- **Radar** com 6 atributos em **percentil entre os departamentos**, e a tabela dos valores reais ao lado:
  1. participação no faturamento;
  2. crescimento contra o ano anterior (lojas comparáveis);
  3. penetração (% dos clientes ativos que compraram o departamento);
  4. frequência (cestas com o departamento ÷ clientes compradores);
  5. % de desconto;
  6. % de marca própria (campo `BRAND`).
- **Faturamento semanal** do departamento nas últimas 52 semanas, com **uma linha por segmento selecionado**. Com os 4 segmentos, use 4 pequenos gráficos lado a lado, conforme a regra de cores da skill de design.
- **Quem compra:** barra 100% empilhada com a divisão do faturamento entre os segmentos.
- **Top 10 subcategorias** (commodity) do departamento, em barras horizontais.
- **Compra junto com:** os 5 departamentos de maior *lift*. Nos departamentos com 10% ou mais do faturamento, mostra também as 5 subcategorias de maior *lift* dentro dele. Respeita o filtro de segmento.
- **Dinheiro em risco:** faturamento do departamento vindo de clientes na faixa alta de risco de pausa, em US$ e em %.

**Direita, a comparação:** o departamento **dentro dos segmentos selecionados × o departamento na base inteira**. Para cada atributo do radar, mostra o valor dos selecionados, o da base e o índice (100 = igual à base). Exemplo: "GROCERY entre Fiéis e Regulares × GROCERY total".

**Ao abrir:** a aba começa no maior departamento (GROCERY), nunca vazia.

## 4. Segmentos (mais completa)

Layout desktop (1440×900, sem rolagem):
- **Topo:** 4 cards de segmento, clicáveis, ligados ao filtro global de segmento, com % de clientes, % do faturamento e ticket médio.
- **Meio, à esquerda (1/3):** a Roda, menor.
- **Meio, à direita (2/3):** a **matriz de afinidade segmento × departamento**, já prevista na spec. Índice 100 = média. Escala divergente. Clicar numa célula aplica o filtro daquele segmento e departamento.
- **Embaixo, à esquerda:** a **evolução semanal por segmento**, em 4 pequenos gráficos com o mesmo eixo Y.
- **Embaixo, à direita: lista de ação.** Clientes em risco de pausa, filtrados pelos segmentos selecionados, com as colunas ID, segmento, faixa de risco, semanas sem comprar e faturamento em 26 semanas. Ordenada por faturamento em risco. Botão **"Baixar CSV"**. Texto de apoio: "lista para campanha de reativação".
- O painel de detalhe do segmento continua, abrindo ao clicar na Roda ou num card.

## 5. Análise de cesta (método)

- **Janela:** as mesmas 26 semanas da segmentação, configurável em `config.yaml`.
- **Unidade:** a cesta (`BASKET_ID`). Antes de cruzar, reduza para pares distintos de cesta × departamento (ou cesta × commodity).
- **Métricas por par A→B:**
  - suporte = cestas com A e B ÷ total de cestas;
  - confiança = cestas com A e B ÷ cestas com A;
  - **lift** = confiança ÷ (cestas com B ÷ total de cestas).
- **Mínimo:** 200 cestas com o par. Abaixo disso, `amostra_pequena: true` e o par não entra no top 5. O número 200 deve ser justificado no comentário da view: com menos de 200 cestas, o lift oscila muito entre semanas.
- **Por segmento:** o mesmo cálculo, restrito às cestas dos clientes de cada segmento. Os subconjuntos de segmentos são calculados no export (16 combinações), não no navegador.
- **Subcategorias:** os pares de commodity são calculados só **dentro** dos departamentos com 10% ou mais do faturamento. O limite de 10% vem do `config.yaml`, e a lista resultante vai para o `manifest.json`.
- **Memória:** execute no DuckDB com `SET memory_limit='2GB'` e `SET threads=2`, uma etapa por vez, salvando o resultado intermediário. Nunca calcule pares no navegador.

## 6. Contrato de dados (arquivos novos ou alterados)

O Claude Code detalha cada um em `contrato_json.md` seguindo as convenções gerais, e sobe a versão do contrato para **2.0**.

| Arquivo | Grão | Observação |
|---|---|---|
| `cubo_faturamento.json` | semana × segmento × departamento | só métricas que somam |
| `kpis_filtrados.json` | período × subconjunto de segmentos × departamento (todos ou 1) | métricas que não somam |
| `departamentos_ficha.json` | departamento | atributos do radar (valor + percentil), participação, variação, dinheiro em risco |
| `departamentos_segmento.json` | subconjunto de segmentos × departamento | atributos do radar para a comparação da direita |
| `subcategorias.json` | departamento × commodity (top 10) | |
| `cesta_departamentos.json` | subconjunto de segmentos × par de departamentos | suporte, confiança, lift, cestas, amostra_pequena |
| `cesta_subcategorias.json` | subconjunto de segmentos × par de commodities (só departamentos ≥10%) | idem |
| `lista_acao.json` | cliente em risco | o CSV é gerado no navegador a partir deste arquivo |
| `clientes/*.json`, `clientes_indice.json` | — | **removidos** (a Ficha do Cliente saiu) |

Orçamento: o carregamento inicial continua abaixo de 1,5 MB. Se o cubo estourar o limite, separe em um arquivo por segmento e carregue sob demanda.

## 7. Validação (acréscimos à reconciliação)

- Para cada período, a soma do cubo com todos os segmentos e todos os departamentos = faturamento dos KPIs.
- Soma do faturamento dos 4 segmentos isolados = faturamento com "todos" (o segmento é exclusivo por cliente).
- `kpis_filtrados`, com todos os segmentos e todos os departamentos = os KPIs atuais.
- Para 10 pares sorteados (semente fixa), recalcular suporte, confiança e lift direto das tabelas de origem, com SQL independente.
- Radar: percentis entre 0 e 100 e 6 atributos em cada departamento.
- Tela: cross-filter funcionando (clique filtra, segundo clique limpa, Ctrl + clique soma), etiquetas de filtro ativo, troca de aba mantendo os filtros, CSV baixando com as colunas certas.

## 8. Fora deste redesenho
- A aba Lojas (próxima fase) e a aba Produtos (fase seguinte).
- `causal_data`.
- Share de gôndola e ruptura, que não existem na base.

## 9. Correções ao aplicar (2026-10-22, decisões do usuário; detalhe na spec, seção 6)
- **Memória:** `memory_limit = 1GB` e `threads = 2`, e não 2 GB: o notebook tem 3,9 GB no total. Pico medido: cerca de 200 MB por etapa.
- **Penetração:** a do RAG (clientes com compra no período, nas lojas comparáveis), e não "% dos clientes ativos", para não haver duas definições.
- **Sem segmento:** 79 clientes sem compra nas 26 semanas não têm segmento. Entram em "todos", sem chip; a regra 7 vira "4 segmentos + sem segmento = todos".
- **Lista de ação:** faixas alta e média (464 clientes); faturamento em risco = probabilidade × faturamento em 26 semanas.
- **Matriz de afinidade:** os 5 maiores departamentos mais os filtrados; amostra pequena com menos de 30 compradores.
