**Precisa de atenção: as conferências passaram, mas a spec no repositório ainda traz os rótulos antigos, e a publicação versionada só roda de verdade no primeiro push. Rótulos de destaque ainda se tocam em 5 de 24 medições com filtro de segmento.**

# Validação: v4.1, Parte B, painel, 04/11/2026

Base: `040c15f100e0` · Contrato: 5.1 · Lakehouse: `9086214` (árvore limpa) · Branch: `v4-1-decisao`, juntada na `main` · Sem push

| Camada | Resultado |
|---|---|
| Dados | ✅ Importação com código 0 · 52 de 52 arquivos e 23 de 23 contratos iguais ao lakehouse · abertura 589.137 bytes (limite 1.572.864) · testes do importador 12/12 |
| Tela | ✅ Console: 0 erros e 0 avisos, com o cache limpo · roteiro `tests/v4_1_tela.js`: 7/7 em 1440×900 e 5/5 em 390×844 · gestos 10/10 alvos por clique real · textos 13/13 · fluxo em DOM emulado 155/155 |
| Layout | ✅ 1440×900: blocos lado a lado, página de 1.308 px, Categorias e Cestas & Marcas sem rolagem (900 px) · 390×844: empilhado, sem rolagem horizontal |
| Cache | ✅ Controle reproduz o erro; 4 de 4 cenários sem mistura · testes do script 11/11 · site gerado, no subcaminho: 0 erros e 0 respostas 4xx/5xx |
| Repositório | ✅ Nenhum arquivo proibido · nenhuma chave · Lakehouse e RAG com `git status` limpo · portas 8000 e 8001 livres · contraste OK |

Todas as conferências de tela acima rodaram na versão final de `site/`. No celular, o bloco 1 ficou fora da última rodada (2 passos), porque nada nele mudou; ele passou na rodada anterior.

## Pontos em aberto

1. **A spec não foi atualizada.** `docs/spec_v4_1_blocos_decisao.md` ainda traz "Evitar mais pausas" e "Proteger mais valor" (linhas 121, 126 e 127). Não há cópia com os rótulos novos aqui nem no lakehouse, então a edição pode não ter sido salva. O painel usa os rótulos novos. O arquivo foi para o commit como está.
2. **A publicação versionada nunca rodou no GitHub.** O workflow mudou e só roda no próximo push. A conferência foi local, com um servidor que imita os cabeçalhos do Pages.
3. **Rótulos que ainda se tocam.** Veja a seção "Rótulos".

## Cache: uma página aberta antes não mistura versões

**O problema:** o navegador guarda cada arquivo por até 10 minutos (`Cache-Control: max-age=600`, medido no site publicado). Um `formatar.js` antigo com um `visao_geral.js` novo quebra a Visão Geral.

**A solução:** a publicação roda `scripts/versionar_site.py`, que põe `js/` e `css/` em `v/<hash do conteúdo>/`. O site em `site/` continua igual, e o painel local roda sem esse passo.

**Por que pasta, e não `?v=` na URL:** o servidor ignora a query. Uma página aberta antes pediria uma aba pelo endereço antigo e receberia o código novo, que é a própria mistura. Com a pasta, o endereço antigo some (404) e a página recarrega uma vez, inteira na versão nova. Uma marca com hora impede laço de recarga.

**Fora do pedido literal:** o CSS foi junto com o JS, porque o defeito é o mesmo: CSS antigo com JS novo deixaria os blocos sem estilo.

| Cenário (`tests/cache_cenarios.js`) | Resultado |
|---|---|
| 1. **Controle**, sem versão: `formatar.js` antigo em cache e o resto novo | Reproduz `fmt.gap is not a function`, com 0 destaques. Prova que o teste detecta a mistura |
| 2. A mesma situação, com a pasta versionada | Só a versão nova, 3 destaques, 0 erros |
| 3. Página aberta antes de publicar, clique numa aba ainda não carregada | Recarrega: antes só a versão A, depois só a B, 3 destaques, 0 erros |
| 4. HTML antigo em cache, arquivos da versão já fora do cache | Recarrega: só a versão nova, 3 destaques, 0 erros |
| 5. Tudo em cache | Inteira na versão antiga; com o cache vencido, inteira na nova |

A primeira rodada dos cenários 3 e 4 falhou por defeito do meu servidor de teste, não do mecanismo: as duas publicações tinham a mesma data, e ele respondia "não mudou". Passou a comparar por conteúdo, como o Pages, que manda ETag. A espera fixa do roteiro virou espera pelo conteúdo, depois que o cenário 2 falhou uma vez com 0 destaques.

O site gerado também rodou em `/retail-bi-dashboard/`, o mesmo subcaminho do Pages: as 3 abas e a metodologia carregaram só a versão `8a088f0e7a4d`, com 0 erros.

**O que isso não cobre:**
- **Só na primeira publicação:** o HTML de hoje não tem a recarga. Quem está com ele em cache ou com uma aba aberta pode ver a página ou uma aba sem carregar até recarregar, por até 10 minutos no caso do cache. Não haveria mistura, mas esse caso não foi testado.
- **JSONs:** não entram na pasta versionada, conforme o pedido. Uma página aberta antes pode ler dados novos com o código antigo; só causaria erro se o contrato mudar.
- **Página já carregada:** quem não troca de aba fica com o código antigo até recarregar, sem misturar.

## Rótulos

O gráfico do bloco 2 mostra rótulo só nos 3 destaques e no departamento selecionado; os outros pontos só têm tooltip. No roteiro, em 26 semanas: sem seleção, `1. MEAT`, `2. MEAT-PCKGD`, `3. PASTRY`; clicar em GROCERY acrescenta `GROCERY`; Esc tira. Nas duas larguras.

Na visão padrão, nenhum rótulo toca outro nos 3 períodos. Medi também cada um dos segmentos Fiéis, Regulares e Esporádicos, 24 medições no total (4 recortes × 3 períodos × 2 larguras):

| O que sobrou | Onde |
|---|---|
| **Dois destaques se tocam (5 de 24)** | 4 s Fiéis e 26 s Fiéis, MEAT × DELI, nas 2 larguras · 13 s Regulares, MEAT × DRUG GM, em 1440×900 |
| **Rótulo sobre o ponto de outro destaque (12 de 24)** | 4 em 1440×900 e 8 em 390×844, inclusive 4 semanas na visão padrão. O contorno na cor do fundo ajuda a manter o texto legível |

São medidas da caixa do texto; não olhei a imagem de cada caso. Combinações de 2 ou mais segmentos não foram medidas. O rótulo do departamento selecionado também não entrou na medida de toque. Os nomes continuam na lista "Defender primeiro", no tooltip e na tabela.

## Decisões do Caio aplicadas

| Decisão | Como ficou |
|---|---|
| Rótulos do objetivo | "Priorizar risco de pausa" e "Priorizar valor em risco" |
| Só "Em pausa" | A nota substitui gráfico, lista e tabela |
| "Em pausa" junto de outros | O aviso aparece acima da nota do recorte |
| Rolagem na Visão Geral | Mantida |
| Eixo x | "Participação no faturamento (escala logarítmica)" |
| Cache | Pasta versionada, conferida contra página aberta antes |
| Rótulos do bloco 2 | Só destaques e selecionado |

Textos das notas, que escrevi:
- **Só "Em pausa":** "O segmento "Em pausa" é definido por ter parado de comprar, então o crescimento cai por construção. Por isso este recorte não tem gráfico."
- **Junto de outros:** "⚠ Com "Em pausa" no recorte, o crescimento cai em parte por construção: o segmento é definido por ter parado de comprar."

O aviso aparece quando o chip "Em pausa" está ligado, mesmo com os 4 ligados. Sem nenhum chip ligado (todos os clientes), não aparece.

## Números × JSON (no navegador)

**Bloco 1, capacidade 100:**

| Objetivo | Pausas esperadas | Faturamento em jogo | Frase do teste | Quem ganha |
|---|---:|---:|---|---|
| Priorizar risco de pausa | 40,38 | US$ 7.959,67 | "Dos 100 primeiros, 32,0% pausaram de fato, contra 28,0% pela regra simples." | modelo |
| Priorizar valor em risco | 19,44 | US$ 67.832,63 | "Os 100 primeiros concentravam US$ 5.987,85 do valor das pausas reais, contra US$ 6.600,08 pela regra simples." | **regra simples** |

Calibração na tela:
- **Pausas:** "No teste, 40,8 pausas esperadas viraram 32,0 reais nos 100 primeiros (média das fotos do teste)."
- **Valor:** "No teste, 17,7 pausas esperadas viraram 13,0 reais nos 100 primeiros (média das fotos do teste)."

As 12 combinações de capacidade e objetivo foram conferidas no DOM emulado. No navegador, conferi a capacidade 100 nos 2 objetivos. Quem ganha: pausas 6 de 6 para o modelo; valor 5 de 6, com a regra simples em N = 100, igual ao relatório da gold.

**Bloco 2:** em 4, 13 e 26 semanas, pontos, destaques e gaps iguais ao arquivo. Em 26 s, todos os clientes: 14 pontos · cortes 1,53% e 3,42% · 1º MEAT (−US$ 9.201,43), 2º MEAT-PCKGD (−US$ 2.600,03), 3º PASTRY (−US$ 691,33).

### Recortes pequenos do bloco 2

| Recorte | Tela | Nota |
|---|---|---|
| Base inteira | só a nota | "Sem ano anterior, não há crescimento para comparar." |
| Só "Em pausa", 4, 13 ou 26 s | só a nota | A nota de "Em pausa" acima. Na base inteira, vale a nota da linha anterior |
| 26 s, Fiéis + Em pausa | gráfico, 2 destaques | O aviso, mais "Só 2 departamentos em Defender neste recorte (14 com amostra suficiente)." |
| 13 s, Esporádicos | 9 pontos, 2 destaques | "Só 2 departamentos em Defender neste recorte (9 com amostra suficiente)." |
| 26 s, Fiéis | 14 pontos, 2 destaques | "Só 2 departamentos em Defender neste recorte (14 com amostra suficiente)." |

## Teste dos 5 segundos

- **Barra de mix:** de que segmentos são os clientes da lista desta semana.
- **Dispersão:** quais departamentos pesam e crescem menos que o negócio, e por quais três começar a defender.

## E daí?

- **CRM:** com capacidade de 100, a escolha é entre acertar mais (32% da lista pausou, US$ 8 mil em jogo esta semana) e cobrir mais valor (US$ 67,8 mil em jogo, 19,4 pausas esperadas). Em valor com N = 100, a regra simples foi melhor no teste, e o bloco diz isso.
- **Category management:** em 26 s, o primeiro lugar para investigar é MEAT. O gráfico mostra onde olhar, não a causa.
- **Limitações:** o número mede quem pausa, não o efeito do contato. O teste tem só duas fotos.

## Outras mudanças

- **Capturas:** refeitas `docs/capturas/visao_geral.png` (página inteira) e `celular.png`. As de Categorias, Cestas & Marcas e Metodologia não foram refeitas e podem trazer um rodapé antigo.
- **`contracts/faturamento_tempo.schema.json`:** muda só o fim de linha, para ficar igual byte a byte ao lakehouse.
- **README:** tirei a pendência da conferência do pipeline, porque o relatório da gold mostra o `reconcile` com código 0. Os trechos antigos do "Estado" continuam como estavam; vale revisar antes de publicar.
- **Decisões pequenas:** estão em `docs/mudancas/resumo_v4_1.md`.
- **Documentação do ECharts:** o Context7 não conectou. O ECharts ignorou `moveOverlap` e `offset` neste gráfico, e a regra final foi escolhida medindo na tela.

## Comandos para repetir

```powershell
venv\Scripts\python -m unittest tests.test_importar_lakehouse tests.test_versionar_site   # 23 testes
node --test tests/decisao_textos.test.mjs                                                 # 13 testes
venv\Scripts\python tests\servidor_cache.py --raiz $env:TEMP\cache_painel --porta 8001    # servidor dos cenários de cache
```

No navegador, os roteiros são `tests/v4_1_tela.js` (7 passos), `tests/gestos.js` (3 execuções) e `tests/cache_cenarios.js` (5 cenários, com o servidor acima no ar). **Limpe antes o cache do navegador do Playwright.** O fluxo em jsdom ficou na pasta temporária da sessão e não se repete por estes comandos.

Pendências: atualizar a spec, conferir o site publicado depois do primeiro push.
