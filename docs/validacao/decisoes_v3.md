# Validação — Decisões das pendências do v3 — 2026-10-26
Base: ddb4d8032cc2 · Contrato: 4.0
Dados: schemas OK (63 arquivos, 0 erros) · reconciliação 978/978 OK · RAG intocado (`git status` do RAG vazio) · Clientes & Lojas até 1,1 MB por período (limite 1,5 MB) · exportação completa (12 etapas, um processo por etapa, 2 min 27 s) idêntica byte a byte
Tela: console 0 erros e 0 avisos, nenhum 404 · 4 gestos 15/15 alvos · 1440×900 sem rolagem em Clientes & Lojas (sem filtro, com região, com a ficha aberta), Categorias e Metodologia · 390×844 sem rolagem horizontal
Repositório: OK · servidor local encerrado · **não publicado** (à espera da revisão)
Decisões e escolhas: `docs/mudancas/pendencias_v3.md`, "Decisões do Caio (2026-10-26)"

## O que mudou
- **Perfil da loja pela venda:** parte de cada segmento no faturamento da loja ÷ a mesma parte na rede (26 semanas);
  mínimo de 100 cestas. 108 lojas com perfil (98% do faturamento), 211 lojas pequenas (1,6%). Antes: 20 lojas.
- **Valor em risco por loja:** faturamento da loja vindo dos clientes em risco alto, por segmento; soma = US$ 41.140,15,
  igual ao dinheiro em risco de Categorias.
- **CSV da loja:** os clientes em risco (alto e médio) que compraram na loja nas 26 semanas, com o que gastaram nela.
- **Região filtra a página:** cards, Roda, perfil e ranking; o segundo clique limpa; migração e detalhe do segmento
  dizem "rede inteira".
- **P1:** previsão no ranking por valor em risco ("~136 pausas esperadas nas próximas 8 semanas, entre 2.203 clientes
  ativos"); na Metodologia, o acerto do teste e a previsão em frases separadas, com a nota de que a coincidência é só
  numérica.
- **Categorias:** aviso "Poucos dados para pares confiáveis" nos departamentos sem pares e a marca ⇄ na lista.
- Sai a regra da loja principal (views, export, contrato, spec, skills, README).

## Dados
- SQL: `views_painel.sql` (saem `loja_principal`, `loja_perfil_segmento`; `lista_acao` sem a loja; entram
  `lista_acao_loja` e o novo `loja_risco`), `painel_lojas.sql` (`loja_perfil` pela venda, `regiao_subconjunto`),
  `regioes_clientes.sql` (novo), `perfis.sql`, `lojas.sql`, `lojas_risco.sql`, `lista_acao.sql`.
- Arquivos: `lista_acao` (+ `lojas`), `lojas` (`cestas` no lugar de `clientes_principais`), `perfis` (região × perfil),
  `lojas_risco` (pela venda), `regioes_clientes` (novo, 127 combinações × 4 segmentos, 18 KB); manifest com
  `minimo_cestas_loja` e `modelo.clientes_ativos`.
- **Reconciliação nova** (SQL próprio na tabela fato): as lojas de cada cliente da lista (faturamento e cestas em cada
  uma) e a soma = faturamento dele; valor em risco (soma = faturamento dos clientes em risco alto = dinheiro em risco de
  Categorias; cada loja × segmento); perfil em todas as lojas (parte, índice, perfil, amostra pequena); cada região ×
  perfil (lojas, cestas, faturamento) e a soma = total das 26 semanas; as combinações de regiões (as 7 sozinhas, todas
  juntas e 3 sorteadas: clientes distintos, faturamento e cestas por segmento); `clientes_ativos` = população do modelo
  do RAG.
- **Teste de mutação:** 4 erros plantados (valor em risco de uma loja, perfil de uma loja, clientes de uma região,
  uma loja tirada da lista de ação) → 8 divergências, todos pegos; arquivos restaurados (validação de novo 0 erros).

## Tela (Playwright, o mesmo pacote do MCP rodado pelo Node: o MCP não conectou nesta sessão)
| Item | Resultado |
|---|---|
| Sem filtro | cards com os números do chat (Fiéis 35,4% dos clientes, 70,9% do faturamento); perfil 34 / 16 / 26 / 32 lojas; aviso "211 lojas (1,6% do faturamento) ficam sem perfil: menos de 100 cestas nas 26 semanas" |
| Clique na Região A | etiqueta "Região: Região A ✕"; cards da região (Fiéis 39,8% dos clientes, 72,5% do faturamento, US$ 31,00 por cesta); Roda da região; perfil 8 / 3 / 6 / 9 lojas; ranking "Top 10 de 26 lojas (Região A)" |
| Segundo clique na região | filtro limpo; cards de volta aos números do chat |
| Valor em risco | linha "~136 pausas esperadas nas próximas 8 semanas, entre 2.203 clientes ativos (previsão)"; some nas outras métricas |
| Ficha e CSV | loja 311: "Baixar clientes em risco desta loja (CSV, 9)"; o arquivo `clientes_em_risco_loja_311.csv` tem 9 linhas e as colunas novas |
| Categorias | ⇄ em GROCERY, DRUG GM, PRODUCE, MEAT, MEAT-PCKGD e DELI; PASTRY mostra "Poucos dados para pares confiáveis" com o mínimo e os departamentos com pares |
| Metodologia | as duas frases, com "135,95 é previsão sobre os clientes de hoje; 136/283, o acerto num teste do passado" |
| Gestos | 15/15 |

## Encontrado e corrigido
1. Com a etiqueta da região, a linha de filtros cresce e o rótulo de baixo da Roda saía do painel: os gráficos medem de
   novo depois da seleção, a Roda é refeita, o piso do lado caiu de 110 para 90 px e o subtítulo com região ficou mais
   curto.
2. Com a ficha aberta e a métrica Valor em risco, a linha da previsão e o subtítulo longo espremiam as 10 barras: a
   previsão ficou numa linha (a explicação vai para o tooltip) e, com a ficha aberta, o subtítulo fica numa frase (a
   definição vai para o tooltip).
3. Na Metodologia, a frase da coincidência encostava na borda do painel: ficou mais curta.
