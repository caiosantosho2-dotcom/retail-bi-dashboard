# Pendências do redesenho v3

Execução sem supervisão (2026-10-23). Quando houve dúvida ou conflito com a spec ou com os dados, ficou a opção mais
conservadora: a que muda menos e não inventa número. Cada item diz qual era a dúvida, o que foi escolhido e o que o Caio
precisa decidir. A ordem é a de prioridade: **P** = prioritária, depois as decisões de cada etapa.

---

## P1 — O número 136 (V0, redesenho v3, 0.3)

**Resultado:** são **dois números diferentes que coincidem em 136**. O 136 da previsão **não** é o 136 do teste. Não há
erro de cálculo, mas há risco real de confusão: o mesmo número aparece em duas frases com sentidos opostos (uma é
previsão sobre o futuro, a outra é acerto no passado). Nenhum texto sobre o 136 foi alterado.

### De onde vem cada número (código do RAG, `C:\RAG_Varejo`, commit `fffb207`, só leitura)

Tudo sai de uma chamada só, `src/nucleo/churn.py`, função `_calcular` (linhas ~255–342), com o modelo treinado nas fotos
das semanas 30 a 68 e o limiar 0,17 escolhido na foto da semana 77 (`config.yaml` do RAG, `analises.churn`).

| Número | O que é | De onde vem |
|---|---|---|
| **136 (previsão)**, "Cerca de 136 clientes ativos devem passar 8 semanas sem comprar" | **soma das probabilidades** de pausa dos 2.203 clientes ativos na última semana (101), sem rótulo: é o número **esperado** de pausas nas próximas 8 semanas. Valor exato: **135,95** | `prob_f = modelo.predict_proba(... fotografar(painel, fim, com_rotulo=False))` → `risco_por_segmento[].pausas_esperadas = g["p"].sum()` → `montar_e_dai`: `total_esperado = sum(pausas_esperadas)`, `conclusao = f"Cerca de {round(total_esperado)} clientes ativos…"` (linhas ~199–212). É a frase do README do RAG, linha 381, e do card da Visão Geral (`insights.json`, `numero` 135,95) |
| **136 (teste)**, "o modelo acha 136 das 283 pausas" | **verdadeiros positivos** no conjunto de teste histórico: 2 fotos (semanas 85 e 93, rótulos 86–93 e 94–101), 4.425 linhas, 283 pausas reais; com risco ≥ 0,17, o modelo deu 473 alertas e 136 deles pausaram de fato | `m = {..., **metricas_binarias(y_t, prob_t >= limiar)}` → `confusion_matrix(...)` → `tp = 136` (linhas ~150–157 e ~272). É a matriz de confusão da aba Laboratório (`lab_modelo.json`: tp 136, fn 147, fp 337, alertas 473, pausas 283) |
| **243** | clientes ativos **hoje** (semana 101) com probabilidade ≥ 0,17: os "households em alerta hoje" | `risco_por_segmento[].alertas = g["alerta"].sum()`, com `alerta = prob_f >= limiar`; frase "Fazer reativação seletiva nos 243 households em alerta hoje" (README do RAG, linha 385). No painel, a faixa ⚠ alta |
| **464** | lista de ação do painel: faixa alta (243) + faixa média (221, probabilidade entre 0,085 e 0,17). As faixas são do painel (decisão do usuário, fase 1), com cortes tirados do limiar do RAG | `painel.cliente_risco` e `painel.lista_acao` (`scripts/sql/views_painel.sql`). Soma das probabilidades dos 464: 100,0 pausas esperadas; dos 243: 73,3 |

Coincidência conferida: 135,95 arredonda para 136, e o TP do teste é exatamente 136. Mudar a semente, o limiar ou o plano
de fotos separaria os dois. Conferido também: a reconciliação já testava os dois lados separadamente (`app: 136 clientes
em risco (pausas esperadas)` contra a soma das probabilidades e a matriz do Laboratório contra `churn._calcular`).

### O que o Caio precisa decidir
1. **Manter as duas frases como estão** (corretas, mas confundem), ou **desambiguar** uma delas. Sugestões, sem aplicar:
   - na previsão: "Cerca de 136 **pausas esperadas** entre os 2.203 clientes ativos nas próximas 8 semanas (soma das
     probabilidades)";
   - no Laboratório: "No teste histórico (semanas 86–101), o modelo encontrou 136 das 283 pausas reais".
2. **O post do LinkedIn** (fora deste repositório) usa a frase da previsão, que está certa como previsão. Se o post
   juntar a previsão com o acerto do teste, aí sim há erro.
3. **Onde a previsão aparece depois do v3.** O card "O que as análises mostram" sai da Visão Geral (redesenho v3, seção 1,
   decisão já aceita). Com ele sai a única frase "136 clientes" da tela principal; o 136 continua no manifest
   (`modelo.pausas_esperadas`) e na reconciliação. Se o Caio quiser a previsão visível, o lugar natural é o bloco de
   valor em risco de Clientes & Lojas, com o texto que ele escolher no item 1.

---

## Decisões tomadas sem o Caio (por etapa)

As entradas abaixo são acrescentadas a cada etapa.

### V1 — seleção, período, Laboratório fora das abas
1. **"Clique no item já selecionado" com vários selecionados.** Antes (v2), clicar num dos selecionados deixava só ele;
   o redesenho diz "desfaz e volta ao total". *Escolhido:* a regra literal do redesenho (limpa a seleção daquele
   gráfico). Para tirar um só, Ctrl + clique. *Decidir:* se prefere o comportamento antigo nesse caso.
2. **Esc com o detalhe do segmento aberto.** O detalhe (card e Roda) já fechava com Esc. *Escolhido:* o primeiro Esc
   fecha o detalhe (o filtro continua) e o segundo limpa a seleção. Na Roda, o detalhe abre por cima dela (validação da
   R4), então o "clique de novo" na Roda só funciona depois de fechar o detalhe; isso some na V4, quando o painel muda.
3. **Opacidade 0,35 também nas listas** (lista de departamentos, cards, linhas de marca própria), como o redesenho
   pede: o texto de fora fica com pouco contraste de propósito. *Decidir:* se nas listas prefere 0,55, como era nos cards.
4. **Notas provisórias de período.** Até a etapa de cada aba (V3 a V5), a nota da linha de filtros diz que a aba "ainda
   usa só as 26 semanas". Somem quando a aba ganha os dados por período.
5. **Pontos da curva ABC** (só aparecem com filtro de departamento) ficaram fora do teste dos gestos: a curva sai na V5.
6. **P1, achado novo:** na página "Metodologia e validação", a conclusão da matriz de confusão junta os dois 136 no
   mesmo parágrafo ("o modelo avisa 136 das 283 pausas… Cerca de 136 clientes ativos devem passar 8 semanas sem
   comprar"). É a frase do RAG; não foi alterada.

### V2 — Visão Geral
1. **Barras de departamento nas lojas comparáveis.** Para o traço do ano anterior comparar a mesma coisa, as barras
   passaram a ser das lojas comparáveis do período (95–96% do faturamento) e não de todas as lojas; na base inteira,
   todas as lojas e sem traço. *Decidir:* se prefere as barras com todas as lojas e o traço só como referência.
2. **Nenhum arquivo novo para a Visão Geral.** A seção 5 do redesenho lista "contribuição", "ano anterior por
   departamento" e "faturamento por segmento" como arquivos novos; os três saem de `cubo_periodo`, que já tem o grão
   período × grupo × departamento. Criar arquivos seria duplicar o cubo.
3. **O "%" do rótulo da variação** é a variação do próprio departamento (▲ 3,6% em GROCERY), não a parte dele na
   variação total (essa está no tooltip). *Decidir:* qual das duas prefere no rótulo.
4. **Frase do 136:** com o card de insights, saiu a frase da previsão da tela principal (ver P1, item 3).

### V3 — Categorias
1. **Direção da frase do par.** "Quem compra A também leva B em X%" usa a direção de **maior confiança** (a da
   subcategoria menor para a maior); a outra fica no tooltip e na tabela. *Decidir:* se prefere sempre a ordem
   alfabética ou a da subcategoria maior.
2. **"Todos os departamentos".** A ficha sem departamento mostra o total do período, quem compra, os 10 pares de maior
   lift entre todos os departamentos (com o nome do departamento), o top 10 de subcategorias do total e o dinheiro em
   risco total. O radar compara departamentos entre si, então em "Todos" ele dá lugar a uma nota; a tabela mostra só
   os atributos que fazem sentido no total (crescimento, frequência, desconto, marca própria).
3. **Base inteira:** crescimento e penetração ficam "—" (não há ano anterior nem lojas comparáveis); não foram
   inventados com outra regra.
4. **Dinheiro em risco fixo nas 26 semanas** em qualquer período (o risco é foto do momento, 0.2), com nota no bloco.
5. **Poucos departamentos com pares.** Com o mínimo de 200 cestas, só 6 departamentos têm pares nas 26 semanas
   (GROCERY, DRUG GM, PRODUCE, MEAT, MEAT-PCKGD, DELI); nos outros, o bloco mostra o aviso de amostra pequena. O
   mínimo não foi mexido. *Decidir:* se quer baixar o mínimo para departamentos pequenos (com a medição da spec, abaixo de
   200 o lift oscila mais de 10%).
6. **Faturamento semanal da ficha** virou uma linha só (os segmentos selecionados somados), com o período sombreado. Os
   pequenos múltiplos por segmento saíram com ele (a faixa é baixa demais para 4 gráficos).

### V4 — Clientes & Lojas
1. **Perfil da loja quase sem amostra (prioritária desta etapa).** Com a regra obrigatória da loja principal e o mínimo
   de 30 clientes (o do RAG), **só 20 lojas** recebem perfil (8 Fiéis, 3 Regulares, 4 Esporádicos, 5 Em pausa); **127
   lojas, com 71% do faturamento, ficam "amostra pequena"**: a média é de ~16 clientes de loja principal por loja.
   *Escolhido:* manter a regra e o mínimo como estão escritos, e dizer isso no bloco ("127 lojas (71% do faturamento)
   ficam sem perfil"). *Decidir:* (a) aceitar; (b) baixar o mínimo para lojas (ex.: 15); (c) calcular o perfil com todos
   os clientes que compraram na loja (mais amostra, mas o cliente conta em várias lojas); (d) tirar o bloco.
2. **Painel lateral da ficha:** abre **ao lado** do ranking, na mesma linha (o ranking encolhe de 12 para 5 colunas), e
   não por cima dele, para a lista continuar clicável. Fecha com ✕, Esc ou o segundo clique na loja.
3. **CSV da loja:** os clientes das faixas alta **e média** com a loja como principal (a mesma regra da antiga lista de
   ação, com a coluna `loja_principal`). O valor em risco usa só a faixa alta (o redesenho define assim). *Decidir:* se o
   CSV deve ter só a faixa alta.
4. **Ranking de ticket e de crescimento sem amostra pequena** (regra do RAG para ranking de loja): em 26 semanas, 212
   das 319 lojas ficam fora; a nota do bloco diz quantas. Faturamento e valor em risco são somas e mostram todas.
5. **Ranking de crescimento mostra só as 10 maiores altas.** As maiores quedas não aparecem. *Decidir:* se quer um botão
   "maiores quedas".
6. **Região não filtra a Roda nem o perfil.** O redesenho diz "clicar numa região filtra a aba"; o ranking responde, a
   barra fica destacada, mas o perfil (fixo, rede inteira) e a Roda (segmentos do RFM) não mudam. *Decidir:* se o perfil
   deve ser recontado por região.
7. **O filtro de departamento não se aplica** à aba (ela olha a loja inteira), como já era em Lojas: fica desabilitado,
   com nota.
8. **No manifest, `minimo_compradores_afinidade` virou `minimo_clientes`** (a afinidade saiu; o 30 serve ao perfil, à
   migração e aos compradores).

### V5 — Cestas & Marcas (não feita)
1. **A etapa não foi executada:** o limite de uso da sessão chegou depois da V4. A aba Produtos segue como antes (26 semanas, com a nota provisória). O plano da V5 está em `plano_v3.md`, seção 3.
