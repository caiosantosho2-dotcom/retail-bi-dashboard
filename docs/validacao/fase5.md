# Validação — Fase 5 (Ficha do Cliente) — 2026-10-21
Base: ddb4d8032cc2 · Contrato: 1.1
Dados: schemas OK (13 arquivos, 0 erros) · reconciliação 284/284 OK (inclui os 20 clientes sorteados com `random.seed(42)`)
Tela: console 0 erros · aceite 4/4 · 1440×900 OK · 390×844 OK
Repositório: OK
Pendências: ver o fim deste arquivo

## Tela (Playwright MCP)
| Item | Resultado |
|---|---|
| T2 | console 0 erros e 0 avisos durante toda a sessão de testes |
| T3. Aceite (spec 5.2) | ✓ **< 300 ms**: com o arquivo do segmento carregado, a ficha monta em 68 ms (mediana) e 120 ms (pior caso) em 36 aberturas, medido com `performance.measure('ficha')`; a primeira, que cria os gráficos, levou 245 ms. ✓ **valores**: a reconciliação confere segmento, recência, frequência, valor, CLV e se o cliente está na população do modelo de risco para 20 sorteados, contra `vw_metricas_cliente`, `vw_cliente_semana` e o RAG; na tela, 37 clientes dos 4 segmentos com o radar igual aos percentis do JSON, segmento e faixa de risco certos. ✓ **radar sempre com a tabela**: 6 linhas (valor real, percentil e média do segmento) em todas as 37 aberturas. ✓ **sem demografia**: 22 dos 37 clientes testados não têm demografia (1.620 dos 2.421 na base) e abrem normalmente; a ficha não usa demografia |
| T4. Interações | busca por ID (Enter abre o exato ou o primeiro da lista), filtro por segmento (Em pausa: 158), "Sortear cliente", clique na lista; clientes fora do modelo de risco (6 nos testes, todo o segmento Em pausa) mostram "Fora do modelo de risco" com o motivo; busca sem resultado diz "Nenhum cliente com esse filtro"; histórico e departamentos com tabela gêmea |
| T5. Layout | 1440×900: 3 + 6 + 3 colunas, sem rolagem da página, nada vazando dos painéis; 390×844: empilhado (lista, ficha, contexto), sem rolagem horizontal, nenhum texto cortado |
| T6. Acessibilidade | lista e filtros pelo teclado (Tab + Enter); faixa de risco com ícone e texto (⚠ alto, ◐ médio, ✓ baixo), nunca só cor; barra de risco e barras de contexto com `role="img"` e descrição; radar com descrição em português |

Regressão das outras abas depois das mudanças de CSS desta fase: Visão Geral e Segmentos sem rolagem em 1440×900,
sem rolagem horizontal em 390×844, nenhum gráfico vazio.

Capturas (fora do git): `.playwright-mcp/fase5_ficha_1440.png`, `.playwright-mcp/fase5_ficha_390.png`.

## Encontrado e corrigido durante a validação
1. **Grade da ficha quebrada**: a regra geral `.painel { grid-column: span 12 }` criava colunas fantasmas dentro da grade de 2 colunas do centro; histórico e departamentos vazavam e se sobrepunham. Regra escopada em `.fc-centro`.
2. **Aba selecionada ilegível sob o mouse** (bug desde a fase 1): o hover tinha especificidade maior que o estado selecionado e pintava a pílula clara de escuro, com texto escuro. O mesmo valia para os botões pressionados (filtro de período, segmentos). O hover não se aplica mais a item selecionado ou pressionado.
3. Nomes do radar cortados ("requência") e legenda invadindo o painel de risco: raio menor, nomes curtos, legenda em cima, tabela sem quebra nos valores.
4. Eixo do histórico e última barra dos departamentos cortados: os gráficos eram medidos antes de a tabela e a lista ocuparem o espaço; agora são medidos de novo antes de cada ficha.
5. Faixa vermelha da barra de risco pesada demais (bloco grande saturado, anti-padrão da skill `dataviz`): mais fina e com menos opacidade.
6. "comprou nesta semana" para quem comprou há 6 dias: agora "comprou há menos de 1 semana".
7. Rótulos da escala de risco sobrepostos no celular: sem o corte de 8,5% em tela estreita.

## Pendências
- A lista mostra até 200 clientes por vez (a busca e o filtro chegam aos 2.421): sem rolagem virtual, para manter a abertura rápida.
- O percentil vem com 1 casa no JSON e aparece inteiro na tabela da ficha; o radar usa o valor exato.
