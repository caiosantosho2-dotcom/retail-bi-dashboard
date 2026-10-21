# Validação — Fase 3 (Visão Geral) — 2026-10-21
Base: ddb4d8032cc2 · Contrato: 1.1
Dados: schemas OK (13 arquivos, 0 erros) · reconciliação 284/284 OK · tamanho abertura 232 KB
Tela: console 0 erros · aceite 4/4 · 1440×900 OK · 390×844 OK
Repositório: OK
Pendências: nenhuma desta aba

## Dados
O card de risco passou a falar de clientes (decisão do usuário): frase "Cerca de 136 clientes ativos devem passar
8 semanas sem comprar; 64% são Esporádicos." e o número 135,95 (pausas esperadas), com link para a Ficha do Cliente.
A reconciliação ganhou 3 verificações (frase, número e "136" do app): 284/284 OK, RAG intocado.

## Tela (Playwright MCP, Chromium do Playwright)
| Item | Resultado |
|---|---|
| T1 | servidor local com `Cache-Control: no-store` (só para o desenvolvimento) |
| T2 | console 0 erros e 0 avisos; todos os JSONs com 200 |
| T3. Aceite (spec 5.1) | ✓ os 6 KPIs são os de `kpis.json`, já reconciliados contra as views para os 4 períodos (26 semanas: US$ 2,2 mi, ▲ 3,4%, 214 lojas, 2.205 clientes ativos); ✓ o filtro troca KPIs, linha semanal (4, 13, 26 e 101 semanas) e departamentos; ✓ nenhum gráfico tem dois eixos Y (1 eixo em cada, conferido nas opções do ECharts); ✓ os cards mostram 71%, 136 clientes e 1,2 p.p., os números do app |
| T4. Interações | botão "Tabela" troca cada gráfico pela tabela gêmea e volta; "ver análise" abre a aba de destino; nas abas do RFM o filtro fica desabilitado com a nota "o período não se aplica" e volta ao normal na Visão Geral; "Alto contraste" liga e desliga as texturas em todos os gráficos |
| T5. Layout | 1440×900: sem rolagem (`scrollHeight` = 900), cards sem rolagem interna. 390×844: blocos empilhados, KPIs em 2 colunas, sem rolagem horizontal, nenhum texto cortado |
| T6. Acessibilidade | abas pelo teclado (fase 1); `aria.enabled` com descrição em português em cada gráfico; variação com ▲/▼ e texto, nunca só cor; menor fonte 11 px |

Capturas (fora do git): `.playwright-mcp/fase3_visao_geral_1440.png`, `.playwright-mcp/fase3_visao_geral_390.png`.

### Encontrado e corrigido durante a validação
1. A skill de design mandava `aria: { show: true }`, opção do ECharts 4 que o 5 e o 6 ignoram sem aviso: o painel ficaria sem acessibilidade. Corrigido para `aria.enabled` na skill e no tema.
2. A descrição automática do ECharts para leitor de tela sai em inglês. Cada gráfico agora tem descrição própria em português, com os números principais.
3. Os 3 cards de insight não cabiam na altura e criavam rolagem interna. Número menor e link na mesma linha da frase.
4. Validador de paleta da skill `dataviz`: segmentos aprovados em pares vizinhos, reprovados com os 4 juntos (Regulares × Em pausa); passo curto entre `--seq-1` e `--seq-2`. Regras na spec, seção 7.

## Repositório
Sem dado bruto, `.duckdb`, `config.yaml` ou chave; RAG sem mudanças.
