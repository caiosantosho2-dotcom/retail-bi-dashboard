# Validação — Fase 4 (Segmentos) — 2026-10-21
Base: ddb4d8032cc2 · Contrato: 1.1
Dados: schemas OK (13 arquivos, 0 erros) · reconciliação 284/284 OK (sem mudança de dados nesta fase)
Tela: console 0 erros · aceite 2/2 · 1440×900 OK · 390×844 OK
Repositório: OK
Pendências: nenhuma desta aba

## Tela (Playwright MCP)
| Item | Resultado |
|---|---|
| T2 | console 0 erros e 0 avisos |
| T3. Aceite (spec 5.3) | ✓ % de clientes 35,4 + 40,5 + 17,6 + 6,5 = 100,0%; % do faturamento 70,9 + 25,9 + 2,5 + 0,7 = 100,0% (também na reconciliação, ±0,0001); ✓ o painel de detalhe mostra o segmento clicado e fecha com Esc |
| T4. Interações | clique com o mouse num nó da roda (coordenada real do nó no canvas) abre o detalhe e marca o botão do mesmo segmento; os botões de segmento fazem o mesmo pelo teclado (Tab + Enter); Esc e "Fechar" limpam a seleção; botão "Tabela" mostra os 4 segmentos com todas as métricas; o filtro de período fica desabilitado com a nota "o período não se aplica" |
| T5. Layout | 1440×900 sem rolagem; 390×844 empilhado (roda com rótulo curto, detalhe logo abaixo, rolagem até ele ao clicar), sem rolagem horizontal |
| T6. Acessibilidade | caminho por teclado para a seleção; nome do segmento sempre em texto ao lado do ponto de cor; descrição da roda em português para leitor de tela; Em pausa explica por que não tem risco ("fora do modelo de risco: sem compra há mais de 8 semanas") |

Capturas (fora do git): `.playwright-mcp/fase4_segmentos_1440.png`, `.playwright-mcp/fase4_segmentos_390.png`.

## Decisões de forma
- **Roda com posições fixas** (Fiéis no topo, Regulares à direita, Esporádicos embaixo, Em pausa à esquerda), em vez do `layout: 'circular'` do ECharts, que espalhava os nós de forma desigual. Regulares e Em pausa, o par que o validador de paleta reprova lado a lado, ficam em lados opostos.
- **Área do círculo proporcional ao faturamento**, com piso de 24 px para o alvo de clique (Esporádicos e Em pausa); o rótulo traz o número real, então o piso não engana. `nodeScaleRatio: 0` e caixa quadrada: sem isso o maior nó saía como elipse.
- **Aro da roda** em linha fina na cor da grade: estrutura, não dado.
- **Botões de segmento** acima da roda: são a legenda e o caminho pelo teclado, porque o canvas não recebe foco.

## Encontrado e corrigido durante a validação
1. Distribuição desigual dos nós com `layout: 'circular'` → posições fixas.
2. Nó de Fiéis desenhado como elipse → caixa quadrada e `nodeScaleRatio: 0`.
3. Rótulos dos segmentos não selecionados herdavam a opacidade do círculo e ficavam ilegíveis → `label.opacity: 1`.
4. No celular, a caixa mínima de 120 px sobrepunha nós e rótulos → geometria própria para tela estreita (gráfico de 380 px, rótulo curto).
