// Aba Lojas (spec 5.4): mapa de clientela (regiões inferidas pela clientela em comum; NÃO é geografia), mapa de calor
// região × semana, ranking de crescimento like-for-like e a ficha da loja (KPIs, árvore de vendas, mix).
// Janela de 26 semanas; os filtros de segmento e departamento não se aplicam (app.js os desabilita nesta aba).
import { COR, SEG_CORES, SEGMENTOS, base, criarGrafico } from '../charts/tema.js';
import { avisoAmostra, el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';

const OPACIDADE_FORA = 0.35;
const CRESCIMENTO_LIMITE = 0.2;   // a escala de cor do crescimento satura em ±20%
const BOLHA_MIN = 6;
const BOLHA_MAX = 34;
const PEQUENAS = 'Lojas pequenas';

let dados;
let ui;
const sel = { loja: null, regiao: null };

export async function iniciar(container) {
  const mapa = painelGrafico({ titulo: 'Mapa de clientela', subtitulo: '', classe: 'lj-mapa' });
  const ficha = el('section', { class: 'painel lj-ficha', 'aria-labelledby': 'lj-ficha-titulo', 'aria-live': 'polite' });
  const calor = painelGrafico({ titulo: 'Faturamento semanal por região, últimas 52 semanas', subtitulo: '', classe: 'lj-calor' });
  const ranking = el('section', { class: 'painel lj-ranking', 'aria-labelledby': 'lj-ranking-titulo' },
    el('h2', { class: 'painel__titulo', id: 'lj-ranking-titulo' }, 'Ranking: crescimento nas lojas comparáveis'),
    el('p', { class: 'painel__subtitulo lj-ranking__nota' }, ''),
    el('ol', { class: 'lista-itens lj-ranking__lista' }));
  container.classList.add('lj');
  container.replaceChildren(mapa.painel, ficha, calor.painel, ranking);
  ui = { mapa, ficha, calor, ranking, graficos: { mapa: criarGrafico(mapa.grafico), calor: criarGrafico(calor.grafico), mix: null } };
  for (const nome of ['mapa', 'calor']) ui[nome].aoAlternar((tabela) => { if (!tabela) ui.graficos[nome].resize(); });

  try {
    const [lojas, pares, regioes, semana, fichas, manifest] = await Promise.all([
      linhas('lojas.json'), linhas('lojas_pares.json'), linhas('regioes.json'), linhas('regioes_semana.json'),
      linhas('lojas_ficha.json'), carregar('manifest.json')]);
    dados = { lojas, porId: new Map(lojas.map((l) => [l.id, l])), pares, regioes, semana, manifest,
              fichas: new Map(fichas.map((f) => [f.id, f])) };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  sel.loja = dados.lojas[0].id;   // a maior loja (o arquivo vem em ordem de faturamento)

  ui.graficos.mapa.on('click', (p) => {
    if (p.seriesId === 'regioes' || p.seriesId === 'nomes') selecionarRegiao(p.data.regiao);
    else if (p.seriesId === 'lojas' || p.seriesId === 'sem-comparacao') selecionarLoja(p.data.id);
  });
  ui.graficos.calor.on('click', (p) => selecionarRegiao(ui.regioesCalor[p.value[1]]));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sel.regiao && !container.hidden) selecionarRegiao(null);
  });
}

export function atualizar() {
  if (!dados) return;
  Object.values(ui.graficos).forEach((g) => g?.resize());
  desenharMapa();
  desenharCalor();
  desenharRanking();
  desenharFicha();
}

function selecionarLoja(id) {
  sel.loja = id;
  desenharMapa();
  desenharRanking();
  desenharFicha();
}

function selecionarRegiao(regiao) {
  sel.regiao = sel.regiao === regiao ? null : regiao;
  desenharMapa();
  desenharCalor();
  desenharRanking();
}

const nomeRegiao = (r) => (r === PEQUENAS ? 'lojas pequenas' : r);
const foraDaRegiao = (l) => sel.regiao !== null && l.regiao !== sel.regiao;

// --------------------------------------------------------------------------- mapa de clientela

/** Fecho convexo (cadeia monótona) dos pontos [x, y]. Só geometria do desenho: as regiões vêm prontas do export. */
function fecho(pontos) {
  const p = [...pontos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const meia = (lista) => {
    const h = [];
    for (const q of lista) {
      while (h.length >= 2 && cruz(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...meia(p), ...meia([...p].reverse())];
}

/** Contorno da região: o fecho afastado do centro, para as bolhas da borda ficarem dentro. */
function contorno(pontos, folga = 0.045) {
  const cx = pontos.reduce((a, q) => a + q[0], 0) / pontos.length;
  const cy = pontos.reduce((a, q) => a + q[1], 0) / pontos.length;
  return fecho(pontos).map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * folga, y + (dy / d) * folga];
  });
}

function desenharMapa() {
  const comPosicao = dados.lojas.filter((l) => l.x !== null);
  const maior = Math.max(...comPosicao.map((l) => l.faturamento));
  const tamanho = (l) => Math.max(BOLHA_MIN, BOLHA_MAX * Math.sqrt(l.faturamento / maior));
  const porId = dados.porId;
  const regioes = dados.regioes.filter((r) => r.regiao !== PEQUENAS).map((r) => {
    const pontos = comPosicao.filter((l) => l.regiao === r.regiao).map((l) => [l.x, l.y]);
    const topo = contorno(pontos).reduce((a, q) => (q[1] > a[1] ? q : a));
    return { ...r, poligono: contorno(pontos), topo };
  });
  const p = dados.manifest.parametros_regioes;
  subtitulo(ui.mapa.painel).replaceChildren(
    el('strong', { class: 'lj-aviso' }, 'Não é geografia: '),
    `a base não tem a localização das lojas. Perto = clientes em comum. ${p.k} regiões inferidas pela clientela `
    + `(${fmt.pct(p.concentracao_dentro, 0)} dela fica dentro das regiões, contra ${fmt.pct(p.concentracao_ao_acaso, 0)} ao acaso). `
    + 'Bolha = faturamento (26 semanas); cor = crescimento nas lojas comparáveis.');
  const ponto = (l) => ({
    id: l.id, name: `Loja ${l.id}`, value: [l.x, l.y, l.faturamento_variacao_pct],
    symbolSize: tamanho(l),
    itemStyle: {
      opacity: foraDaRegiao(l) ? OPACIDADE_FORA : l.amostra_pequena ? 0.55 : 0.95,
      borderColor: l.id === sel.loja ? COR.textoPrimario : COR.superficie, borderWidth: l.id === sel.loja ? 3 : 1,
    },
  });
  const comparaveis = comPosicao.filter((l) => l.faturamento_variacao_pct !== null);
  const semComparacao = comPosicao.filter((l) => l.faturamento_variacao_pct === null);
  const titulo = 'Mapa de clientela: lojas perto quando dividem clientes (não é geografia)';
  ui.graficos.mapa.setOption({
    ...base(titulo, `${titulo}. ${regioes.length} regiões: `
      + regioes.map((r) => `${r.regiao}, ${r.lojas} lojas, ${fmt.pct(r.participacao_pct)} do faturamento, ${fmt.variacao(r.faturamento_variacao_pct)} contra o ano anterior`).join('; ')
      + '. A lista completa está na tabela.'),
    grid: { left: 4, right: 4, top: 4, bottom: 36 },
    // Os eixos acompanham os dados (as posições vão de 0 a 1 no eixo mais longo), com margem para os contornos e os nomes.
    xAxis: { type: 'value', min: -0.08, max: Math.max(...comPosicao.map((q) => q.x)) + 0.08, show: false },
    yAxis: { type: 'value', min: -0.08, max: Math.max(...comPosicao.map((q) => q.y)) + 0.14, show: false },
    tooltip: { trigger: 'item', formatter: (q) => {
      if (q.seriesId === 'regioes' || q.seriesId === 'nomes') {
        const r = regioes.find((x) => x.regiao === q.data.regiao);
        return `${r.regiao}<br>${r.lojas} lojas · ${fmt.pct(r.participacao_pct)} do faturamento<br>`
          + `${fmt.variacao(r.faturamento_variacao_pct)} contra o ano anterior (${r.lojas_comparaveis} comparáveis)<br>`
          + `Âncora: loja ${r.ancora}<br>Clique para destacar a região`;
      }
      if (q.seriesId === 'ligacoes') return null;
      const l = porId.get(q.data.id);
      const variacao = l.faturamento_variacao_pct === null ? 'sem comparação com o ano anterior' : `${fmt.variacao(l.faturamento_variacao_pct)} contra o ano anterior`;
      return `Loja ${l.id} · ${l.regiao}<br>${fmt.usd(l.faturamento)} em 26 semanas<br>${variacao}`
        + `${l.amostra_pequena ? '<br>⚠ amostra pequena' : ''}<br>Clique para abrir a ficha`;
    } },
    visualMap: {
      type: 'continuous', seriesIndex: 3, dimension: 2, min: -CRESCIMENTO_LIMITE, max: CRESCIMENTO_LIMITE,
      inRange: { color: COR.divergente }, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 160, itemWidth: 10,
      calculable: false, text: ['▲ alta', '▼ queda'], textStyle: { color: COR.textoMudo, fontSize: 11 },
      formatter: (v) => fmt.pct(v, 0),
    },
    series: [
      {
        id: 'regioes', type: 'custom', coordinateSystem: 'cartesian2d', z: 1,
        data: regioes.map((r) => ({ value: [r.topo[0], r.topo[1]], regiao: r.regiao, ...r })),
        renderItem: (params, api) => {
          const r = regioes[params.dataIndex];
          const apagada = sel.regiao !== null && sel.regiao !== r.regiao;
          const marcada = sel.regiao === r.regiao;
          return { type: 'polygon', shape: { points: r.poligono.map((q) => api.coord(q)) },
                   style: { fill: COR.sombreado, opacity: apagada ? 0.25 : 0.7, stroke: marcada ? COR.textoSecundario : COR.eixo, lineWidth: marcada ? 2 : 1 } };
        },
      },
      {
        // Os nomes das regiões numa camada acima das bolhas, para nenhuma loja os cobrir. Clicar no nome destaca a região.
        id: 'nomes', type: 'custom', coordinateSystem: 'cartesian2d', z: 5, cursor: 'pointer',
        data: regioes.map((r) => ({ value: [r.topo[0], r.topo[1]], regiao: r.regiao })),
        renderItem: (params, api) => {
          const r = regioes[params.dataIndex];
          const [tx, ty] = api.coord(r.topo);
          return { type: 'text', x: tx, y: ty - 4,
                   style: { text: `${r.regiao} ${fmt.variacao(r.faturamento_variacao_pct)}`, fill: COR.textoPrimario,
                            opacity: sel.regiao !== null && sel.regiao !== r.regiao ? 0.5 : 1, font: '600 12px system-ui',
                            align: 'center', verticalAlign: 'bottom', stroke: COR.superficie, lineWidth: 3 } };
        },
      },
      {
        id: 'ligacoes', type: 'lines', coordinateSystem: 'cartesian2d', silent: true, z: 2,
        data: dados.pares.map((par) => {
          const a = porId.get(par.loja_a);
          const b = porId.get(par.loja_b);
          return { coords: [[a.x, a.y], [b.x, b.y]], lineStyle: { opacity: foraDaRegiao(a) || foraDaRegiao(b) ? 0.15 : 0.45 } };
        }),
        lineStyle: { color: COR.eixo, width: 1 },
      },
      { id: 'lojas', type: 'scatter', z: 3, cursor: 'pointer', data: comparaveis.map(ponto) },
      { id: 'sem-comparacao', type: 'scatter', z: 3, cursor: 'pointer',
        data: semComparacao.map((l) => ({ ...ponto(l), itemStyle: { ...ponto(l).itemStyle, color: COR.outros } })) },
    ],
  }, { notMerge: true });
  preencherTabela(ui.mapa.tabela, [
    { titulo: 'Região', valor: (r) => r.regiao },
    { titulo: 'Lojas', valor: (r) => fmt.contagem(r.lojas), numero: true },
    { titulo: 'Âncora', valor: (r) => (r.ancora === null ? '—' : `loja ${r.ancora}`), numero: true },
    { titulo: 'Faturamento', valor: (r) => fmt.usdGrande(r.faturamento), numero: true },
    { titulo: '% do total', valor: (r) => fmt.pct(r.participacao_pct), numero: true },
    { titulo: 'vs ano anterior', valor: (r) => fmt.variacao(r.faturamento_variacao_pct), numero: true },
  ], dados.regioes, 'Regiões inferidas pela clientela em comum');
}

/** Subtítulo de um painel de gráfico, criado se ainda não existir. */
function subtitulo(painel) {
  return painel.querySelector('.painel__subtitulo')
    ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
}

// --------------------------------------------------------------------------- mapa de calor região × semana

function desenharCalor() {
  const semanas = [...new Set(dados.semana.map((s) => s.semana_inicio))].sort();
  ui.regioesCalor = dados.regioes.map((r) => r.regiao);
  const linhaDe = new Map(dados.regioes.map((r) => [r.regiao, r]));
  const celulas = dados.semana.map((s) => ({ ...s, i: semanas.indexOf(s.semana_inicio), j: ui.regioesCalor.indexOf(s.regiao) }));
  const desvio = Math.min(40, Math.max(10, ...celulas.map((c) => Math.abs(c.indice - 100))));
  subtitulo(ui.calor.painel).textContent =
    'Índice da semana contra a semana típica da própria região (100 = média das 52 semanas). Todas as lojas. Clique numa região para destacá-la.';
  const titulo = 'Faturamento semanal por região, índice contra a média da região';
  ui.graficos.calor.setOption({
    ...base(titulo, `${titulo}, ${ui.regioesCalor.length} linhas e 52 semanas. Os valores estão na tabela.`),
    grid: { left: 8, right: 8, top: 4, bottom: 40, containLabel: true },
    tooltip: { trigger: 'item', formatter: (q) => {
      const c = celulas[q.dataIndex];
      return `${c.regiao}, semana de ${fmt.data(c.semana_inicio)}<br>${fmt.usd(c.faturamento)}<br>Índice ${fmt.decimal(c.indice, 0)} (100 = semana típica)`;
    } },
    xAxis: { type: 'category', data: semanas.map((d) => fmt.dataCurta(d)), splitArea: { show: false },
             axisLabel: { color: COR.textoMudo, fontSize: 11, interval: 12 } },
    yAxis: { type: 'category', data: ui.regioesCalor, inverse: true,
             axisLabel: { fontSize: 11, color: COR.textoSecundario,
                          formatter: (r) => (r === PEQUENAS ? 'Lojas pequenas' : `${r} · ${linhaDe.get(r).lojas} lojas`) } },
    visualMap: {
      type: 'continuous', min: 100 - desvio, max: 100 + desvio, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemHeight: 160, itemWidth: 10, inRange: { color: COR.divergente }, text: ['acima da média', 'abaixo'],
      textStyle: { color: COR.textoMudo, fontSize: 11 }, formatter: (v) => fmt.decimal(v, 0),
    },
    series: [{
      type: 'heatmap', name: 'Índice semanal', cursor: 'pointer',
      data: celulas.map((c) => ({ value: [c.i, c.j, Math.max(100 - desvio, Math.min(100 + desvio, c.indice))],
                                  itemStyle: { opacity: sel.regiao !== null && c.regiao !== sel.regiao ? OPACIDADE_FORA : 1 } })),
      itemStyle: { borderColor: COR.superficie, borderWidth: 1 },
    }],
  }, { notMerge: true });
  preencherTabela(ui.calor.tabela, [
    { titulo: 'Região', valor: (c) => c.regiao },
    { titulo: 'Semana de', valor: (c) => fmt.data(c.semana_inicio) },
    { titulo: 'Faturamento', valor: (c) => fmt.usd(c.faturamento), numero: true },
    { titulo: 'Índice', valor: (c) => fmt.decimal(c.indice, 0), numero: true },
  ], celulas, titulo);
}

// --------------------------------------------------------------------------- ranking

function desenharRanking() {
  // Regra do RAG para ranking de loja: nunca com amostra pequena.
  const elegiveis = dados.lojas.filter((l) => l.comparavel && !l.amostra_pequena);
  const lista = elegiveis.filter((l) => !foraDaRegiao(l)).sort((a, b) => b.faturamento_variacao_pct - a.faturamento_variacao_pct || a.id - b.id);
  const fora = dados.lojas.filter((l) => l.comparavel && l.amostra_pequena).length;
  ui.ranking.querySelector('.lj-ranking__nota').textContent =
    `${fmt.contagem(lista.length)} lojas${sel.regiao ? ` da ${nomeRegiao(sel.regiao)}` : ''}, do maior crescimento para o menor. `
    + `${fmt.contagem(fora)} comparáveis ficam fora por amostra pequena (menos de 100 cestas em algum dos dois períodos). Clique para abrir a ficha.`;
  ui.ranking.querySelector('.lj-ranking__lista').replaceChildren(...lista.map((l, i) => el('li', {},
    el('button', { class: 'item-lista lj-item', type: 'button', 'aria-current': l.id === sel.loja ? 'true' : null,
                   onclick: () => selecionarLoja(l.id) },
      el('span', { class: 'lj-item__pos' }, `${i + 1}.`),
      el('span', { class: 'item-lista__nome' }, `Loja ${l.id}`, el('span', { class: 'item-lista__marca' }, ` · ${l.regiao}`)),
      el('span', { class: 'item-lista__valor' }, `${fmt.usdGrande(l.faturamento)} · ${fmt.contagem(l.cestas)} cestas `,
        el('span', { class: `variacao variacao--${l.faturamento_variacao_pct >= 0 ? 'bom' : 'critico'}` }, fmt.variacao(l.faturamento_variacao_pct)))))));
}

// --------------------------------------------------------------------------- ficha da loja

const FATORES = [
  { chave: 'clientes', rotulo: 'Clientes', formato: fmt.contagem },
  { chave: 'idas_por_cliente', rotulo: 'Idas por cliente', formato: (v) => fmt.decimal(v, 1) },
  { chave: 'ticket_medio', rotulo: 'Ticket médio', formato: fmt.usd },
];

function variacao(v) {
  if (v === null || v === undefined) return el('span', { class: 'kpi__nota' }, 'sem comparação');
  return el('span', { class: `variacao variacao--${v >= 0 ? 'bom' : 'critico'}` }, fmt.variacao(v));
}

function desenharFicha() {
  const l = dados.porId.get(sel.loja);
  const f = dados.fichas.get(sel.loja);
  const a = f?.arvore;
  const kpi = (rotulo, valor, v) => el('div', { class: 'lj-kpi' }, el('dt', {}, rotulo), el('dd', {}, valor), v === undefined ? null : el('dd', { class: 'lj-kpi__var' }, variacao(v)));
  const arvore = a
    ? el('div', { class: 'lj-arvore', role: 'group', 'aria-label': 'Árvore de vendas: faturamento = clientes × idas por cliente × ticket médio' },
      el('div', { class: 'lj-arvore__no lj-arvore__no--total' }, el('span', { class: 'lj-arvore__rotulo' }, 'Faturamento'),
        el('strong', {}, fmt.usdGrande(a.faturamento.atual)), variacao(a.faturamento.variacao_pct)),
      el('span', { class: 'lj-arvore__op', 'aria-hidden': 'true' }, '='),
      ...FATORES.flatMap((x, i) => [
        i ? el('span', { class: 'lj-arvore__op', 'aria-hidden': 'true' }, '×') : null,
        el('div', { class: 'lj-arvore__no' }, el('span', { class: 'lj-arvore__rotulo' }, x.rotulo),
          el('strong', {}, x.formato(a[x.chave].atual)), variacao(a[x.chave].variacao_pct),
          el('span', { class: 'kpi__nota' }, `antes ${x.formato(a[x.chave].base)}`)),
      ]).filter(Boolean))
    : el('p', { class: 'painel__vazio' }, 'Sem árvore de vendas: a loja não é comparável (não vendeu nas mesmas semanas do ano anterior).');
  const mix = el('div', { class: 'lj-mix__grafico' });
  const deps = el('div', { class: 'lj-deps' });
  ui.ficha.replaceChildren(
    el('header', { class: 'lj-ficha__cabecalho' },
      el('h2', { class: 'ct-cabecalho__titulo', id: 'lj-ficha-titulo' }, `Loja ${l.id}`),
      el('span', { class: 'ct-cabecalho__nota' }, `${l.regiao} · 26 semanas${l.comparavel ? ' · comparável' : ''}`),
      l.amostra_pequena ? avisoAmostra(`${fmt.contagem(l.cestas)} cestas`) : null),
    el('dl', { class: 'lj-kpis' },
      kpi('Faturamento', fmt.usdGrande(l.faturamento), l.faturamento_variacao_pct),
      kpi('Cestas', fmt.contagem(l.cestas), l.cestas_variacao_pct),
      kpi('Clientes', fmt.contagem(l.clientes), l.clientes_variacao_pct),
      kpi('Ticket médio', fmt.usd(l.ticket_medio), l.ticket_variacao_pct),
      kpi('Itens por cesta', fmt.decimal(l.itens_por_cesta, 1)),
      kpi('% de desconto', fmt.pct(l.desconto_pct))),
    el('p', { class: 'ct-rotulo' }, 'Árvore de vendas: por que o faturamento mudou'),
    arvore,
    el('div', { class: 'lj-mix' },
      el('div', {}, el('p', { class: 'ct-rotulo' }, 'Quem compra: loja × rede'), mix),
      el('div', {}, el('p', { class: 'ct-rotulo' }, 'Top 5 departamentos: loja × rede'), deps)));
  if (!f?.segmentos) return;
  if (!ui.graficos.mix || ui.graficos.mix.getDom() !== mix) {
    ui.graficos.mix?.dispose();
    ui.graficos.mix = criarGrafico(mix);
  }
  ui.graficos.mix.setOption({
    ...base(`Quem compra na loja ${l.id} e na rede`, `Faturamento por segmento: `
      + f.segmentos.map((x) => `${x.segmento} ${fmt.pct(x.pct, 0)} na loja e ${fmt.pct(x.rede_pct, 0)} na rede`).join('; ') + '.'),
    grid: { left: 4, right: 8, top: 4, bottom: 24, containLabel: true },
    legend: { bottom: 0, left: 0, itemGap: 10, data: SEGMENTOS, selectedMode: false, textStyle: { fontSize: 11 } },
    tooltip: { trigger: 'item', formatter: (q) => {
      const x = f.segmentos.find((s) => s.segmento === q.seriesName);
      return `${x.segmento}<br>Loja: ${fmt.pct(x.pct)} · Rede: ${fmt.pct(x.rede_pct)}<br>Índice ${fmt.decimal(x.indice, 0)} (100 = igual à rede)`;
    } },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: { type: 'category', data: ['Loja', 'Rede'], inverse: true, axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false } },
    series: f.segmentos.map((x, i) => ({
      name: x.segmento, type: 'bar', stack: 'mix', barWidth: 14, data: [x.pct, x.rede_pct],
      itemStyle: { color: SEG_CORES[x.segmento], borderColor: COR.superficie, borderWidth: 1,
                   borderRadius: i === 0 ? [4, 0, 0, 4] : i === f.segmentos.length - 1 ? [0, 4, 4, 0] : 0 },
      label: { show: true, position: 'inside', fontSize: 11, color: COR.textoPrimario, formatter: (q) => (q.value >= 0.1 ? fmt.pct(q.value, 0) : '') },
    })),
  }, { notMerge: true });
  ui.graficos.mix.resize();
  preencherTabela(deps, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: 'Loja', valor: (d) => fmt.pct(d.pct), numero: true },
    { titulo: 'Rede', valor: (d) => fmt.pct(d.rede_pct), numero: true },
    { titulo: 'Índice', valor: (d) => `${d.indice > 100.5 ? '▲ ' : d.indice < 99.5 ? '▼ ' : ''}${fmt.decimal(d.indice, 0)}`, numero: true },
  ], f.departamentos, `Top 5 departamentos da loja ${l.id} contra a rede`);
}
