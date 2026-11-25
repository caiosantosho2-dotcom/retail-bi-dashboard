# Resumo da v4.3: correções e remoção dos "maneirismos de IA"

A v4.2 deixou o painel claro e legível, mas sobraram erros e vícios de texto: um "null" na tela, um rótulo cortado, cinza
claro, pílula em tudo, cadeias com "·", "×" como palavra, jargão ("lift", "recorte", "foto da semana 101") e informação
repetida. A v4.3 corrige isso **só na apresentação**: nenhum dado, JSON, contrato ou conta mudou. Nada foi apagado; o que saiu
da tela foi para o ⓘ, para a Metodologia ou para "Sobre os dados". Arredondar a exibição é formatação, não conta nova.

| O que mudou | Por quê |
|---|---|
| **"null" no dinheiro em risco**, com "Em pausa" sozinho: era o `replaceChildren` do navegador escrevendo `null` como texto | Erro de código; o JSON está completo, nada depende do lakehouse |
| **Cores dos segmentos sem verde:** Fiéis primária `#4349E6`, Regulares coral `#EA6655`, Esporádicos rosa `#D470BB`, Em pausa cinza `#4D4D50`. "Sem segmento" listrado | Verde e vermelho são só para variação. Menor distância entre os 4, também no daltonismo: ΔE 31 |
| **Pares de cesta em tabela compacta** (Se compra, Também leva, % das vezes, Vezes mais que o normal, Cestas) | A frase repetida em cada card cansa a leitura e não deixa comparar |
| **Frase do CRM sem "O modelo ganha."**; quando a regra simples ganha, a tela diz | Os dois números já mostram quem ganhou |
| **Números curtos nas decisões e listas** (−US$ 9,2 mil, 32%, ▲ 3,1%); o exato no tooltip e nas tabelas | Centavos em bloco de decisão são ruído |
| **Lojas comparáveis uma vez**, acima dos KPIs | Estava repetido em 5 cards |
| **Sem etiquetas que repetem filtro** ("todos os clientes", "todas as lojas") | O filtro já está na barra lateral |
| **Sem jargão na tela:** "última semana da base", "26 semanas", "período e segmento", "vezes mais que o normal", "Fornecedores para 80% do faturamento", "Maior fornecedor" | Os termos técnicos ficam no ⓘ e na Metodologia |
| **Caixa-alta só nos KPIs; sem "·"; "vs." no lugar de "×"; título sem "X: Y"** ("O que vai junto na cesta") | Maneirismos de texto gerado |
| **Pílula só nos filtros:** controle segmentado em Capacidade, Objetivo e Ordenar; "Limpar tudo" como link; abas com sublinhado; etiquetas com canto de 4 px | Pílula em tudo apagava a diferença entre filtrar e escolher |
| **"Alto contraste" vira ícone** no canto superior direito, com rótulo acessível | Não é aba nem filtro |
| **Botão "Tabela" só no quadrante e no faturamento por departamento**; nos outros, a tabela fica para o leitor de tela | Menos botões repetidos, sem perder a acessibilidade |
| **Legendas em bolinha** em todo card; **nomes inteiros**, quebrando a linha | Um padrão só; nome cortado esconde o que se lê |
| **Linha do tempo de Categorias com 300 px**, como na Visão Geral (a aba passa a rolar na vertical) | Mesmo gráfico, mesma leitura nas duas abas |
| **"Selec." e "Índice" só com segmento ligado** | Sem segmento, as duas colunas eram só "—" |
| **Rede de cestas no fim da aba**, rótulo só nos grupos e nos 5 maiores nós, nenhum sobreposto | Os outros nomes poluíam o gráfico; estão no tooltip |
| **Rodapé:** fonte, link da Metodologia e "Sobre os dados" (abre com base, hash, commit e data) | O rodapé era uma cadeia longa com "·" |
| **Contraste:** todo texto a 4,5:1 ou mais, inclusive "Limpar tudo" desabilitado e o rótulo sobre uma parte de barra apagada | Sobrava cinza claro e rótulo herdando a opacidade da barra |

**Conferência.** Testes de unidade 15/15 e 23/23. Os testes de tela rodaram nos 2 tamanhos (1440×900 e 390×844), nos 4
períodos e com o console limpo: `v4_1_tela.js` 7/7, `gestos.js` 10/10 e o novo `v4_3_ajustes.js` 3/3 abas. O contraste deu
45/45. Detalhes, a tabela dos 26 itens (antes, depois e para onde foi a informação) e as tabelas de cor e contraste estão em
[`docs/validacao/v4_3_ajustes.md`](../validacao/v4_3_ajustes.md).
