// Modelo único de seleção (redesenho v3, 0.1): o mesmo gesto em todo gráfico e toda lista clicável do painel.
//   clique                      = seleciona o item;
//   clique no item já selecionado = desfaz e volta ao total;
//   Ctrl (ou ⌘) + clique         = soma ou tira o item da seleção;
//   Esc, ou clique no fundo vazio do gráfico = limpa a seleção daquele gráfico.
// O item selecionado fica destacado e os outros com OPACIDADE_FORA (cada aba desenha assim).
// Dimensões globais (segmentos, departamentos) ficam em estado.filtros e valem para todas as abas. As locais (loja,
// região, perfil, subcategoria) são de uma aba só. Toda seleção que vira filtro tem etiqueta removível na linha de
// filtros (filtros.js), e quem muda uma seleção avisa com o evento 'selecao-mudou'.

export const OPACIDADE_FORA = 0.35;

const GLOBAIS = new Set(['segmentos', 'departamentos']);
const locais = new Map();         // nome -> { nome, aba, rotulo, filtro, unico, formatar, valores }
const ultimaPorAba = new Map();   // id da aba -> dimensões do último gráfico ou lista usado (o Esc limpa essas)
let estado;

export function iniciarSelecao(estadoGlobal) {
  estado = estadoGlobal;
}

/**
 * Dimensão local de uma aba. filtro: vira etiqueta na linha de filtros; unico: um item por vez (o Ctrl não soma).
 * Devolve o conjunto dos selecionados.
 */
export function registrarDimensao(nome, { aba, rotulo, filtro = true, unico = false, formatar = String }) {
  if (!locais.has(nome)) locais.set(nome, { nome, aba, rotulo, filtro, unico, formatar, valores: new Set() });
  return locais.get(nome).valores;
}

export function selecionados(nome) {
  return GLOBAIS.has(nome) ? estado.filtros[nome] : locais.get(nome).valores;
}

/** As dimensões locais que viram filtro na aba (para as etiquetas). */
export function filtrosLocais(aba) {
  return [...locais.values()].filter((d) => d.aba === aba && d.filtro);
}

/** Avisa a mudança: filtros.js redesenha as etiquetas e, se a dimensão for global, dispara 'filtros-mudaram'. */
export function mudou(nome) {
  window.dispatchEvent(new CustomEvent('selecao-mudou', { detail: { dimensao: nome, global: GLOBAIS.has(nome) } }));
}

const ctrlDe = (evento) => Boolean(evento?.ctrlKey || evento?.metaKey);

/** O gesto de clique num item, com a regra do topo do arquivo. */
export function clicar(nome, valor, evento) {
  const conjunto = selecionados(nome);
  const unico = locais.get(nome)?.unico;
  if (ctrlDe(evento) && !unico) {
    if (conjunto.has(valor)) conjunto.delete(valor); else conjunto.add(valor);
  } else if (conjunto.has(valor)) {
    conjunto.clear();
  } else {
    conjunto.clear();
    conjunto.add(valor);
  }
  lembrar(evento?.target ?? null, [nome]);
  mudou(nome);
}

/**
 * Um item que é um par de dimensões (célula segmento × departamento): selecionado quando os dois estão nos filtros.
 * Clique substitui os dois, clique no já selecionado limpa os dois, Ctrl + clique soma ou tira os dois.
 */
export function clicarPar([nomeA, valorA], [nomeB, valorB], evento) {
  const a = selecionados(nomeA);
  const b = selecionados(nomeB);
  const marcado = a.has(valorA) && b.has(valorB);
  if (ctrlDe(evento)) {
    if (marcado) { a.delete(valorA); b.delete(valorB); } else { a.add(valorA); b.add(valorB); }
  } else if (marcado) {
    a.clear(); b.clear();
  } else {
    a.clear(); b.clear(); a.add(valorA); b.add(valorB);
  }
  lembrar(evento?.target ?? null, [nomeA, nomeB]);
  mudou(nomeA);
  mudou(nomeB);
}

/** Limpa as dimensões dadas; devolve true se alguma tinha seleção. */
export function limpar(...nomes) {
  let algum = false;
  for (const nome of nomes) {
    const conjunto = selecionados(nome);
    if (!conjunto.size) continue;
    conjunto.clear();
    algum = true;
    mudou(nome);
  }
  return algum;
}

function abaDe(no) {
  return no?.closest?.('.painel-aba')?.id ?? document.querySelector('.painel-aba:not([hidden])')?.id;
}

function lembrar(no, nomes) {
  const aba = abaDe(no);
  if (aba) ultimaPorAba.set(aba, nomes);
}

/**
 * Liga um gráfico ECharts ao modelo: o clique no fundo vazio limpa as dimensões dele, e qualquer clique nele o torna o
 * "último gráfico usado" da aba (o Esc limpa esse). O clique nos itens continua com a aba, que chama clicar().
 */
export function ligarGrafico(grafico, ...nomes) {
  const dom = grafico.getDom();
  grafico.getZr().on('click', (e) => {
    lembrar(dom, nomes);
    if (!e.target) limpar(...nomes);
  });
}

/** O mesmo para uma lista ou tabela HTML: clicar fora dos itens (seletor) limpa. */
export function ligarLista(container, seletorItem, ...nomes) {
  container.addEventListener('click', (e) => {
    lembrar(container, nomes);
    if (!e.target.closest(seletorItem)) limpar(...nomes);
  });
}

/** Esc limpa a seleção do último gráfico usado na aba visível. Quem usa o Esc para outra coisa chama preventDefault. */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const aba = document.querySelector('.painel-aba:not([hidden])')?.id;
  const nomes = ultimaPorAba.get(aba);
  if (nomes) limpar(...nomes);
});
