# Plano de execução do redesenho v3

Escrito antes de codar (2026-10-23), depois de ler `redesenho_v3.md`, a spec, o contrato 2.4 e as 3 skills. A execução
segue as etapas V0 a V5 da seção 7 do redesenho. **A V6 não é executada:** nada de publicação, `git push` ou GitHub Pages.
Dúvidas e escolhas feitas sem o Caio vão para `pendencias_v3.md`.

Regras que continuam: RAG somente leitura; DuckDB em read-only; números só das views do painel ou das funções do RAG
(o navegador só soma o que soma: faturamento, desconto, valor bruto); snapshot antes de captura de tela; servidor local
encerrado ao fim de cada etapa; uma etapa de exportação por processo, `memory_limit` 1 GB e `threads` 2.

## 1. Como o v3 entra na spec, no contrato e nas skills

- **Spec (`docs/spec_dashboard.md`)** continua a fonte única. Cada etapa reescreve a seção da sua aba, com os critérios de
  aceite novos, e a seção 6 ganha as regras novas: loja principal, valor em risco por loja, perfil da loja, contribuição
  para a variação, pares por período. A V1 reescreve 5.0 (seleção e período) e tira o Laboratório das abas (vira a página
  "Metodologia e validação"). Cabeçalho da spec com a nota do redesenho v3 e a tabela de escopo (seção 4) com as 4 abas.
- **Contrato:** sobe para **3.0** na V2, quando os primeiros arquivos saem, e fica em 3.0 até a V5; o histórico do
  contrato ganha uma linha por etapa. Regra nova: **arquivos por período**, `<nome>_<periodo>.json` (`4s`, `13s`, `26s`,
  `base`), carregados só quando a aba é aberta naquele período. O manifest ganha `periodo` nos arquivos por período e
  `bytes_por_aba` passa a ser por aba × período (fixos da aba + os do período), cada um ≤ 1,5 MB.
- **Skills:**
  - `exporting-dashboard-data`: lista de etapas, arquivos por período, regra da loja principal;
  - `validating-dashboard`: os 4 gestos de seleção em todo gráfico clicável, o período em todas as abas, o teste dos
    5 segundos (uma frase por gráfico no relatório), as checagens novas de reconciliação;
  - `designing-dashboard-ui`: o modelo único de seleção (`selecao.js`), a linha de texto no lugar de gráfico, o painel
    lateral, "N× mais que o normal" no lugar de "lift".

## 2. O que sai

| Etapa | Tela | Dados (arquivos) |
|---|---|---|
| V1 | Laboratório sai das abas (vira `site/metodologia.html`, link "Metodologia e validação" no rodapé) | nenhum (os `lab_*` ficam) |
| V2 | mapa de calor dia × hora; card "O que as análises mostram" | `calor_dia_hora.json`, `calor/*.json`, `insights.json` |
| V3 | pares de departamento no "Compra junto com"; regra dos 10% | `cesta_departamentos.json`; os de 26 semanas viram por período (`departamentos_ficha`, `departamentos_segmento`, `subcategorias`, `cesta_subcategorias`) |
| V4 | matriz de afinidade, evolução semanal por segmento, lista de ação como bloco, mapa de bolinhas por loja, calor região × semana, ranking de crescimento; as abas Segmentos e Lojas viram uma | `afinidade.json`, `lojas_pares.json`, `regioes_semana.json`, `lojas_ficha.json` (vira por período) |
| V5 | curva ABC (vira uma linha de texto) | `abc.json`; `marcas`, `rede_pares`, `rede_caracteristicos` viram por período e por segmento |

O código das telas removidas sai junto (sem código morto). O `lista_acao.json` fica: alimenta o CSV da ficha da loja.

## 3. Etapas

### V0 — o número 136
Só investigação, em `pendencias_v3.md` (P1). Nenhum texto alterado. Relatório `docs/validacao/v0.md`.

### V1 — seleção, período global, Laboratório fora das abas
- **`site/js/selecao.js`** (novo), o único lugar com a regra: clique seleciona; clique no item já selecionado desfaz e
  volta ao total; Ctrl/⌘ + clique soma ou tira; Esc ou clique no fundo vazio do gráfico limpa a seleção daquele gráfico;
  item selecionado destacado e os outros a 0,35 (cada aba já desenha assim). Serve a dimensões **globais** (segmentos,
  departamentos, no estado compartilhado) e **locais** de uma aba (loja, região, perfil, subcategoria); toda seleção que
  vira filtro tem etiqueta removível na linha de filtros (as locais só aparecem na aba delas). `filtros.js` passa a usar
  o módulo (o `aplicarCliqueGrafico` de hoje sai). Registro por gráfico: `ligarGrafico(chart, dimensao)` liga o clique no
  fundo (zrender, `e.target` vazio) e guarda o último gráfico usado, que o Esc limpa.
- **Período em todas as abas:** o botão nunca fica desabilitado. Enquanto a aba não tiver dados por período (até a etapa
  dela), os blocos dizem "26 semanas (fixo nesta versão)". Os fixos de verdade, depois do v3, levam a nota curta:
  segmento do cliente, risco de pausa, matriz de migração.
- **Laboratório:** sai do `tablist`; `site/metodologia.html` carrega o mesmo `tabs/laboratorio.js` numa página própria
  (sem filtros; período e departamento não se aplicam ali) e volta ao painel por um link.
- Validação: os 4 gestos em cada gráfico clicável das 5 abas que sobram, por clique real (Playwright MCP).

### V2 — Visão Geral
- Sai o calor dia × hora; entra **"O que puxou a variação"**: barras horizontais com a diferença em US$ contra o ano
  anterior por departamento (lojas comparáveis do período), ordenadas, ▲ verde / ▼ vermelho, rótulo com o valor e a
  variação do departamento. Os 10 maiores em módulo + "Outros". Base inteira: sem ano anterior, aviso no lugar.
- **Faturamento por departamento** ganha o marcador do ano anterior (traço fino) em cada barra.
- Sai o card de insights; entra **"Faturamento por segmento"**: barra 100% empilhada com % e valor, respondendo a todos
  os filtros; clicar num segmento filtra.
- Dados: tudo sai de `cubo_periodo.json` (já tem faturamento, comparável e ano anterior por período × grupo ×
  departamento). Nenhum arquivo novo: os três "arquivos novos" da seção 5 do redesenho para a Visão Geral seriam cópias
  do cubo. Reconciliação nova: soma das contribuições = variação total (os 3 períodos com ano anterior), segmentos somam
  o total; a checagem "136 do app" passa a ler `manifest.modelo.pausas_esperadas`.

### V3 — Categorias
- Arquivos por período: `departamentos_ficha_<p>`, `departamentos_segmento_<p>`, `subcategorias_<p>` (top 10 de cada
  departamento e do total), `cesta_subcategorias_<p>` (**todos** os departamentos, os 10 pares de maior *lift* por
  subconjunto × departamento, mínimo de 200 cestas). Fixo: `departamentos_risco.json` (dinheiro em risco, 26 semanas: o
  risco é uma foto). A macro `painel.par_subcategoria(dep, ini, fim)` passa a receber a janela; a etapa roda um
  departamento × período por vez.
- Tela: lista com "clique de novo desfaz" e "Todos os departamentos"; "Compra junto com" no centro, maior, com a frase de
  confiança ("Quem compra A também leva B em 38% das vezes · 11× mais que o normal"; lift técnico no tooltip e na
  tabela); faturamento semanal vira uma faixa baixa sob o cabeçalho; radar, comparação, top 10 e dinheiro em risco
  continuam. 4 semanas: aviso "período curto: poucos pares confiáveis".
- **Layout 1440×900:** esquerda (3 col.) lista + dinheiro em risco; centro (6 col.) cabeçalho, faixa semanal, "Compra
  junto com"; direita (3 col.) radar + valores reais e comparação, top 10 subcategorias.

### V4 — Clientes & Lojas (junção de Segmentos e Lojas)
**Regra da loja principal (spec, seção 6):** cada cliente é atribuído à **loja de maior faturamento dele nas 26 semanas**
(empate: mais cestas, depois o menor `STORE_ID`), em `painel.loja_principal`. Vale para o **perfil da loja** e o **valor
em risco por loja**; o resto (faturamento, ticket, crescimento, ficha) usa todas as cestas da loja. A reconciliação
confere: soma do valor em risco das lojas = total em risco; segmentos de cada loja = valor da loja; cada cliente numa loja.

- **Valor em risco** = faturamento de 26 semanas (`vw_metricas_cliente.valor`, todas as lojas) dos clientes na faixa ⚠
  alta de risco, na loja principal deles, aberto por segmento. Fixo (o risco é uma foto).
- **Perfil da loja:** % de cada segmento entre os clientes de loja principal ÷ o mesmo % na rede × 100; perfil = o
  segmento de maior índice; menos de 30 clientes (`tamanho_minimo_grupo` do RAG) = amostra pequena, sem perfil. Fixo
  (26 semanas, a janela da loja principal).
- Arquivos: `segmentos`, `migracao`, `migracao_segmentos` (ficam); `lista_acao` ganha `loja_principal` (o CSV da ficha);
  `regioes` ganha a posição da bolha da região; `regioes_segmento.json` (região × período × grupo); `lojas.json` passa a
  ser o cadastro da aba (região, perfil, índices, clientes de loja principal); `perfis.json`; `lojas_risco.json` (loja ×
  segmento); `lojas_ranking_<p>` (loja × subconjunto: faturamento, cestas, ticket, crescimento, amostra) e
  `lojas_ficha_<p>` (KPIs, árvore de vendas, mix). Em 26 semanas as variações e a árvore batem com `vw_yoy_loja`; em 4 e
  13 semanas a mesma regra do RAG aplicada às lojas comparáveis do período (`painel.lojas_comparaveis`).
- **Layout 1440×900:**
  ```
  linha 1  [ Fiéis ][ Regulares ][ Esporádicos ][ Em pausa ]                           (cards, ~72 px)
  linha 2  [ Roda | Migração (4 col.) ][ Regiões: quem compra (5 col.) ][ Perfil (3 col.) ]   (~330 px)
  linha 3  [ Ranking top 10, seletor de métrica (12 col.) ]                                    (~330 px)
           com uma loja aberta: [ Ranking (5 col.) ][ Ficha da loja, painel lateral (7 col.) ✕ ]
  ```
  Celular: tudo empilhado; a ficha abre logo abaixo do ranking.

### V5 — Cestas & Marcas
- Linha de texto no topo: "N subcategorias fazem 80% do faturamento" (`concentracao.json`, período × subconjunto).
- Rede: nós e posições fixos (as 80 maiores subcategorias das 26 semanas: trocar o desenho a cada período desorientaria);
  as ligações e os números mudam com o período e o segmento (`rede_pares_<p>`). Clique num nó: `emphasis.focus:
  'adjacency'`, vira o filtro de subcategoria da aba, segundo clique desfaz. Rótulos nos 15 maiores nós e nos vizinhos do
  selecionado.
- Pares característicos: com um nó, os pares dele por *lift* com a frase de confiança (`rede_vizinhos_<p>`, os 10 de
  cada nó × subconjunto, sem amostra pequena); sem nó, os característicos do segmento (`rede_caracteristicos_<p>`).
- Marca própria e fornecedores por subconjunto de segmentos (`marcas_<p>`); clique na linha filtra o departamento.

## 4. Estimativa de tamanho e memória

| Aba × período | Arquivos | Estimativa |
|---|---|---|
| Abertura (Visão Geral) | `departamentos`, `cubo_faturamento`, `cubo_periodo`, `kpis_filtrados` | ~295 KB (hoje 312; saem calor e insights) |
| Categorias | ficha + segmento + subcategorias + pares (por período) + risco | ~260–330 KB por período (os pares de todos os departamentos com top 10 ≈ 26 × 16 × 10 linhas compactas) |
| Clientes & Lojas | fixos (~120 KB: segmentos, migração, lista, regiões, perfis, lojas, risco) + ranking e ficha do período | ~600–700 KB por período |
| Cestas & Marcas | nós + concentração + pares, vizinhos, característicos e marcas do período | ~500–700 KB por período |
| Metodologia (página à parte) | `lab_*` | 26 KB |

Todos abaixo de 1,5 MB. **Memória:** o pico conhecido é ~200 MB por etapa. O que mais pesa é contar pares de
subcategorias na base inteira (101 semanas, cerca de 4× as cestas da janela de 26): GROCERY passa de ~3,4 milhões de
linhas de pares para ~13 milhões antes de agregar. Por isso: um departamento × período por vez, e o excedente vai para
`data/tmp/duck`. Se uma etapa passar de 1 GB, ela é partida (por subconjunto) antes de subir o limite; o limite não muda.

## 5. Validação de cada etapa
Camadas da skill: dados (schemas, reconciliação sem divergência, orçamento) → tela (Playwright MCP: console, aceite,
4 gestos por clique real, período, 1440×900 sem rolagem e 390×844, snapshot antes de captura) → repositório. Relatório
em `docs/validacao/v<N>.md` com a frase do teste dos 5 segundos de cada gráfico novo ou mudado. Commit
`feat: redesenho v3, V<N> (…)`. Servidor encerrado e porta 8000 livre antes da etapa seguinte.
