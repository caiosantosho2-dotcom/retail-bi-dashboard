# Resumo do painel v4.2: ajuste visual

A v4.1 tinha os blocos de decisão certos, mas a tela era escura, com letra pequena e com muito texto em cada card. A v4.2 muda só a apresentação: **nenhum dado, JSON, contrato ou conta mudou**, e nenhuma informação foi apagada (o que saiu do corpo do card foi para o ⓘ ou já estava na página de metodologia). Validação completa, com o contraste par a par e a tabela de cada card: `docs/validacao/v4_2_visual.md`.

## O que mudou

| Mudança | Por quê |
|---|---|
| **Tema claro.** Página `#F5F5FA`, painéis brancos, bordas `#E3E3EC`. Só os valores de `site/css/tokens.css` mudaram; layout e ordem dos blocos são os mesmos | Leitura mais confortável em reunião e no projetor |
| **Paleta nova.** Primária `#4349E6` (aba ativa, botões, links, foco, série principal), lavanda `#8A7AD6` (séries secundárias); rosa e pêssego só como origem de fundos claros | Uma identidade única, com as cores tiradas de 4 tons de origem |
| **Segmentos:** Fiéis = primária, Regulares = lavanda, Esporádicos `#C2639F`, Em pausa `#BE4F37` | Rosa e pêssego puros não passam em 3:1 no branco; as versões escurecidas passam e continuam distintas no daltonismo |
| **Fonte maior:** texto 16 px, notas e rótulos 14 px, eixos 13 px, peso 500; tudo lido dos tokens, também nos gráficos | O menor texto era de 10 a 12 px |
| **Contraste:** todo texto a 4,5:1 ou mais, marcas gráficas a 3:1 ou mais (45 de 45 pares aprovados) | O vermelho de "caiu" ficava em 3,59:1; agora `#B42318`, 6,57:1. Não existe mais cinza-claro |
| **Filtros na barra lateral**, com o título "Filtros"; abas e "Alto contraste" no topo. No celular, um botão "Filtros" abre a barra como painel | Os filtros ficam sempre à vista sem roubar altura das abas |
| **Textos enxutos.** Cada card tem título, no máximo um subtítulo de até ~10 palavras e um ⓘ ao lado do título com o método, as regras e as dicas de clique | Os subtítulos chegavam a 4 linhas e repetiam o que a barra lateral já mostra |
| **Etiquetas curtas** para o que muda a leitura do número: "123 lojas comparáveis", "todas as lojas", "todos os clientes", "foto da semana 101", "⚠ poucos pares no período" | O aviso continua visível sem virar parágrafo |
| **"Quem o CRM deve acionar":** "No teste histórico" mostra só a capacidade escolhida, numa frase com o modelo e a regra simples em destaque ("Dos 100 primeiros, **32,0%** pausaram de fato, contra **28,0%** pela regra simples"); se a regra simples ganhar, a frase diz. O subtítulo é a nota fixa ("Mostra quem tende a pausar, não quantas pausas o contato evitaria") | Uma frase por capacidade, 6 linhas, era o maior bloco de texto da tela. Quem ganha em cada capacidade continua no ⓘ |
| **Quadrante:** os 3 destaques mostram só o número (1, 2, 3) no ponto | Os nomes já estão na lista "Defender primeiro" ao lado, e o rótulo curto cobre menos pontos |
| A nota do rodapé da barra de filtros em Cestas & Marcas foi para o ⓘ da rede | Ela explicava um card só |

## O ⓘ

- Abre com o mouse por cima, com o foco do teclado (Tab) e com toque ou clique; o clique fixa aberto.
- Fecha com Esc (sem limpar a seleção dos gráficos), com clique fora, com outro clique no ⓘ ou ao rolar a página.
- O texto fica ligado ao botão por `aria-describedby`: o leitor de tela lê o método mesmo com a caixa fechada.
- A caixa se posiciona dentro da janela, também em 390 px de largura.

## Em números

| | v4.1 | v4.2 |
|---|---:|---:|
| Menor texto na tela | 10 px | 14 px |
| Texto abaixo de 4,5:1 | o vermelho de "caiu" (3,59:1 no painel, 3,24:1 no tooltip) | nenhum (45 de 45 pares aprovados) |
| Altura da Visão Geral em 1440×900 | 1.308 px | 1.287 px (1.546 px com a fonte maior, antes dos textos enxutos) |
| Categorias e Cestas & Marcas em 1440×900 | sem rolagem | sem rolagem |
| Arquivos de dados alterados | — | 0 |

## Limitações

- As capturas em `docs/capturas/` ainda são do tema escuro: a conferência visual com capturas fica para depois, por decisão do Caio.
- A skill `designing-dashboard-ui` ainda descreve o tema escuro (decisão em aberto, ver a validação).
- O ⓘ tira o método da vista: quem só passa os olhos não lê as regras. Por isso o que muda a leitura do número é etiqueta, não ⓘ.
