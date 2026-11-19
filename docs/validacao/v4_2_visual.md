# Validação: v4.2, ajuste visual, 19/11/2026

Base: `040c15f100e0` · Contrato: 5.1 · Dados: os mesmos da v4.1 (nenhum JSON mudou) · Branch: `v4-2-visual` · Sem merge e sem push

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
