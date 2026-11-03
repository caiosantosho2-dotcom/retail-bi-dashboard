**Precisa de atenção: as paradas 4a e 4b estão aprovadas, mas a publicação espera o conserto do `reconcile` no lakehouse.**

# Validação: painel v4, 03/11/2026

Base: `1ecce942e6e2` · Contrato: 5.0 · Lakehouse: `865ee10` (árvore limpa) · Branch: `v4-lakehouse`

- **Parada 4a:** aprovada pelo Caio e commitada (`0459fd4`). O relatório dela está no fim deste arquivo.
- **Parada 4b:** aprovada pelo Caio e commitada. Sem push.

## Parada 4b: resumo

| Camada | Resultado |
|---|---|
| Dados | `site/data` igual à exportação (48 de 48 arquivos) · abertura 446.719 bytes (abaixo de 1,5 MB) · testes do importador 10/10 |
| Tela (Playwright MCP) | Console: 0 erros e 0 avisos em todas as leituras · 28 pontos em 4 s · ano anterior certo nos 4 períodos · gestos 9/9 |
| Repositório | Nenhum arquivo proibido versionável · nenhuma chave · Lakehouse e RAG com `git status` limpo |

Nenhuma chamada do Playwright passou de 2 minutos. Nada ficou para conferência manual.

## Revisão do Caio (parada 4b aprovada)

1. **Gráfico de tempo sem gestos:** o ponto só mostra o tooltip, porque não existe filtro por data. O texto das seções 2.2 e 3 da spec foi corrigido. `tests/gestos.js` prova que o clique no ponto não seleciona nem limpa nada e que o filtro de segmento muda a linha e volta ao valor exato.
2. **Publicação só depois do conserto do `reconcile` no lakehouse.** A exportação atual não passou por essa conferência; a evidência dela é ser idêntica à anterior em 47 de 48 arquivos.
3. **Documentação do painel antigo:** a skill `designing-dashboard-ui` foi atualizada para o v4, e `docs/spec_dashboard.md` ganhou uma nota no topo apontando para `docs/spec_painel_v4.md`.

**Antes de publicar, ainda valem:** a `main` local está 1 commit à frente do GitHub (`dc69cc1` × `866439e`), e a tag `v3-rag` é só local.

## Seções 2.2 e 2.3: gráfico de tempo

**Teste dos 5 segundos:** "Faturamento ao longo do tempo" mostra quanto as lojas comparáveis venderam em cada dia ou semana do período, contra o mesmo ponto um ano antes.

O mesmo componente (`site/js/charts/tempo.js`) e os mesmos arquivos servem às duas abas.

### Por período, sem filtros

| Período | Pontos | Ano anterior | Subtítulo | Soma da linha | Soma do ano anterior |
|---|---:|---|---|---:|---:|
| 4 s | 28 (dia) | tracejado, 28 | Lojas comparáveis do período (123 lojas) | 328.647,92 | 313.633,16 |
| 13 s | 13 | tracejado, 13 | Lojas comparáveis do período (160 lojas) | 1.051.581,25 | 1.004.134,40 |
| 26 s | 26 | tracejado, 26 | Lojas comparáveis do período (214 lojas) | 2.068.074,67 | 1.999.776,43 |
| Base | 101 | ausente, com nota | Todas as lojas | 7.310.849,82 | — |

As somas são as da linha em Categorias, sem filtro. Elas batem com `faturamento_comparavel` e `faturamento_ano_anterior` do `cubo_periodo` (na base, com `faturamento`), que é um arquivo diferente do usado para desenhar.

### Com filtros

Em Categorias, MEAT × Fiéis, 4 semanas:

| Caminho | Atual | Ano anterior |
|---|---:|---:|
| Tela | 15.403,31 | 14.588,21 |
| Soma direta de `faturamento_tempo_4s.json` | 15.403,31 | 14.588,21 |
| `cubo_periodo.json` | 15.403,31 | 14.588,21 |

### Outras conferências

- **Tooltip:** "Dia 22/11/17 · Período atual · Ano anterior · Variação", sem dia da semana nem feriado.
- **Blocos removidos:** "O que puxou a variação" saiu com código, estilos e o teste dele. Ficam 6 KPIs, tempo, segmento e departamento.
- **Limpar filtros:** volta a 26 semanas sem etiquetas.

## Seção 3: conferência na tela

### Números em 26 s, sem filtros

| Número | Spec | Na tela | Situação |
|---|---|---|---|
| Faturamento | US$ 2.151.812 | US$ 2,2 mi; US$ 2.151.812,00 ao passar o mouse | OK |
| Ticket | 31,21 | US$ 31,21 | OK |
| Lojas comparáveis | 214, +3,4% | 214 lojas, ▲ 3,4% | OK |
| Clientes ativos | 2.205 | 2.205 | OK |
| Fiéis, % do faturamento | 71% | 70,9% (71% na barra) | OK |
| Dinheiro em risco | US$ 41.140,15 | US$ 41,1 mil; **US$ 41.140,15 ao passar o mouse** | OK (item (a) do pedido) |
| AUC | 0,85 × 0,74 | AUC 0,85 × 0,74 | OK |

### Telas

| Conferência | 1440×900 | 390×844 |
|---|---|---|
| Visão Geral nos 4 períodos | OK, sem rolagem | OK, sem rolagem horizontal |
| Categorias | OK nos 4 períodos, sem rolagem | OK em 4 s, 26 s e base (13 s não foi repetido no celular) |
| Cestas & Marcas | OK | OK em 26 s |
| Metodologia | OK, sem "do RAG", com a origem no lakehouse | OK, 4 painéis dentro da tela |
| Console | 0 erros, 0 avisos | 0 erros, 0 avisos |
| Links | O único link da página é `metodologia.html`; nenhum `data-ir-para` | — |
| Teclado | Setas, Home e End percorrem as 3 abas | — |

Cestas & Marcas não mudou na 4b: os 4 períodos dela nos 2 tamanhos foram conferidos na 4a, e não repeti.

### Gestos, por clique real: 9 de 9

| Aba | Alvos |
|---|---|
| Visão Geral | tempo (sem seleção), departamento, segmento |
| Categorias | tempo (sem seleção), lista, quem compra |
| Cestas & Marcas | nó da rede, nome do departamento, marca própria |

**Duas execuções falharam antes de passar, ambas por erro meu no teste, não no site nem no Playwright.** A linha sem marcadores não guarda a posição do ponto; e, ao enxugar o arquivo, tirei o ramo que media séries `custom`. Corrigi os dois. Cada aba passou na execução seguinte à correção, sem repetir nenhuma chamada mais de uma vez.

`tests/gestos.js` agora testa uma aba por execução: rode 3 vezes.

### Fora desta rodada

"Alto contraste" e o botão "Tabela" não foram clicados.

## Seção 4: documentação

- **README:** abas, rigor, regenerar e estado reescritos, com uma seção nova de arquitetura. Sem link do lakehouse: o repositório dele não tem remoto, então entra um texto até a publicação. Corrigi também a seção "Dados", que citava a lista de ação.
- **Capturas:** 5 novas; `clientes_lojas.png` removida. Abri os arquivos de Cestas & Marcas, Metodologia e celular. Os de Visão Geral e Categorias não abri: vi capturas das mesmas telas tiradas minutos antes, já com o código final. A de Cestas & Marcas saiu com o contorno de foco do teclado na aba: só visual.
- **`docs/mudancas/resumo_v4.md`:** novo.
- **Validação:** neste arquivo, por decisão do Caio.

## Itens extras do pedido

- **(a) Valor exato do dinheiro em risco:** feito em `categoria.js`, conferido na tela.
- **(b) Skills atualizadas:** `exporting-dashboard-data` (com `reference/contrato_json.md`, agora 5.0) e `validating-dashboard` descrevem o fluxo novo. A busca pelos scripts removidos nas skills não encontra nada.

## Decisões pequenas desta parada

| Decisão | Motivo |
|---|---|
| "Faturamento por departamento" ocupa a linha inteira | O bloco da variação saiu e deixou a metade vazia |
| Linha do gráfico em Categorias de 132 px para 176 px | Com o subtítulo das lojas, o gráfico sobrava com 48 px e não dava para ler; agora tem 108 px. A spec diz que o resto da aba não muda, mas "Compra junto com" perdeu 44 px e passou a rolar mais (323 px visíveis de 356) |
| Subtítulo mais curto em Categorias, sem a frase sobre o KPI | Cabe numa linha no painel baixo. A Visão Geral traz a frase completa |
| Categorias passa a ler `kpis_filtrados.json` | É de onde vem o N de lojas; o arquivo já está na abertura |
| `serieTempo` mantém no eixo os pontos sem venda no filtro, valendo 0 | A linha não pula datas com filtros pequenos |
| Tooltip com a variação do ponto | É a mesma razão que o gráfico antigo já mostrava |
| Instalação local do navegador pedido pelo Playwright MCP | Feita na 4a, reaproveitada aqui |

---

# Parada 4a (dados e remoção): aprovada e commitada

**Revisão do Caio:** aprovada. O dinheiro em risco arredondado na tela, com o valor exato ao passar o mouse, atende. O conserto do `reconcile` será feito numa sessão no lakehouse. A validação continua neste arquivo.

## O que foi conferido

| Verificação | Resultado |
|---|---|
| 3 abas e Metodologia em 1440×900 | 0 erros e 0 avisos; sem rolagem |
| Os 4 períodos nas 3 abas, nos 2 tamanhos | Sem erro de carga, com os valores certos |
| Teclado | Setas, Home e End com 3 abas |
| 390×844 | Sem rolagem horizontal |
| Gestos | 8 de 8, numa cópia temporária do teste |

## Dados

| Conferência | Resultado |
|---|---|
| `site/data` do v3 contra a exportação (bytes) | 44 arquivos em comum, 42 idênticos; os 2 diferentes são `lab_modelo.json` (G35) e `manifest.json` (G36) |
| Contratos | 21 em `contracts/`, iguais byte a byte aos do lakehouse |
| JSON inválido numa cópia da exportação real | código 1, `site/data` com o mesmo hash |
| 1ª importação | código 0: 48 copiados, 19 removidos |
| Reimportação, depois de regenerar | código 0: 48 copiados, 0 removidos; base `1ecce942e6e2`, lakehouse `865ee10` sem mudanças pendentes |

## O `reconcile` do lakehouse

- **O que houve:** `python -m src.pipeline` terminou com código 1. Bronze, silver, gold e exportação deram certo, mas o `reconcile` falhou com `FileNotFoundError` em `site/data/cubo_faturamento.json`.
- **Causa:** `paths.painel_publicado` aponta para `site/data` deste repositório, que agora é a própria saída do lakehouse.
- **Esta exportação não passou pela conferência do lakehouse.** Comparada à anterior, 47 de 48 arquivos são idênticos byte a byte, e o manifest mudou só em `gerado_em`, `base_hash`, `lakehouse_commit`, `lakehouse_sujo` e `silver_versoes`.
- **Ordem dos fatos:** reimportei junto com a leitura do resultado do pipeline, antes de saber da falha.

## Decisões da 4a

**Do Caio (03/11/2026):** regenerar a exportação, como exceção à regra de somente leitura; tirar a conferência "Fiéis 35% dos clientes"; trocar "definição do chat" por texto neutro; remover `cesta` e `memoria` do config.

**Pequenas:**

| Decisão | Motivo |
|---|---|
| `scripts/comum.py` também saiu | Só o pipeline antigo usava, e ele importa `duckdb` |
| `requirements.txt` reduzido a PyYAML e jsonschema | O resto só servia à exportação antiga |
| O importador também confere bytes e sha256 contra o manifest | Pega JSON alterado que ainda passaria no contrato |
| O importador recusa item desconhecido em `site/data` | Sem isso, ele seria publicado junto |
| Opção `--origem` no importador | Permite testar com uma cópia, sem tocar na exportação real |
| Novo `tests/test_importar_lakehouse.py` | Prova a promessa de não mexer em `site/data` quando algo falha |
| Rodapé mostra o aviso de `lakehouse_sujo`, quando houver | Um commit sem esse aviso sugeriria uma origem exata que não existe |
