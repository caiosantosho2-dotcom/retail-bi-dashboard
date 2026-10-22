# Painel BI de Varejo (Dunnhumby)

Painel de BI em uma página web, tema escuro, com abas: saúde do varejo, categorias (departamentos) e segmentos de
clientes, com filtros globais e clique que filtra, como no Power BI. É a continuação visual do projeto "Assistente Comercial + Análise de Clientes" (projeto de RAG). As regras
estão em [`docs/spec_dashboard.md`](docs/spec_dashboard.md).

> Em construção. As fases e a validação de cada uma ficam em [`docs/validacao/`](docs/validacao/).

## Abrir o painel

O site é estático e roda sozinho com os JSONs já exportados em `site/data/`, sem Python nem banco:

```
python -m http.server 8000 --directory site
```

e abra `http://localhost:8000` (não por `file://`: o `fetch` dos JSONs falha nele).

## Regenerar os dados

**Exige o repositório do projeto de RAG.** Os números vêm do banco DuckDB dele e, para segmento, CLV e risco de pausa
por cliente, do código Python dele, importado só para leitura. O painel não reescreve nenhuma dessas definições: painel
e chat dão o mesmo número para a mesma pergunta.

1. Tenha o projeto de RAG com o banco construído (`data/processed/dunnhumby.duckdb`).
2. Copie `config.example.yaml` para `config.yaml` (fora do git) e preencha `duckdb_origem` e `rag_dir`.
3. Crie o ambiente com as mesmas versões do RAG: `python -m venv venv` e `venv\Scripts\pip install -r requirements.txt`.
4. Exporte, valide e reconcilie:

```
venv\Scripts\python scripts\exportar_dados.py           # todos os JSONs + manifest.json, uma etapa por processo
venv\Scripts\python scripts\exportar_dados.py --validar # schemas em contracts/, grão, orçamento e hash do manifest
venv\Scripts\python scripts\reconciliar.py              # cada número contra a origem e contra o app de RAG
```

A exportação e a reconciliação nunca escrevem no projeto de RAG: o banco abre em somente leitura, o import não gera
`__pycache__`, só são chamadas funções que não gravam log, e uma "foto" de todos os arquivos do RAG, tirada antes e
depois, interrompe a execução se algo mudar. O `manifest.json` registra o commit do RAG usado (`rag_commit`).

A exportação roda em etapas (`rag`, `base`, `cubos`, `kpis_filtrados`, `cesta_departamentos`, `cesta_subcategorias`,
`ficha_categoria`, `segmentos`, `manifest`), cada uma num processo novo, com o DuckDB limitado pelo `config.yaml`
(`memoria`: 1 GB e 2 threads). O pico medido é de cerca de 200 MB por etapa, e o total leva um minuto. Os resultados
intermediários ficam em `data/tmp/` (fora do git). `--etapa <nome>` roda uma só.

## O que a base não tem

- **Encarte e ponta de gôndola** (`causal_data`): existem na base, mas ficam para uma fase futura.
- **Share de gôndola e ruptura:** não existem na base Dunnhumby. O painel não mostra nem estima esses indicadores.
- **Calendário real:** as datas são inventadas, então os dias da semana aparecem como "Dia 1 … Dia 7".
