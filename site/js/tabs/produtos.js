// Aba Produtos (spec 5.5): curva ABC das subcategorias, marca própria e fornecedores por departamento, rede de cestas
// das maiores subcategorias e os pares característicos dos segmentos selecionados.
// Janela de 26 semanas (ABC e marcas) e janela da cesta (rede). O filtro de segmento vale para a rede; o de
// departamento destaca os itens dele (e o clique numa barra, linha ou nó aplica o filtro de departamento).
import { chaveSubconjunto } from '../agregados.js';
import { contornoArredondado } from '../charts/geometria.js';
import { COR, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { aplicarCliqueGrafico } from '../filtros.js';
import { fmt } from '../formatar.js';

const OPACIDADE_FORA = 0.35;
const TOP_MARCAS = 12;
const NOMES_NA_REDE = 12;   // rótulo direto só nas maiores subcategorias (o resto no tooltip); os que colidem somem
const NO_MIN = 5;
const NO_MAX = 26;

let estado;
let dados;
let ui;

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  const abc = painelGrafico({ titulo: 'Curva ABC das subcategorias', subtitulo: '', classe: 'pd-abc' });
  const marcas = el('section', { class: 'painel pd-marcas', 'aria-labelledby': 'pd-marcas-titulo' },
    el('h2', { class: 'painel__titulo', id: 'pd-marcas-titulo' }, 'Marca própria e fornecedores por departamento'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('div', { class: 'pd-marcas__tabela' }));
  const rede = painelGrafico({ titulo: 'Rede de cestas: o que vai junto', subtitulo: '', classe: 'pd-rede' });
  const pares = el('section', { class: 'painel pd-pares', 'aria-labelledby': 'pd-pares-titulo' },
    el('h2', { class: 'painel__titulo', id: 'pd-pares-titulo' }, 'Pares característicos'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('ol', { class: 'pares pd-pares__lista' }));
  container.classList.add('pd');
  container.replaceChildren(abc.painel, marcas, rede.painel, pares);
  ui = { abc, marcas, rede, pares, graficos: { abc: criarGrafico(abc.grafico), rede: criarGrafico(rede.grafico) } };
  for (const nome of ['abc', 'rede']) ui[nome].aoAlternar((tabela) => { if (!tabela) ui.graficos[nome].resize(); });

  try {
    const [abcL, marcasL, nos, paresL, caract, manifest] = await Promise.all([
      linhas('abc.json'), linhas('marcas.json'), linhas('rede_nos.json'), linhas('rede_pares.json'),
      linhas('rede_caracteristicos.json'), carregar('manifest.json')]);
    dados = { abc: abcL, marcas: marcasL, nos, no: new Map(nos.map((n) => [n.no, n])), pares: paresL, caract, manifest };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  const ctrl = (p) => Boolean(p.event?.event?.ctrlKey || p.event?.event?.metaKey);
  // Clique num ponto (subcategoria do departamento filtrado): a mesma regra do clique que filtra.
  ui.graficos.abc.on('click', (p) => {
    if (p.data?.x) aplicarCliqueGrafico('departamentos', p.data.x.departamento, ctrl(p));
  });
  ui.graficos.rede.on('click', (p) => {
    if (p.seriesId === 'nos') aplicarCliqueGrafico('departamentos', dados.no.get(p.data.no).departamento, ctrl(p));
    if (p.seriesId === 'nomes-deptos') aplicarCliqueGrafico('departamentos', p.data.departamento, ctrl(p));
  });
}

export function atualizar() {
  if (!dados) return;
  Object.values(ui.graficos).forEach((g) => g.resize());
  desenharAbc();
  desenharMarcas();
  desenharRede();
  desenharPares();
}

const deps = () => estado.filtros.departamentos;
const foraDoFiltro = (departamento) => deps().size > 0 && !deps().has(departamento);

function subtitulo(painel) {
  return painel.querySelector('.painel__subtitulo')
    ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
}

// --------------------------------------------------------------------------- curva ABC

function desenharAbc() {
  // A curva acumulada com as faixas A, B e C. Sem as barras de participação: no eixo de 0 a 100% (a regra do Pareto,
  // sem segundo eixo), a maior das 321 subcategorias tem 4% e as barras somem (validação da P2). Com filtro de
  // departamento, as subcategorias dele viram pontos sobre a curva: mostra onde elas caem no ABC.
  const a = dados.abc;
  const classes = ['A', 'B', 'C'].map((c) => {
    const itens = a.filter((x) => x.classe === c);
    return { classe: c, n: itens.length, inicio: itens[0].posicao - 1, fim: itens.at(-1).posicao - 1,
             parte: itens.reduce((s, x) => s + x.participacao_pct, 0) };
  });
  const filtradas = a.filter((x) => deps().has(x.departamento));
  subtitulo(ui.abc.painel).textContent = `26 semanas, todas as lojas. ${classes.map((c) => `${c.classe}: ${fmt.contagem(c.n)} subcategorias, ${fmt.pct(c.parte, 0)} do faturamento`).join(' · ')}. `
    + (deps().size ? `Pontos: as ${fmt.contagem(filtradas.length)} subcategorias do filtro de departamento.` : 'Filtre um departamento para ver onde as subcategorias dele caem na curva.');
  const titulo = 'Curva ABC das subcategorias';
  const dica = (x) => `${x.posicao}. ${x.subcategoria} (${x.departamento}) · classe ${x.classe}<br>${fmt.usd(x.faturamento)} · ${fmt.pct(x.participacao_pct, 2)} do faturamento`
    + `<br>Acumulado: ${fmt.pct(x.acumulado_pct)}<br>Marca própria: ${fmt.pct(x.marca_propria_pct)} · ${x.crescimento_pct === null ? 'sem ano anterior' : `${fmt.variacao(x.crescimento_pct)} contra o ano anterior`}`;
  ui.graficos.abc.setOption({
    ...base(titulo, `${titulo}: ${classes.map((c) => `classe ${c.classe} com ${c.n} subcategorias e ${fmt.pct(c.parte, 0)} do faturamento`).join('; ')}. `
      + `A maior é ${a[0].subcategoria} (${a[0].departamento}), com ${fmt.pct(a[0].participacao_pct)}. A lista completa está na tabela.`),
    grid: { left: 8, right: 24, top: 16, bottom: 22, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, formatter: (itens) => dica(a[itens[0].dataIndex]) },
    xAxis: { type: 'category', boundaryGap: false, data: a.map((x) => x.posicao), axisLabel: { color: COR.textoMudo, fontSize: 11, interval: 49 },
             name: 'subcategorias, da maior para a menor', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: COR.textoMudo, fontSize: 11 } },
    yAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: COR.textoMudo, fontSize: 11, formatter: (v) => fmt.pct(v, 0) } },
    series: [
      { name: 'Acumulado', type: 'line', symbol: 'none', data: a.map((x) => x.acumulado_pct),
        lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie },
        areaStyle: { color: COR.serie, opacity: 0.08 },
        markArea: { silent: true, label: { color: COR.textoSecundario, fontSize: 11, position: 'insideTop' },
                    // Em tela estreita só a letra da classe (os rótulos longos se encostavam).
                    data: classes.map((c, i) => [{ xAxis: c.inicio, name: ui.graficos.abc.getWidth() < 600 ? c.classe : `${c.classe} · ${c.n} subcategorias`,
                                                   itemStyle: { color: COR.sombreado, opacity: i === 1 ? 0.7 : 0 } },
                                                 { xAxis: c.fim }]) },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: COR.eixo, type: 'dashed' },
                    label: { color: COR.textoMudo, fontSize: 11, formatter: (q) => fmt.pct(q.value, 0) }, data: [{ yAxis: 0.8 }, { yAxis: 0.95 }] } },
      { name: 'Do departamento filtrado', type: 'scatter', symbolSize: 7, cursor: 'pointer',
        data: filtradas.map((x) => ({ value: [x.posicao - 1, x.acumulado_pct], x })),
        itemStyle: { color: COR.textoPrimario, borderColor: COR.superficie, borderWidth: 1 },
        tooltip: { trigger: 'item', formatter: (q) => dica(q.data.x) } },
    ],
  }, { notMerge: true });
  preencherTabela(ui.abc.tabela, [
    { titulo: '#', valor: (x) => String(x.posicao), numero: true },
    { titulo: 'Subcategoria', valor: (x) => x.subcategoria },
    { titulo: 'Departamento', valor: (x) => x.departamento },
    { titulo: 'Classe', valor: (x) => x.classe },
    { titulo: 'Participação', valor: (x) => fmt.pct(x.participacao_pct, 2), numero: true },
    { titulo: 'Acumulado', valor: (x) => fmt.pct(x.acumulado_pct), numero: true },
    { titulo: 'Marca própria', valor: (x) => fmt.pct(x.marca_propria_pct), numero: true },
    { titulo: 'vs ano anterior', valor: (x) => fmt.variacao(x.crescimento_pct), numero: true },
  ], a, titulo);
}

// --------------------------------------------------------------------------- marca própria e fornecedores

function desenharMarcas() {
  const lista = dados.marcas.filter((m) => !m.amostra_pequena).slice(0, TOP_MARCAS);
  subtitulo(ui.marcas).textContent = `${TOP_MARCAS} maiores departamentos, 26 semanas. A base só traz o código do fabricante; o 69 é a marca própria da rede `
    + '(97% dela). Fornecedores = fabricantes das marcas nacionais. Clique numa linha para filtrar o departamento.';
  const maxMp = Math.max(...lista.map((m) => m.marca_propria_pct));
  const variacao = (v) => el('span', { class: `variacao variacao--${v === null ? 'neutro' : v >= 0 ? 'bom' : 'critico'}` }, fmt.variacao(v));
  const tabela = el('table', { class: 'tabela pd-tabela' },
    el('caption', { class: 'sr-only' }, 'Marca própria e fornecedores por departamento'),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, 'Departamento'),
      el('th', { scope: 'col' }, 'Marca própria'),
      el('th', { scope: 'col', class: 'num', title: 'Crescimento like-for-like da marca própria e da nacional' }, 'Própria × nacional'),
      el('th', { scope: 'col', class: 'num', title: 'Quantos fornecedores nacionais somam 80% do faturamento nacional' }, 'Fornec. p/ 80%'),
      el('th', { scope: 'col', class: 'num', title: 'Parte do maior fornecedor nacional' }, 'Maior'))),
    el('tbody', {}, lista.map((m) => el('tr', {
      class: foraDoFiltro(m.departamento) ? 'pd-linha--fora' : null, tabindex: '0', role: 'button',
      'aria-label': `Filtrar ${m.departamento}`,
      onclick: (e) => aplicarCliqueGrafico('departamentos', m.departamento, e.ctrlKey || e.metaKey),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aplicarCliqueGrafico('departamentos', m.departamento, e.ctrlKey); } },
    },
    el('th', { scope: 'row' }, m.departamento),
    el('td', {}, el('span', { class: 'pd-barra', 'aria-hidden': 'true' }, el('span', { style: `width:${(100 * m.marca_propria_pct / maxMp).toFixed(1)}%` })),
      ` ${fmt.pct(m.marca_propria_pct)}`),
    el('td', { class: 'num' }, variacao(m.marca_propria_crescimento_pct), ' × ', variacao(m.nacional_crescimento_pct)),
    el('td', { class: 'num' }, fmt.contagem(m.fabricantes_80), el('span', { class: 'pd-de' }, ` de ${fmt.contagem(m.fabricantes_nacionais)}`)),
    el('td', { class: 'num' }, fmt.pct(m.maior_fabricante_pct, 0))))));
  ui.marcas.querySelector('.pd-marcas__tabela').replaceChildren(tabela);
}

// --------------------------------------------------------------------------- rede de cestas

function desenharRede() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const ligacoes = dados.pares.filter((p) => p.subconjunto === sub);
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
  subtitulo(ui.rede.painel).textContent = `As ${pr.rede_subcategorias} maiores subcategorias (${fmt.pct(pr.cobertura_faturamento_pct, 0)} do faturamento), agrupadas por departamento; `
    + `perto = vão juntas na cesta. Linhas: as ${pr.rede_ligacoes_por_no} de maior lift de cada uma (mais grossa = lift maior). `
    + (comSegmento ? `Com os segmentos selecionados, a cor da linha compara o lift deles com o de todos (vermelho = mais que a média, azul = menos). ` : '')
    + `Pares com menos de ${minimo} cestas ficam tracejados.`;
  const maxLift = Math.max(...ligacoes.map((p) => p.lift), 1);
  const corIndice = (i) => (i >= 1.15 ? COR.divergente[5] : i >= 1.05 ? COR.divergente[4] : i <= 0.87 ? COR.divergente[1] : i <= 0.95 ? COR.divergente[2] : COR.eixo);
  const titulo = 'Rede de cestas das maiores subcategorias';
  // Em tela estreita só os nomes dos departamentos: os das subcategorias brigavam com eles (ficam no tooltip e na tabela).
  const rotulados = new Set(ui.graficos.rede.getWidth() < 600 ? [] : nos.slice(0, NOMES_NA_REDE).map((n) => n.no));
  ui.graficos.rede.setOption({
    ...base(titulo, `${titulo}: ${nos.length} subcategorias em ${areas.length} departamentos, ${ligacoes.length} ligações de maior lift`
      + `${comSegmento ? `, para ${sub.split('+').join(', ')}` : ''}. As ligações estão na tabela.`),
    grid: { left: 4, right: 4, top: 4, bottom: 4 },
    xAxis: { type: 'value', min: -0.08, max: Math.max(...nos.map((n) => n.x)) + 0.08, show: false },
    yAxis: { type: 'value', min: -0.08, max: Math.max(...nos.map((n) => n.y)) + 0.14, show: false },
    tooltip: { trigger: 'item', formatter: (q) => {
      if (q.seriesId === 'nos') {
        const n = dados.no.get(q.data.no);
        return `${n.subcategoria}<br>${n.departamento} · ${fmt.usdGrande(n.faturamento)}<br>Clique para filtrar o departamento`;
      }
      if (q.seriesId === 'ligacoes') {
        const p = q.data.par;
        const a = dados.no.get(p.no_a);
        const b = dados.no.get(p.no_b);
        return `${a.subcategoria} + ${b.subcategoria}<br>lift ${fmt.decimal(p.lift, 2)} · ${fmt.contagem(p.cestas_par)} cestas com os dois`
          + `${comSegmento ? `<br>${fmt.decimal(p.indice, 2)} × o lift de todos os clientes` : ''}${p.amostra_pequena ? `<br>⚠ amostra pequena (menos de ${minimo} cestas)` : ''}`;
      }
      if (q.seriesId === 'nomes-deptos') return `${q.data.departamento}: ${q.data.n} subcategorias na rede<br>Clique para filtrar`;
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
      { id: 'ligacoes', type: 'lines', coordinateSystem: 'cartesian2d', z: 2,
        data: ligacoes.map((p) => {
          const a = dados.no.get(p.no_a);
          const b = dados.no.get(p.no_b);
          const apagada = foraDoFiltro(a.departamento) && foraDoFiltro(b.departamento);
          return { par: p, coords: [[a.x, a.y], [b.x, b.y]],
                   lineStyle: { width: 0.6 + 2.4 * (p.lift / maxLift), type: p.amostra_pequena ? 'dashed' : 'solid',
                                // Amostra pequena fica cinza: com menos de 200 cestas o índice oscila demais para pintar.
                                color: comSegmento && !p.amostra_pequena ? corIndice(p.indice) : COR.eixo, opacity: apagada ? 0.1 : p.amostra_pequena ? 0.3 : 0.55 } };
        }) },
      { id: 'nos', type: 'scatter', z: 3, cursor: 'pointer', labelLayout: { hideOverlap: true },
        data: nos.map((n) => ({ no: n.no, value: [n.x, n.y], symbolSize: tamanho(n),
                                itemStyle: { color: COR.serie, opacity: foraDoFiltro(n.departamento) ? OPACIDADE_FORA : 0.95, borderColor: COR.superficie, borderWidth: 1 },
                                label: { show: rotulados.has(n.no), position: 'right', distance: 3, color: COR.textoSecundario, fontSize: 10,
                                         formatter: () => n.subcategoria.slice(0, 18) } })) },
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

// --------------------------------------------------------------------------- pares característicos

function desenharPares() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const lista = ui.pares.querySelector('.pd-pares__lista');
  const nome = (p) => `${dados.no.get(p.no_a).subcategoria} + ${dados.no.get(p.no_b).subcategoria}`;
  const n = dados.manifest.parametros_rede.rede_caracteristicos;
  if (sub === 'todos') {
    // Sem segmento: os pares de maior lift com todos os clientes (das ligações desenhadas).
    const top = dados.pares.filter((p) => p.subconjunto === 'todos' && !p.amostra_pequena).sort((x, y) => y.lift - x.lift).slice(0, n);
    subtitulo(ui.pares).textContent = `Os ${n} pares de maior lift com todos os clientes. Ligue segmentos no filtro para ver os pares que eles compram juntos bem mais que a média.`;
    lista.replaceChildren(...top.map((p) => el('li', {}, el('div', { class: 'pares__item', title: nome(p) },
      el('span', { class: 'pares__nome' }, nome(p)), el('span', { class: 'pares__lift' }, `lift ${fmt.decimal(p.lift, 2)}`)))));
    return;
  }
  const itens = dados.caract.filter((c) => c.subconjunto === sub);
  subtitulo(ui.pares).textContent = `${sub.split('+').join(', ')}: os pares cujo lift mais supera o de todos os clientes (índice = lift deles ÷ lift de todos), `
    + `com ${dados.manifest.parametros_cesta.minimo_cestas_par}+ cestas.`;
  if (!itens.length) {
    lista.replaceChildren(el('li', {}, el('p', { class: 'aviso-amostra' }, '⚠ amostra pequena: nenhum par com cestas suficientes neste recorte.')));
    return;
  }
  lista.replaceChildren(...itens.map((c) => el('li', {}, el('div', { class: 'pares__item pd-par',
    title: `${nome(c)}: lift ${fmt.decimal(c.lift, 2)} contra ${fmt.decimal(c.lift_todos, 2)} de todos os clientes; ${fmt.contagem(c.cestas_par)} cestas` },
  el('span', { class: 'pares__nome' }, nome(c)),
  el('span', { class: 'pares__lift' }, `${fmt.decimal(c.indice, 2)}×`),
  el('span', { class: 'pd-par__detalhe' }, `lift ${fmt.decimal(c.lift, 2)} · todos ${fmt.decimal(c.lift_todos, 2)}`)))));
}
