---
name: exporting-dashboard-data
description: Gera os JSONs agregados que alimentam o painel BI a partir das views DuckDB do projeto de RAG, seguindo o contrato de dados (granularidade, tipos, nomes, aviso de amostra pequena, manifest). Usar ao criar, alterar ou depurar scripts/exportar_dados.py, as consultas em scripts/sql/, os schemas em contracts/ ou qualquer arquivo em site/data/.
---

# Exportação de dados do painel

O painel não calcula métricas. Ele só desenha o que esta etapa entrega. Por isso, todo número nasce aqui, a partir das views do projeto de RAG. Regras de negócio: `docs/spec_dashboard.md`, seção 6. Formato de cada arquivo: `reference/contrato_json.md`.

## Fluxo de trabalho

Copie e marque:

```
- [ ] 1. Resolver os [A CONFIRMAR] da spec relacionados ao arquivo (nome da view, colunas)
- [ ] 2. Inspecionar a view de origem (DuckDB MCP ou duckdb CLI, somente leitura): colunas, tipos, contagem
- [ ] 3. Escrever a consulta em scripts/sql/<arquivo>.sql, lendo só das views de origem ou das views do painel
- [ ] 4. Atualizar o schema em contracts/<arquivo>.schema.json ANTES de exportar
- [ ] 5. Rodar a etapa do arquivo: python scripts/exportar_dados.py --etapa <etapa> --etapa manifest
- [ ] 6. Validar o schema: python scripts/exportar_dados.py --validar
- [ ] 7. Reconciliar: python scripts/reconciliar.py (skill validating-dashboard)
- [ ] 8. Conferir os tamanhos no manifest.json contra o orçamento
```

Se o passo 6, 7 ou 8 falhar, volte ao passo 3. Não edite JSON à mão nunca.

## De onde vêm os dados

- **Origem:** o arquivo DuckDB do projeto de RAG, cujo caminho está em `config.yaml` (fora do git). Abra sempre em **somente leitura**:
  ```python
  con = duckdb.connect()
  con.execute(f"ATTACH '{cfg['duckdb_origem']}' AS origem (READ_ONLY)")
  ```
- **Métricas que já existem** (faturamento, ticket, segmento, CLV, risco): leia da view `origem.<view>` e nunca reescreva a fórmula.
- **Métricas novas do painel** (cubos, KPIs filtrados, atributos e percentis de departamento, pares de cesta, afinidade, faixas de risco, lista de ação): defina **uma vez** em `scripts/sql/views_painel.sql`, como `CREATE VIEW painel.<nome> AS …` em cima de `origem.*`. Elas ficam numa conexão em memória e nunca alteram o banco do projeto de RAG. Cada view nova leva um comentário com a definição de negócio e o grão.
- **Antes de criar uma métrica, procure se o RAG já a define** (glossário `METRICAS` e views em `src/views.py` do RAG). Se já existe (ex.: penetração, frequência = `idas_por_cliente`, marca própria), use a definição do RAG. Duas definições para o mesmo nome violam o princípio 1 da spec.
- **Somam × não somam:** faturamento, desconto e valor bruto somam e vão para os cubos; cestas, ticket, itens por cesta e clientes ativos não somam entre departamentos e são pré-calculados (`kpis_filtrados`). Entre segmentos, contagens somam (cada cliente tem um só grupo). O navegador só soma o que soma.

## Execução em etapas (memória)

O notebook do projeto tem 4 GB. A exportação roda **uma etapa por processo** (`python scripts/exportar_dados.py` faz todas em sequência), com `memory_limit` e `threads` do `config.yaml` (`memoria`: 1 GB e 2) e o excedente em `data/tmp/duck`:

```
rag -> base -> cubos -> kpis_filtrados -> cesta_departamentos -> cesta_subcategorias -> ficha_categoria -> segmentos -> lojas -> produtos -> manifest
```

`rag` grava os resultados do RAG em `data/tmp/rag_*.parquet` e `rag.json`; `base` grava as tabelas-base de `painel_base.sql` em `data/tmp/*.parquet`. As outras etapas leem esses arquivos e criam só as views. Pares de subcategorias rodam **um departamento por vez** (macro `painel.par_subcategoria(dep)`). Nunca calcule pares no navegador. `data/` está no `.gitignore`.

**Modelos do painel em Python** (hoje, as regiões da aba Lojas em `scripts/regioes.py` e as posições dos mapas em `scripts/layout.py`): só quando o SQL não basta (agrupamento, posições); a entrada sai de uma view comentada em `views_painel.sql`, a semente é fixa, o resultado vai para `data/tmp/*.parquet` e os parâmetros para o manifest, e a reconciliação roda o modelo de novo para provar que dá o mesmo resultado.

## Contrato (resumo)

O detalhe de cada arquivo está em `reference/contrato_json.md`. As regras gerais:

| Regra | Como |
|---|---|
| **Grão declarado** | Cada arquivo diz o que é uma linha (ex.: "1 linha por segmento × departamento"). Sem linhas duplicadas no grão. |
| **Nomes** | Chaves em `snake_case`, português, sem acento. Valores de categoria com acento exatamente como na origem (`"Fiéis"`, `"Em pausa"`). |
| **Números crus** | Sem formatação, sem `"US$"`, sem `%`. Dinheiro com 2 casas, razões com 4. |
| **Percentuais** | Fração de 0 a 1, com campo terminado em `_pct` (0,352 = 35,2%). |
| **Datas** | ISO `AAAA-MM-DD`. A semana é identificada pela data de início. |
| **Ausente** | `null`, nunca `0` nem `""`. O front mostra "—". |
| **Amostra pequena** | `amostra_pequena: true` quando a regra da spec indicar (ex.: n de clientes abaixo do corte do projeto de RAG). O valor continua no arquivo. O front decide como mostrar. |
| **Ordem** | Determinística, definida no contrato, para o diff do git fazer sentido. |
| **Codificação** | UTF-8, `ensure_ascii=False`, JSON minificado em `site/data/`. |
| **Privacidade** | Só agregados. O nível cliente traz o ID pseudônimo da base pública e indicadores, nunca linhas de transação. |

## manifest.json

O manifest é sempre gerado por último. O rodapé "Sobre os dados" e a validação dependem dele:

```json
{
  "versao_contrato": "2.0",
  "gerado_em": "2026-10-21T14:05:00-03:00",
  "base_hash": "ddb4d8032cc2",
  "periodo_base": {"inicio": "2016-01-01", "fim": "2017-12-11"},
  "arquivos": [{"nome": "kpis_filtrados.json", "carga": "abertura", "linhas": 1786, "bytes": 177454, "sha256": "…"}]
}
```

`base_hash` é o mesmo identificador da base mostrado no app de RAG. Se o projeto de RAG não expuser um, use os primeiros 12 caracteres do SHA-256 do arquivo `.duckdb` de origem.

## Orçamento de tamanho

| Carregamento | Limite | Motivo |
|---|---|---|
| Abertura do painel (`carga = "abertura"`, a Visão Geral) | 1,5 MB | Abre em menos de 2 s numa conexão comum |
| Cada aba sob demanda (`carga = "categoria"`, `"segmentos"`) | 1,5 MB cada | A aba abre logo depois do clique |
| `calor/<departamento>.json` | pequeno (hoje ≤ 20 KB) | Só com filtro de departamento |

Arquivos grandes usam o **formato compacto** do contrato (dimensões como índice). Estourou o limite? Divida o arquivo por período ou por subconjunto e carregue sob demanda. Registre a decisão na spec.

## Erros comuns

- recalcular faturamento ou ticket no Python em vez de ler da view;
- percentual salvo como 35,2 num campo e como 0,352 em outro;
- `0` no lugar de dado ausente;
- exportar com a conexão em modo escrita;
- comparação com o ano anterior sem o filtro de lojas comparáveis;
- um arquivo exportado sem o schema atualizado antes.

## Avaliações desta skill

1. "Exporte os KPIs da Visão Geral com filtro de segmento e departamento." Esperado: métricas que somam no cubo, as que não somam pré-calculadas por subconjunto × departamento, comparação *like-for-like*, frações, schema e manifest atualizados.
2. "Adicione a penetração de cada departamento." Esperado: procura a métrica no glossário do RAG antes, usa a definição dele, e cria a view em `views_painel.sql` com comentário de definição e grão.
3. "Calcule os pares de subcategorias de todos os departamentos." Esperado: lembra a regra dos 10% e roda um departamento por vez, dentro do limite de memória.
