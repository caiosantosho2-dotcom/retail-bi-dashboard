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
- [ ] 5. Rodar: python scripts/exportar_dados.py --apenas <arquivo>
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
- **Métricas novas do painel** (índice de afinidade, percentis da ficha, pares de cesta): defina **uma vez** em `scripts/sql/views_painel.sql`, como `CREATE VIEW painel.<nome> AS …` em cima de `origem.*`. Elas ficam numa conexão em memória e nunca alteram o banco do projeto de RAG. Cada view nova leva um comentário com a definição de negócio e o grão.

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
  "versao_contrato": "1.0",
  "gerado_em": "2026-10-21T14:05:00-03:00",
  "base_hash": "ddb4d8032cc2",
  "periodo_base": {"inicio": "2016-01-01", "fim": "2017-12-11"},
  "arquivos": [{"nome": "kpis.json", "linhas": 24, "bytes": 3120, "sha256": "…"}]
}
```

`base_hash` é o mesmo identificador da base mostrado no app de RAG. Se o projeto de RAG não expuser um, use os primeiros 12 caracteres do SHA-256 do arquivo `.duckdb` de origem.

## Orçamento de tamanho

| Carregamento | Limite | Motivo |
|---|---|---|
| Abertura do painel (todos os arquivos menos `clientes/*`) | 1,5 MB | Abre em menos de 2 s numa conexão comum |
| `clientes/<segmento>.json` (um por segmento, sob demanda) | 1,5 MB cada | Ficha abre em menos de 300 ms depois de carregado |

Estourou o limite? Reduza o histórico semanal da ficha para as últimas 52 semanas e arredonde os valores da série para inteiros, nessa ordem. Registre a decisão na spec.

## Erros comuns

- recalcular faturamento ou ticket no Python em vez de ler da view;
- percentual salvo como 35,2 num campo e como 0,352 em outro;
- `0` no lugar de dado ausente;
- exportar com a conexão em modo escrita;
- comparação com o ano anterior sem o filtro de lojas comparáveis;
- um arquivo exportado sem o schema atualizado antes.

## Avaliações desta skill

1. "Exporte os KPIs da Visão Geral para os 4 períodos." Esperado: lê da view, comparação *like-for-like*, percentuais em fração, schema e manifest atualizados.
2. "Crie o índice de afinidade segmento × departamento." Esperado: uma view nova em `views_painel.sql` com comentário de definição, e o JSON com `amostra_pequena`.
3. "O arquivo de clientes ficou com 4 MB." Esperado: aplica a redução na ordem documentada, sem cortar clientes, e registra na spec.
