// Aba Visão Geral (spec 5.1): 6 KPIs, faturamento semanal (52 semanas), mapa de calor dia × hora, departamentos e
// 3 insights. Métricas que somam vêm dos cubos (somadas aqui); as que não somam, prontas de kpis_filtrados.json.
import { chaveSubconjunto, departamentosPeriodo, serieSemanal, somarCalor, somarPeriodo } from '../agregados.js';
import { COR, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';

const KPIS = [
  { metrica: 'faturamento', rotulo: 'Faturamento', formato: fmt.usdGrande, titulo: (v) => fmt.usd(v), soma: true },
  { metrica: 'cestas', rotulo: 'Cestas', formato: fmt.contagem },
  { metrica: 'ticket_medio', rotulo: 'Ticket médio', formato: fmt.usd },
  { metrica: 'itens_por_cesta', rotulo: 'Itens por cesta', formato: (v) => fmt.decimal(v, 1) },
  // Mais desconto não é bom nem ruim por si: a seta fica, a cor de status não.
  { metrica: 'desconto_pct', rotulo: '% de desconto', formato: (v) => fmt.pct(v), neutro: true, soma: true },
  { metrica: 'clientes_ativos', rotulo: 'Clientes ativos', formato: fmt.contagem,
    dica: 'Comprou nas últimas 8 semanas do período (definição do chat). 4, 13 e 26 semanas terminam na mesma semana, por isso o número se repete.' },
];

const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };
const ABA_DESTINO = { visao_geral: 'painel-visao-geral', categoria: 'painel-categoria', segmentos: 'painel-segmentos' };
const SEM_FILTRO = { segmentos: new Set(), departamentos: new Set() };

let dados;
let blocos;

export async function iniciar(container) {
  const kpis = el('div', { class: 'kpis', role: 'list', 'aria-label': 'Indicadores do período' });
  const semanal = painelGrafico({ titulo: 'Faturamento semanal, últimas 52 semanas', subtitulo: '', classe: 'vg-semanal' });
  const calor = painelGrafico({
    titulo: 'Faturamento por dia e hora',
    subtitulo: 'Base inteira, todas as lojas. A base não tem calendário real: os dias formam um ciclo, sem nome.',
    classe: 'vg-calor',
  });
  const deptos = painelGrafico({ titulo: 'Faturamento por departamento', subtitulo: '', classe: 'vg-deptos' });
  const insights = el('section', { class: 'painel vg-insights', 'aria-labelledby': 'vg-insights-titulo' },
    el('h2', { class: 'painel__titulo', id: 'vg-insights-titulo' }, 'O que as análises mostram'),
    el('div', { class: 'insights' }));
  container.classList.add('vg');
  container.replaceChildren(kpis, semanal.painel, insights, calor.painel, deptos.painel);

  blocos = { kpis, semanal, calor, deptos, insights,
             graficos: { semanal: criarGrafico(semanal.grafico), calor: criarGrafico(calor.grafico), deptos: criarGrafico(deptos.grafico) } };
  for (const nome of ['semanal', 'calor', 'deptos']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }

  try {
    const [kf, cp, cf, c, i, m] = await Promise.all([linhas('kpis_filtrados.json'), linhas('cubo_periodo.json'),
      linhas('cubo_faturamento.json'), linhas('calor_dia_hora.json'), linhas('insights.json'), carregar('manifest.json')]);
    dados = { kpisFiltrados: kf, cuboPeriodo: cp, cuboSemanal: cf, calor: c, insights: i, manifest: m };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  desenharInsights();
}

export function atualizar(estado) {
  if (!dados) return;
  const filtros = estado.filtros ?? SEM_FILTRO;
  desenharKpis(estado.periodo, filtros);
  desenharSemanal(estado.periodo, filtros);
  desenharDeptos(estado.periodo, filtros);
  desenharCalor(filtros);
}

// --------------------------------------------------------------------------- KPIs

/** Os 6 KPIs do período e do filtro, no formato do card: valor, comparável, ano anterior, variação, lojas, amostra. */
function kpisDoFiltro(periodo, filtros) {
  const deps = [...filtros.departamentos];
  const departamento = deps.length === 0 ? 'todos' : deps.length === 1 ? deps[0] : null;
  const subconjunto = chaveSubconjunto(filtros.segmentos);
  const k = departamento && dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === subconjunto && l.departamento === departamento);
  const s = somarPeriodo(dados.cuboPeriodo, periodo, filtros);
  const razao = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
  const variacao = (a, b) => (a === null || b === null || b === 0 ? null : a / b - 1);
  const lojas = dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
  const saida = {
    faturamento: { valor: s.faturamento, valor_comparavel: s.faturamento_comparavel, valor_ano_anterior: s.faturamento_ano_anterior,
                   variacao_pct: variacao(s.faturamento_comparavel, s.faturamento_ano_anterior), lojas_comparaveis: lojas },
    desconto_pct: { valor: razao(s.desconto, s.valor_bruto), valor_comparavel: razao(s.desconto_comparavel, s.valor_bruto_comparavel),
                    valor_ano_anterior: razao(s.desconto_ano_anterior, s.valor_bruto_ano_anterior), lojas_comparaveis: lojas },
  };
  saida.desconto_pct.variacao_pct = variacao(saida.desconto_pct.valor_comparavel, saida.desconto_pct.valor_ano_anterior);
  for (const m of ['cestas', 'ticket_medio', 'itens_por_cesta', 'clientes_ativos']) {
    if (!departamento) { saida[m] = { indisponivel: true }; continue; }
    saida[m] = k
      ? { valor: k[m], valor_comparavel: k[`${m}_comparavel`], valor_ano_anterior: k[`${m}_ano_anterior`], variacao_pct: k[`${m}_variacao_pct`],
          lojas_comparaveis: m === 'clientes_ativos' ? null : k.lojas_comparaveis, amostra_pequena: k.amostra_pequena }
      : { valor: null, valor_comparavel: null, valor_ano_anterior: null, variacao_pct: null, lojas_comparaveis: null, semDados: true };
  }
  return saida;
}

function desenharKpis(periodo, filtros) {
  const valores = kpisDoFiltro(periodo, filtros);
  const cards = KPIS.map((cfg) => {
    const k = valores[cfg.metrica];
    if (k.indisponivel) {
      return el('article', { class: 'kpi', role: 'listitem' },
        el('h3', { class: 'kpi__rotulo' }, cfg.rotulo),
        el('p', { class: 'kpi__valor' }, '—'),
        el('p', { class: 'kpi__nota' }, 'selecione um departamento para ver este indicador'));
    }
    let variacao;
    if (k.variacao_pct === null || k.variacao_pct === undefined) {
      variacao = el('p', { class: 'kpi__nota' }, periodo === 'base' ? 'sem ano anterior na base' : 'sem comparação');
    } else {
      const tom = cfg.neutro ? 'neutro' : k.variacao_pct >= 0 ? 'bom' : 'critico';
      const lojas = k.lojas_comparaveis === null ? 'sem filtro de loja' : `${fmt.contagem(k.lojas_comparaveis)} lojas comparáveis`;
      variacao = el('p', { class: 'kpi__variacao' },
        el('span', { class: `variacao variacao--${tom}` }, fmt.variacao(k.variacao_pct)),
        ' vs ano anterior',
        el('span', { class: 'kpi__nota' }, lojas));
    }
    return el('article', { class: 'kpi', role: 'listitem', title: cfg.dica || null },
      el('h3', { class: 'kpi__rotulo' }, cfg.rotulo, cfg.dica ? el('span', { class: 'kpi__dica', 'aria-label': cfg.dica }, ' ⓘ') : null),
      el('p', { class: 'kpi__valor', title: cfg.titulo && k.valor !== null ? cfg.titulo(k.valor) : null }, cfg.formato(k.valor)),
      variacao,
      k.amostra_pequena ? el('p', { class: 'aviso-amostra' }, '⚠ amostra pequena') : null);
  });
  blocos.kpis.replaceChildren(...cards);
}

// --------------------------------------------------------------------------- faturamento semanal

function desenharSemanal(periodo, filtros) {
  const semanas = serieSemanal(dados.cuboSemanal, filtros);
  const janela = dados.manifest.janelas[periodo];
  const inicio = semanas.find((s) => s.semana_inicio >= janela.data_ini) ?? semanas[0];
  const lojas = dados.kpisFiltrados.find((l) => l.periodo === '26s' && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
  const titulo = 'Faturamento semanal, últimas 52 semanas';
  const nota = periodo === 'base'
    ? 'A base inteira tem mais que 52 semanas: o sombreado cobre todo o gráfico.'
    : `Sombreado: ${NOMES_PERIODO[periodo]}.`;
  blocos.semanal.painel.querySelector('.painel__subtitulo')?.remove();
  blocos.semanal.painel.querySelector('.painel__titulo').after(
    el('p', { class: 'painel__subtitulo' }, `${fmt.contagem(lojas)} lojas comparáveis (as do chat). ${nota} `
      + 'Em cinza tracejado, a mesma semana um ano antes, só nas últimas 26 semanas: antes disso o ano anterior cai no início da base, quando os clientes ainda estavam entrando.'));
  const ultima = semanas.at(-1);
  const rotulos = semanas.map((s) => fmt.dataCurta(s.semana_inicio));
  blocos.graficos.semanal.setOption({
    ...base(titulo, `${titulo}, nas ${lojas} lojas comparáveis. Linha do período atual e linha da mesma semana um ano antes; `
      + `o período selecionado (${NOMES_PERIODO[periodo]}) está sombreado. Na última semana, ${fmt.usd(ultima.faturamento)} `
      + `contra ${fmt.usd(ultima.faturamento_ano_anterior)} um ano antes. Os valores de cada semana estão na tabela.`),
    grid: { left: 8, right: 72, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, data: ['Período atual', 'Ano anterior'] },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      formatter: (itens) => {
        const atual = itens.find((x) => x.seriesName === 'Período atual')?.value;
        const anterior = itens.find((x) => x.seriesName === 'Ano anterior')?.value;
        const variacao = atual != null && anterior ? fmt.variacao(atual / anterior - 1) : '—';
        return `Semana de ${itens[0].axisValue}<br>Período atual: ${fmt.usd(atual)}<br>Ano anterior: ${fmt.usd(anterior)}<br>Variação: ${variacao}`;
      },
    },
    xAxis: { type: 'category', boundaryGap: false, data: rotulos,
             axisLabel: { color: COR.textoMudo, fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { color: COR.textoMudo, fontSize: 11, formatter: (v) => fmt.usdGrande(v) } },
    series: [
      { name: 'Ano anterior', type: 'line', data: semanas.map((s) => s.faturamento_ano_anterior),
        lineStyle: { color: COR.anoAnterior, type: 'dashed', width: 2 }, itemStyle: { color: COR.anoAnterior },
        symbol: 'none', connectNulls: false },
      { name: 'Período atual', type: 'line', data: semanas.map((s) => s.faturamento),
        lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie }, symbol: 'none',
        endLabel: { show: true, color: COR.textoSecundario, fontSize: 11, formatter: (p) => fmt.usdGrande(p.value) },
        markArea: { silent: true, itemStyle: { color: COR.sombreado },
                    data: [[{ xAxis: fmt.dataCurta(inicio.semana_inicio) }, { xAxis: rotulos.at(-1) }]] } },
    ],
  }, { notMerge: true });
  preencherTabela(blocos.semanal.tabela, [
    { titulo: 'Semana de', valor: (s) => fmt.data(s.semana_inicio) },
    { titulo: 'No período', valor: (s) => (s.semana_inicio >= inicio.semana_inicio ? 'sim' : '') },
    { titulo: 'Período atual', valor: (s) => fmt.usd(s.faturamento), numero: true },
    { titulo: 'Ano anterior', valor: (s) => fmt.usd(s.faturamento_ano_anterior), numero: true },
  ], semanas, titulo);
}

// --------------------------------------------------------------------------- mapa de calor

function desenharCalor(filtros) {
  const celulas = somarCalor([dados.calor], filtros.segmentos);
  const valores = celulas.map((c) => c.faturamento);
  const dias = [1, 2, 3, 4, 5, 6, 7].map((d) => `Dia ${d}`);
  blocos.graficos.calor.setOption({
    ...base('Faturamento por dia do ciclo semanal e hora, base inteira',
      'Mapa de calor do faturamento por dia do ciclo semanal (sem nome: a base não tem calendário real) e hora do dia.'),
    grid: { left: 8, right: 8, top: 8, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const c = celulas[p.dataIndex];
        const cestas = c.cestas === null ? '' : `<br>${fmt.contagem(c.cestas)} cestas`;
        return `Dia ${c.dia_semana}, ${String(c.hora).padStart(2, '0')}h<br>${fmt.usd(c.faturamento)}${cestas}`;
      },
    },
    xAxis: { type: 'category', data: [...Array(24).keys()].map((h) => `${h}h`), splitArea: { show: false },
             axisLabel: { color: COR.textoMudo, fontSize: 11, interval: 2 } },
    yAxis: { type: 'category', data: dias, inverse: true, axisLabel: { color: COR.textoMudo, fontSize: 11 } },
    visualMap: {
      type: 'continuous', min: 0, max: Math.max(...valores), calculable: false, orient: 'horizontal',
      left: 'center', bottom: 0, itemHeight: 160, itemWidth: 10, inRange: { color: COR.sequencial },
      text: ['mais', 'menos'], textStyle: { color: COR.textoMudo, fontSize: 11 }, formatter: (v) => fmt.usdGrande(v),
    },
    series: [{
      name: 'Faturamento', type: 'heatmap',
      data: celulas.map((c) => [c.hora, c.dia_semana - 1, c.faturamento]),
      itemStyle: { borderColor: COR.superficie, borderWidth: 2, borderRadius: 2 },
      emphasis: { itemStyle: { borderColor: COR.textoPrimario, borderWidth: 1 } },
    }],
  }, { notMerge: true });
  preencherTabela(blocos.calor.tabela, [
    { titulo: 'Dia', valor: (c) => `Dia ${c.dia_semana}` },
    { titulo: 'Hora', valor: (c) => `${String(c.hora).padStart(2, '0')}h` },
    { titulo: 'Faturamento', valor: (c) => fmt.usd(c.faturamento), numero: true },
    { titulo: 'Cestas', valor: (c) => fmt.contagem(c.cestas), numero: true },
  ], celulas, 'Faturamento por dia do ciclo e hora');
}

// --------------------------------------------------------------------------- departamentos

function desenharDeptos(periodo, filtros) {
  const todos = departamentosPeriodo(dados.cuboPeriodo, periodo, filtros);
  const total = todos.reduce((a, d) => a + d.faturamento, 0);
  const linhasPeriodo = todos.slice(0, 10);
  const resto = todos.slice(10).reduce((a, d) => a + d.faturamento, 0);
  if (resto > 0) linhasPeriodo.push({ departamento: 'Outros', faturamento: resto });
  linhasPeriodo.forEach((d) => { d.participacao_pct = d.faturamento / total; });
  const titulo = `Faturamento por departamento, ${NOMES_PERIODO[periodo]}`;
  blocos.deptos.painel.querySelector('.painel__subtitulo')?.remove();
  blocos.deptos.painel.querySelector('.painel__titulo').after(
    el('p', { class: 'painel__subtitulo' }, 'Top 10 e o restante em "Outros". Todas as lojas.'));
  blocos.graficos.deptos.setOption({
    ...base(titulo, `${titulo}. Barras horizontais em ordem decrescente: `
      + linhasPeriodo.map((d) => `${d.departamento} ${fmt.usdGrande(d.faturamento)} (${fmt.pct(d.participacao_pct, 0)})`).join('; ') + '.'),
    grid: { left: 8, right: 96, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => {
      const d = linhasPeriodo[p.dataIndex];
      return `${d.departamento}<br>${fmt.usd(d.faturamento)} · ${fmt.pct(d.participacao_pct)} do período`;
    } },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', inverse: true, data: linhasPeriodo.map((d) => d.departamento),
             axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false } },
    series: [{
      name: 'Faturamento', type: 'bar', barMaxWidth: 16, barCategoryGap: '30%',
      data: linhasPeriodo.map((d) => ({
        value: d.faturamento,
        itemStyle: { color: d.departamento === 'Outros' ? COR.outros : COR.serie, borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: COR.textoSecundario, fontSize: 11,
               formatter: (p) => `${fmt.usdGrande(p.value)} · ${fmt.pct(linhasPeriodo[p.dataIndex].participacao_pct, 0)}` },
    }],
  }, { notMerge: true });
  preencherTabela(blocos.deptos.tabela, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: 'Faturamento', valor: (d) => fmt.usd(d.faturamento), numero: true },
    { titulo: '% do período', valor: (d) => fmt.pct(d.participacao_pct), numero: true },
  ], linhasPeriodo, titulo);
}

// --------------------------------------------------------------------------- insights

const NUMERO = {
  pct: (v) => fmt.pct(v, 0),
  pp: (v) => `${fmt.decimal(v * 100, 1)} p.p.`,
  usd: fmt.usdGrande,
  clientes: (v) => `${fmt.contagem(v)} clientes`,
};
const APOIO = {
  fieis_faturamento: 'do faturamento vem dos Fiéis',
  risco_pausa: 'devem pausar nas próximas 8 semanas',
  desconto_segmentos: 'entre a maior e a menor mediana de desconto',
};

function desenharInsights() {
  const lista = blocos.insights.querySelector('.insights');
  lista.replaceChildren(...dados.insights.map((i) => el('article', { class: 'insight' },
    el('p', { class: 'insight__numero' }, NUMERO[i.unidade](i.numero), el('span', { class: 'insight__apoio' }, ` ${APOIO[i.id] ?? ''}`)),
    el('p', { class: 'insight__conclusao' }, `${i.conclusao} `,
      el('a', { class: 'insight__link', href: `#${ABA_DESTINO[i.aba_destino]}`, 'data-ir-para': ABA_DESTINO[i.aba_destino] }, 'ver análise →')))));
}
