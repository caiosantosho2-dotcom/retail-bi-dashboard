# Redesenho v3 — "menos é mais"

> Documento de mudança. Aplicar em `docs/spec_dashboard.md`, no contrato de dados e nas skills. A spec continua sendo a fonte única. Este arquivo registra o que muda e por quê.
> Marcação: **[Caio]** = decisão do Caio; **[Ajuste]** = recomendação de boas práticas de BI que refina ou substitui a ideia original, já aceita.

## Princípio deste redesenho

Painel de BI serve para **acompanhar**, não para **analisar**. Cada aba responde a uma pergunta de negócio e cada gráfico passa no **teste dos 5 segundos**: quem olha consegue dizer o que ele mostra. Análise estatística profunda não fica na tela principal.

## Estrutura final: 4 abas (antes eram 6)

| Aba | Pergunta | Origem |
|---|---|---|
| **Visão Geral** | Como está o negócio e o que puxou a variação? | ajustada |
| **Categorias** | Como está cada departamento e o que se compra junto dentro dele? | ex-"Ficha da Categoria" |
| **Clientes & Lojas** | Onde estão os nossos clientes, quais lojas pesam e onde está o risco? | junção de Segmentos + Lojas **[Caio]** |
| **Cestas & Marcas** | Que produtos andam juntos e quanto pesa a marca própria? | ex-"Produtos", enxuta |

**Laboratório:** sai das abas **[Caio]**. **[Ajuste]** O código não é apagado. Ele fica acessível por um link discreto no rodapé, **"Metodologia e validação"**, que abre a página atual do Laboratório separada do painel. Custo zero, e um recrutador técnico encontra o rigor.

---

## 0. Correções que valem para o painel inteiro (fazer primeiro)

### 0.1 Modelo único de seleção (bug recorrente) [Caio]
Hoje, clicar de novo num item selecionado não desfaz a seleção: lista de departamentos, bolinhas do mapa, rede de cestas. Corrigir **num módulo só** (`site/js/selecao.js`), usado por todos os gráficos e listas:
- **clique** num item = seleciona;
- **clique no item já selecionado** = desfaz e volta ao total;
- **Ctrl + clique** = soma ou tira da seleção;
- **Esc**, ou clique no fundo vazio do gráfico = limpa a seleção daquele gráfico;
- o item selecionado fica destacado, e os outros ficam com opacidade de 0,35;
- toda seleção que vira filtro aparece como etiqueta removível na linha de filtros.

Teste obrigatório na validação: os 4 gestos acima em **cada** gráfico clicável.

### 0.2 Filtro de período em todas as abas [Caio]
- O período passa a valer em todas as abas.
- **[Ajuste]** O que **não** muda com o período continua fixo, com uma nota curta:
  - o **segmento do cliente** (calculado na janela de 26 semanas, é atributo do cliente);
  - o **risco de pausa** (é uma foto do momento);
  - a **matriz de migração** (compara dois semestres fixos).
- **[Ajuste]** Pares de cesta com "Últimas 4 semanas": há poucas cestas e muitos pares cairiam abaixo do mínimo de 200. Nesse período, os pares mostram o aviso "período curto: poucos pares confiáveis" em vez de esconder o filtro.
- Os dados por período são carregados sob demanda, por aba e por período, para não estourar o orçamento.

### 0.3 Conferir o número "136" antes de qualquer outra coisa [Ajuste]
O Laboratório diz que o modelo **acertou 136 das 283 pausas** no teste histórico (verdadeiros positivos). A Visão Geral e o post do LinkedIn dizem que **"136 clientes ativos devem pausar nas próximas 8 semanas"** (previsão). A lista de ação fala em **464 clientes (243 com risco alto)**.

Explicar, citando o código do RAG, de onde vem cada número. Se o 136 da previsão for, na verdade, o 136 do teste, **registrar em `pendencias_v3.md`** como pendência prioritária: o texto do card e o post precisam ser corrigidos, e quem decide é o Caio. Não alterar o texto agora.

---

## 1. Visão Geral

| Item | Decisão |
|---|---|
| KPIs, filtros e linha semanal de 52 semanas | mantém |
| Mapa de calor dia × hora | **sai [Caio]** |
| No lugar dele | **[Ajuste]** "**O que puxou a variação**": barras horizontais com a diferença em US$ contra o ano anterior por departamento (lojas comparáveis), ordenadas, verde para alta e vermelho para queda, com rótulo do valor e da %. Responde "de onde veio o crescimento ou a queda", que é a pergunta de quem compara ano contra ano. |
| Faturamento por departamento | mantém, e **[Ajuste]** ganha um **marcador do ano anterior** em cada barra (um traço fino), para comparar ano contra ano sem precisar de um segundo gráfico. |
| Card "O que as análises mostram" | **[Ajuste]** sai. As frases são conclusões fixas, que não respondem aos filtros, e os links apontavam para o Laboratório. No lugar, **"Faturamento por segmento"**: barra 100% empilhada com a % e o valor de cada segmento, respondendo a todos os filtros. |

Por que a ideia original foi ajustada: o Caio pediu barras **verticais** de departamento com o ano contra ano. Com 10 nomes longos no eixo X, os rótulos ficariam inclinados e ilegíveis. A boa prática é usar barras horizontais para categorias com nome. E a página já tem um gráfico de departamentos, então dois gráficos mostrando "tamanho" ficariam redundantes. O par "tamanho (com marcador do ano anterior)" e "contribuição para a variação" responde às duas perguntas sem repetir.

---

## 2. Categorias (ex-Ficha da Categoria)

| Item | Decisão |
|---|---|
| Lista de departamentos | mantém. **Clique de novo desfaz a seleção e volta ao total** (0.1) **[Caio]**. Sem departamento selecionado, a ficha mostra "Todos os departamentos". |
| "Compra junto com" | **ganha destaque [Caio]**: sobe para a área central, maior. |
| Pares de **departamento** no "Compra junto com" | **saem [Caio]**. Os lifts entre departamentos ficam em torno de 1,1, praticamente o acaso. Os de subcategoria chegam a 10–15. |
| Pares de **subcategoria** | **[Caio]** viram o conteúdo principal do bloco: os 10 pares de maior lift **dentro do departamento selecionado**, para **todos** os departamentos com cestas suficientes. A regra dos 10% do faturamento cai. |
| Como mostrar o par | **[Ajuste]** Lift é palavra técnica. Mostrar como **"Quem compra BLEACH também leva LAUNDRY ADDITIVES em 38% das vezes · 11× mais que o normal"**, com a confiança em % e o lift como "N× mais". O valor técnico do lift fica no tooltip e na tabela. |
| Faturamento semanal | **encolhe [Caio]**: vira um gráfico baixo (sparkline com eixo) abaixo do cabeçalho da ficha. |
| Radar, tabela de comparação, top 10 subcategorias, dinheiro em risco | mantém. |

Mínimo de cestas por par: continua **200**. Com segmentos ligados, o cálculo é feito só com as cestas dos clientes daqueles segmentos.

---

## 3. Clientes & Lojas (junção de Segmentos + Lojas) [Caio]

### Sai
- Matriz de afinidade segmento × departamento **[Caio]**.
- Evolução semanal por segmento **[Caio]**.
- Lista de clientes em risco como bloco principal **[Caio]**.
- Mapa com uma bolinha por loja **[Caio]**.
- Faturamento semanal por região (mapa de calor) **[Caio]**.
- Ranking de crescimento **[Caio]**, substituído pelo ranking com troca de métrica abaixo.

### Fica / entra
**Linha 1: os 4 cards de segmento** (mantém). Clicáveis, ligados ao filtro global.

**Linha 2, três blocos:**
1. **Roda dos segmentos** (mantém) **[Caio]**. **[Ajuste]** O botão "Migração" continua como segunda visão, não como padrão. É a única análise de evolução de clientes que sobrou, e é fácil de ler.
2. **Regiões: quem compra em cada área** **[Caio]**. Barras 100% empilhadas, uma por região, com a % de cada segmento e o faturamento da região escrito ao lado. Clicar numa região filtra a aba.
   - **[Ajuste]** Mantenha o **número de regiões que a inferência encontrou** (hoje são 6, mais "lojas pequenas"), em vez de forçar 4. Forçar um número muda o resultado só para caber no gráfico. Se o Caio quiser menos regiões, que a inferência seja refeita com esse objetivo e a qualidade comparada (% de clientela em comum).
   - Continua o aviso: "região inferida pela clientela em comum, não é geografia".
   - **[Ajuste]** O mapa de bolinhas (que o Caio gostou) pode ficar como visão alternativa deste bloco, mas com **uma bolha por região**, não por loja.
3. **Perfil das lojas pela clientela** **[Caio]**. Cada loja recebe o rótulo do segmento em que está **mais acima da média da rede**: índice = % do segmento na loja ÷ % do segmento na rede × 100. Exemplo: "Loja de perfil Esporádico".
   - Mostra quantas lojas e quanto faturamento há em cada perfil (4 barras).
   - Lojas com menos de 30 clientes ficam como "amostra pequena", sem perfil.
   - Clicar num perfil filtra o ranking.

**Linha 3, dois blocos:**
1. **Ranking de lojas, top 10**, com um seletor de métrica **[Caio + Ajuste]**:
   - **Faturamento**: barra empilhada por segmento;
   - **Ticket médio**: barra simples (o ticket não se soma por segmento);
   - **Valor em risco**: barra empilhada por segmento **[Caio]**. É o faturamento de 26 semanas dos clientes na faixa alta de risco, aberto por segmento;
   - **Crescimento**: barra simples, verde ou vermelha, só lojas comparáveis.

   Responde aos filtros de segmento, região e perfil.
2. **Ficha da loja** (mantém) **[Caio]**. Abre ao clicar numa loja do ranking. Mantém a **barra Loja × Rede** **[Caio]**, os KPIs e a árvore de vendas (faturamento = clientes × idas × ticket).
   - **[Ajuste]** Para caber em 1440×900, a ficha abre como **painel lateral** por cima da linha 3 e fecha com ✕ ou Esc.
   - **[Ajuste]** Dentro dela, o botão **"Baixar clientes em risco desta loja (CSV)"** guarda a utilidade da antiga lista de ação: o CRM baixa só o que importa.

**Regra de dados obrigatória:** um cliente compra em várias lojas. Para "valor em risco por loja" e "perfil da loja", cada cliente é atribuído à sua **loja principal** (a de maior gasto nas 26 semanas). A regra deve estar escrita na spec e numa nota no bloco. A reconciliação confere que a soma do valor em risco das lojas é igual ao total em risco.

---

## 4. Cestas & Marcas (ex-Produtos)

| Item | Decisão |
|---|---|
| Curva ABC | **sai [Caio]**. **[Ajuste]** O fato útil vira uma linha de texto no topo da aba: "101 subcategorias fazem 80% do faturamento". |
| Rede de cestas | mantém e ganha interação **[Caio]**. Clique num nó: **acende os vizinhos** (o ECharts tem isso nativo, com `emphasis.focus: 'adjacency'`) e apaga o resto; vira o filtro de subcategoria da aba; clique de novo desfaz (0.1). **[Ajuste]** Os rótulos aparecem só nos 15 maiores nós e nos vizinhos do nó selecionado, para não virar um emaranhado. |
| Pares característicos | **[Caio]** respondem **ao mesmo tempo** ao nó selecionado e ao filtro de segmento. Com um nó selecionado, mostram os pares que contêm aquela subcategoria, ordenados por lift, com a frase de confiança da seção 2. |
| Marca própria e fornecedores | mantém e **passa a responder ao filtro de segmento [Caio]**. Precisa de dados por subconjunto de segmentos. Clicar numa linha filtra o departamento (já existe), e clicar de novo desfaz. |

---

## 5. Dados e contrato

- Contrato sobe para a **versão 3.0**.
- Arquivos novos ou alterados:
  - contribuição para a variação por departamento × período;
  - faturamento do ano anterior por departamento × período;
  - faturamento por segmento × filtros;
  - pares de subcategoria dentro de cada departamento × subconjunto de segmentos × período;
  - regiões × segmento;
  - perfil das lojas;
  - ranking de lojas (4 métricas) × filtros;
  - valor em risco por loja × segmento;
  - clientes em risco por loja (para o CSV);
  - marca própria × subconjunto de segmentos.
- Arquivos que saem: afinidade, evolução semanal por segmento, calor dia × hora, calor região × semana, curva ABC, ranking de crescimento, insights.
- Orçamento: abertura do painel abaixo de 1,5 MB. O resto carrega sob demanda, por aba e por período.

## 6. Validação (acréscimos)

- Os 4 gestos de seleção (0.1) em **todos** os gráficos e listas clicáveis, com clique real via Playwright.
- O período alterando os gráficos de todas as abas, exceto os itens fixos de 0.2, que devem mostrar a nota.
- Soma da contribuição para a variação dos departamentos = variação total do faturamento.
- Soma do valor em risco por loja = total em risco. Soma dos segmentos dentro de cada loja = valor da loja.
- Perfil da loja: recalcular os índices de 10 lojas sorteadas com SQL independente.
- Teste dos 5 segundos: para cada gráfico, o relatório da fase traz **uma frase** dizendo o que ele mostra. Se não der para escrever a frase, o gráfico deve ser revisto.

## 7. Ordem de execução (sem supervisão; o Caio revisa tudo no fim)

A execução roda **sem parar entre as etapas**. O Caio revisa o resultado completo depois. Cada etapa termina com validação, relatório em `docs/validacao/`, **commit próprio** (para dar para voltar etapa por etapa) e o servidor local encerrado. Em seguida, começa a próxima etapa.

1. **V0:** conferência do número 136 (0.3). Só investigação, registrada em `docs/mudancas/pendencias_v3.md`. Não altera nenhum texto sobre o 136.
2. **V1:** modelo único de seleção (0.1) + filtro de período global (0.2) + remover o Laboratório das abas, com o link no rodapé.
3. **V2:** Visão Geral.
4. **V3:** Categorias.
5. **V4:** Clientes & Lojas.
6. **V5:** Cestas & Marcas.
7. **V6, NÃO executar agora:** publicação no GitHub Pages e README com as 4 abas. Só depois da aprovação do Caio. Nada de `git push`.

**Dúvidas e conflitos durante a execução:** não parar. Escolher a opção mais conservadora (a que muda menos e não inventa número), registrar em `docs/mudancas/pendencias_v3.md` (a dúvida, o que foi escolhido e o que o Caio precisa decidir) e seguir.

**Etapa que falhar 3 vezes na validação:** registrar em `pendencias_v3.md`, fazer commit do que estiver estável e seguir para a próxima.

**No fim:** escrever `docs/mudancas/resumo_v3.md` com o que foi feito em cada etapa, os commits, o resultado da V0, as decisões tomadas sem o Caio, as pendências e como abrir o painel localmente.
