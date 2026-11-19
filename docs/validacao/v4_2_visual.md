# Validação: v4.2, ajuste visual, 19/11/2026

Base: `040c15f100e0` · Contrato: 5.1 · Dados: os mesmos da v4.1 (nenhum JSON mudou) · Branch: `v4-2-visual`, com merge na `main` · Sem push

| Camada | Resultado |
|---|---|
| Contraste | ✅ `check_contrast.py`: 45 de 45 pares aprovados, todo texto a 4,5:1 ou mais (tabela abaixo) · na tela, 0 textos abaixo de 4,5:1 contra o fundo real em 3 abas × 4 períodos × 2 tamanhos |
| Fonte | ✅ Menor texto na tela: 14 px (mínimo pedido: 13) · pesos usados: 500 e 600 · gráficos: eixos e rótulos 13 px, legenda e tooltip 14 px, todos lidos dos tokens |
| Tela | ✅ Console: 0 erros e 0 avisos · `tests/v4_1_tela.js` 7/7 em 1440×900 e 7/7 em 390×844 · gestos 10/10 alvos em 1440×900 e 10/10 em 390×844 |
| Números | ✅ Tela = antes: 18 de 18 recortes idênticos (3 abas × 4 períodos + segmento Fiéis + limpar), 10.639 caracteres de números e etiquetas comparados com a versão `0e24271` |
| Filtros | ✅ Mesmo comportamento na lateral e no painel do celular (período, chip, busca e seleção de departamento, ✕ da etiqueta, Limpar tudo, nota de Cestas & Marcas) |
| Layout | ✅ 1440×900: Categorias e Cestas & Marcas sem rolagem (900 px), Visão Geral rola como antes · nada cortado, nada escondido por `overflow` · gráficos com a largura do contêiner (resize) · 390×844: sem rolagem horizontal |
| Metodologia | ✅ 1440×900 em 900 px, sem rolagem · 390×844 sem rolagem horizontal · 0 textos abaixo de 4,5:1 · menor fonte 14 px · console limpo |
| Testes de unidade | ✅ `decisao_textos.test.mjs` 13/13 · Python 23/23 |

Todas as conferências de tela acima rodaram na versão final de `site/` (última rodada: roteiro v4.1, gestos e checagem visual de 3 abas × 4 períodos, nos dois tamanhos, sem nenhuma falha).

**Conferência visual com capturas: não feita, por decisão do Caio (ele confere o visual depois).** O Playwright MCP não conectou nesta sessão; os roteiros do repositório rodaram com o Playwright do cache do `npx`, chamado por um script de apoio fora do repositório, na mesma página e com os mesmos passos.

## O que mudou

1. **Tema claro.** Só os valores em `site/css/tokens.css`: página `#F5F5FA`, painéis `#FFFFFF`, bordas `#E3E3EC`. O layout (abas, ordem dos blocos, cards) é o mesmo.
2. **Paleta.** Primária `#4349E6` (aba ativa, botões pressionados, links, foco, série principal), lavanda `#8A7AD6` (séries secundárias), rosa `#D6A6C4` e pêssego `#FDBFB2` só como origem de fundos. Nenhuma cor fora dos tokens: o `tema.js` só lê, e a sombra do popover virou `--shadow-popover`.
3. **Segmentos** (`SEG_CORES`): Fiéis = primária, Regulares = lavanda, Esporádicos = rosa escurecido `#C2639F`, Em pausa = pêssego escurecido `#BE4F37`.
4. **Escalas** refeitas a partir da primária (sequencial) e da primária × rosa escurecido (divergente, neutro `#E4E4EC` no 100).
5. **Ano anterior:** tracejado em `#6E7085` (4,86:1), não mais no cinza de texto.
6. **Quadrante:** cada área com o fundo do seu quadrante (Investir primária clarinha, Manter lavanda clarinha, Defender rosa clarinho, Rever pêssego clarinho) e o nome no canto, como antes. Os pontos continuam na primária.
7. **Texto:** principal `#1A1A2E`, secundário `#4A4C60`, notas/eixos `#55576B`. Não existe mais cinza-claro.
8. **Fonte:** texto 16 px, notas e rótulos 14 px, peso 500; um único tema do ECharts (`varejo-claro`) com os tamanhos dos tokens. Os 25 `fontSize` escritos à mão nas abas (10 a 12 px) passaram a usar `FONTE.*`.
9. **Filtros na lateral:** período, segmento e departamento numa barra fixa à esquerda, com o título "Filtros"; as abas e o "Alto contraste" ficam no topo. Os ids e o `filtros.js` não mudaram. No celular (< 768 px), um botão "Filtros" abre a barra como painel; Fechar, Esc e toque no fundo fecham, e o foco volta ao botão. Um `ResizeObserver` na área de conteúdo chama o `resize` dos gráficos quando a largura muda.

## Contraste final (WCAG 2.x)

Texto: mínimo 4,5:1. Marcas gráficas e linhas: mínimo 3:1.

| Cor | Painel `#FFFFFF` | Página `#F5F5FA` | Hover `#EEEEF6` | Destaque suave `#FFF1EE` |
|---|---|---|---|---|
| Texto principal `#1A1A2E` | 17,06 | 15,70 | 14,78 | 15,49 |
| Texto secundário `#4A4C60` | 8,42 | 7,75 | 7,30 | 7,65 |
| Notas, eixos, legendas `#55576B` | 7,09 | 6,52 | 6,14 | 6,44 |
| Subiu ▲ `#1E7B3A` | 5,32 | 4,89 | 4,61 | — |
| Caiu ▼ `#B42318` | 6,57 | 6,05 | 5,70 | — |
| Aviso ⚠ `#8A5A00` | 5,93 | 5,45 | 5,14 | — |
| Link e aba ativa `#4349E6` | 6,30 | 5,80 | — | — |
| Branco sobre a primária (aba ativa, botão pressionado) | 6,30 | | | |

Tooltip: fundo branco, texto principal, 17,06:1.

| Área do quadrante | Nome do quadrante `#4A4C60` | Texto `#55576B` | Ponto (primária) |
|---|---|---|---|
| Investir `#E6E7FC` | 6,90 | 5,81 | 5,16 |
| Manter `#EEEAFA` | 7,13 | 6,00 | 5,33 |
| Defender `#F7E8F1` | 7,12 | 6,00 | 5,33 |
| Rever `#FFEAE5` | 7,28 | 6,13 | 5,44 |

| Marca gráfica no branco | Contraste | Mínimo |
|---|---|---|
| Série principal / Fiéis `#4349E6` | 6,30 | 3,0 ✅ |
| Série secundária / Regulares `#8A7AD6` | 3,60 | 3,0 ✅ |
| Esporádicos `#C2639F` | 3,76 | 3,0 ✅ |
| Em pausa `#BE4F37` | 4,81 | 3,0 ✅ |
| Outros / sem segmento `#6B6F78` | 5,04 | 3,0 ✅ |
| Ano anterior (tracejado) `#6E7085` | 4,86 | 3,0 ✅ |
| Linha do eixo `#8E90A6` | 3,14 | 3,0 ✅ |

Rótulo de % dentro das barras de segmento (a cor do texto é escolhida pelo maior contraste, `textoSobre` em `tema.js`): Fiéis branco 6,30 · Regulares texto principal 4,74 · Esporádicos texto principal 4,53 · Em pausa branco 4,81 · Outros branco 5,04.

Rosa `#D6A6C4` (2,08) e pêssego `#FDBFB2` (1,58) não aparecem como texto nem como marca: só como origem dos fundos clarinhos.

**Segmentos no daltonismo** (distância de cor ΔE, CIE76, simulação de Machado): o menor par sem simulação é 35 (Regulares × Esporádicos); com deuteranopia 35, protanopia 24, tritanopia 21. O 4º tom foi escolhido entre 7 candidatos por ficar a ΔE ≥ 26 dos outros três em todas as simulações.

**Antes (tema escuro), o que falhava:** o vermelho de "caiu" `#d03b3b` era texto pequeno a 3,59:1 no painel e 3,24:1 no tooltip. O verificador aprovava porque testava status com mínimo de 3:1.

## Decisões pequenas (minhas)

1. **4º tom dos segmentos `#BE4F37`.** O primeiro candidato, `#C8553D`, passava em 3:1, mas o rótulo branco por cima dele ficava em 4,35:1. Escureci até 4,81:1.
2. **Itens fora da seleção.** Antes, o item inteiro ficava com opacidade 0,35 e o texto caía para cerca de 2:1. Agora o texto fica em `--text-muted` (6:1 ou mais) e só as marcas (barra, ponto, nó) apagam. Vale para as listas, as tabelas e os rótulos dentro dos gráficos (quadrante, CLV, departamentos, rede). Os testes não dependiam da opacidade.
3. **Lista de departamentos dentro da barra.** Ela abre logo abaixo do botão, no fluxo da barra, não mais flutuando: a barra rola e cortaria um popover absoluto. Abrir, buscar, marcar, clicar fora e Esc funcionam como antes.
4. **Dois ajustes para o layout não mudar** com a barra lateral e a fonte maior:
   - **Bloco de CRM:** mínimo da coluna de 260 → 240 px, senão as duas seções empilhavam e o bloco ia de 424 para 810 px. Os números grandes desse bloco foram de 20 → 18 px ("US$ 8 mil" passava 5 px da coluna).
   - **Ficha de Categorias:** os 4 números passaram a se reorganizar sozinhos (`auto-fit`, colunas de no mínimo 110 px), porque não cabiam em 4 colunas de 92 px.
5. **`check_contrast.py`** (na skill) agora testa o tema claro: as 4 superfícies, os fundos do quadrante e o status a 4,5:1.
6. **Testes:** `tests/v4_1_tela.js` e `tests/gestos.js` abrem o painel "Filtros" no celular antes de clicar num filtro, como a pessoa faria. No `gestos.js`, o item de lista agora é trazido para a tela antes do clique, como já era nos gráficos. Esse defeito era antigo: a versão `0e24271` também falhava na linha de marca a 390×844.

## Pontos em aberto

1. **Rótulos do quadrante sobre pontos.** O gráfico ficou mais estreito (352 px; antes, 484) e o texto, maior. Em 4 semanas, os rótulos de destaque que passam sobre um ponto subiram de 2 para 4; em 26 semanas, de 0 para 1. Continuam legíveis (contorno branco) e o roteiro aprova (`todosVisiveis`, nenhum rótulo encostando em outro), mas está pior que antes. Vale olhar nas capturas.
2. **A Visão Geral ficou mais alta:** 1.546 px (antes, 1.308) em 1440×900, por causa da fonte maior. Ela já rolava; as outras abas continuam em 900 px.
3. **A skill `designing-dashboard-ui` ainda descreve o tema escuro.** O texto do `SKILL.md` e o `reference/tokens.css` não foram mexidos: falta a sua decisão.
4. **Uma vez o console registrou `ERR_CONNECTION_REFUSED`** num teste de gestos em 1440×900. Os dois servidores estavam no ar e o log não mostrou pedido com falha. Repetido com o registro de cada pedido, deu 0 erros e não voltou a acontecer.
5. **Um passo do roteiro v4.1 demorou 26 min** na rodada final (antes, 8 s), provavelmente por memória do notebook. O resultado foi o mesmo.

## Como repetir

```powershell
# servidor local (na pasta site)
..\venv\Scripts\python.exe -m http.server 8000 --bind 127.0.0.1
# contraste
.\venv\Scripts\python.exe .claude\skills\designing-dashboard-ui\scripts\check_contrast.py site\css\tokens.css
```

No navegador: `tests/v4_1_tela.js` (7 execuções) e `tests/gestos.js` (3 execuções), em 1440×900 e em 390×844, pelo Playwright MCP (`browser_run_code_unsafe`), como antes.

---

# Segunda etapa: textos enxutos (subtítulo curto + ⓘ)

Só apresentação: nenhum dado, JSON ou conta mudou. Nenhuma informação foi apagada: o que saiu do corpo foi para o ⓘ do card, ou para uma etiqueta curta quando muda a leitura do número. A página de metodologia não foi enxugada.

**Regras aplicadas:** título + no máximo um subtítulo de até ~10 palavras; o card não repete o estado dos filtros; um ⓘ ao lado do título (mouse, toque e teclado); avisos que mudam a leitura viram etiqueta; dicas de clique vão para o ⓘ.

**Componente ⓘ** (`site/js/componentes.js`, `info` e `definirInfo`): botão com `aria-label` "Sobre: <título>" e o texto num `role="tooltip"` ligado por `aria-describedby`. Abre com hover, foco e clique ou toque (o clique fixa); fecha com Esc (com `preventDefault`, para não limpar a seleção dos gráficos), clique fora, novo clique ou rolagem. Fica dentro da janela (até 340 px de largura; acima do botão se não couber embaixo). **Etiqueta** (`etiqueta`, `definirEtiquetas`): pílula neutra ou de aviso (⚠ em `--status-warning`, 5,93:1 no branco).

## Card a card

Os textos "antes" são os de 26 semanas, sem filtro; as variantes de outros recortes seguem o mesmo padrão.

### Visão Geral

| Card | Texto antes | Subtítulo depois | Etiqueta | O que foi para o ⓘ |
|---|---|---|---|---|
| 6 KPIs | (sem subtítulo; só "Clientes ativos" tinha ⓘ, no `title`, sem teclado) | — | — | Definição de cada KPI, tirada da spec (ticket = faturamento ÷ cestas distintas etc.), e a regra da variação (lojas comparáveis; "—" com 2+ departamentos) |
| Faturamento ao longo do tempo | "Lojas comparáveis do período (214 lojas), um ponto por semana. Tracejado: a mesma semana um ano antes. O KPI de faturamento soma todas as lojas." | "Por semana; tracejado: um ano antes" (4 s: "Por dia…"; base: "Por semana, sem ano anterior") | "214 lojas comparáveis" / "todas as lojas" | O texto antes inteiro, "o ponto não filtra" e "os valores estão na tabela" |
| Faturamento por segmento | "26 semanas, todos os departamentos, todas as lojas. O segmento é fixo (atributo do cliente, calculado nas 26 semanas). Clique para filtrar." | "Quanto do faturamento vem de cada segmento" | "todas as lojas" | Segmento fixo (26 semanas), o que é "Sem segmento", clique / clique de novo / Ctrl + clique |
| Quem o CRM deve acionar | Subtítulo "Com capacidade para 100 clientes, priorizando quem tem mais chance de pausar"; no corpo, a calibração, a nota fixa, "Foto fixa da semana 101: não muda com o período nem com o segmento. O departamento não se aplica.", a nota do teste e 6 frases, uma por capacidade | "Mostra quem tende a pausar, não quantas pausas o contato evitaria." (a nota fixa, que muda a leitura do bloco inteiro) | "foto da semana 101" | Capacidade e objetivo (a frase do antigo subtítulo), a foto fixa, a calibração, a nota do teste com o recall ou a fração do valor (antes no `title` da frase), quem ganha em cada uma das 6 capacidades e que os seletores não são filtros globais. O link "Como o modelo foi avaliado" ficou visível |
| ↳ No teste histórico | 6 frases, a escolhida em destaque | Uma frase, só a capacidade escolhida: "Dos 100 primeiros, **32,0%** pausaram de fato, contra **28,0%** pela regra simples. O modelo ganha." Em valor: "…concentravam **US$ 5.987,85**…, contra **US$ 6.600,08**… **A regra simples ganha.**" | — | (na linha acima) |
| ↳ Faturamento de 26 s em jogo | ⓘ só no `title` | — | — | O mesmo texto, agora num ⓘ acessível |
| Onde agir no mix de departamentos | "26 semanas, todos os segmentos, lojas comparáveis. Cortes: participação X (mediana) e crescimento Y (total do recorte). Departamentos com amostra pequena ficam de fora. Clique para filtrar." + o aviso longo de "Em pausa" na nota | "Participação × crescimento contra o total do recorte" | "lojas comparáveis"; com "Em pausa" junto de outros: "⚠ Com "Em pausa", o crescimento cai por construção" | Cortes, crescimento comparável, eixo logarítmico, amostra pequena fora, o que é cada quadrante e "Defender primeiro" (spec v4.1, `highlight_rank`), o aviso longo de "Em pausa" e o clique. A nota de recorte curto (G47) e a de departamento fora do gráfico continuam visíveis |
| ↳ rótulo dos 3 destaques | "1. MEAT", "2. MEAT-PCKGD", "3. PASTRY" | "1", "2", "3" (o nome está na lista "Defender primeiro" e no tooltip) | — | — |
| Faturamento por departamento | "Nas 214 lojas comparáveis; o traço branco é o mesmo período um ano antes, nas mesmas lojas. Clique para filtrar." | "Os 10 maiores; traço: um ano antes" (base: "Os 10 maiores, sem ano anterior") | "214 lojas comparáveis" / "todas as lojas" | O texto antes, com "traço escuro" (o "branco" era do tema escuro), top 10 + "Outros", o que é o ⚠ na variação e o clique |

### Categorias

| Card | Texto antes | Subtítulo depois | Etiqueta | O que foi para o ⓘ |
|---|---|---|---|---|
| Departamentos (lista) | "Clique para abrir a ficha (vira o filtro de departamento); clique de novo para voltar a todos. ⇄ = tem pares de cesta confiáveis no período e no segmento." | "⇄ = tem pares de cesta confiáveis" (a legenda do símbolo é preciso para ler a lista) | — | Clique / clique de novo / Ctrl + clique, o ⇄ com o mínimo de 200 cestas, o ⚠ de amostra pequena e o que é o valor ao lado |
| Dinheiro em risco | "Faturamento de clientes na faixa ⚠ alta de risco de pausa, todos os clientes. Fixo nas 26 semanas: o risco é uma foto do momento." | "Faturamento de clientes com risco alto de pausa" (só "Em pausa": a mensagem de fora do modelo continua no corpo) | "foto das 26 semanas" | O texto antes, com o recorte, e a regra de "Em pausa" |
| Ficha (nome do departamento) | Ao lado do nome: "26 semanas · todos os clientes" | — (a nota repetia a barra lateral e saiu) | "lojas comparáveis" sob a variação, como antes | O que são os números, a variação nas lojas comparáveis, a barra "Quem compra" e o clique nela |
| Faturamento ao longo do tempo | A versão curta do texto da Visão Geral | O mesmo da Visão Geral | O mesmo | O mesmo |
| Compra junto com | "Os 10 pares de subcategorias que mais vão juntos na mesma cesta dentro de cada departamento, todos os clientes, 26 semanas. Só pares com 200+ cestas." (4 s: + "⚠ período curto: poucos pares confiáveis.") | "Subcategorias que mais vão juntas na cesta" (com departamento: ", dentro de MEAT") | 4 s: "⚠ poucos pares no período" | Top 10 por lift, 200+ cestas e por quê, o que é "N× mais que o normal" e a %, o aviso de período curto e o hover com os números |
| Perfil entre os departamentos | "Percentil de 0 a 100 entre os N departamentos do período, todos os clientes. Ligue segmentos para comparar." (sem departamento: "O perfil compara um departamento com os outros: escolha um na lista. A tabela compara…") | "Percentil de 0 a 100 entre os departamentos" (sem departamento: "Escolha um departamento para ver o radar") | — | O texto antes e o que é o índice. A ⓘ de "Penetração" na tabela, que era só `title`, virou ⓘ acessível |
| Top 10 subcategorias | "26 semanas, todos os clientes, todas as lojas; % do faturamento total." | "% do faturamento total" (com departamento: "% do faturamento do departamento") | "todos os clientes" (o card não segue o filtro de segmento, o que muda a leitura) | O texto antes e o que está entre parênteses |

### Cestas & Marcas

| Card | Texto antes | Subtítulo depois | Etiqueta | O que foi para o ⓘ |
|---|---|---|---|---|
| Linha de concentração | "**N subcategorias** fazem 80% do faturamento (de M com venda), 26 semanas, todos os clientes." | "**N subcategorias** fazem 80% do faturamento (de M com venda)" | — | Período, segmento e a definição (curva ABC) |
| Rede de cestas | "As 80 maiores subcategorias das 26 semanas (…% do faturamento), agrupadas por departamento; perto = vão juntas na cesta. Linhas: as N de maior lift de cada uma; os números são de 26 semanas. [Cor da linha: … (vermelho = mais, azul = menos).] Tracejado: menos de 200 cestas. Clique num nó para ver os pares dele. [⚠ Período curto…]" | "Perto = vão juntas na cesta; linha = maior lift" | Com segmento: "cor: rosa = mais que todos, azul = menos"; 4 s: "⚠ poucos pares no período" | O texto antes (com a cor corrigida: dizia "vermelho", e no tema claro é rosa), a **nota da barra de filtros** e os cliques no nó e no nome do departamento |
| Pares que vão juntos | "Os 10 pares de maior lift entre as subcategorias da rede, todos os clientes, 26 semanas, com 200+ cestas. Ligue segmentos para ver os pares característicos deles, ou clique num nó." | "Os 10 de maior lift entre as subcategorias da rede" (nó: "…com esta subcategoria"; segmentos: "Onde o lift dos segmentos mais supera o de todos") | 4 s: "⚠ poucos pares no período" | O texto antes, o que é lift e confiança, "× o de todos" e as dicas (ligar segmentos, clicar no nó, clicar de novo para voltar) |
| Marca própria e fornecedores | "12 maiores departamentos, 26 semanas, todos os clientes. A base só traz o código do fabricante; o 69 é a marca própria da rede (97% dela). Fornecedores = fabricantes das marcas nacionais. Crescimento nas lojas comparáveis do período. Clique numa linha para filtrar o departamento." | "Os 12 maiores departamentos do recorte" | "crescimento: lojas comparáveis" / base: "sem ano anterior" | O texto antes, o significado das 3 últimas colunas (o `title` do cabeçalho continua) e o clique |
| Nota da barra de filtros | "Os nós e as ligações da rede são fixos (as 80 maiores subcategorias das 26 semanas); os números mudam com o período e o segmento. O departamento destaca os itens dele." | Saiu da barra (`NOTAS` vazio em `app.js`) | — | No ⓘ da rede |

### Metodologia

Não enxugada (regra 7). O componente de painel ganhou a linha título + ⓘ, mas lá o ⓘ fica escondido (sem conteúdo) e o subtítulo completo continua.

## Testes (versão final de `site/`)

| Teste | Resultado |
|---|---|
| `node --test tests/decisao_textos.test.mjs` | ✅ 13/13. Nenhum teste de número mudou: `fraseHistorica` agora devolve também os pedaços com X e Y, e o texto é o mesmo |
| Python (`python -m unittest discover -s tests`) | ✅ 23/23 |
| `tests/v4_1_tela.js` | ✅ 7/7 em 1440×900 e 7/7 em 390×844 |
| `tests/gestos.js` | ✅ 10/10 alvos em 1440×900 e 10/10 em 390×844 |
| Checagem da v4.2 (script de apoio, 3 abas × 4 períodos) | ✅ todo card com ⓘ; nenhum subtítulo acima de 11 palavras; nenhuma dica de clique em subtítulo; nota da barra escondida e presente no ⓘ da rede; ⓘ abre no foco, no hover e no clique, fecha no Esc, ao tirar o mouse e no clique fora, e fica dentro da janela, nos dois tamanhos |
| Layout | Visão Geral 1.287 px em 1440×900 (antes desta etapa, 1.546); Categorias e Cestas & Marcas em 900 px nos 4 períodos; sem rolagem horizontal em 390×844 |
| Metodologia | 900 px em 1440×900, sem rolagem horizontal em 390×844, 0 ⓘ visíveis, subtítulos completos (39 a 41 palavras), console limpo |

**Atualizado no `tests/v4_1_tela.js`, só onde o texto mudou de lugar:** a calibração é lida do ⓘ do bloco do CRM; a frase do teste é a única `.vg-crm__frase`; os rótulos dos destaques são `1`, `2`, `3` (antes `1. MEAT`); o aviso de "Em pausa" junto de outros é lido da etiqueta. As conferências de número (pausas esperadas, faturamento em jogo, X e Y da frase, pontos e destaques do quadrante) não mudaram.

**Correção no meio da validação:** a primeira versão do ⓘ fechava a cada rolagem. Em 390×844, focar o botão rola a página até ele, e a caixa fechava no mesmo instante (foco e hover reprovados). Agora a caixa acompanha o botão ao rolar e só fecha se ele sair da janela. Depois disso, tudo acima foi rodado de novo.

**Erro intermitente do servidor de teste:** em 2 de 6 rodadas em 1440×900, o console registrou `ERR_CONNECTION_REFUSED`. Com o registro de pedidos ligado, a URL apareceu: `data/departamentos_quadrante_13s.json`, pedido pelo próprio roteiro ao `http.server` local. Numa dessas rodadas o roteiro de gestos parou com erro (o gráfico não estava pronto); repetido duas vezes seguidas, passou inteiro, com o console limpo na última. É o mesmo ponto 4 da primeira etapa: o servidor local recusa uma conexão de vez em quando, não é o código do painel.

O Playwright MCP não conectou nesta sessão: os roteiros rodaram com o Playwright 1.64.1 do cache do `npx`, por um script de apoio fora do repositório, como na primeira etapa. Sem capturas, como pedido.
