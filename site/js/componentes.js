// Componentes de HTML do painel (skill designing-dashboard-ui, "Componentes"). Nada de estilo solto: só classes do app.css.
import { fmt } from './formatar.js';

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

// --------------------------------------------------------------------------- ⓘ do card (v4.2)
// O método e as regras do card saem do corpo e moram aqui. Abre com o mouse por cima, com o foco do teclado e com
// toque ou clique (o clique fixa aberto; outro clique, clique fora ou Esc fecham). O texto fica num role="tooltip"
// ligado ao botão por aria-describedby, então o leitor de tela lê o conteúdo mesmo fechado.

let infoAberta = null;   // a ⓘ fixada por clique ou toque (só uma por vez)

function posicionarInfo(caixa) {
  const botao = caixa.querySelector('.info__botao');
  const texto = caixa.querySelector('.info__texto');
  const b = botao.getBoundingClientRect();
  const margem = 8;
  const largura = Math.min(340, innerWidth - 2 * margem);
  texto.style.width = `${largura}px`;
  texto.style.left = `${Math.max(margem, Math.min(b.left, innerWidth - largura - margem))}px`;
  const alturaTexto = texto.offsetHeight;
  const cabeEmbaixo = b.bottom + 6 + alturaTexto <= innerHeight - margem;
  texto.style.top = `${cabeEmbaixo ? b.bottom + 6 : Math.max(margem, b.top - 6 - alturaTexto)}px`;
}

function mostrarInfo(caixa, mostrar) {
  const texto = caixa.querySelector('.info__texto');
  caixa.querySelector('.info__botao').setAttribute('aria-expanded', String(mostrar));
  texto.hidden = !mostrar;
  if (mostrar) posicionarInfo(caixa);
}

function fecharInfoAberta() {
  if (!infoAberta) return;
  const caixa = infoAberta;
  infoAberta = null;
  mostrarInfo(caixa, false);
}

document.addEventListener('click', (e) => { if (infoAberta && !infoAberta.contains(e.target)) fecharInfoAberta(); });
// Esc fecha a ⓘ antes de qualquer outro uso do Esc (o preventDefault avisa o selecao.js para não limpar a seleção).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const visivel = document.querySelector('.info__texto:not([hidden])');
  if (!visivel) return;
  e.preventDefault();
  const caixa = visivel.closest('.info');
  infoAberta = null;
  mostrarInfo(caixa, false);
}, true);
// A caixa é fixa na janela: ao rolar, acompanha o botão; se o botão sair da janela, fecha. (Fechar a cada rolagem não
// serve: focar o botão rola a página até ele, e a caixa fecharia no mesmo instante.)
window.addEventListener('scroll', () => {
  document.querySelectorAll('.info__texto:not([hidden])').forEach((t) => {
    const caixa = t.closest('.info');
    const b = caixa.querySelector('.info__botao').getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) { if (infoAberta === caixa) infoAberta = null; mostrarInfo(caixa, false); } else posicionarInfo(caixa);
  });
}, { passive: true, capture: true });

/**
 * O botão ⓘ de um card. rotulo: o título do card (para o nome acessível). conteudo: texto, nó ou lista deles (cada item
 * vira um parágrafo). Sem conteúdo, o botão some. Troque o conteúdo depois com definirInfo.
 */
export function info(rotulo, conteudo = []) {
  const id = `info-${++sequencia}`;
  const botao = el('button', { class: 'info__botao', type: 'button', 'aria-label': `Sobre: ${rotulo}`, 'aria-describedby': id, 'aria-expanded': 'false' }, 'ⓘ');
  const texto = el('div', { class: 'info__texto', id, role: 'tooltip', hidden: true });
  const caixa = el('span', { class: 'info' }, botao, texto);
  caixa.addEventListener('mouseenter', () => mostrarInfo(caixa, true));
  caixa.addEventListener('mouseleave', () => { if (infoAberta !== caixa && document.activeElement !== botao) mostrarInfo(caixa, false); });
  botao.addEventListener('focus', () => mostrarInfo(caixa, true));
  botao.addEventListener('blur', () => { if (infoAberta !== caixa && !caixa.matches(':hover')) mostrarInfo(caixa, false); });
  botao.addEventListener('click', (e) => {
    e.stopPropagation();   // o clique na ⓘ não é clique no fundo de um gráfico ou lista
    if (infoAberta === caixa) { fecharInfoAberta(); return; }
    fecharInfoAberta();
    infoAberta = caixa;
    mostrarInfo(caixa, true);
  });
  definirInfo(caixa, conteudo);
  return caixa;
}

/** Troca o conteúdo de uma ⓘ (a caixa devolvida por info). */
export function definirInfo(caixa, conteudo) {
  const itens = (Array.isArray(conteudo) ? conteudo : [conteudo]).filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  caixa.querySelector('.info__texto').replaceChildren(...itens.map((c) => el('p', {}, c)));
  caixa.hidden = !itens.length;
  if (!caixa.querySelector('.info__texto').hidden) posicionarInfo(caixa);
}

/** Etiqueta curta e visível para o que muda a leitura do número. tom: 'aviso' (⚠, cor de alerta) ou 'neutro'. */
export function etiqueta(texto, tom = 'neutro') {
  return el('span', { class: `etiqueta-card etiqueta-card--${tom}` }, texto);
}

/** Troca as etiquetas de um card (o contêiner devolvido por cabecalhoCard ou painelGrafico). itens: [texto, tom] ou nulos. */
export function definirEtiquetas(alvo, itens) {
  alvo.replaceChildren(...itens.filter(Boolean).map(([texto, tom]) => etiqueta(texto, tom)));
}

/**
 * Cabeçalho de card no formato v4.2: título + ⓘ + etiquetas numa linha e, embaixo, um subtítulo curto (ou nenhum).
 * Devolve { cabecalho, titulo, info, etiquetas, subtitulo }.
 */
export function cabecalhoCard({ id, titulo, subtitulo = '', nivel = 'h2' }) {
  const h = el(nivel, { class: 'painel__titulo', id }, titulo);
  const caixaInfo = info(titulo);
  const etiquetas = el('span', { class: 'painel__etiquetas' });
  const sub = el('p', { class: 'painel__subtitulo' }, subtitulo);
  const cabecalho = el('div', { class: 'painel__titulos' }, el('div', { class: 'painel__titulo-linha' }, h, caixaInfo, etiquetas), sub);
  return { cabecalho, titulo: h, info: caixaInfo, etiquetas, subtitulo: sub };
}

/**
 * Painel com gráfico e a sua tabela gêmea (a visão em tabela que toda visualização tem).
 * Devolve { painel, grafico, tabela, aoAlternar, info, etiquetas, subtitulo, titulo } — o gráfico e a tabela ocupam o mesmo lugar.
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
  const cab = cabecalhoCard({ id: `${id}-titulo`, titulo, subtitulo });
  const painel = el('section', { class: `painel painel--grafico ${classe}`, 'aria-labelledby': `${id}-titulo` },
    el('header', { class: 'painel__cabecalho' }, cab.cabecalho, botao),
    grafico, tabela);
  return { painel, grafico, tabela, aoAlternar: (f) => ouvintes.push(f), info: cab.info, etiquetas: cab.etiquetas, subtitulo: cab.subtitulo, titulo: cab.titulo };
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

/**
 * Período da base na barra superior (#periodo-base) e o rodapé "Sobre os dados" (#sobre-os-dados), lidos do manifest.
 * link: o link do começo do rodapé (no painel, "Metodologia e validação"; na página de metodologia, a volta ao painel).
 */
export function sobreOsDados(m, { link = null, erro = null } = {}) {
  const periodo = document.getElementById('periodo-base');
  const rodape = document.getElementById('sobre-os-dados');
  if (!m) {
    console.error(erro);
    periodo.textContent = 'Período da base: indisponível';
    rodape.textContent = 'Sobre os dados: não foi possível ler data/manifest.json.';
    return;
  }
  const intervalo = `${fmt.data(m.periodo_base.inicio)} a ${fmt.data(m.periodo_base.fim)}`;
  periodo.textContent = `Período da base: ${intervalo}`;
  rodape.replaceChildren();
  if (link) rodape.append(el('a', { class: 'rodape__link', href: link.href }, link.texto), ' · ');
  [
    ['Fonte', 'Dunnhumby, The Complete Journey'],
    ['Origem', 'lakehouse (bronze → silver → gold)'],
    ['Período', intervalo],
    ['Gerado em', new Date(m.gerado_em).toLocaleDateString('pt-BR')],
    ['Base', m.base_hash],
    ['Commit do lakehouse', `${m.lakehouse_commit.slice(0, 7)}${m.lakehouse_sujo ? ' (com mudanças não commitadas)' : ''}`],
  ].forEach(([rotulo, valor], i) => {
    if (i) rodape.append(' · ');
    rodape.append(el('strong', {}, `${rotulo}: `), valor);
  });
}
