# Resumo do painel v4

O painel deixou de calcular os próprios números: agora ele lê os JSONs exportados pelo lakehouse. Spec: `docs/spec_painel_v4.md`. Validação: `docs/validacao/painel_v4.md`.

As decisões citadas ficam no projeto do lakehouse, em `docs/decisoes_arquitetura_lakehouse.md`.

## O que mudou e por quê

| Mudança | Por quê | Decisão |
|---|---|---|
| O painel lê `export/painel_v4` do lakehouse (contrato 5.0), por `scripts/importar_lakehouse.py` | Manter a conta em dois lugares criaria duas definições da mesma métrica | G43 |
| O pipeline antigo saiu do repositório e ficou na tag `v3-rag` | A conta e a conferência agora moram no lakehouse | G43 |
| Aba Clientes & Lojas removida (com os arquivos e contratos dela) | Decisão de escopo do v4 | "Painel v4", G36, G38 |
| "O que puxou a variação" removido da Visão Geral | Decisão de escopo do v4 | "Painel v4" |
| O gráfico de tempo mostra só o período, com o ano anterior tracejado | As 52 semanas com sombreado saem; o grão acompanha o período | G2, G37 |
| Em 4 semanas, um ponto por dia (dia − 364) | Com grão semanal, a linha teria só 4 pontos | G2 (a) |
| A linha usa as lojas comparáveis do **próprio período** | Antes, usava as comparáveis de 26 semanas em todos os períodos | G2 (b) |
| Base inteira: todas as lojas, sem ano anterior | Sem ano anterior não existe loja comparável | G2 (c) |
| Categorias usa o mesmo gráfico e o mesmo arquivo | Uma regra só nas duas abas | G3 |
| Rodapé com a origem, o commit do lakehouse e a base | A procedência agora é o lakehouse | G36 |
| A descrição do modelo fica sem "do RAG" | O modelo agora roda no lakehouse | G35 |

## Em números

| | v3 | v4 |
|---|---:|---:|
| Abas | 4 | 3 |
| Arquivos em `site/data/` (com o manifest) | 63 | 48 |
| Contratos | 33 | 21 |
| Bytes da abertura | 295.526 | 446.719 |

A abertura cresceu porque os 4 `faturamento_tempo_<periodo>.json` fazem parte dela, e continua abaixo do limite de 1,5 MB.

## O que não mudou

Os números. A exportação do lakehouse, comparada com o painel anterior, bate em 54.130 de 54.131 linhas (a diferença é o texto da G35). Mudam de propósito só os do gráfico de tempo, pela regra de lojas da G2 (b).

Cestas & Marcas e a Metodologia seguem iguais, a não ser pelos textos de origem.

## Decisões do Caio durante a construção (03/11/2026)

- Regenerar a exportação a partir de um commit limpo do lakehouse, como exceção à regra de somente leitura.
- Tirar a conferência "Fiéis 35% dos clientes": o número vinha de `segmentos.json`, que saiu, e nenhuma tela que fica o mostra.
- Trocar "definição do chat" por um texto neutro nas dicas.
- Remover `cesta` e `memoria` do config.
- Dinheiro em risco arredondado na tela, com o valor exato ao passar o mouse.
- Atualizar as skills de dados e de validação para o fluxo novo.
- O conserto da conferência do pipeline, que comparava com `site/data/`, fica para uma sessão no lakehouse.
