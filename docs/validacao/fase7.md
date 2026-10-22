# Validação — Fase 7 (Publicação) — 2026-10-22
Base: ddb4d8032cc2 · Contrato: 2.0
Site: https://caiosantosho2-dotcom.github.io/retail-bi-dashboard/ · Repositório: https://github.com/caiosantosho2-dotcom/retail-bi-dashboard (público, ramo `main`)
Dados: os 51 arquivos publicados idênticos ao `manifest.json` (sha256 e bytes, conferidos no próprio site) · reconciliação 328/328 (R4)
Tela no site publicado: console 0 erros e 0 avisos, nenhuma resposta de rede com erro · 1440×900 OK · 390×844 OK
Repositório: OK
Pendências: nenhuma

## Antes de publicar
- **Histórico auditado** (os 12 commits): nenhum `.duckdb`, `.parquet`, `config.yaml`, `.env` ou `.csv` em commit nenhum; nenhuma chave (`gsk_`, `sk-`, `ghp_`, `api_key`); nenhum caminho local. `.mcp.json` só tem os comandos dos servidores MCP. Os arquivos de cliente das fases 2 a 5 continuam no histórico, com os IDs pseudônimos da base pública e sem demografia (decisão do usuário: publicar com o histórico).
- Ramo `master` renomeado para `main` (decisão do usuário).

## Publicação
- Repositório criado com `gh repo create --public`; GitHub Pages ligado no modo "GitHub Actions" antes do primeiro envio.
- Workflow `.github/workflows/pages.yml`: `actions/checkout@v7`, `configure-pages@v6`, `upload-pages-artifact@v5` (pasta `site/`), `deploy-pages@v5`, nas versões estáveis atuais; roda a cada mudança em `site/` ou no próprio workflow. Primeira execução: sucesso em 18 s.

## Conferência no site publicado (Playwright MCP)
| Item | Resultado |
|---|---|
| Abertura | HTTP 200; os 6 KPIs iguais aos da validação local (US$ 2,2 mi, 68.947 cestas, US$ 31,21, 13,8 itens, 15,7%, 2.205 ativos) |
| Integridade | `manifest.json` lido do site e os 51 arquivos baixados e conferidos por sha256 e tamanho: 0 divergências |
| Abas | Visão Geral, Ficha da Categoria e Segmentos em 1440×900 sem rolagem e sem gráfico vazio; em 390×844 sem rolagem horizontal |
| CSV | "Baixar CSV" funciona em HTTPS: `lista_acao_todos.csv` com 464 linhas |
| Tempo de abertura | cache vazio, até os 6 KPIs na tela: 1,2 s, 1,3 s, 1,5 s, 1,8 s e 2,7 s em 5 aberturas, com uma de 5,7 s (pico de rede no primeiro acesso). JSON da abertura: 95 KB transferidos (comprimidos). O maior item é o ECharts do CDN (367 KB, 0,2 a 0,8 s). A meta de 2 s da spec é local; no site publicado a mediana fica abaixo dela |

## README
Link do site no topo, captura da Visão Geral, tabela do que tem em cada aba, capturas da Ficha da Categoria, de Segmentos e do celular (`docs/capturas/`), a seção "Rigor" (uma definição por métrica, reconciliação de 328 números, contrato de dados, validação de tela), como rodar localmente e como regenerar os dados.
