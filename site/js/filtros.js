// Filtros globais (spec 5.0): período, segmento (chips liga/desliga), departamento (lista com busca) e "Limpar tudo".
// O estado é um só, em estado.filtros e estado.periodo; quem muda o filtro avisa com o evento 'filtros-mudaram' e as
// abas reagem a ele, nunca umas às outras. O clique nos gráficos segue o modelo único de seleção (selecao.js); as
// seleções locais de uma aba que viram filtro (região, perfil, subcategoria) ganham etiqueta aqui, só na aba delas.
import { SEGMENTOS } from './agregados.js';
import { SEG_CORES } from './charts/tema.js';
import { el, etiquetaSegmento } from './componentes.js';
import { fmt } from './formatar.js';
import { filtrosLocais, iniciarSelecao, limpar as limparSelecao } from './selecao.js';

const PERIODO_PADRAO = '26s';
let estado;
let departamentos = [];
let nos;
let avisoPendente = false;

/** Redesenha etiquetas e controles e avisa as abas (uma vez por ciclo, mesmo que várias dimensões mudem juntas). */
export function avisar() {
  desenharEtiquetas();
  sincronizarControles();
  if (avisoPendente) return;
  avisoPendente = true;
  queueMicrotask(() => {
    avisoPendente = false;
    window.dispatchEvent(new CustomEvent('filtros-mudaram'));
  });
}

export function iniciarFiltros(estadoGlobal, listaDepartamentos) {
  estado = estadoGlobal;
  estado.filtros = { segmentos: new Set(), departamentos: new Set() };
  iniciarSelecao(estado);
  departamentos = listaDepartamentos;
  // Seleção feita num gráfico ou lista (selecao.js): global vira 'filtros-mudaram'; local só redesenha as etiquetas
  // (a aba dela ouve 'selecao-mudou').
  window.addEventListener('selecao-mudou', (e) => {
    if (e.detail.global) avisar();
    else desenharEtiquetas();
  });
  window.addEventListener('aba-visivel', () => desenharEtiquetas());
  nos = {
    periodos: [...document.querySelectorAll('.filtro[data-periodo]')],
    chips: document.getElementById('chips-segmento'),
    botaoDep: document.getElementById('botao-departamentos'),
    popover: document.getElementById('popover-departamentos'),
    busca: document.getElementById('busca-departamento'),
    lista: document.getElementById('lista-departamentos'),
    limpar: document.getElementById('limpar-filtros'),
    etiquetas: document.getElementById('etiquetas-filtro'),
  };

  for (const botao of nos.periodos) {
    botao.addEventListener('click', () => {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      estado.periodo = botao.dataset.periodo;
      avisar();
    });
  }

  // Chips de segmento: cada clique (ou toque, ou Ctrl + clique) liga ou desliga o segmento. Nenhum ligado = todos.
  nos.chips.replaceChildren(...SEGMENTOS.map((s) => el('button', {
    class: 'filtro chip', type: 'button', 'aria-pressed': 'false', dataset: { segmento: s },
    onclick: (e) => {
      if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
      const conjunto = estado.filtros.segmentos;
      if (conjunto.has(s)) conjunto.delete(s); else conjunto.add(s);
      avisar();
    },
  }, etiquetaSegmento(s, SEG_CORES[s]))));

  // Departamentos: lista com busca e seleção múltipla, na ordem do faturamento das 26 semanas.
  nos.lista.replaceChildren(...departamentos.map((d) => el('li', { dataset: { nome: d.departamento.toLowerCase() } },
    el('label', { class: 'opcao-departamento' },
      el('input', { type: 'checkbox', value: d.departamento, onchange: (e) => {
        if (e.target.checked) estado.filtros.departamentos.add(d.departamento);
        else estado.filtros.departamentos.delete(d.departamento);
        avisar();
      } }),
      el('span', { class: 'opcao-departamento__nome' }, d.departamento),
      el('span', { class: 'opcao-departamento__valor' },
        d.amostra_pequena ? '⚠ ' : '',
        d.faturamento_26s > 0 ? fmt.usdGrande(d.faturamento_26s) : 'sem venda em 26 sem.')))));
  nos.busca.addEventListener('input', () => {
    const termo = nos.busca.value.trim().toLowerCase();
    for (const li of nos.lista.children) li.hidden = !li.dataset.nome.includes(termo);
  });
  nos.botaoDep.addEventListener('click', () => {
    if (nos.botaoDep.getAttribute('aria-disabled') === 'true') return;
    abrirPopover(nos.popover.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!nos.popover.hidden && !e.target.closest('.filtro-departamento')) abrirPopover(false);
  });
  nos.popover.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); abrirPopover(false); nos.botaoDep.focus(); }
  });

  nos.limpar.addEventListener('click', () => {
    estado.filtros.segmentos.clear();
    estado.filtros.departamentos.clear();
    for (const d of filtrosLocais(estado.abaVisivel)) limparSelecao(d.nome);
    estado.periodo = PERIODO_PADRAO;
    avisar();
  });
  desenharEtiquetas();
  sincronizarControles();
}

function abrirPopover(abrir) {
  nos.popover.hidden = !abrir;
  nos.botaoDep.setAttribute('aria-expanded', String(abrir));
  if (abrir) nos.busca.focus();
}

/** Botões, chips e caixas de seleção refletem o estado (o estado pode mudar por clique num gráfico ou etiqueta). */
function sincronizarControles() {
  const { segmentos, departamentos: deps } = estado.filtros;
  nos.periodos.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === estado.periodo)));
  for (const chip of nos.chips.children) chip.setAttribute('aria-pressed', String(segmentos.has(chip.dataset.segmento)));
  for (const caixa of nos.lista.querySelectorAll('input')) caixa.checked = deps.has(caixa.value);
  const n = deps.size;
  nos.botaoDep.textContent = n === 0 ? 'Departamento: todos ▾' : n === 1 ? `Departamento: ${[...deps][0]} ▾` : `Departamento: ${n} ▾`;
  nos.botaoDep.setAttribute('aria-pressed', String(n > 0));
  nos.botaoDep.title = n ? `Departamento: ${[...deps].join(', ')}` : 'Filtrar por departamento';
  sincronizarLimpar();
}

function sincronizarLimpar() {
  const { segmentos, departamentos: deps } = estado.filtros;
  const locais = filtrosLocais(estado.abaVisivel).some((d) => d.valores.size);
  nos.limpar.disabled = !segmentos.size && !deps.size && !locais && estado.periodo === PERIODO_PADRAO;
}

/** Etiquetas removíveis dos filtros ativos: "Segmento: Fiéis, Regulares ✕". */
function desenharEtiquetas() {
  const { segmentos, departamentos: deps } = estado.filtros;
  const lista = (nomes) => (nomes.length <= 3 ? nomes.join(', ') : `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`);
  const etiqueta = (rotulo, valores, remover, nomeAria) => el('span', { class: 'etiqueta-filtro' },
    el('span', {}, `${rotulo}: ${lista(valores)}`),
    el('button', { class: 'etiqueta-filtro__remover', type: 'button', 'aria-label': nomeAria, title: nomeAria, onclick: remover }, '✕'));
  const itens = [];
  if (segmentos.size) {
    itens.push(etiqueta('Segmento', SEGMENTOS.filter((s) => segmentos.has(s)),
      () => { segmentos.clear(); avisar(); }, 'Remover filtro de segmento'));
  }
  if (deps.size) {
    const ordem = departamentos.map((d) => d.departamento).filter((d) => deps.has(d));
    itens.push(etiqueta('Departamento', ordem, () => { deps.clear(); avisar(); }, 'Remover filtro de departamento'));
  }
  // Seleções locais da aba visível que viram filtro (região, perfil, subcategoria).
  for (const d of filtrosLocais(estado.abaVisivel)) {
    if (!d.valores.size) continue;
    itens.push(etiqueta(d.rotulo, [...d.valores].map(d.formatar), () => limparSelecao(d.nome),
      `Remover filtro de ${d.rotulo.toLowerCase()}`));
  }
  sincronizarLimpar();
  nos.etiquetas.replaceChildren(...itens);
  nos.etiquetas.hidden = itens.length === 0;
}
