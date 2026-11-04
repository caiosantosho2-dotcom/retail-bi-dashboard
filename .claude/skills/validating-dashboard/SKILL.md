---
name: validating-dashboard
description: Valida o painel BI antes de qualquer fase ser dada como pronta — confere a importação do lakehouse (contratos, integridade, tamanho), compara os números na tela com os JSONs, abre o painel no navegador via Playwright MCP para conferir interação, console, layout e acessibilidade, e checa a higiene do repositório. Usar ao terminar uma tela, um arquivo de dados ou uma fase, antes de commit ou publicação, ou quando um número do painel parecer errado.
---

# Validação do painel

Nada está pronto até passar aqui. A validação tem três camadas, nesta ordem: **dados → tela → repositório**. Se uma camada falhar, não siga para a próxima.

**Quem confere o quê:** a conta é conferida no lakehouse, pela etapa de conferência de `python -m src.pipeline`. Aqui se confere que os dados chegaram íntegros e que a tela mostra o que os JSONs dizem.

## Checklist da fase

Copie e marque:

```
DADOS
- [ ] D1. Pipeline do lakehouse terminou com código 0 (resultado da sessão de lá; este projeto só lê)
- [ ] D2. Importação: python scripts/importar_lakehouse.py → código 0, sem aviso de mudanças não commitadas
- [ ] D3. Testes do importador: python -m unittest tests.test_importar_lakehouse
- [ ] D4. Orçamento: bytes_abertura e bytes_por_aba do manifest.json dentro do limite (skill exporting-dashboard-data)
TELA
- [ ] T1. Servidor local: python -m http.server 8000 --directory site, conferido com uma requisição simples
- [ ] T2. Console: 0 erros e 0 avisos de rede (404 de JSON)
- [ ] T3. Critérios de aceite da spec conferidos um a um
- [ ] T4. Números na tela contra os JSONs (seção abaixo)
- [ ] T5. Interações: filtro → gráficos; os 4 gestos do modelo único de seleção em TODO gráfico e lista clicável, por clique real: tests/gestos.js (lista de alvos atualizada a cada tela nova); o período mudando os gráficos de todas as abas, e os itens fixos com a nota; etiquetas de filtro ativo; troca de aba mantém os filtros
- [ ] T6. Layout em 1440×900 (sem rolagem da página, menos a Visão Geral) e 390×844 (empilhado, legível)
- [ ] T7. Acessibilidade: abas pelo teclado, aria nos gráficos, nenhuma informação só por cor
REPOSITÓRIO
- [ ] R1. git ls-files sem .duckdb, .parquet, config.yaml, .env, dado bruto
- [ ] R2. git grep sem chave (gsk_, api_key, token, secret)
- [ ] R3. Lakehouse e projeto de RAG com git status limpo
- [ ] R4. Relatório da fase salvo em docs/validacao/
- [ ] R5. Servidor local encerrado (porta 8000 livre), salvo pedido em contrário
```

Item falhou? Corrija na skill responsável (`exporting-dashboard-data` para dados, `designing-dashboard-ui` para tela) e **refaça a camada inteira**, não só o item.

## T4 — Números na tela contra os JSONs

O objetivo é provar que a tela mostra o que o arquivo diz. Compare com os JSONs, **não com conta própria**: nenhuma conta nova nasce aqui.

| Verificação | Regra |
|---|---|
| KPIs de 26 semanas, sem filtros | os da spec, seção 3, lendo o título do card quando a tela arredonda |
| Gráfico de tempo | 28 pontos em 4 semanas; 13, 26 e 101 nos outros; ano anterior presente em 4, 13 e 26 semanas e ausente na base |
| Soma da linha do tempo | a soma da série na tela = `faturamento_comparavel` e `faturamento_ano_anterior` do `cubo_periodo` no mesmo filtro (4, 13 e 26 semanas); na base, = `faturamento` |
| Um recorte com filtros | um departamento × um segmento: tela = soma direta do arquivo de tempo = `cubo_periodo` |
| Dinheiro em risco | o título do valor traz o exato de `departamentos_risco` |
| Metodologia | AUC e a previsão de pausas iguais a `lab_modelo` e ao manifest |

**Tolerâncias:** contagens exatas; dinheiro ±0,01; frações ±0,0001.

Uma diferença nunca se resolve ajustando o JSON ou a tolerância. Descubra qual dos lados está errado. Se o número do JSON parecer errado, a correção é no lakehouse.

## Tela — com Playwright MCP

O Playwright MCP abre um navegador próprio, controlado pelo Claude Code. Antes de usar:
- configure o servidor para usar o navegador do Playwright, e não o Edge do sistema. Confira as opções com `npx @playwright/mcp@latest --help`;
- abra o painel por `http://localhost:8000`, nunca por `file://`, porque o `fetch` dos JSONs falha em `file://`;
- limpe o cache do navegador (`Network.clearBrowserCache`, por CDP) antes da primeira leitura: o `http.server` local pode servir um JS antigo, e o erro parece defeito do código.

Mudou `scripts/versionar_site.py`, `pages.yml` ou o carregamento dos módulos? Rode `tests/servidor_cache.py` e os 5 cenários de `tests/cache_cenarios.js`, e abra o site gerado num subcaminho.

**Passos pequenos.** O notebook tem pouca memória: uma página e uma verificação por chamada, sem lotes longos. `tests/gestos.js` testa uma aba por execução: rode 3 vezes.

**Como conferir:**
1. `browser_navigate` para `http://localhost:8000`.
2. `browser_console_messages`: zero erros.
3. `browser_snapshot` ou uma leitura curta com `browser_run_code_unsafe` para conferir que abas, títulos, KPIs e rótulos existem e têm texto. **Prefira isso à captura de tela**: é mais barato e mais preciso para conferir conteúdo.
4. Cliques da interação, um por chamada, e nova leitura para confirmar que a tela mudou.
5. `browser_resize` para 1440×900: `document.documentElement.scrollHeight <= innerHeight` precisa dar verdadeiro em cada aba.
6. `browser_resize` para 390×844 e repita: sem rolagem horizontal.
7. **Só agora** use `browser_take_screenshot`, uma por aba e por tamanho, para a revisão visual: rótulos sobrepostos, texto cortado, cores fora dos tokens, gráfico vazio ou pequeno demais. Avise o usuário sobre o que viu.
8. Feche o navegador e **encerre o servidor local** ao terminar, e confirme que a porta 8000 ficou livre.

Se o Playwright MCP não estiver disponível, se uma chamada passar de 2 minutos ou falhar 2 vezes, pare de usar o navegador, registre até onde chegou e marque o resto como conferência manual. Não tente outro navegador por conta própria.

## Teste dos 5 segundos

Para cada gráfico novo ou mudado, o relatório da fase traz **uma frase** dizendo o que ele mostra. Se não der para escrever a frase, o gráfico volta para revisão.

## Relatório da fase

Primeira linha: "tudo verde" ou o que precisa de atenção. Depois:

```
# Validação — <fase> — <data>
Base: <base_hash> · Contrato: <versao_contrato> · Lakehouse: <commit>
Dados: importação OK · testes N/N · tamanho abertura X KB
Tela: console 0 erros · aceite N/N · 1440×900 OK · 390×844 OK · gestos N/N
Repositório: OK
Pendências: <lista ou "nenhuma">
```

O relatório é a prova de rigor que vai para o README.

## Erros comuns

- dar uma aba por pronta só porque "abriu sem erro";
- tratar a importação com código 0 como prova de que a conta está certa;
- conferir um número contra uma conta nova, em vez do JSON;
- aumentar a tolerância para o teste passar;
- conferir só no desktop;
- tirar dezenas de capturas de tela em vez de ler a página.

## Avaliações desta skill

1. "Terminei a Visão Geral, pode validar?" Esperado: roda as 3 camadas em ordem, para no primeiro bloco que falhar e gera o relatório.
2. "O ticket médio do painel está diferente do chat." Esperado: compara a tela com o JSON; se baterem, a diferença está na origem e vai para o lakehouse, sem mexer na tolerância.
3. "Valide o layout no celular." Esperado: `browser_resize` para 390×844, leitura primeiro, captura de tela só depois, e o relatório das falhas encontradas.
