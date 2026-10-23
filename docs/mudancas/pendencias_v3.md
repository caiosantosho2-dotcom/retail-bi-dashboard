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
