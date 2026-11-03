**Precisa de atenção: a tela da 4a passou em tudo, mas a etapa `reconcile` do pipeline do lakehouse agora falha, porque a 4a tirou de `site/data` o arquivo com que ela compara (ponto 1 abaixo).**

# Validação: painel v4, parada 4a (dados e remoção), 03/11/2026

Base: `1ecce942e6e2` · Contrato: 5.0 · Lakehouse: `865ee10` (árvore limpa) · Branch: `v4-lakehouse` · Sem commit e sem push (nada em stage).

## Resumo

| Camada | Resultado |
|---|---|
| Dados | Schemas OK nos 48 arquivos (47 + manifest) · sha256 OK · abertura 446.719 bytes |
| Código, sem navegador | Sintaxe 15/15 · 91 importações OK · 44 arquivos pedidos, nenhum faltando · nenhum resto do v3 · testes do importador 10/10 |
| Tela (Playwright MCP) | (a) a (f) concluídas · 0 erros e 0 avisos no console · gestos 8/8 |
| Repositório | Nenhum arquivo proibido versionável · nenhuma chave · Lakehouse e RAG com `git status` limpo |

## Pontos de atenção

1. **O `reconcile` do lakehouse falha desde a 4a.**
   - **O que houve:** `python -m src.pipeline` terminou com código 1: bronze, silver, gold e exportação com sucesso, `reconcile` com `FileNotFoundError` em `site/data/cubo_faturamento.json`.
   - **Causa:** `paths.painel_publicado` aponta para `site/data` deste repositório, que agora é a própria saída do lakehouse e não tem mais o arquivo do v3.
   - **Esta exportação não passou pela conferência do lakehouse.** Comparada à exportação anterior, 47 de 48 arquivos são idênticos byte a byte, e o manifest mudou só em `gerado_em`, `base_hash`, `lakehouse_commit`, `lakehouse_sujo` e `silver_versoes`. Na anterior, a própria 3c registra 0 diferenças sem explicação e 20 de 20 gabaritos.
   - **Ordem dos fatos:** reimportei junto com a leitura do resultado do pipeline, antes de saber da falha. A comparação acima foi feita antes da cópia, e o resultado foi aceitável.
   - **Enquanto não houver correção, todo `python -m src.pipeline` termina em erro.** O `importar_lakehouse.py` não consulta esse resultado: ele valida só contrato e sha256.
2. **Exato na tela:** o dinheiro em risco aparece como "US$ 41,1 mil"; o valor 41.140,15 não está em nenhum ponto da página. O faturamento aparece como "US$ 2,2 mi", com US$ 2.151.812,00 no título (ao passar o mouse). Ver a pergunta 1.
3. **Efeitos fora deste repositório:** o pipeline regravou o lake e a exportação em `C:\Dashboard_Lakehouse` (autorizado pelo Caio em 03/11/2026), e o `git status` de lá segue limpo. A silver subiu da versão 3 para a 4, por isso o `base_hash` mudou (regra da G36). O Playwright baixou `chromium-1252` e `chromium_headless_shell-1252` para o cache dele e removeu a versão 1247.
4. **A `main` local está 1 commit à frente do GitHub:** `origin/main` é `866439e` e a tag `v3-rag` está em `dc69cc1`. A spec chama a tag de "ponto de volta para a versão publicada", mas o publicado é o commit anterior.
5. **A tag é só local:** até haver um push, o pipeline antigo só existe nesta máquina.
6. **Skills desatualizadas:** `exporting-dashboard-data` e `validating-dashboard` ainda citam os scripts removidos.

## Revisão do Caio (parada 4a aprovada)

1. **Dinheiro em risco:** arredondado na tela, com o valor exato ao passar o mouse, atende. O valor exato ao passar o mouse ainda não existe: entra na 4b (uma linha em `categoria.js`).
2. **`reconcile`:** o conserto será feito numa sessão no lakehouse.
3. **Arquivo da 4b:** a validação continua neste arquivo, e não em `docs/validacao/v4.md`, que é a V4 do redesenho v3.

## Tela

Chromium do Playwright, servidor local na porta 8000.

### (a) 1440×900: abas e Metodologia

| Página | Console | Rolagem da página | Conteúdo |
|---|---|---:|---|
| Visão Geral | 0 | não | 6 KPIs; 3 abas no menu; carregou os 7 arquivos de abertura, com os 4 `faturamento_tempo` |
| Categorias | 0 | não | 27 itens na lista; sem link no dinheiro em risco; aviso provisório legível |
| Cestas & Marcas | 0 | não | Rede, pares e marcas; 12 linhas |
| Metodologia | 0 | não | "do RAG" e "do chat" fora; nota com "trazidos do projeto de RAG e conferidos" |

Rodapé: "Origem: lakehouse (bronze → silver → gold) · Período: 01/01/2016 a 11/12/2017 · Base: 1ecce942e6e2 · Commit do lakehouse: 865ee10".

### (b) Os 4 períodos

| Período | Faturamento (Visão Geral) | KPI | Rolagem |
|---|---:|---|---:|
| 4 s | US$ 349.113,24 | ▲ 4,8%, 123 lojas comparáveis | não |
| 13 s | US$ 1.108.218,06 | ▲ 4,7%, 160 lojas comparáveis | não |
| 26 s | US$ 2.151.812,00 | ▲ 3,4%, 214 lojas comparáveis | não |
| Base | US$ 7.310.849,82 | "sem ano anterior na base" | não |

Categorias e Cestas & Marcas também passaram pelos 4 períodos nos 2 tamanhos, sem erro de carga, sem console e sem rolagem indevida (Categorias com o mesmo faturamento da tabela).

### (c) Números da seção 3 na tela, em 26 s, sem filtros

| Número | Spec | Na tela | Situação |
|---|---|---|---|
| Faturamento | US$ 2.151.812 | US$ 2,2 mi; exato no título | OK |
| Ticket | 31,21 | US$ 31,21 | OK |
| Lojas comparáveis | 214, +3,4% | 214 lojas, ▲ 3,4% | OK |
| Clientes ativos | 2.205 | 2.205 | OK |
| Fiéis, % do faturamento | 71% | 70,9% (71% na barra) | OK |
| Fiéis, % dos clientes | ~~35%~~ | não aparece | Conferência retirada da spec (decisão abaixo) |
| Dinheiro em risco | US$ 41.140,15 | **US$ 41,1 mil**; exato só no JSON | **Ver a pergunta 1** |
| AUC | 0,85 × 0,74 | AUC 0,85 × 0,74 | OK |

### (d) Teclado

Setas, Home e End percorrem as 3 abas, com volta nas pontas (direita na última vai à primeira). Foco, aba selecionada e painel visível andam juntos, e só uma aba fica com `tabindex=0`.

### (e) 390×844

| Página | Rolagem horizontal | Painel fora da tela | Console |
|---|---:|---:|---:|
| Visão Geral (KPIs em 2 colunas) | não | 0 | 0 |
| Categorias | não | 0 | 0 |
| Cestas & Marcas | não | 0 | 0 |
| Metodologia | não | 0 | 0 |

Revisão visual por captura em Visão Geral (390) e Categorias (1440): sem texto cortado nem sobreposição. O aviso provisório cabe nos 132 px de Categorias.

### (f) Gestos, por clique real: 8 de 8

Cópia de `tests/gestos.js` sem os alvos da aba removida, rodada um alvo por chamada (em `.playwright-mcp/`, fora do git). O próprio `tests/gestos.js` muda só na 4b e hoje falharia nos alvos da aba removida.

Visão Geral (departamento, variação, segmento) · Categorias (lista, quem compra) · Cestas & Marcas (nó da rede, nome do departamento, marca própria).

### Fora desta rodada

"Alto contraste" e tabelas gêmeas não foram clicados; o código deles não mudou nesta parada, exceto a tabela do gráfico provisório.

## Seção 0: tag e branch

Tag local `v3-rag` em `dc69cc1` e branch `v4-lakehouse`. O pipeline antigo continua acessível pela tag (`scripts/exportar_dados.py` e `scripts/sql/views_painel.sql` conferidos).

## Seção 1: dados

| Conferência | Resultado |
|---|---|
| Antes da 1ª troca, `site/data` do v3 contra a exportação (bytes) | 44 arquivos em comum, 42 idênticos; os 2 diferentes são `lab_modelo.json` (G35) e `manifest.json` (G36) |
| Contratos | 21 em `contracts/`, iguais byte a byte aos do lakehouse |
| JSON inválido numa cópia da exportação real | **código 1**, `site/data` com o mesmo hash, 64 itens |
| Testes do importador | 10 de 10, inclusive falha na troca da pasta |
| 1ª importação | **código 0**: 48 copiados, 19 removidos, abertura de 446.719 bytes |
| Reimportação, depois de regenerar | **código 0**: 48 copiados, 0 removidos; base `1ecce942e6e2`, lakehouse `865ee10` sem mudanças pendentes |
| Depois da importação | `site/data` = manifest + `.gitkeep` (49 itens) |

Pipeline antigo fora do repositório. Nenhum teste dependia dele: `tests/` só tinha `gestos.js`.

## Seções 2.1, 2.4 e 2.5: front-end

- **Origem:** rodapé com lakehouse, commit, base e período. Metodologia sem "Teste do RAG" e "IC de 95% do RAG".
- **Carga:** `app.js` carrega a lista `abertura` do manifest.
- **Clientes & Lojas:** saíram botão, painel, `clientes.js`, entradas em `app.js`, estilos e o único link para ela, junto com o tratamento de `data-ir-para`.
- **Gráfico de tempo:** provisório, com aviso, em `site/js/charts/tempo.js`.
- **Fica para a 4b:** "O que puxou a variação" (seção 2.2) e `tests/gestos.js` (seção 3).

## Decisões

**Do Caio (03/11/2026), aplicando as recomendações do relatório anterior:**

| Decisão | O que foi feito |
|---|---|
| Regenerar a exportação | Pipeline rodado no lakehouse, como exceção à regra de somente leitura da spec, e dados reimportados |
| Tirar a conferência "Fiéis 35% dos clientes" | Removida da seção 3 de `docs/spec_painel_v4.md` |
| Texto neutro no lugar de "definição do chat" | Ajustado em `visao_geral.js` e `categoria.js` |
| Remover `cesta` e `memoria` do config | Removidos de `config.yaml` e `config.example.yaml` |

**Pequenas, tomadas nesta parada:**

| Decisão | Motivo |
|---|---|
| `scripts/comum.py` também saiu | Só o pipeline antigo usava, e ele importa `duckdb` |
| `requirements.txt` reduzido a PyYAML e jsonschema | O resto só servia à exportação antiga |
| O importador também confere bytes e sha256 contra o manifest | Pega JSON alterado que ainda passaria no contrato |
| O importador recusa item desconhecido em `site/data` | Sem isso, ele seria publicado junto |
| Opção `--origem` no importador | Permite testar com uma cópia, sem tocar na exportação real |
| Novo `tests/test_importar_lakehouse.py` (unittest, sem dependência nova) | Prova a promessa de não mexer em `site/data` quando algo falha |
| Rodapé mostra o aviso de `lakehouse_sujo`, quando houver | Um commit sem esse aviso sugeriria uma origem exata que não existe |
| Instalação do navegador pedido pelo Playwright MCP | A versão atual do MCP exigia o build 1252 |

`clicarPar` em `selecao.js` já estava sem uso antes desta parada, por isso não mexi.

## Teste dos 5 segundos

Faturamento ao longo do tempo (provisório, nas duas abas): por enquanto mostra só um aviso de que o novo gráfico entra na próxima etapa.
