# Spec — v4.1: dois blocos de decisão na Visão Geral

> Vale para os **dois repositórios**. A mesma cópia fica em `C:\Dashboard_Lakehouse\docs\` e em `C:\retail-bi-dashboard\docs\`.
> - **Parte A (lakehouse):** a conta nasce na gold, com exportação e contrato.
> - **Parte B (painel):** o painel só mostra.
>
> Regras de sempre:
> - uma definição por métrica;
> - nenhuma conta no navegador além de somar o que soma;
> - igualdade com o que já existe;
> - nada de push sem o Caio pedir.
>
> **Ordem:** Parte A inteira e commitada → Parte B.

## Por que estes blocos
Hoje a Visão Geral responde "**como estamos?**". Os dois blocos novos respondem "**o que fazer agora, com o que temos?**": cada um tem um **decisor**, uma **restrição** e uma **ação**.

| Bloco | Pergunta | Decisor | Restrição |
|---|---|---|---|
| **1. Quem acionar** | Se o CRM só consegue acionar **N clientes**, quem priorizar e o que isso protege? | time de CRM | capacidade de contato (N) |
| **2. Onde agir no mix** | Quais departamentos atacar primeiro: **investir, manter, defender ou rever**? | category management | atenção limitada: 3 departamentos em destaque |

---

## Parte A — Lakehouse (`C:\Dashboard_Lakehouse`)

### A1. Bloco 1: `gold/metrics/crm_capacity`
**Fonte:** o que já existe em `gold/models/`:
- `churn_score`: probabilidade de pausa na foto T = 101;
- `churn_test_score`: notas do teste, nas fotos 85 e 93;
- o faturamento de 26 semanas por cliente.

Nada no modelo muda.

**Ordem de prioridade (definição única, nova):**
- `priority_score = probability × revenue_26s` (faturamento de 26 semanas do cliente);
- prioriza quem tem **mais chance de pausar e mais valor**;
- empate → `household_key`.

**Atenção ao nome:** isso **não** é o "dinheiro em risco" da G4. Aquela métrica continua única, com a definição dela. A `priority_score` serve só para **ordenar**.

**Capacidades:** 25, 50, 100, 150, 200 e 300 clientes. A lista fica no config, em `gold.crm.capacidades`.

**Tabela `crm_capacity`, grão capacidade × método:**

| Coluna | Significado |
|---|---|
| `capacity` | N clientes acionados |
| `method` | `model` (ordem pela `priority_score`) ou `baseline` (regra simples: mais semanas sem comprar; empate pelo faturamento de 26 s) |
| `pauses_expected` | **esta semana** (foto 101, só `model`): soma das probabilidades dos N primeiros |
| `revenue_26s_at_stake` | **esta semana** (só `model`): faturamento de 26 s dos N primeiros |
| `segment_mix` | **esta semana** (só `model`): quantos dos N são de cada segmento |
| `hist_precision` | **no teste** (fotos 85 e 93, média das duas): dos N primeiros pela mesma regra de ordenação, que fração pausou de verdade (*precision@N*) |
| `hist_pauses_caught_share` | **no teste**: das pausas reais da foto, que fração estava entre os N primeiros (*recall@N*) |

- No teste, `priority_score` usa a probabilidade do teste × o faturamento de 26 s **até a foto**, calculado das features já gravadas (G21: valor original). Não usa nada posterior à foto.
- A população é a mesma do modelo: cliente elegível na foto.

**Gabaritos para conferir por outro caminho:**
- `pauses_expected` com N = população inteira = **135,95** (soma das probabilidades, já conferida);
- a curva `hist_precision` de `model` fica **acima** da de `baseline` na maioria das capacidades. Se não ficar, registrar e explicar, sem forçar.

> **Revisão de 04/11/2026 (G48, decisão do Caio depois da Parte A):** o resultado mostrou que ordenar só por `probability × revenue_26s` perde da regra simples em precisão (13% × 28% em N = 100). Quem tende a pausar gasta pouco (correlação −0,75), então essa ordem leva a lista para clientes valiosos de risco menor. Por isso o bloco passa a ter **dois objetivos**, cada um comparado com a regra simples **na métrica dele**:
> - **`objective = pauses`**: ordem pela `probability`; métrica principal `hist_precision` (dos N, quantos pausaram);
> - **`objective = value`**: ordem pela `priority_score`; métrica principal `hist_value_caught` (faturamento de 26 s, até a foto, dos clientes entre os N que pausaram de fato; média das fotos 85 e 93) e `hist_value_caught_share` (fração do valor total das pausas reais da foto).
> - `method` passa a ser `model` ou `baseline` dentro de cada objetivo. A regra simples é a mesma nos dois.
> - As colunas de "esta semana" (`pauses_expected`, `revenue_26s_at_stake`, `segment_mix`) saem por objetivo.
> - Se o modelo perder da regra simples em algum objetivo e capacidade, isso **aparece no painel**, sem esconder.

### A2. Bloco 2: `gold/metrics/department_quadrant`
**Fonte:** `department_profile` e `department_segment`, que já existem. Nada é recalculado.

**Grão:** período × subconjunto × departamento, só departamentos **sem** amostra pequena. A base inteira fica **fora**: não tem crescimento comparável (G2c).

| Coluna | Significado |
|---|---|
| `share` | participação no faturamento do período (já existe) |
| `growth` | crescimento nas lojas comparáveis do período (já existe) |
| `share_cut` | corte de participação: **mediana** dos departamentos válidos no recorte |
| `growth_cut` | corte de crescimento: o **crescimento total** do recorte (comparável) |
| `quadrant` | `invest` (participação abaixo do corte, crescimento acima) · `keep` (acima, acima) · `defend` (acima, abaixo) · `review` (abaixo, abaixo) |
| `gap_value` | US$ que o departamento ficou abaixo (ou acima) do crescimento do recorte: faturamento do ano anterior × (`growth` − `growth_cut`) |
| `highlight_rank` | 1 a 3 para os **3 departamentos de `defend` com o `gap_value` mais negativo**; nulo nos demais |

**Por que o corte de crescimento é o total do recorte, e não zero:** a pergunta é "quem puxa para baixo **em relação ao negócio**", não "quem caiu".

**Conferência:** soma de `share` = 1 entre os departamentos válidos mais os de amostra pequena, e todo departamento cai em exatamente um quadrante.

### A3. Exportação e contrato (contrato **5.1**, só acréscimo)
- `acionamento_crm.json`: de `crm_capacity`, com colunas em português (`capacidade`, `metodo`, `pausas_esperadas`, `faturamento_26s_em_jogo`, `mix_segmentos`, `precisao_historica`, `pausas_capturadas_historica`). Carga junto da abertura.
- `departamentos_quadrante_<p>.json` para `4s`, `13s` e `26s`, de `department_quadrant`.
- Contratos novos em `contracts/`, e o `manifest` passa para `versao_contrato` **5.1**. **Nenhum arquivo existente muda.**
- `reconcile`:
  - os arquivos que já existiam continuam iguais ao gabarito congelado;
  - os novos são conferidos pelos gabaritos da A1 e da A2;
  - o caminho 2 refaz a `hist_precision` de N = 100 por SQL próprio sobre `churn_test_score`.

### A4. Testes, decisões e fim da Parte A
- **Testes:**
  - ordenação e desempate;
  - precision@N e recall@N calculados à mão num caso pequeno;
  - quadrante nos 4 cantos e na linha do corte (regra: **igual ao corte conta como "acima"**);
  - base inteira ausente;
  - contrato 5.1.
- **Documento de decisões:** G45 (bloco 1) e G46 (bloco 2), com o porquê, e o aviso de que `priority_score` ≠ "dinheiro em risco".
- `python -m src.pipeline` com código 0.
- Commit: `feat: gold para os blocos de decisão (CRM e quadrante de departamentos)`. Depois, rodar o pipeline **de novo** para o manifest sair com o commit limpo.
- Relatório em `docs/validacao/v4_1_gold.md`.

---

## Parte B — Painel (`C:\retail-bi-dashboard`, branch nova `v4-1-decisao`)

### B1. Dados
- Copiar os contratos 5.1 do lakehouse.
- Rodar `scripts/importar_lakehouse.py`. O importador aceita 5.1 e recusa outra versão.

### B2. Bloco "Quem acionar" (Visão Geral)
- **Título:** "Quem o CRM deve acionar". **Subtítulo:** "Com capacidade para N clientes, priorizando quem tem mais chance de pausar e mais valor".
- **Seletor de capacidade:** 25, 50, 100, 150, 200 e 300, com 100 como padrão.
- **Seletor de objetivo (G48):** "Priorizar risco de pausa" (padrão) ou "Priorizar valor em risco" (rótulos revistos em 04/11/2026: a base não mede pausas evitadas). Troca a ordem da lista e a métrica da comparação histórica.
- **Esta semana:**
  - 3 números: **clientes acionados**, **pausas esperadas** entre eles e **faturamento de 26 s em jogo**;
  - uma barra com o mix por segmento.
- **No teste histórico:** uma linha por capacidade, com o modelo × a regra simples ("mais tempo sem comprar"), na métrica do objetivo escolhido:
  - "Priorizar risco de pausa": "Dos 100 primeiros, X% pausaram de fato, contra Y% pela regra simples";
  - "Priorizar valor em risco": "Os 100 primeiros concentravam US$ X do valor das pausas reais, contra US$ Y pela regra simples".
  Se a regra simples ganhar, o texto diz isso.
- **Recortes sem dados ou com menos de 3 destaques no bloco 2:** mostrar o que existe e uma nota curta (G47).
- **Filtros:**
  - não muda com o período nem com o segmento (foto fixa da semana 101). Nota igual às outras notas de filtro fixo;
  - o departamento não se aplica.
- **Sem lista de clientes:** o bloco mostra a decisão, não a lista.
- **Link** "como o modelo foi avaliado" → Metodologia.

### B3. Bloco "Onde agir no mix" (Visão Geral)
- **Título:** "Onde agir no mix de departamentos".
- **Gráfico de dispersão:**
  - x = participação, y = crescimento comparável, com as linhas dos dois cortes;
  - os 4 quadrantes com rótulo **Investir · Manter · Defender · Rever**;
  - os 3 destaques (`highlight_rank`) marcados e listados ao lado: "Defender primeiro: A (−US$ x), B, C".
- **Filtros:**
  - responde ao período e ao segmento;
  - na **base inteira**, o bloco mostra uma nota ("sem ano anterior, não há crescimento para comparar") em vez do gráfico;
  - o departamento **destaca** o ponto.
- **Gestos:** clicar num ponto seleciona o departamento, como nos outros gráficos (filtro global de departamento). Os 4 gestos valem.

### B4. Layout, testes e documentação
- **Layout:** os dois blocos entram na Visão Geral depois dos KPIs e do gráfico de tempo. Lado a lado em 1440, um embaixo do outro no celular.
- **Testes (Playwright, com os cuidados de sempre: passos pequenos e a regra dos 2 minutos):**
  - console limpo;
  - 1440×900 e 390×844;
  - 3 períodos + base;
  - números da tela = JSON: capacidade 100 e um quadrante;
  - gestos no bloco 2.
- **Documentação:**
  - README (o que tem em cada aba);
  - captura nova da Visão Geral;
  - `docs/mudancas/resumo_v4_1.md`;
  - relatório em `docs/validacao/v4_1_painel.md`.
- **Commit na branch.** Merge e publicação só quando o Caio pedir.
