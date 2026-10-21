# Validação — Fase 1 (Fundação) — 2026-10-21
Base: ddb4d8032cc2 · Contrato: 1.0 (manifest provisório)
Dados: não se aplica nesta fase (nenhum dado exportado) · schemas — · reconciliação — · tamanho abertura: 1 arquivo (manifest provisório)
Tela: console 0 erros · aceite da fase 1 5/5 · 1440×900 OK · 390×844 OK
Repositório: OK
Pendências: ver o fim deste arquivo

## Escopo
A fase 1 entrega a casca do painel. Os critérios de aceite das abas (seção 5 da spec) dependem de dados e ficam para as fases 3 a 5. Aqui só se aplicam as camadas TELA e REPOSITÓRIO da skill `validating-dashboard`.

## Tela (Playwright MCP, Chromium do Playwright, `http://localhost:8000`)
| Item | Resultado |
|---|---|
| T1. Servidor local | `python -m http.server 8000 --directory site`: todos os arquivos com 200 (HTML, 2 CSS, 2 JS, manifest, ECharts 6.1.0 do CDN) |
| T2. Console | 0 erros e 0 avisos. Na primeira abertura havia 1 erro, o 404 de `/favicon.ico` pedido pelo navegador; foi corrigido com um ícone vazio declarado no HTML |
| T3. Aceite da fase 1 | barra superior com título, período da base e abas ✓; Lojas, Produtos e Laboratório desabilitadas com "em breve" ✓; linha de filtro de período (4, 13, 26 semanas, base inteira) ✓; um painel vazio por aba ✓; rodapé "Sobre os dados" lido do `manifest.json` (fonte, período, gerado em, hash da base e aviso de manifest provisório) ✓ |
| T4. Interações | clique nas abas troca o painel; o filtro marca `aria-pressed` e emite `periodo-alterado`. Sem gráfico nem painel de detalhe nesta fase |
| T5. Layout | 1440×900: as 3 abas sem rolagem vertical nem horizontal (`scrollHeight` = 900). 390×844: blocos empilhados em 366 px, filtro quebra em 2 linhas, abas em faixa com rolagem horizontal própria, sem rolagem horizontal da página |
| T6. Acessibilidade | `role="tablist"`/`tab`/`tabpanel` com `aria-selected` e `aria-controls`; ←/→ trocam de aba, pulam as desabilitadas e dão a volta nos dois sentidos; Home/End vão para a primeira/última; `tabindex` itinerante. Menor fonte da tela: 11 px. Variação e status não aparecem nesta fase |
| Tema ECharts | `echarts.version` = 6.1.0; `registerTheme('varejo-dark')` registrado; `echarts.init(el, 'varejo-dark')` funciona; `SEG_CORES` lê os 4 tokens (`#3987e5`, `#d95926`, `#199e70`, `#c98500`). Nenhum hex no JS |
| Contraste | `check_contrast.py site/css/tokens.css`: 12/12 OK. `site/css/tokens.css` é idêntico a `reference/tokens.css` (`cmp`) |

### Falhas encontradas e corrigidas
1. **390×844 com rolagem horizontal da página** (largura do conteúdo 738 px). A coluna da grade de `.app` crescia até a largura mínima da faixa de abas. Correção: `grid-template-columns: minmax(0, 1fr)` em `.app` e `min-width: 0` em `.abas`. A camada de tela foi refeita inteira depois da correção.
2. **Barra de rolagem padrão do Windows sob as abas** no celular, grossa e fora do tema. Correção: `scrollbar-width: thin` com `--border`.
3. **404 de `favicon.ico`** no console. Correção: `<link rel="icon" href="data:,">`.

Capturas de tela (uma por tamanho, só para a revisão visual, fora do git): `.playwright-mcp/fase1_1440x900.png` e `.playwright-mcp/fase1_390x844.png`.

## Repositório
| Item | Resultado |
|---|---|
| R1. `git ls-files` / arquivos novos | sem `.duckdb`, `.parquet`, `config.yaml`, `.env` ou dado bruto. A regra `data/` do `.gitignore` ignorava também `site/data/`; virou `/data/`. `.playwright-mcp/` entrou no `.gitignore` |
| R2. `git grep` por chave | nenhuma chave; o único resultado é o próprio texto do checklist na skill |
| R3. Relatório | este arquivo |
| RAG somente leitura | `git -C C:\RAG_Varejo status --short` vazio; os 2 `.duckdb` abertos só com `read_only=True` |

## Ambiente
- O Playwright MCP procurava o Google Chrome do sistema, que não está instalado. Instalado o Chromium do Playwright (`npx @playwright/mcp install-browser chrome-for-testing`) e acrescentado `--browser chromium` no `.mcp.json`.
- ECharts fixado em `6.1.0`, a versão `latest` do npm, publicada em 2026-05-19. O Context7 não informa a versão atual, então ela foi conferida no registro do npm.

## Pendências (para as próximas fases)
- Regra de `amostra_pequena` para segmento × departamento: o RAG não tem; proposta de 30 households (`analises.clv.tamanho_minimo_grupo`), a confirmar na fase 2.
- Matriz de migração (P2): o K-Means é reajustado por janela, sem reaproveitar centróides; exige uma decisão nova.
- Versão do DuckDB: o venv do painel tem 2.0.0 e o RAG usa 1.5.6. Ao importar o código do RAG na fase 2, instalar as versões do `requirements.txt` do RAG e listá-las no do painel.
- Reconciliação da fase 2: 136 clientes = pausas esperadas (soma das probabilidades); 243 = alertas acima do limiar 0,17. Conferir os dois, separados.
