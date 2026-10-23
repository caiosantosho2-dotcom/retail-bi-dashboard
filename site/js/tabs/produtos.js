// Aba Cestas & Marcas (spec 5.5, redesenho v3; ex-Produtos): que produtos andam juntos e quanto pesa a marca própria?
//   topo: uma linha de texto com a concentração ("N subcategorias fazem 80% do faturamento", no lugar da curva ABC);
//   rede de cestas das maiores subcategorias (nós e ligações fixos, números do período e do segmento): clique num nó
//   acende os vizinhos e vira o filtro de subcategoria da aba;
//   pares: os do nó selecionado, ou os característicos dos segmentos, em frases de confiança;
//   marca própria e fornecedores por departamento, para os segmentos e o período (clique filtra o departamento).
import { chaveSubconjunto } from '../agregados.js';
import { contornoArredondado } from '../charts/geometria.js';
import { COR, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA, clicar, ligarGrafico, ligarLista, registrarDimensao } from '../selecao.js';

const TOP_MARCAS = 12;
const TOP_PARES = 10;
const NOMES_NA_REDE = 15;   // rótulo direto só nos maiores nós e nos vizinhos do selecionado (o resto no tooltip)
const NO_MIN = 5;
const NO_MAX = 26;
const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };

let estado;
let dados;            // os fixos: nós da rede, concentração, manifest
let periodo = null;   // os do período desenhado: marcas, pares, vizinhos, característicos
let ui;
let pedido = 0;

// O nó selecionado na rede vira o filtro de subcategoria da aba (modelo único de seleção; um por vez).
const subcategoriaSel = registrarDimensao('subcategoria', {
  aba: 'painel-produtos', rotulo: 'Subcategoria', unico: true,
  formatar: (n) => dados?.no.get(n)?.subcategoria ?? String(n),
});

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  const resumo = el('p', { class: 'pd-resumo', 'aria-live': 'polite' });
  const rede = painelGrafico({ titulo: 'Rede de cestas: o que vai junto', subtitulo: '', classe: 'pd-rede' });
  const pares = el('section', { class: 'painel pd-pares', 'aria-labelledby': 'pd-pares-titulo' },
    el('h2', { class: 'painel__titulo', id: 'pd-pares-titulo' }, 'Pares que vão juntos'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('ol', { class: 'ct-pares pd-pares__lista' }));
  const marcas = el('section', { class: 'painel pd-marcas', 'aria-labelledby': 'pd-marcas-titulo' },
    el('h2', { class: 'painel__titulo', id: 'pd-marcas-titulo' }, 'Marca própria e fornecedores por departamento'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('div', { class: 'pd-marcas__tabela' }));
  container.classList.add('pd');
  container.replaceChildren(resumo, rede.painel, pares, marcas);
  ui = { resumo, rede, pares, marcas, graficos: { rede: criarGrafico(rede.grafico) } };
  rede.aoAlternar((tabela) => { if (!tabela) ui.graficos.rede.resize(); });

  try {
    const [nos, concentracao, manifest] = await Promise.all([linhas('rede_nos.json'), linhas('concentracao.json'), carregar('manifest.json')]);
    dados = { nos, no: new Map(nos.map((n) => [n.no, n])), concentracao, manifest };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  ui.graficos.rede.on('click', (p) => {
    if (p.seriesId === 'nos' && p.dataType === 'node') clicar('subcategoria', p.data.no, p.event?.event);
    if (p.seriesId === 'nomes-deptos') clicar('departamentos', p.data.departamento, p.event?.event);
  });
  ligarGrafico(ui.graficos.rede, 'subcategoria');
  ligarLista(ui.marcas.querySelector('.pd-marcas__tabela'), 'tbody tr', 'departamentos');
  window.addEventListener('selecao-mudou', (e) => {
    if (e.detail.dimensao !== 'subcategoria' || !periodo) return;
    desenharRede();
    desenharPares();
  });
}

async function carregarPeriodo(p) {
  const [marcas, pares, vizinhos, caract] = await Promise.all([linhas(`marcas_${p}.json`), linhas(`rede_pares_${p}.json`),
    linhas(`rede_vizinhos_${p}.json`), linhas(`rede_caracteristicos_${p}.json`)]);
  return { periodo: p, marcas, pares, vizinhos, caract };
}

export async function atualizar() {
  if (!dados) return;
  const meu = ++pedido;
  let carregado;
  try {
    carregado = await carregarPeriodo(estado.periodo);
  } catch (erro) {
    erroDeCarga(ui.rede.grafico, erro);
    return;
  }
  if (meu !== pedido) return;   // outro período chegou enquanto este carregava
  periodo = carregado;
  ui.graficos.rede.resize();
  desenharResumo();
  desenharRede();
  desenharPares();
  desenharMarcas();
  requestAnimationFrame(() => ui.graficos.rede.resize());
}

const deps = () => estado.filtros.departamentos;
const foraDoFiltro = (departamento) => deps().size > 0 && !deps().has(departamento);
const nomeSub = (sub) => (sub === 'todos' ? 'todos os clientes' : sub.split('+').join(', '));
const no = () => [...subcategoriaSel][0];
/** "11× mais que o normal" (o lift arredondado, com uma casa abaixo de 10). */
const vezes = (lift) => `${fmt.decimal(lift, lift < 10 ? 1 : 0)}× mais que o normal`;

function subtitulo(painel) {
  return painel.querySelector('.painel__subtitulo')
    ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
}

// --------------------------------------------------------------------------- a linha de concentração

function desenharResumo() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const c = dados.concentracao.find((x) => x.periodo === estado.periodo && x.subconjunto === sub);
  ui.resumo.replaceChildren(c
    ? el('span', {}, el('strong', {}, `${fmt.contagem(c.subcategorias_80)} subcategorias`), ` fazem 80% do faturamento (de ${fmt.contagem(c.subcategorias)} com venda), `
      + `${NOMES_PERIODO[estado.periodo]}, ${nomeSub(sub)}.`)
    : el('span', { class: 'aviso-amostra' }, `⚠ ${nomeSub(sub)} não compraram em ${NOMES_PERIODO[estado.periodo]}.`));
}

// --------------------------------------------------------------------------- rede de cestas

function desenharRede() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const ligacoes = periodo.pares.filter((p) => p.subconjunto === sub);
  const nos = dados.nos;
  const maior = Math.max(...nos.map((n) => n.faturamento));
  const tamanho = (n) => Math.max(NO_MIN, NO_MAX * Math.sqrt(n.faturamento / maior));
  const porDep = new Map();
  for (const n of nos) porDep.set(n.departamento, [...(porDep.get(n.departamento) ?? []), n]);
  const areas = [...porDep].map(([departamento, membros]) => {
    const poligono = contornoArredondado(membros.map((n) => [n.x, n.y]), 0.05);
    const topo = poligono.reduce((a, q) => (q[1] > a[1] ? q : a));
    return { departamento, poligono, topo, n: membros.length };
  });
  const comSegmento = sub !== 'todos';
  const minimo = dados.manifest.parametros_cesta.minimo_cestas_par;
  const pr = dados.manifest.parametros_rede;
  const sel = no();
  // Vizinhos do nó selecionado: as ligações desenhadas que tocam nele.
  const vizinhos = new Set(sel === undefined ? [] : ligacoes.flatMap((p) => (p.no_a === sel ? [p.no_b] : p.no_b === sel ? [p.no_a] : [])));
  const aceso = (n) => sel === undefined || n === sel || vizinhos.has(n);
  subtitulo(ui.rede.painel).textContent = `As ${pr.rede_subcategorias} maiores subcategorias das 26 semanas (${fmt.pct(pr.cobertura_faturamento_pct, 0)} do faturamento), `
    + `agrupadas por departamento; perto = vão juntas na cesta. Linhas: as ${pr.rede_ligacoes_por_no} de maior lift de cada uma; os números são de ${NOMES_PERIODO[estado.periodo]}. `
    + (comSegmento ? 'Cor da linha: lift dos segmentos × o de todos (vermelho = mais, azul = menos). ' : '')
    + `Tracejado: menos de ${minimo} cestas. Clique num nó para ver os pares dele.`
    + (estado.periodo === '4s' ? ' ⚠ Período curto: poucos pares confiáveis.' : '');
  const maxLift = Math.max(...ligacoes.map((p) => p.lift), 1);
  const corIndice = (i) => (i >= 1.15 ? COR.divergente[5] : i >= 1.05 ? COR.divergente[4] : i <= 0.87 ? COR.divergente[1] : i <= 0.95 ? COR.divergente[2] : COR.eixo);
  const titulo = 'Rede de cestas das maiores subcategorias';
  // Rótulos: os maiores nós e, com um nó selecionado, ele e os vizinhos. Em tela estreita, só o selecionado e os vizinhos.
  const estreito = ui.graficos.rede.getWidth() < 600;
  const rotulados = new Set([...(estreito ? [] : nos.slice(0, NOMES_NA_REDE).map((n) => n.no)), ...(sel === undefined ? [] : [sel, ...vizinhos])]);
  const indice = new Map(nos.map((n, i) => [n.no, i]));
  ui.graficos.rede.setOption({
    ...base(titulo, `${titulo}: ${nos.length} subcategorias em ${areas.length} departamentos, ${ligacoes.length} ligações de maior lift`
      + `${comSegmento ? `, para ${nomeSub(sub)}` : ''}, ${NOMES_PERIODO[estado.periodo]}.`
      + (sel === undefined ? '' : ` Selecionada: ${dados.no.get(sel).subcategoria}, com ${vizinhos.size} vizinhos.`) + ' As ligações estão na tabela.'),
    grid: { left: 4, right: 4, top: 4, bottom: 4 },
    xAxis: { type: 'value', min: -0.08, max: Math.max(...nos.map((n) => n.x)) + 0.08, show: false },
    yAxis: { type: 'value', min: -0.08, max: Math.max(...nos.map((n) => n.y)) + 0.14, show: false },
    tooltip: { trigger: 'item', formatter: (q) => {
      if (q.seriesId === 'nos' && q.dataType === 'node') {
        const n = dados.no.get(q.data.no);
        return `${n.subcategoria}<br>${n.departamento} · ${fmt.usdGrande(n.faturamento)} nas 26 semanas`
          + `<br>${subcategoriaSel.has(n.no) ? 'Clique de novo para desfazer' : 'Clique para ver os pares dela'}`;
      }
      if (q.seriesId === 'nos' && q.dataType === 'edge') {
        const p = q.data.par;
        return `${dados.no.get(p.no_a).subcategoria} + ${dados.no.get(p.no_b).subcategoria}<br>${vezes(p.lift)} (lift ${fmt.decimal(p.lift, 2)}) · `
          + `${fmt.contagem(p.cestas_par)} cestas com os dois${comSegmento ? `<br>${fmt.decimal(p.indice, 2)} × o lift de todos os clientes` : ''}`
          + `${p.amostra_pequena ? `<br>⚠ amostra pequena (menos de ${minimo} cestas)` : ''}`;
      }
      if (q.seriesId === 'nomes-deptos') return `${q.data.departamento}: ${q.data.n} subcategorias na rede<br>Clique para filtrar o departamento`;
      return null;
    } },
    series: [
      { id: 'areas', type: 'custom', coordinateSystem: 'cartesian2d', z: 1, silent: true,
        data: areas.map((r) => ({ value: r.topo })),
        renderItem: (params, api) => {
          const r = areas[params.dataIndex];
          return { type: 'polygon', shape: { points: r.poligono.map((q) => api.coord(q)) },
                   style: { fill: COR.sombreado, opacity: foraDoFiltro(r.departamento) ? 0.25 : 0.7,
                            stroke: deps().has(r.departamento) ? COR.textoSecundario : COR.eixo, lineWidth: deps().has(r.departamento) ? 2 : 1 } };
        } },
      {
        // Grafo nas coordenadas fixas do export: o hover acende os vizinhos (focus: 'adjacency'), como no clique.
        id: 'nos', type: 'graph', coordinateSystem: 'cartesian2d', z: 3, cursor: 'pointer',
        emphasis: { focus: 'adjacency', blurScope: 'series', label: { show: true }, lineStyle: { opacity: 0.9 } },
        blur: { itemStyle: { opacity: 0.2 }, lineStyle: { opacity: 0.06 }, label: { show: false } },
        data: nos.map((n) => ({ no: n.no, value: [n.x, n.y], symbolSize: tamanho(n),
          itemStyle: { color: COR.serie, opacity: !aceso(n.no) || foraDoFiltro(n.departamento) ? OPACIDADE_FORA : 0.95,
                       borderColor: n.no === sel ? COR.textoPrimario : COR.superficie, borderWidth: n.no === sel ? 3 : 1 },
          label: { show: rotulados.has(n.no), position: 'right', distance: 3, color: n.no === sel ? COR.textoPrimario : COR.textoSecundario,
                   fontSize: 10, fontWeight: n.no === sel ? 600 : 400, formatter: () => n.subcategoria.slice(0, 18) } })),
        labelLayout: { hideOverlap: true },
        edges: ligacoes.map((p) => {
          const toca = sel === undefined || p.no_a === sel || p.no_b === sel;
          const apagada = !toca || (foraDoFiltro(dados.no.get(p.no_a).departamento) && foraDoFiltro(dados.no.get(p.no_b).departamento));
          return { source: indice.get(p.no_a), target: indice.get(p.no_b), par: p,
                   lineStyle: { width: 0.6 + 2.4 * (p.lift / maxLift), type: p.amostra_pequena ? 'dashed' : 'solid', curveness: 0,
                                // Amostra pequena fica cinza: com menos de 200 cestas o índice oscila demais para pintar.
                                // As ligações do nó selecionado em cinza claro (as outras somem); sem seleção, a cor da grade.
                                color: comSegmento && !p.amostra_pequena ? corIndice(p.indice) : sel !== undefined && toca ? COR.textoSecundario : COR.eixo,
                                opacity: apagada ? 0.08 : p.amostra_pequena ? 0.3 : sel === undefined ? 0.55 : 0.9 } };
        }),
      },
      { id: 'nomes-deptos', type: 'custom', coordinateSystem: 'cartesian2d', z: 5, cursor: 'pointer',
        data: areas.map((r) => ({ value: r.topo, departamento: r.departamento, n: r.n })),
        renderItem: (params, api) => {
          const r = areas[params.dataIndex];
          const [tx, ty] = api.coord(r.topo);
          return { type: 'text', x: tx, y: ty - 3,
                   style: { text: r.departamento, fill: COR.textoPrimario, opacity: foraDoFiltro(r.departamento) ? 0.5 : 1,
                            font: '600 11px system-ui', align: 'center', verticalAlign: 'bottom', stroke: COR.superficie, lineWidth: 3 } };
        } },
    ],
  }, { notMerge: true });
  preencherTabela(ui.rede.tabela, [
    { titulo: 'Subcategoria A', valor: (p) => dados.no.get(p.no_a).subcategoria },
    { titulo: 'Subcategoria B', valor: (p) => dados.no.get(p.no_b).subcategoria },
    { titulo: 'Lift', valor: (p) => fmt.decimal(p.lift, 2), numero: true },
    { titulo: 'Cestas', valor: (p) => `${p.amostra_pequena ? '⚠ ' : ''}${fmt.contagem(p.cestas_par)}`, numero: true },
    { titulo: '× todos', valor: (p) => fmt.decimal(p.indice, 2), numero: true },
  ], [...ligacoes].sort((x, y) => y.lift - x.lift), titulo);
}

// --------------------------------------------------------------------------- pares (do nó ou dos segmentos)

/** Um par como frase: "Quem compra A também leva B em X% das vezes · N× mais que o normal". */
function par({ de, leva, confianca, lift, cestas, detalhe }) {
  return el('li', { class: 'ct-par', title: `lift ${fmt.decimal(lift, 2)} · confiança ${fmt.pct(confianca)} · ${fmt.contagem(cestas)} cestas com os dois` },
    el('p', { class: 'ct-par__frase' }, 'Quem compra ', el('strong', {}, de), ' também leva ', el('strong', {}, leva),
      ` em ${fmt.pct(confianca, 0)} das vezes`),
    el('p', { class: 'ct-par__detalhe' }, el('span', { class: 'ct-par__vezes' }, vezes(lift)), detalhe ?? '', ` · ${fmt.contagem(cestas)} cestas`));
}

function desenharPares() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const lista = ui.pares.querySelector('.pd-pares__lista');
  const minimo = dados.manifest.parametros_cesta.minimo_cestas_par;
  const nome = (n) => dados.no.get(n).subcategoria;
  const sel = no();
  const curto = estado.periodo === '4s' ? ' ⚠ Período curto: poucos pares confiáveis.' : '';
  const titulo = ui.pares.querySelector('.painel__titulo');
  let itens;
  if (sel !== undefined) {
    titulo.textContent = `Pares com ${nome(sel)}`;
    subtitulo(ui.pares).textContent = `Os ${TOP_PARES} de maior lift, ${nomeSub(sub)}, ${NOMES_PERIODO[estado.periodo]}, com ${minimo}+ cestas.${curto} Clique no nó de novo para voltar.`;
    itens = periodo.vizinhos.filter((v) => v.subconjunto === sub && v.no === sel)
      .map((v) => par({ de: nome(sel), leva: nome(v.outro), confianca: v.confianca, lift: v.lift, cestas: v.cestas_par,
                        detalhe: sub === 'todos' ? null : ` · ${fmt.decimal(v.indice, 2)}× o de todos` }));
  } else if (sub !== 'todos') {
    titulo.textContent = 'Pares característicos';
    subtitulo(ui.pares).textContent = `${nomeSub(sub)}: os pares cujo lift mais supera o de todos os clientes (índice = lift deles ÷ lift de todos), `
      + `${NOMES_PERIODO[estado.periodo]}, com ${minimo}+ cestas.${curto}`;
    itens = periodo.caract.filter((c) => c.subconjunto === sub).slice(0, TOP_PARES).map((c) => {
      const aParaB = c.confianca_a_b >= c.confianca_b_a;
      return par({ de: nome(aParaB ? c.no_a : c.no_b), leva: nome(aParaB ? c.no_b : c.no_a), confianca: Math.max(c.confianca_a_b, c.confianca_b_a),
                   lift: c.lift, cestas: c.cestas_par, detalhe: ` · ${fmt.decimal(c.indice, 2)}× o de todos` });
    });
  } else {
    titulo.textContent = 'Pares que vão juntos';
    subtitulo(ui.pares).textContent = `Os ${TOP_PARES} pares de maior lift entre as subcategorias da rede, todos os clientes, ${NOMES_PERIODO[estado.periodo]}, `
      + `com ${minimo}+ cestas.${curto} Ligue segmentos para ver os pares característicos deles, ou clique num nó.`;
    // Cada par aparece duas vezes nos vizinhos (uma por ponta): fica a direção de maior confiança.
    const porPar = new Map();
    for (const v of periodo.vizinhos.filter((x) => x.subconjunto === 'todos')) {
      const chave = `${Math.min(v.no, v.outro)}-${Math.max(v.no, v.outro)}`;
      if (!porPar.has(chave) || porPar.get(chave).confianca < v.confianca) porPar.set(chave, v);
    }
    itens = [...porPar.values()].sort((a, b) => b.lift - a.lift || a.no - b.no).slice(0, TOP_PARES)
      .map((v) => par({ de: nome(v.no), leva: nome(v.outro), confianca: v.confianca, lift: v.lift, cestas: v.cestas_par }));
  }
  lista.replaceChildren(...(itens.length ? itens
    : [el('li', {}, el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: nenhum par com ${minimo} cestas ou mais neste recorte.`))]));
}

// --------------------------------------------------------------------------- marca própria e fornecedores

function desenharMarcas() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const lista = periodo.marcas.filter((m) => m.subconjunto === sub && !m.amostra_pequena).slice(0, TOP_MARCAS);
  const semAnterior = estado.periodo === 'base';
  subtitulo(ui.marcas).textContent = `${TOP_MARCAS} maiores departamentos, ${NOMES_PERIODO[estado.periodo]}, ${nomeSub(sub)}. A base só traz o código do fabricante; `
    + 'o 69 é a marca própria da rede (97% dela). Fornecedores = fabricantes das marcas nacionais. '
    + (semAnterior ? 'A base inteira não tem ano anterior para o crescimento. ' : 'Crescimento nas lojas comparáveis do período. ')
    + 'Clique numa linha para filtrar o departamento.';
  const maxMp = Math.max(...lista.map((m) => m.marca_propria_pct), 0.0001);
  const variacao = (v) => el('span', { class: `variacao variacao--${v === null ? 'neutro' : v >= 0 ? 'bom' : 'critico'}` }, fmt.variacao(v));
  const tabela = el('table', { class: 'tabela pd-tabela' },
    el('caption', { class: 'sr-only' }, 'Marca própria e fornecedores por departamento'),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, 'Departamento'),
      el('th', { scope: 'col', class: 'num' }, 'Faturamento'),
      el('th', { scope: 'col' }, 'Marca própria'),
      el('th', { scope: 'col', class: 'num', title: 'Crescimento like-for-like da marca própria e da nacional' }, 'Própria × nacional'),
      el('th', { scope: 'col', class: 'num', title: 'Quantos fornecedores nacionais somam 80% do faturamento nacional' }, 'Fornec. p/ 80%'),
      el('th', { scope: 'col', class: 'num', title: 'Parte do maior fornecedor nacional' }, 'Maior'))),
    el('tbody', {}, lista.map((m) => el('tr', {
      class: foraDoFiltro(m.departamento) ? 'pd-linha--fora' : null, tabindex: '0', role: 'button',
      'aria-label': `Filtrar ${m.departamento}`, title: deps().has(m.departamento) ? 'Clique de novo para desfazer' : 'Clique para filtrar; Ctrl + clique soma',
      onclick: (e) => clicar('departamentos', m.departamento, e),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clicar('departamentos', m.departamento, e); } },
    },
    el('th', { scope: 'row' }, m.departamento),
    el('td', { class: 'num' }, fmt.usdGrande(m.faturamento)),
    el('td', {}, el('span', { class: 'pd-barra', 'aria-hidden': 'true' }, el('span', { style: `width:${(100 * m.marca_propria_pct / maxMp).toFixed(1)}%` })),
      ` ${fmt.pct(m.marca_propria_pct)}`),
    el('td', { class: 'num' }, variacao(m.marca_propria_crescimento_pct), ' × ', variacao(m.nacional_crescimento_pct)),
    el('td', { class: 'num' }, fmt.contagem(m.fabricantes_80), el('span', { class: 'pd-de' }, ` de ${fmt.contagem(m.fabricantes_nacionais)}`)),
    el('td', { class: 'num' }, fmt.pct(m.maior_fabricante_pct, 0))))));
  ui.marcas.querySelector('.pd-marcas__tabela').replaceChildren(lista.length ? tabela
    : el('p', { class: 'aviso-amostra' }, '⚠ Nenhum departamento com venda neste recorte.'));
}
