# Resumo da execução do redesenho v3 (2026-10-23)

Execução sem supervisão, etapa por etapa, com o plano em `plano_v3.md` e as escolhas feitas sem o Caio em
`pendencias_v3.md`. **V0 a V5 feitas, validadas e commitadas.** A V6 não foi executada (como pedido): nada de publicação,
`git push` ou GitHub Pages, e o README ainda descreve as abas antigas.

## Etapas e commits
| Etapa | Commit | O que foi feito | Validação |
|---|---|---|---|
| V0 | `1929561` | Investigação do 136 e plano da execução | `docs/validacao/v0.md` |
| V1 | `f276a44` | `selecao.js` (modelo único de seleção: clique, clique de novo, Ctrl + clique, Esc e fundo vazio), período em todas as abas, Laboratório virou a página "Metodologia e validação" (link no rodapé) | gestos 13/13, `v1.md` |
| V2 | `e39b42e` | Visão Geral: "O que puxou a variação", traço do ano anterior nos departamentos, faturamento por segmento; saem o calor dia × hora e os insights; contrato 3.0 | 589/589, `v2.md` |
| V3 | `d05d769` | Categorias por período, "Todos os departamentos", pares de subcategoria em todos os departamentos, em frases de confiança | 801/801, `v3.md` |
| V4 | `77df422` | Clientes & Lojas (junção de Segmentos e Lojas): regiões × segmento, perfil das lojas, ranking com 4 métricas, ficha lateral com o CSV de clientes em risco da loja; regra da loja principal | 937/937, `v4.md` |
| V5 | `f015ebc` | Cestas & Marcas: linha de concentração no lugar da ABC, rede com o nó como filtro de subcategoria, pares do nó e dos segmentos, marcas por segmento e período | 988/988, gestos 15/15, `v5.md` |

Em todas as etapas:
- reconciliação sem divergência e teste de mutação (os erros plantados foram pegos);
- schemas sem erro;
- console limpo;
- 1440×900 sem rolagem e 390×844 sem rolagem horizontal;
- os 4 gestos de seleção em todos os gráficos clicáveis, por clique real do mouse (`tests/gestos.js`).

**Estado final:**
- contrato 3.0, 61 arquivos de dados;
- abertura em 296 KB; a maior aba × período é Clientes & Lojas na base inteira, com 1,0 MB (limite 1,5 MB);
- exportação completa (12 etapas, um processo por etapa, 1 GB e 2 threads) em 2 min, idêntica byte a byte;
- RAG intocado.

## Resultado da V0
Os dois 136 são números **diferentes que coincidem**:
- **a previsão:** 135,95, a soma das probabilidades de pausa dos 2.203 clientes ativos ("Cerca de 136 clientes ativos devem passar 8 semanas sem comprar");
- **o acerto no teste histórico:** 136 verdadeiros positivos em 283 pausas ("o modelo acha 136 das 283").

Não há erro de cálculo, mas há risco de confusão. A página de metodologia junta as duas frases no mesmo parágrafo. Nenhum texto foi alterado. Detalhes e sugestões de redação: P1.

## Decisões tomadas sem o Caio (as principais; todas em `pendencias_v3.md`)
- **Visão Geral:** as barras de departamento passaram às lojas comparáveis, para o traço do ano anterior comparar a mesma coisa. Os gráficos novos saem de `cubo_periodo`, sem arquivo novo.
- **Categorias:** a frase do par usa a direção de maior confiança. A base inteira deixa crescimento e penetração em "—". O dinheiro em risco fica fixo nas 26 semanas.
- **Clientes & Lojas:**
  - a regra e o mínimo do perfil foram mantidos, embora só 20 lojas passem;
  - a ficha abre ao lado do ranking, e não por cima;
  - o CSV traz as faixas alta e média;
  - ticket e crescimento sem amostra pequena;
  - o departamento não se aplica à aba.
- **Cestas & Marcas:** os nós e as ligações da rede ficam fixos (26 semanas), e o período e o segmento mudam os números.
- **Seleção:** clicar num item já selecionado limpa a seleção daquele gráfico (a regra literal do v3). Opacidade 0,35 também nas listas.

## Pendências para o Caio decidir
1. **P1:** o texto do 136, na Visão Geral (o card saiu), no Laboratório e no post.
2. **V4.1:** o perfil das lojas, em que 127 lojas, com 71% do faturamento, ficam sem perfil com o mínimo de 30 clientes de loja principal.
3. As demais escolhas de cada etapa (V1 a V5) em `pendencias_v3.md`.
4. **V6:** publicar e atualizar o README com as 4 abas, depois da revisão.

## Como abrir o painel localmente
```
cd C:\retail-bi-dashboard
venv\Scripts\python.exe -m http.server 8000 --directory site
```
Abra http://localhost:8000. A página "Metodologia e validação" está no link do rodapé. Encerre o servidor (Ctrl+C) ao
terminar.

Para conferir os dados:
- `venv\Scripts\python.exe scripts\exportar_dados.py --validar`;
- `venv\Scripts\python.exe scripts\reconciliar.py` (cerca de 3 min);
- para regerar tudo, `venv\Scripts\python.exe scripts\exportar_dados.py` (precisa do RAG em `C:\RAG_Varejo`).

O teste dos gestos roda no Playwright MCP com `tests/gestos.js`, a partir de uma página recém-aberta.
