// Componentes de HTML do painel (skill designing-dashboard-ui, "Componentes"). Nada de estilo solto: só classes do app.css.

/** el('div', {class: 'x', onclick: fn}, filho1, 'texto', ...) */
export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave.startsWith('on')) no.addEventListener(chave.slice(2), valor);
    else if (chave === 'dataset') Object.assign(no.dataset, valor);
    else no.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

/** Ponto de 8 px na cor do segmento + nome. Nunca só a cor. */
export function etiquetaSegmento(segmento, cor) {
  return el('span', { class: 'etiqueta' }, el('span', { class: 'etiqueta__ponto', style: `background:${cor}`, 'aria-hidden': 'true' }), segmento);
}

let sequencia = 0;

/**
 * Painel com gráfico e a sua tabela gêmea (a visão em tabela que toda visualização tem).
 * Devolve { painel, grafico, tabela, aoAlternar } — o gráfico e a tabela ocupam o mesmo lugar.
 */
export function painelGrafico({ titulo, subtitulo, classe = '' }) {
  const id = `painel-${++sequencia}`;
  const grafico = el('div', { class: 'painel__grafico', id: `${id}-grafico` });
  const tabela = el('div', { class: 'painel__tabela', id: `${id}-tabela`, hidden: true });
  const botao = el('button', { class: 'botao-tabela', type: 'button', 'aria-pressed': 'false', 'aria-controls': `${id}-tabela` }, 'Tabela');
  const ouvintes = [];
  botao.addEventListener('click', () => {
    const mostrar = botao.getAttribute('aria-pressed') !== 'true';
    botao.setAttribute('aria-pressed', String(mostrar));
    tabela.hidden = !mostrar;
    grafico.hidden = mostrar;
    ouvintes.forEach((f) => f(mostrar));
  });
  const painel = el('section', { class: `painel painel--grafico ${classe}`, 'aria-labelledby': `${id}-titulo` },
    el('header', { class: 'painel__cabecalho' },
      el('div', {},
        el('h2', { class: 'painel__titulo', id: `${id}-titulo` }, titulo),
        subtitulo ? el('p', { class: 'painel__subtitulo' }, subtitulo) : null),
      botao),
    grafico, tabela);
  return { painel, grafico, tabela, aoAlternar: (f) => ouvintes.push(f) };
}

/** colunas: [{ titulo, valor: (linha) => texto, numero: true }] */
export function preencherTabela(alvo, colunas, linhas, legenda) {
  const tabela = el('table', { class: 'tabela' },
    legenda ? el('caption', { class: 'sr-only' }, legenda) : null,
    el('thead', {}, el('tr', {}, colunas.map((c) => el('th', { scope: 'col', class: c.numero ? 'num' : null }, c.titulo)))),
    el('tbody', {}, linhas.map((l) => el('tr', {}, colunas.map((c, i) =>
      el(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: c.numero ? 'num' : null }, c.valor(l)))))));
  alvo.replaceChildren(tabela);
}

/** ⚠ amostra pequena (n = X), em --status-warning. */
export function avisoAmostra(n) {
  return el('span', { class: 'aviso-amostra' }, `⚠ amostra pequena (n = ${n})`);
}

/** Mensagem no lugar de um bloco que não carregou: nunca uma tela vazia sem explicação. */
export function erroDeCarga(alvo, erro) {
  console.error(erro);
  alvo.replaceChildren(el('p', { class: 'painel__vazio' }, 'Não foi possível carregar os dados deste bloco.'));
}
