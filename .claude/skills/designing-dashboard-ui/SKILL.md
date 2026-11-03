---
name: designing-dashboard-ui
description: Define o visual do painel BI de varejo (HTML + Apache ECharts, tema escuro estilo Pokédex) — tokens de cor, layout das abas, componentes e convenções dos gráficos ECharts. Usar ao criar ou alterar qualquer tela, componente, gráfico, cor, tipografia ou interação do painel em site/.
---

# Design do painel BI

A fonte das regras de negócio é `docs/spec_painel_v4.md`, com as decisões do lakehouse que ela cita. `docs/spec_dashboard.md` vale só no que o v4 não substituiu. Esta skill cuida de **como** a tela fica. Se as duas divergirem, siga a spec e avise.

## Fluxo de trabalho

Copie esta lista e marque cada item ao trabalhar numa tela:

```
- [ ] 1. Ler o que a spec diz da aba em docs/spec_painel_v4.md (conteúdo e critérios de aceite)
- [ ] 2. Escolher a forma de cada gráfico pela tabela "Que gráfico usar"
- [ ] 3. Montar o layout com os componentes desta skill (nada de estilo solto)
- [ ] 4. Aplicar cores só via tokens e via SEG_CORES (nunca hex no JS das abas)
- [ ] 5. Ligar tooltip, aria e o modelo único de seleção
- [ ] 6. Rodar: python .claude/skills/designing-dashboard-ui/scripts/check_contrast.py site/css/tokens.css
- [ ] 7. Passar a tela pela skill validating-dashboard
```

Se o passo 6 ou 7 falhar, corrija e repita. Só avance com tudo aprovado.

## Tokens

Copie `reference/tokens.css` para `site/css/tokens.css` **sem alterar valores**. Os valores já foram validados:
- a paleta dos segmentos passa nas checagens de daltonismo e distinção em pares vizinhos no fundo `#171b22`;
- todos os textos passam no contraste WCAG.

Para mudar uma cor: altere o token, rode `check_contrast.py`, registre a mudança no relatório da fase em `docs/validacao/`.

## Regras de cor (não negociáveis)

1. **Cor segue a entidade, nunca a posição.** Cada segmento tem sempre a sua cor, em todo gráfico, mesmo que um filtro remova outros segmentos. Use um mapa único em `site/js/charts/tema.js`:
   ```js
   export const SEG_CORES = {
     'Fiéis': cssVar('--seg-fieis'),
     'Regulares': cssVar('--seg-regulares'),
     'Esporádicos': cssVar('--seg-esporadicos'),
     'Em pausa': cssVar('--seg-em-pausa'),
   };
   ```
2. **Status é reservado.** `--status-*` só para variação boa ou ruim e alertas, sempre com ícone (▲ ▼ ⚠) e texto. Nunca como cor de série.
3. **Destaque de interface ≠ dado.** `--accent` (pílula clara) marca aba e botão selecionados. Nunca aparece dentro de um gráfico.
4. **Magnitude usa a escala sequencial** (`--seq-1` baixo → `--seq-6` alto). **Acima ou abaixo de uma referência** (índice 100, variação) usa a divergente, com o cinza `--div-mid` no centro. Nunca arco-íris.
5. **Texto nunca na cor da série.** Valores e rótulos usam `--text-*`. A cor fica na marca do gráfico ao lado.
6. **Os 4 segmentos juntos sem ser vizinhos** (dispersão, radar sobreposto): rótulo direto obrigatório em cada série, ou compare no máximo 3 de cada vez.

## Layout

- **Desktop (≥1366 px):** cada aba cabe numa tela de 1440×900 sem rolar a página. Grade CSS de 12 colunas, `gap: var(--gap)`.
- **Estrutura fixa de cada aba:** barra superior (título, período, abas) → linha de filtros globais (período | segmento | departamento | limpar tudo) e etiquetas de filtro ativo → conteúdo → rodapé "Sobre os dados".
- **Padrão "lista | ficha | contexto"** (Ficha da Categoria): 3 + 6 + 3 colunas. Dentro de cada coluna a grade é própria: escope `grid-column: auto` para os painéis dela, senão o `span 12` geral cria colunas fantasmas.
- **As 3 abas e a página de metodologia:**
  - Visão Geral: KPIs no topo; tempo (8 colunas) e segmento (4) no meio; departamentos (12) embaixo.
  - Categorias: lista, ficha e contexto. No centro, o gráfico de tempo fica numa linha de 176 px, com o subtítulo em uma linha.
  - Cestas & Marcas: resumo no topo; rede (8) e pares (4) no meio; marcas (12) embaixo.
  - Metodologia (link no rodapé): ROC (7) e matriz (5) em cima; CLV (6) e desconto (6) embaixo.
- **Celular (<768 px):** os blocos empilham numa coluna. As abas viram uma faixa com rolagem horizontal.

## Componentes

Todos em HTML/CSS. Gráfico só onde houver dado plotado.

| Componente | Regras |
|---|---|
| **Painel** | `--surface-panel`, `border: 1px solid var(--border)`, `border-radius: var(--radius-panel)`, padding `var(--pad)`. Título em `--fs-title`, 600, `--text-primary`. |
| **Card de KPI** | Rótulo (`--fs-small`, `--text-muted`, maiúsculas) → valor (`--fs-kpi`, 600) → variação (▲/▼ + % + "vs ano anterior", em `--status-good`/`--status-critical`). Sem gráfico dentro. |
| **Abas** | Pílulas. A ativa usa `--accent` com `--accent-text`; as inativas, texto `--text-secondary` com hover em `--surface-raised`. Teclado: setas trocam de aba, `role="tablist"`. |
| **Filtro global** | Estado único em `app.js` (`estado.filtros`), compartilhado entre as abas; as abas ouvem o evento `filtros-mudaram` e nunca falam umas com as outras. Filtro que não se aplica fica `aria-disabled` com nota. |
| **Chip de segmento** | Pílula liga/desliga (`aria-pressed`) com o ponto de cor e o nome. Clique ou toque soma ou tira; Ctrl + clique também. Nenhum ligado = todos. Rótulo do grupo: "Segmento atual do cliente". |
| **Lista de departamentos** | Busca + caixas de seleção múltipla, ordem pelo faturamento das 26 semanas. |
| **Etiqueta de filtro ativo** | "Segmento: Fiéis, Regulares ✕"; o ✕ é um botão com `aria-label` "Remover filtro de segmento". "Limpar tudo" ao lado. |
| **Etiqueta de segmento** | Ponto de 8 px na cor do segmento + nome em `--text-primary`. Nunca só a cor. |
| **Aviso de amostra pequena** | Ícone ⚠ + "amostra pequena (n = X)" em `--status-warning`. Em gráfico, a marca fica com opacidade 0,45. |
| **Rodapé "Sobre os dados"** | Fonte, origem ("lakehouse (bronze → silver → gold)"), período, gerado em, hash da base e commit do lakehouse, lidos do `manifest.json`. Se `lakehouse_sujo` for verdadeiro, o commit leva o aviso "com mudanças não commitadas". |
| **Valor arredondado** | Dinheiro grande na tela (`fmt.usdGrande`) leva o valor exato no `title` (`fmt.usd`), como no KPI de faturamento e no dinheiro em risco. |

## Que gráfico usar

| Pergunta do dado | Forma | Evite |
|---|---|---|
| Um número que resume | Card de KPI | Medidor decorativo |
| Evolução no tempo | `site/js/charts/tempo.js`, o mesmo nas duas abas: só o período selecionado, um ponto por dia em 4 semanas e por semana no resto, linha de 2 px, ano anterior tracejado no mesmo eixo, subtítulo com as lojas ("Lojas comparáveis do período (N lojas)" ou "Todas as lojas"), sem gestos: o ponto só mostra o tooltip | Dois eixos Y; dia da semana ou feriado (o calendário é reconstruído) |
| Comparar categorias | Barras horizontais ordenadas, top N + "Outros" | Pizza com mais de 3 fatias |
| Duas dimensões × intensidade | Mapa de calor (`visualMap` sequencial ou divergente) | Cores arbitrárias |
| Perfil de um item em vários atributos | Radar em percentil 0–100 **+ tabela dos valores reais ao lado** | Radar sem tabela |
| Participação de poucos grupos | Barra 100% empilhada ou donut com até 4 fatias e rótulo direto | Donut sem rótulo |
| Concentração (ABC) | Pareto: barras + linha acumulada **na escala de %, no mesmo eixo de 0–100%** | Segundo eixo para a linha |
| O que vai junto (rede de cestas) | `graph` com posições fixas vindas da exportação, bolha por tamanho, poucas ligações finas | Grafo de força sem legenda |
| Índice contra uma média (afinidade) | Mapa de calor **divergente** (`--div-*`, `--div-mid` em 100), com o número na célula ou no tooltip | Escala sequencial para dado acima/abaixo de 100 |
| Mesma série em 4 segmentos | Pequenos múltiplos lado a lado, mesmo eixo Y | 4 linhas sobrepostas sem rótulo |
| Participação dos segmentos num total | Barra 100% empilhada com rótulo direto | Pizza |
| Tamanho com o ano anterior | Barra + traço fino do ano anterior na mesma escala, rótulo depois do que for mais longe | Dois gráficos de barras ou dois eixos |

## Convenções do ECharts

- **Versão fixada** no `<script>` do CDN (ex.: `echarts@5.x.y`). Antes de usar uma opção, consulte a documentação atual (Context7 MCP ou echarts.apache.org) em vez de confiar na memória.
- **Tema único:** `tema.js` lê os tokens com `getComputedStyle` e registra `echarts.registerTheme('varejo-dark', …)`. Todo gráfico usa `echarts.init(el, 'varejo-dark', { renderer: 'canvas' })`. Fundo transparente, para o painel aparecer.
- **Acessibilidade:** `aria: { enabled: true }` e `title.text` em todo gráfico, mesmo com o título escondido visualmente (`aria.show` era a opção do ECharts 4; no 5 e no 6 ela é ignorada sem aviso). Padrão de textura (`aria.decal.show`) disponível atrás de um botão "modo alto contraste".
- **Tooltip sempre:** `axisPointer` do tipo `line` em gráficos de linha e tooltip por item em barras e células. Valores formatados em pt-BR.
- **Legenda:** obrigatória com 2 ou mais séries. Com até 4 séries, rótulo direto também. Uma série só: o título já nomeia, sem legenda.
- **Marcas finas:** linhas de 2 px, `barMaxWidth: 28`, cantos de 4 px na ponta da barra, grade em `--grid` e eixos em `--axis`, discretos.
- **Ciclo de vida:** um `init` por contêiner. Ao trocar de aba, chame `resize()` no gráfico que ficou visível. Ouça `window.resize` com *debounce* de 150 ms.
- **Clique → seleção (modelo único, `site/js/selecao.js`, redesenho v3):** todo gráfico ou lista clicável usa só este módulo. `clicar(dimensao, valor, evento)` no item (clique seleciona; clique no já selecionado desfaz; Ctrl/⌘ + clique soma ou tira), `clicarPar` para a célula de duas dimensões, `ligarGrafico(chart, ...dimensoes)` e `ligarLista(container, seletorItem, ...dimensoes)` para o clique no fundo vazio e o Esc. Dimensões globais: `segmentos`, `departamentos`; locais de uma aba: `registrarDimensao(nome, { aba, rotulo, filtro, unico })`, e a aba ouve `selecao-mudou`. O item selecionado mantém a cor; os outros ficam com `OPACIDADE_FORA` (0,35), também nas listas (`data-fora`). Quem usa o Esc para outra coisa chama `preventDefault()`. Gráficos que não filtram (o ponto do gráfico de tempo) só mostram o tooltip. Os gráficos reagem ao estado, nunca uns aos outros diretamente.

## Formatação de números

Use `Intl.NumberFormat('pt-BR')`. A moeda da base é o dólar, então mostre `US$`. Isso vale também para o texto da aba "Sobre os dados".

| Tipo | Exemplo |
|---|---|
| Dinheiro grande | US$ 482,3 mil · US$ 1,2 mi |
| Dinheiro unitário | US$ 31,47 |
| Percentual | 35,2% |
| Variação | ▲ 4,1% |
| Pontos percentuais | +1,2 p.p. |
| Contagem | 2.500 |

## Erros comuns (se a tela tiver um destes, está errada)

- hex escrito direto no JS de uma aba;
- a cor de um segmento muda quando um filtro remove outro;
- gráfico com dois eixos Y;
- pizza ou donut com mais de 4 fatias;
- número em cada ponto da linha;
- radar sem a tabela de valores;
- variação mostrada só pela cor, sem ▲/▼;
- texto do eixo menor que 11 px;
- aba que exige rolagem da página em 1440×900.

## Avaliações desta skill

Use estes cenários para testar se a skill está funcionando, com uma sessão nova do Claude Code:
1. "Crie o card de KPI de ticket médio com variação contra o ano anterior." Esperado: usa os tokens, ▲/▼ com texto, sem gráfico dentro do card; com 2+ departamentos filtrados, mostra "—" com a nota.
2. "Adicione um gráfico comparando o faturamento dos 4 segmentos." Esperado: barras ordenadas com as cores de `SEG_CORES`, rótulo direto, sem pizza.
3. "Mostre faturamento e número de cestas por semana no mesmo gráfico." Esperado: recusa o eixo duplo e propõe dois gráficos alinhados ou um índice com base 100.
