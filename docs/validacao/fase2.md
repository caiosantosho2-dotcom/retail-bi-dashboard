# Validação — Fase 2 (Dados do MVP) — 2026-10-21
Base: ddb4d8032cc2 · Contrato: 1.1 · RAG: fffb20743097214da44a3e7211e0203beaa0a62e (sem mudanças não commitadas)
Dados: schemas OK (13 arquivos, 0 erros) · reconciliação 282/282 OK · tamanho abertura 232 KB (limite 1,5 MB)
Tela: console 0 erros · 12/12 arquivos do manifest servidos com 200 · rodapé lê o manifest real
Repositório: OK
Pendências: ver o fim deste arquivo

## O que foi entregue
| Arquivo | Linhas | Bytes | Origem |
|---|---|---|---|
| `kpis.json` | 24 | 4.396 | views do RAG + `painel.metricas_periodo` |
| `vendas_semanais.json` | 101 | 8.931 | `painel.cestas` nas lojas de `vw_lojas_like_for_like` |
| `calor_dia_hora.json` | 168 | 10.589 | `fato_transacoes.hora` × `dim_data.dia_semana` |
| `departamentos.json` | 44 | 4.134 | `vw_vendas_item` |
| `segmentos.json` | 4 | 853 | RFM, CLV e teste de desconto do RAG |
| `medias_segmento.json` | 24 | 2.305 | `painel.cliente_atributos` |
| `insights.json` | 3 | 601 | frases e números das análises do RAG |
| `clientes_indice.json` | 2.421 | 200.231 | um por cliente segmentado |
| `clientes/fieis.json` | 857 | 1.043.912 | sob demanda |
| `clientes/regulares.json` | 980 | 1.126.928 | sob demanda (75% do limite de 1,5 MB) |
| `clientes/esporadicos.json` | 426 | 458.089 | sob demanda |
| `clientes/em_pausa.json` | 158 | 163.560 | sob demanda |

Código: `scripts/exportar_dados.py`, `scripts/rag_modelos.py` (ponte com o RAG), `scripts/comum.py`,
`scripts/reconciliar.py`, `scripts/sql/*.sql` (uma consulta por arquivo + `views_painel.sql`), `contracts/*.schema.json`.

## Dados
| Item | Resultado |
|---|---|
| D1. Schemas | `exportar_dados.py --validar`: 13 arquivos, 0 erros. Confere também o grão (sem linha repetida), o número de linhas fixo de cada arquivo, o orçamento por segmento e se cada arquivo é o mesmo que o manifest descreve (bytes, sha256, linhas) |
| D2. Reconciliação | `reconciliar.py`: 282/282 OK, 0 divergências |
| D3. Orçamento | abertura 232.040 bytes (limite 1.572.864); maior arquivo de segmento 1.126.928 bytes (limite 1.572.864) |

### Como a reconciliação evita ser circular
- KPIs de 4 e 13 semanas: SQL próprio em `vw_metricas_cesta` (filtro por `semana_alinhada` e lojas comparáveis com o seu próprio `HAVING`). A exportação lê `vw_vendas_item`, por outro caminho.
- KPIs de 26 semanas: também contra `vw_yoy_resumo` e `vw_contexto_periodo`, as views que o chat usa (faturamento, cestas e ticket nas mesmas lojas, variação, 214 lojas, % de desconto).
- Base inteira: direto da tabela `fato_transacoes`, sem view nenhuma.
- Segmento, CLV e risco: as funções do próprio RAG (`rfm._resultado`, `clv._calcular`, `churn._calcular`), e não a réplica da exportação. 20 clientes sorteados (`random.seed(42)`) contra `vw_metricas_cliente` e `vw_cliente_semana`, inclusive se o cliente está ou não na população do modelo.
- Contra o app: Fiéis = 35% dos clientes e 71% do faturamento ✓; AUC 0,85 contra 0,74 da regra simples ✓; 136 pausas esperadas ✓; 243 alertas ✓.

### Teste da própria reconciliação
Com 3 erros plantados de propósito (+US$ 1 no faturamento de 26 semanas, um Regular trocado para Fiel, um cliente em
alerta rebaixado para faixa média), a reconciliação acusou 11 divergências e saiu com código 1. Um arquivo editado à
mão depois da exportação faz o `--validar` falhar pelo sha256. Os dados foram restaurados e revalidados.

### Reprodução do modelo de risco
O RAG calcula a probabilidade por cliente mas não a devolve; `rag_modelos._probabilidades` repete os passos de
`churn._calcular` com as funções do próprio RAG. Bate exatamente: limiar 0,17; Fiéis 857 clientes, 5,1836 pausas,
0 alertas; Regulares 966, 43,7009, 20; Esporádicos 380, 87,0675, 223. Em pausa fica fora da população (sem compra há
mais de 8 semanas), então o risco desses clientes é `null`.

## Tela
Não há tela nova nesta fase. Servidor local no ar, console sem erros nem avisos, os 12 arquivos do manifest servidos
com 200, e o rodapé "Sobre os dados" lê o manifest real (sem o aviso de provisório).

## Repositório
| Item | Resultado |
|---|---|
| R1 | sem `.duckdb`, `.parquet`, `config.yaml`, `.env`, `__pycache__`; os JSONs têm só agregados e o ID pseudônimo da base pública |
| R2 | nenhuma chave nos arquivos novos |
| R3 | este arquivo |
| RAG somente leitura | `git -C C:\RAG_Varejo status --short` vazio; a foto de todos os arquivos do RAG (fora `venv/` e `.git/`, inclusive `logs/` e `__pycache__/`) não mudou em nenhuma execução da exportação nem da reconciliação |

## Decisões desta fase (registradas na spec, seção 6, e no contrato 1.1)
1. Análise segmento × departamento fora do escopo.
2. KPIs: valor com todas as lojas; variação nas lojas comparáveis do período (campo novo `valor_comparavel`).
3. Clientes ativos: a definição do RAG (mesmo número em 4, 13 e 26 semanas).
4. Faturamento semanal: as duas linhas nas 214 lojas do chat.
5. Base inteira: semanas 1 a 101.
6. Dia da semana sem nome ("Dia 1 … Dia 7"): a base não tem calendário real.
7. Insight de desconto com 6 casas, para mostrar "1,2 p.p." como o app, e não "1,3".

## Pendências
- **Frase do insight de risco:** a frase de conclusão da aba de risco do RAG fala em clientes ("Cerca de 136 clientes ativos devem passar 8 semanas sem comprar"), mas a spec pede "dinheiro em risco de pausa". O card usa a primeira frase do "impacto estimado" da mesma análise ("Faturamento em risco nas próximas 8 semanas ≈ US$ 12.706, …"), com o número US$ 12.706,18. Confirmar na fase 3.
- O grupo "Sem compra na janela" do CLV (79 households) não é um segmento do RFM: não entra na Ficha nem em `segmentos.json`.
- `clientes/regulares.json` está em 75% do orçamento; se a base crescer, aplicar a redução documentada na skill (52 semanas de histórico, depois inteiros).
- No contrato, `periodo = "base"` quer dizer base inteira, enquanto nas views do RAG `'base'` é o ano anterior. Está documentado nas convenções do contrato.
