# Resumo do painel v4.1: dois blocos de decisão

A Visão Geral respondia "como estamos?". Os dois blocos novos respondem "o que fazer agora, com o que temos?". Spec: `docs/spec_v4_1_blocos_decisao.md`. Validação: `docs/validacao/v4_1_painel.md`. As contas nascem na gold do lakehouse (G45 a G49), e o painel só mostra.

## O que mudou

| Mudança | Por quê | Decisão |
|---|---|---|
| Bloco "Quem o CRM deve acionar", com seletor de capacidade (25 a 300) e de objetivo | O CRM tem capacidade limitada e precisa saber quem priorizar | G45, G48 |
| Subtítulo, números da semana e barra de mix trocam junto com o seletor | Até N = 100, a lista de pausas é 100% Esporádicos; a de valor tem outro perfil | G48 |
| Comparação com a regra simples, uma linha por capacidade, na métrica do objetivo | Se a regra simples ganhar, o texto diz: é o caso de valor em N = 100 | G48 |
| Nota de calibração lida da linha escolhida, sem número fixo | No teste, o modelo superestima no topo da lista, e a diferença varia com N e com o objetivo | G49 |
| Nota fixa: "Mostra quem tende a pausar, não quantas pausas o contato evitaria." | A base não mede o efeito do contato | Caio |
| Bloco "Onde agir no mix de departamentos": dispersão, 4 quadrantes e 3 destaques | Category management tem atenção limitada: por onde começar | G46 |
| Nota nos recortes sem dados ou com menos de 3 destaques | Mostrar o que existe, sem parecer erro | G47 |
| Rótulos "Priorizar risco de pausa" e "Priorizar valor em risco", no lugar dos da spec | "Evitar mais pausas" prometia o que a nota fixa nega: a base não mede pausas evitadas | Caio |
| Só "Em pausa": nota no lugar do gráfico. "Em pausa" junto de outros: aviso curto | O segmento é definido por ter parado de comprar, então o crescimento cai por construção | Caio |
| Importador e contratos em 5.1 | Dois contratos novos; nenhum arquivo existente mudou | A3 |
| JS e CSS publicados em `v/<hash do conteúdo>/`, com recarga única se a versão sumir | Cache antigo com arquivo novo quebrava a Visão Geral. Na query (`?v=`), o servidor ignora a versão e a página aberta antes misturaria código | Caio |

## Em números

| | v4 | v4.1 |
|---|---:|---:|
| Arquivos em `site/data/` (com o manifest) | 48 | 52 |
| Contratos | 21 | 23 |
| Bytes da abertura | 446.719 | 589.137 |

O limite da abertura é de 1,5 MB.

## Decisões pequenas tomadas na construção

| Decisão | Motivo |
|---|---|
| A Visão Geral passa de uma tela em 1440×900 e rola; as outras abas continuam sem rolar | Os blocos não cabem junto com KPIs, tempo, segmento e departamentos. Ordem: KPIs → tempo e segmento → blocos → departamentos |
| Eixo x da dispersão em escala logarítmica, escrita no nome do eixo | A participação vai de 0,2% a 56%: em escala linear, a maioria dos pontos viraria um só |
| Valores exatos em dinheiro nas frases do teste (`US$ 11.965,58`) | Arredondados, diferenças pequenas sumiriam (em N = 200, o modelo ganha por US$ 62,17) |
| Recall e fração do valor no `title` de cada frase | A frase da spec fica curta e o número continua disponível |
| A semana da foto vem do manifest (`janelas.26s.semana_fim`) | Nenhum número escrito à mão |
| Seletores do bloco 1 são locais, e o "Limpar tudo" não mexe neles | Não são filtro global e não têm etiqueta |
| A barra de mix não tem gesto, e a lista "Defender primeiro" não é clicável | O segmento não se aplica ao bloco 1; no bloco 2, quem seleciona é o ponto do gráfico |
| Nota quando o departamento filtrado está fora do recorte | Sem ela, todos os pontos ficariam apagados sem motivo aparente |
| No bloco 2, rótulo só nos 3 destaques e no departamento selecionado; os outros pontos só têm tooltip (decisão do Caio) | Com 14 nomes, o gráfico ficava poluído. Os nomes de todos continuam no tooltip e na tabela |
| Rótulos dos destaques alternam embaixo e em cima, da esquerda para a direita, com contorno na cor do fundo | Em 390 px os nomes se cobriam. Sobram toques só com filtro de segmento (ver a validação) |
| O aviso de "Em pausa" vale quando o chip está ligado, mesmo com os 4 ligados; sem nenhum chip, não aparece | Sem chip é a visão de todos os clientes, não um recorte escolhido |
| Refeita também a captura `celular.png` | Ela mostrava a Visão Geral sem os blocos |
| O CSS entrou na pasta versionada junto com o JS; os JSONs não | CSS antigo com JS novo deixaria os blocos sem estilo. Nos JSONs, o pedido era só JS, e o risco aparece apenas se o contrato mudar |
| Skills de dados e de design atualizadas (5.1 e layout da Visão Geral) | Continuavam descrevendo o 5.0 e a aba sem rolagem |
