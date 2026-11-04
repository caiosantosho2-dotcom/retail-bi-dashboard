---
name: exporting-dashboard-data
description: Leva para o painel BI os JSONs exportados pelo lakehouse, com validação contra os contratos 5.0 (grão, tipos, nomes, aviso de amostra pequena, manifest). Usar ao regenerar ou importar os dados, ao alterar ou depurar scripts/importar_lakehouse.py, os schemas em contracts/ ou qualquer arquivo em site/data/, ou quando faltar um número no painel.
---

# Dados do painel: importar do lakehouse

O painel não calcula métricas: ele só soma no navegador o que soma e desenha. Todo número nasce na gold do projeto do lakehouse e chega aqui como JSON com contrato (decisão G43 do lakehouse).

```
CSV → lakehouse (bronze → silver → gold) → export/painel_v4 (JSON + manifest) → scripts/importar_lakehouse.py → site/data
```

Regras de escopo: `docs/spec_painel_v4.md`. Formato de cada arquivo: `reference/contrato_json.md` e `contracts/*.schema.json`. O projeto do lakehouse é **somente leitura** a partir daqui: mudança lá acontece numa sessão aberta lá.

## Fluxo de trabalho

Copie e marque:

```
- [ ] 1. Regenerar no lakehouse (lá, não aqui): python -m src.pipeline. Confira que a conferência dele passou
- [ ] 2. Se os contratos mudaram: copiar de <lakehouse>/contracts/ para contracts/ e conferir byte a byte
- [ ] 3. Importar: python scripts/importar_lakehouse.py
- [ ] 4. Ler o resumo: arquivos copiados, removidos, bytes da abertura, base e commit do lakehouse
- [ ] 5. Conferir o aviso de "mudanças não commitadas": publicar só com a exportação de um commit limpo
- [ ] 6. Passar a tela pela skill validating-dashboard
```

Não edite JSON à mão nunca: o sha256 do manifest pega a edição e o importador recusa.

## Faltou um número?

Pare e pergunte ao Caio. O número novo nasce na gold do lakehouse, com contrato novo, e vem pela exportação. Nunca calcule aqui: duas cópias criariam duas definições da mesma métrica.

**O que o navegador pode fazer:** somar o que soma (faturamento, desconto, valor bruto) para os filtros de segmento e departamento, e fazer as razões dessas somas. Cestas, ticket, itens por cesta e clientes ativos não somam entre departamentos: vêm prontos de `kpis_filtrados`.

## O que o importador garante

`scripts/importar_lakehouse.py` lê a pasta de `lakehouse_export` no `config.yaml` (`--origem` usa outra, para teste). A ordem é sempre validar primeiro e trocar a pasta depois:

1. A pasta existe e o `manifest.json` tem `versao_contrato` 5.1.
2. Cada JSON passa no contrato; a lista de arquivos, os bytes e o sha256 batem com o manifest.
3. `site/data/` não tem item desconhecido: só o que veio no contrato, o que saiu do v4 e `.gitkeep`.
4. Monta a pasta nova em `data/importacao/` (fora do git) e só então troca.

Se algo falhar, termina com **código 1** e `site/data/` fica como estava. Testes: `python -m unittest tests.test_importar_lakehouse`.

**O importador não sabe se a conferência do lakehouse passou.** Ele só valida contrato e integridade. Por isso o passo 1 pede para olhar o resultado do pipeline.

## Contrato (resumo)

O detalhe de cada arquivo está em `reference/contrato_json.md`. As regras gerais:

| Regra | Como |
|---|---|
| **Grão declarado** | Cada arquivo diz o que é uma linha. Sem linhas duplicadas no grão. |
| **Nomes** | Chaves em `snake_case`, português, sem acento. Valores de categoria com acento como na origem (`"Fiéis"`, `"Em pausa"`). |
| **Números crus** | Sem formatação, sem `"US$"`, sem `%`. |
| **Percentuais** | Fração de 0 a 1, com campo terminado em `_pct`. |
| **Datas** | ISO `AAAA-MM-DD`. |
| **Ausente** | `null`, nunca `0` nem `""`. O front mostra "—". |
| **Amostra pequena** | `amostra_pequena: true`. O valor continua no arquivo, e o front decide como mostrar. |
| **Privacidade** | Só agregados. |

Mudou o contrato? Quem muda é o lakehouse: o contrato daqui é sempre uma cópia igual byte a byte.

## manifest.json (5.1)

O rodapé "Sobre os dados" e a validação dependem dele. Campos de procedência: `lakehouse_commit`, `lakehouse_sujo`, `silver_versoes` e `base_hash` (os 12 primeiros caracteres do sha256 de `silver_versoes`: muda quando a silver muda, mesmo com os mesmos dados). `arquivos[].carga` diz quando cada arquivo é baixado, e `bytes_abertura` soma os de `carga = "abertura"`.

## Orçamento de tamanho

| Carregamento | Limite | Motivo |
|---|---|---|
| Abertura do painel (`carga = "abertura"`, com os 4 `faturamento_tempo_<periodo>.json`) | 1,5 MB | Abre em menos de 2 s numa conexão comum |
| Cada aba × período (`bytes_por_aba`) | 1,5 MB | A aba abre logo depois do clique |

Estourou? O corte é decidido no lakehouse.

## Erros comuns

- calcular aqui um número que falta, em vez de pedir à gold;
- editar um JSON de `site/data/` à mão;
- copiar arquivos para `site/data/` sem passar pelo importador;
- alterar um contrato só neste repositório;
- publicar com `lakehouse_sujo: true`;
- tratar importação com código 0 como prova de que os números estão certos: ela prova contrato e integridade, e a conta é conferida no lakehouse.

## Avaliações desta skill

1. "Atualize os dados do painel." Esperado: pede o pipeline no lakehouse e olha o resultado dele, roda o importador, lê o resumo e passa pela validação.
2. "Adicione a penetração por loja." Esperado: para e pergunta; o número nasce na gold, com contrato novo.
3. "O importador terminou em 1." Esperado: lê a lista de erros, diz qual arquivo falhou e em quê, confirma que `site/data/` não mudou e corrige a causa, sem editar o JSON nem o contrato.
