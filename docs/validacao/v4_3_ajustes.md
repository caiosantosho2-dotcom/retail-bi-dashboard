tudo verde

# Validação: v4.3, correções e remoção dos "maneirismos de IA" (25/11/2026)

Base: `040c15f100e0` · Contrato: 5.1 · Lakehouse: `9086214`

| Camada | Resultado |
|---|---|
| Dados | Nenhum dado, JSON, contrato ou conta mudou (só apresentação). `python -m unittest tests.test_importar_lakehouse tests.test_versionar_site`: 23/23 |
| Testes de unidade | `node --test tests/decisao_textos.test.mjs`: 15/15 |
| Tela | Console: 0 erros e 0 avisos em todas as execuções, nas 3 abas e na Metodologia · `tests/v4_1_tela.js` 7/7 em 1440×900 e 7/7 em 390×844 · `tests/gestos.js` 10/10 alvos em 1440×900 e 10/10 em 390×844 · `tests/v4_3_ajustes.js` (novo) 3/3 abas em 1440×900 e 3/3 em 390×844, cada uma nos 4 períodos |
| Contraste | `check_contrast.py`: 45/45 pares · teste de tela: todo texto visível (HTML e gráficos) a 4,5:1 ou mais, nos 4 períodos e nos 2 tamanhos |
| Repositório | Só arquivos de `site/`, `tests/`, `docs/`, `README.md` e a skill de design. Nenhum dado bruto, `config.yaml` ou chave |
| Pendências | Revisão visual pelo Caio (sem capturas nesta fase, como pedido) |

**Como rodou.** O Playwright MCP caiu no começo da sessão. Os testes de tela rodaram pelo executor `tests/rodar_playwright.cjs`,
que é o Playwright 1.64.1 local com o Chromium sem janela. Ele roda o mesmo arquivo de teste que o `browser_run_code_unsafe` do
MCP e registra o console (erros, avisos, erros de página, requisições que falharam e respostas 4xx/5xx). Cada execução abre um
navegador novo, sem cache. O servidor usado foi o que já estava na porta 8000, e nenhum processo foi encerrado. Nenhuma captura
de tela foi tirada.

## Itens 1 a 26

| # | Antes | Depois | Para onde foi a informação | Conferido por |
|---|---|---|---|---|
| 1 | "Dinheiro em risco" mostrava "null" com "Em pausa" sozinho | Mostra o valor e, sem nulo, a frase "Em pausa fica fora do modelo de risco" | Nada foi apagado. **Causa: código, não dado.** `corpo.replaceChildren(..., soPausa ? el(...) : null)`: o `replaceChildren` do navegador escreve `null` como texto (o `el()` filtra nulos, ele não). O JSON tem 401 linhas e 0 nulos; nada depende do lakehouse | `v4_3_ajustes.js` item1 nos 4 períodos e com "Em pausa" sozinho; título = `fmt.usd` do JSON |
| 2 | Rótulo do último ponto cortado ("US$ 72,3 n") | Margem direita de 104 px; o rótulo cabe inteiro | — | item2: borda direita do rótulo ≤ largura do gráfico, Visão Geral e Categorias, 4 períodos |
| 3 | Colunas da tabela de marcas fora da linha do departamento | Todas as células com `vertical-align: middle`; barra e % de marca própria num só bloco alinhado | — | item3: meio da linha de texto de cada coluna a ±1 px do nome do departamento, em todas as linhas |
| 4 | Texto cinza-claro em vários pontos; "Limpar tudo" desabilitado a 45% de opacidade | Rótulos de "Faturamento por departamento" e nomes da tabela de marcas em `--text-primary`. Rodapé, pares e rótulos de seção em `--text-secondary`. "Limpar tudo" desabilitado em `--text-muted` (7,09:1), sem opacidade. Partes de barra fora da seleção pintadas com a cor já clara e opacidade 1, para o rótulo não herdar a opacidade (antes: 0,35 × 0,35) | — | "comuns": todo texto visível do HTML com a opacidade real a ≥ 4,5:1; gráficos: todo rótulo ≥ 4,5:1 sobre o fundo real (dentro da barra, sobre a barra), com e sem segmento ligado |
| 5 | Segmentos com verde (mudança sem commit da v4.2) e azul e lavanda lado a lado | Fiéis `#4349E6` (primária), Regulares `#EA6655` (coral, do pêssego), Esporádicos `#D470BB` (rosa), Em pausa `#4D4D50` (cinza escuro neutro). O verde sem commit foi descartado (`git restore` de `tokens.css` e dos 2 docs da v4.2) | Tabela de ΔE abaixo | item5: nenhuma cor de segmento com matiz de verde; ΔE abaixo |
| 6 | Pares de cesta em cards de frase | Tabela compacta: Se compra, Também leva, % das vezes, Vezes mais que o normal, Cestas. Em "Todos os departamentos", uma coluna discreta "Departamento". Em Cestas & Marcas, com segmento ligado, também "Vs. todos os clientes" | O departamento de cada subcategoria (Cestas & Marcas) e os números exatos ficam no tooltip da linha; lift e confiança, no ⓘ | item6: cabeçalhos exatos nas duas abas; sem coluna de departamento com um departamento escolhido |
| 7 | "Dos 100 primeiros, 32,0% pausaram de fato, contra 28,0% pela regra simples. O modelo ganha." | "Dos 100 primeiros, 32% pausaram de fato, contra 28% pela regra simples." Com a regra simples na frente, "A regra simples ganha." (ex.: valor em N = 100); empate, "Empate." | Quem ganha em cada capacidade continua no ⓘ | item7: as 12 combinações; `decisao_textos.test.mjs` |
| 8 | Caixa-alta em Capacidade, Objetivo, Esta semana, No teste histórico, Ordenar, Quem compra, Defender primeiro, Vs. ano anterior, Período, Segmento atual do cliente | Texto normal, peso 600. Caixa-alta só nos rótulos dos KPIs | — | item8 e "comuns": o único elemento com `text-transform: uppercase` é `.kpi__rotulo` |
| 9 | Cadeias com "·" (rodapé, tooltips, lista, risco, pares, ⓘ, Metodologia); "×" como texto | Nenhum "·". "×" de texto virou "vs." ("Própria vs. nacional", "Participação vs. crescimento", "Curva ROC do modelo de risco de pausa vs. regra simples"). Fica só o "×" de multiplicador ("11×", "× 100") | — | "comuns": 0 "·" e nenhum "×" fora de número no texto visível, 4 períodos, 2 tamanhos; Metodologia também |
| 10 | Etiquetas "todos os clientes" (Top 10 subcategorias), "todas as lojas" (segmentos, tempo e departamentos na base) | Saíram. Ficam as que mudam a leitura: "N lojas comparáveis", "⚠ poucos pares no período", "crescimento: lojas comparáveis", "fixo: últimas 26 semanas", "última semana da base" | ⓘ do card ("não segue o filtro de segmento", "Todas as lojas") | "comuns": nenhuma etiqueta com "todos os clientes" ou "todas as lojas" |
| 11 | Subtítulo do CRM "Mostra quem tende a pausar, não quantas pausas o contato evitaria." | Sem subtítulo | Primeiro parágrafo do ⓘ do CRM | item11 |
| 12 | "foto da semana 101", "Faturamento de 26 s em jogo", "recorte", "lift", "Fornec. p/ 80%", "Maior", "sem venda em 26 sem." | "última semana da base" (a semana 101 é a `semana_fim` da base no manifest), "Faturamento de 26 semanas em jogo", "período e segmento", "vezes mais que o normal", "Fornecedores para 80% do faturamento", "Maior fornecedor", "sem venda em 26 semanas" | "lift", "confiança", "suporte" e "foto" ficam no ⓘ e na Metodologia | item12 e "comuns": nenhum desses termos no texto visível |
| 13 | "214 lojas comparáveis" repetido em 5 KPIs | Uma linha acima dos KPIs: "Variação contra o ano anterior em 214 lojas comparáveis" (123 em 4 semanas, 160 em 13; na base, "sem ano anterior"). "sem filtro de loja" continua só no KPI de clientes ativos | — | item13. O número é o mesmo para todo filtro do período (conferido em `kpis_filtrados`: 123, 160, 214) |
| 14 | Mix do CRM listava segmentos com 0; a lista de "Faturamento por segmento" repetia a % da barra | Mix só com quem tem clientes; um só, "Todos os 100 são Esporádicos". Na lista de segmentos, a % aparece só quando a parte da barra é estreita demais para o rótulo (< 8%). Em "Quem compra", a legenda segue a mesma regra | A % das partes pequenas continua na lista; todas estão no tooltip e na tabela do leitor de tela | item14 nas 12 combinações; item14segmento |
| 15 | ⇄ ao lado dos departamentos, com legenda | Sem ⇄ e sem legenda | ⓘ da lista: "Têm pares de cesta confiáveis (200+ cestas) neste período e segmento: …" | item15 |
| 16 | "Rede de cestas: o que vai junto" | "O que vai junto na cesta" | — | item16 |
| 17 | −US$ 9.201,43 na lista; 32,0%; US$ 5.987,85 na frase | Blocos de decisão e listas: US$ com até 1 casa e "mil"/"mi" (−US$ 9,2 mil, US$ 6 mil, US$ 691). Participação e precisão sem decimal (32%; abaixo de 1%, uma casa: 0,4%). Variação com 1 casa | O valor com centavos fica no `title` e nas tabelas detalhadas (quadrante, departamentos) | item17 e `v4_1_tela.js`, comparados pelo mesmo `fmt` do site |
| 18 | Capacidade, Objetivo e Ordenar em pílulas; "Limpar tudo" em pílula | Controle segmentado (`controleSegmentado`); "Limpar tudo" como link de texto | — | item18; "comuns": nenhuma pílula fora dos filtros |
| 19 | "Alto contraste" como pílula na linha das abas | Botão com ícone SVG embutido no canto superior direito, `aria-label` "Alto contraste: texturas nos gráficos, além da cor" e `aria-pressed` | — | item19 |
| 20 | Botão "Tabela" em todos os gráficos | Só no quadrante e em "Faturamento por departamento" | Nos outros, a tabela continua na página como `sr-only` (leitor de tela) e o gráfico fica `aria-hidden` | item20 nas 3 abas; Metodologia: 3 tabelas `sr-only`, 0 botões |
| 21 | Legendas em traço (ECharts) e em bolinha (HTML) | Bolinha em todas: `icon: 'circle'` no tema e a legenda de cor da rede em bolinhas | — | item21 |
| 22 | Nomes cortados com "…" (lista, botão de departamento, eixo das subcategorias, rede com 18 letras) | Quebra de linha; nome completo também no tooltip. Nenhum nome traduzido ou renomeado | — | "comuns": nenhum elemento com `text-overflow: ellipsis`; eixo com `overflow: 'break'` |
| 23 | Linha do tempo de Categorias com 176 px | 300 px, a mesma da Visão Geral. A aba passa a rolar na vertical em 1440×900 (1.215 a 1.317 px), como autorizado; nunca para o lado | — | item23: 300 px; "comuns": sem rolagem horizontal |
| 24 | "Selec." e "Índice" sempre, com "—" sem segmento | Só com segmento ligado (decisão aprovada) | ⓘ: "Ligue segmentos para comparar…" | item24 com e sem segmento |
| 25 | Rede no meio da aba; rótulo nos 15 maiores nós e nos vizinhos; `hideOverlap` escondia alguns | Rede no fim da aba (12 colunas). Rótulo só nos grupos de departamento e nos 5 maiores nós (BEEF, CHEESE, FLUID MILK PRODUCTS, FRZN MEAT/MEAT DINNERS, SOFT DRINKS), com o lado escolhido para nada se sobrepor (`posicionarRotulos`). No celular, só os grupos, e um nome que encosta noutro sobe ou desce uma linha | Os outros nós, o selecionado e os vizinhos: tooltip e título do card de pares | item25: rótulos = os 5 maiores (celular: nenhum), todos os grupos, 0 pares de rótulos sobrepostos, 4 períodos |
| 26 | Rodapé com fonte, origem, período, data, base, commit em cadeia com "·" | "Fonte: Dunnhumby, The Complete Journey", o link da Metodologia e "Sobre os dados" | "Sobre os dados" (`<details>`) abre com origem, período, gerado em, base e commit do lakehouse | item26 |

## Cores dos segmentos (item 5)

Pedido: Fiéis na primária, Regulares em coral do pêssego (~`#E0795F`), Esporádicos em rosa escurecido (~`#C2639F`) e Em
pausa em cinza escuro neutro (~`#6B6E80`), com ΔE mínimo de ~30 entre todos os pares, também na simulação de daltonismo.

Os tons pedidos ficavam abaixo de 30 em três pares: Esporádicos × Em pausa na deuteranopia (10,8), Regulares × Esporádicos
na tritanopia (18,9) e Fiéis × Em pausa na tritanopia (24,8). Além disso, `#E0795F` dava 2,97:1 no branco. A busca ficou
perto dos tons pedidos, sem mudar a primária e exigindo 3:1, e levou o pior par a 31,0. Distância ΔE (CIE76), simulação
de Machado com severidade 1,0:

| Par | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|
| Fiéis × Regulares | 116,2 | 123,4 | 101,9 | 100,0 |
| Fiéis × Esporádicos | 61,1 | 68,9 | 49,0 | 68,8 |
| Fiéis × Em pausa | 91,5 | 81,7 | 76,8 | **31,0** |
| Regulares × Esporádicos | 57,1 | 57,8 | 55,4 | 33,2 |
| Regulares × Em pausa | 67,0 | 51,7 | 33,3 | 78,6 |
| Esporádicos × Em pausa | 59,5 | 34,4 | 37,5 | 52,9 |

"Sem segmento" (`--seg-outros` `#6B6F78`) não é segmento, mas divide a barra de faturamento com eles. Contra o novo cinza de
Em pausa ele fica em ΔE 14, e nenhum cinza chega a 30 do rosa na deuteranopia. Por isso ele leva **listras** (`LISTRAS` em
`tema.js`), além do nome na lista, e nunca é distinguido só pela cor.

## Tabela de contraste final

Texto (mínimo 4,5:1) e marcas gráficas (mínimo 3:1), `check_contrast.py`: 45/45.

| Texto | Painel `#FFFFFF` | Página `#F5F5FA` | Hover `#EEEEF6` |
|---|---|---|---|
| Principal `#1A1A2E` | 17,06 | 15,70 | 14,78 |
| Secundário `#4A4C60` (rodapé, pares, seções) | 8,42 | 7,75 | 7,30 |
| Mudo `#55576B` ("Limpar tudo" desabilitado, notas) | 7,09 | 6,52 | 6,14 |
| Subiu `#1E7B3A` | 5,32 | 4,89 | 4,61 |
| Caiu `#B42318` | 6,57 | 6,05 | 5,70 |
| Aviso `#8A5A00` | 5,93 | 5,45 | 5,14 |
| Link e aba ativa `#4349E6` | 6,30 | 5,80 | — |
| Branco sobre a primária (botão ligado, controle segmentado) | 6,30 | — | — |

| Marca gráfica no branco | Contraste | Rótulo por cima (`textoSobre`) |
|---|---|---|
| Fiéis `#4349E6` | 6,30 | branco 6,30 |
| Regulares `#EA6655` | 3,22 | texto principal 5,30 |
| Esporádicos `#D470BB` | 3,07 | texto principal 5,55 |
| Em pausa `#4D4D50` | 8,42 | branco 8,42 |
| Sem segmento `#6B6F78` (listrado) | 5,04 | branco 5,04 |
| Série secundária `#8A7AD6` | 3,60 | — |
| Ano anterior `#6E7085` | 4,86 | — |
| Eixo `#8E90A6` | 3,14 | — |

Parte de barra fora da seleção: cor misturada a 35% com o branco e opacidade 1; o rótulo é escolhido sobre essa cor (o teste
de tela confere o contraste real de todo rótulo dentro de barra, com segmento ligado).

## Decisões tomadas nesta fase

- **Item 17, "% de desconto" do KPI:** é uma taxa, não participação, e fica com 1 casa.
- **Item 17, dinheiro abaixo de US$ 1 mil** nos blocos e listas: sem centavos (US$ 691), o que vale também para o eixo e as
  listas que usam `fmt.usdGrande`. Participação abaixo de 1% fica com uma casa (0,4%), para não virar "0%".
- **Item 17, espaço antes de "mil" e "mi":** é o espaço não separável que o `Intl` põe, para o número não quebrar a linha longe
  da unidade. Os testes usam o mesmo caractere.
- **Item 18, pílulas:** o botão "Filtros" do celular, que abre a barra lateral, conta como filtro e continua pílula. Botão
  "Tabela" e controles com canto de 6 px (`--radius-control`); etiquetas dos cards com 4 px (`--radius-tag`), como aprovado.
- **Item 25, celular:** em gráfico com menos de 600 px de largura não há rótulo de nó (só os grupos). Os 5 nomes ficam no
  tooltip, como antes da v4.3.
- **Categorias com rolagem vertical:** a lista de departamentos rola por dentro e não estica a aba; quem dita a altura é a
  coluna do meio.
- **Opacidade dos nós da rede:** 0,95 → 1, para o rótulo não herdar a transparência.

## Testes atualizados (só onde o texto mudou de lugar, e os números pelo item 17)

- `tests/decisao_textos.test.mjs`: a frase sem "O modelo ganha." e com os números pelo formatador curto. O gabarito da gold
  continua conferido no próprio teste (0,32 e 0,28; US$ 5.987,85 e 6.600,08). Notas com "período e segmento" no lugar de
  "recorte". Destaques no formato curto (−US$ 9,2 mil), com o exato ainda conferido. Dois testes novos: formato curto e
  conclusão nas 12 combinações.
- `tests/v4_1_tela.js`: a frase, os destaques e o faturamento em jogo são comparados pelo `fmt` do site (`formatar.js`).
- `tests/v4_3_ajustes.js` (novo): os itens 1 a 26 e as conferências comuns, por aba, nos 4 períodos.
- `tests/rodar_playwright.cjs` (novo): o executor local.
