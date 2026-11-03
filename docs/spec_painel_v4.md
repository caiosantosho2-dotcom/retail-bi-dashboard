# Spec — Painel v4: o painel passa a ser consumidor do lakehouse

> **Decisões de origem** (no projeto do lakehouse, `C:\Dashboard_Lakehouse\docs\decisoes_arquitetura_lakehouse.md`):
> - **"Painel v4"**: escopo das abas;
> - **G1–G4, G7, G10**: regras das métricas;
> - **G35–G38**: arquivos e contratos 5.0;
> - **G43**: o painel é consumidor do lakehouse.
>
> Em conflito, valem aquelas decisões.
> **Somente leitura nesta sessão:** `C:\Dashboard_Lakehouse` e `C:\RAG_Varejo`. Nada é alterado lá.
> **Sem push e sem publicar.** Publicar = merge na `main` (o workflow do Pages roda sozinho), e isso só acontece quando o Caio pedir.

## Objetivo
O painel deixa de calcular os próprios números. A partir do v4:
- Ele **lê os JSONs exportados pelo lakehouse** (`C:\Dashboard_Lakehouse\export\painel_v4`, contrato 5.0).
- Ele aplica as mudanças de escopo do v4:
  - a Visão Geral perde "O que puxou a variação";
  - o gráfico de tempo mostra só o período, com o ano anterior;
  - Categorias acompanha esse gráfico;
  - a aba Clientes & Lojas sai.

O lakehouse já garante os números: os JSONs exportados batem com o painel publicado em 54.130 de 54.131 linhas, e a diferença é explicada na G35. **Este repositório cuida só de levar os dados para o site e de mostrá-los.**

## Fora do escopo
- Qualquer conta nova ou métrica nova. Se faltar um número, **parar e perguntar**: ele tem que nascer na gold do lakehouse, nunca aqui.
- Mudanças visuais além das listadas (cores, layout das abas que ficam, textos).
- `causal_data`.

---

## 0. Antes de começar
- Criar a tag **`v3-rag`** no commit atual da `main`. É o ponto de volta para a versão publicada, com o pipeline antigo.
- Trabalhar na branch **`v4-lakehouse`**.

## 1. Dados: importar do lakehouse (`scripts/importar_lakehouse.py`)
- **Config:** `lakehouse_export`, o caminho da pasta de exportação, no `config.yaml` e no `config.example.yaml` (este com caminho genérico).
- **O que o script faz:**
  1. Confere que a pasta existe e que o `manifest.json` dela tem `versao_contrato` 5.0.
  2. Valida **cada JSON** contra o contrato de `contracts/`.
  3. Só depois de tudo passar, troca o conteúdo de `site/data/`:
     - remove os arquivos que saíram do v4 (lista em G36/G38: `segmentos`, `lista_acao`, `migracao*`, `lojas*`, `regioes*`, `perfis`, `cubo_faturamento`);
     - copia os novos.
  4. Se algo falhar, termina com código 1 e `site/data/` fica como estava.
  5. Mostra um resumo: arquivos copiados, removidos e bytes da abertura.
- **Contratos:** substituir `contracts/` pelos contratos 5.0 do lakehouse (`C:\Dashboard_Lakehouse\contracts\`). São os 19 que ficam (iguais byte a byte), mais `faturamento_tempo.schema.json` e `manifest.schema.json` 5.0. Remover os contratos dos arquivos que saíram.
- **O pipeline antigo sai do repositório** e continua na tag `v3-rag`:
  - `scripts/exportar_dados.py`, `rag_modelos.py`, `reconciliar.py`, `regioes.py`, `layout.py` e `scripts/sql/`;
  - os testes que dependem deles;
  - `duckdb_origem` e `rag_dir` do config.
- **Motivo da remoção:** a conta e a conferência agora moram no lakehouse (`python -m src.pipeline`). Manter as duas cópias criaria duas definições da mesma métrica.

## 2. Front-end

### 2.1 Geral
- **Manifest 5.0:** o "Sobre os dados" mostra `lakehouse_commit`, `base_hash` e o período da base, no lugar de `rag_commit`. Nenhum texto do site diz que os números "vêm do RAG". A origem agora é **"lakehouse (bronze → silver → gold)"**, e a Metodologia diz que os modelos foram trazidos do projeto de RAG e conferidos.
- **Carga dos arquivos:** seguir as listas de carga e `bytes_abertura` do manifest 5.0. Os 4 `faturamento_tempo_<p>.json` fazem parte da abertura.

### 2.2 Visão Geral
- **Sai** o bloco "O que puxou a variação", com tudo o que só ele usava: código, estilos e textos.
- **Faturamento ao longo do tempo** (`faturamento_tempo_<periodo>.json`, G2), no lugar do semanal de 52 semanas:
  - **mostra só o período selecionado**:
    - 4 s: **um ponto por dia** (28);
    - 13 s, 26 s e base: um ponto por semana;
  - **ano anterior tracejado** no mesmo eixo (dia − 364 no diário; semana − 52 no semanal);
  - na **base inteira** não há ano anterior: só a linha cheia, e uma nota curta diz por quê;
  - **subtítulo obrigatório com as lojas:**
    - em 4/13/26 s, "lojas comparáveis do período (N lojas)", com o N vindo de `kpis_filtrados`/manifest;
    - na base, "todas as lojas".

    Isso evita confusão com o KPI de faturamento, que soma todas as lojas e por isso dá um número diferente da soma da linha.
  - filtros de segmento e departamento funcionam como no gráfico antigo, somando no navegador o que soma (grupo × departamento);
  - eixo de datas como no gráfico antigo; **sem dia da semana nem feriado**, porque o calendário é reconstruído (README, "O que a base não tem");
  - sem gestos de seleção, como no gráfico antigo: o ponto só mostra o tooltip (seção 3).

### 2.3 Categorias
- O gráfico semanal da ficha do departamento passa a usar o **mesmo componente e o mesmo arquivo** da Visão Geral (G3), filtrado pelo departamento, com as mesmas regras de grão, ano anterior e subtítulo.
- O resto da aba **não muda**.

### 2.4 Clientes & Lojas: sai inteira
- Remover:
  - a aba, o botão e o painel do `index.html`;
  - `site/js/tabs/clientes.js`;
  - as entradas em `app.js` (`MODULOS`, `SEM_DEPARTAMENTO`, `NOTAS`) e os estilos usados só por ela.
- Procurar **todo link interno** para a aba (`data-ir-para="painel-clientes"`, cards de "ver análise") e removê-lo ou redirecioná-lo. Nenhum link pode levar a uma aba que não existe.
- A navegação por teclado entre as abas (setas, Home, End) continua funcionando com 3 abas.

### 2.5 Cestas & Marcas e Metodologia
- Não mudam, a não ser pelos textos de origem (2.1).
- A Metodologia lê `lab_*` do lakehouse. O texto do modelo agora vem sem "do RAG" (G35).

## 3. Testes e conferência na tela
- **`tests/gestos.js`:** os 4 gestos em todos os gráficos clicáveis que ficam. O gráfico de tempo **não tem gestos** (decisão do Caio em 03/11/2026): como no gráfico antigo, o ponto só mostra o tooltip, porque não existe filtro por data. Nas duas abas, o teste prova que o clique no ponto não seleciona nem limpa nada e que o filtro de segmento muda a linha. Os testes da aba removida saem.
- **Navegador (Playwright), 1440×900 e 390×844,** nos 4 períodos:
  - todas as abas carregam sem erro no console;
  - o gráfico de tempo tem 28 pontos em 4 s;
  - ano anterior presente em 4/13/26 s e ausente na base;
  - nenhum link quebrado.
- **Números na tela contra os JSONs** (não contra conta própria), em 26 s, sem filtros:
  - faturamento US$ 2.151.812;
  - ticket 31,21;
  - lojas comparáveis 214, +3,4%;
  - clientes ativos 2.205;
  - Fiéis 71% do faturamento (a conferência de "35% dos clientes" saiu por decisão do Caio em 03/11/2026: o número vinha de `segmentos.json`, que saiu no v4, e nenhuma tela que fica o mostra);
  - dinheiro em risco total US$ 41.140,15;
  - AUC 0,85 × 0,74 na Metodologia.
- **Tamanho:** a abertura fica abaixo de 1,5 MB (manifest).

## 4. Documentação
- **README:** reescrever as seções "O que tem em cada aba", "Rigor", "Regenerar os dados" e "Estado" para a nova arquitetura:
  - CSV → lakehouse (bronze, silver, gold) → JSON com contrato → painel;
  - link para o repositório do lakehouse quando ele for publicado, ou um texto até lá;
  - regenerar = rodar o pipeline no lakehouse + `python scripts/importar_lakehouse.py`.
- **Capturas novas** em `docs/capturas/`, sem a aba Clientes & Lojas.
- **`docs/mudancas/resumo_v4.md`:** o que mudou e por quê, apontando para as decisões do lakehouse.
- **`docs/validacao/v4.md`:** primeira linha "tudo verde" ou o que precisa de atenção; depois as conferências da seção 3.

## 5. Paradas
- **4a: dados e remoção.** Seções 0 e 1, 2.1, 2.4 e 2.5. O site tem que funcionar com os JSONs do lakehouse, sem a aba, ainda com o gráfico de tempo **provisório** (pode ficar vazio, com aviso). Parar com relatório e sem commit.
- **4b: gráfico de tempo, testes e documentação.** Seções 2.2, 2.3, 3 e 4. Parar com relatório e sem commit.

## Critérios de aceite
- [ ] Tag `v3-rag` criada; trabalho na branch `v4-lakehouse`.
- [ ] `python scripts/importar_lakehouse.py` valida e copia; com um JSON inválido, termina em 1 e não mexe em `site/data/`.
- [ ] `site/data/` só tem arquivos do contrato 5.0; nenhum arquivo do v3 sobrando.
- [ ] O site abre sem erro no console, nas 3 abas e na Metodologia, nos 4 períodos e nos 2 tamanhos de tela.
- [ ] O gráfico de tempo segue a G2 nas duas abas, com o subtítulo das lojas.
- [ ] Os números da seção 3 aparecem na tela.
- [ ] Nada alterado em `C:\Dashboard_Lakehouse` nem em `C:\RAG_Varejo` (`git status` limpo nos dois).
- [ ] Nenhum push, nenhum merge na `main`.
