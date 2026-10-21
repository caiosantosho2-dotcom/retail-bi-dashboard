// Aba Visão Geral (spec 5.1): 6 KPIs, faturamento semanal, mapa de calor dia × hora, departamentos e 3 insights.
import { COR, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';

const KPIS = [
  { metrica: 'faturamento', rotulo: 'Faturamento', formato: fmt.usdGrande, titulo: (v) => fmt.usd(v) },
  { metrica: 'cestas', rotulo: 'Cestas', formato: fmt.contagem },
  { metrica: 'ticket_medio', rotulo: 'Ticket médio', formato: fmt.usd },
  { metrica: 'itens_por_cesta', rotulo: 'Itens por cesta', formato: (v) => fmt.decimal(v, 1) },
  // Mais desconto não é bom nem ruim por si: a seta fica, a cor de status não.
  { metrica: 'desconto_pct', rotulo: '% de desconto', formato: (v) => fmt.pct(v), neutro: true },
  { metrica: 'clientes_ativos', rotulo: 'Clientes ativos', formato: fmt.contagem,
    dica: 'Comprou nas últimas 8 semanas do período (definição do chat). 4, 13 e 26 semanas terminam na mesma semana, por isso o número se repete.' },
];

const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };
const ABA_DESTINO = { visao_geral: 'painel-visao-geral', ficha: 'painel-ficha', segmentos: 'painel-segmentos' };

let dados;
let blocos;

export async function iniciar(container) {
  const kpis = el('div', { class: 'kpis', role: 'list', 'aria-label': 'Indicadores do período' });
  const semanal = painelGrafico({ titulo: 'Faturamento semanal', subtitulo: '', classe: 'vg-semanal' });
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
    const [k, s, c, d, i, m] = await Promise.all([linhas('kpis.json'), linhas('vendas_semanais.json'),
      linhas('calor_dia_hora.json'), linhas('departamentos.json'), linhas('insights.json'), carregar('manifest.json')]);
    dados = { kpis: k, semanal: s, calor: c, deptos: d, insights: i, manifest: m };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  desenharCalor();
  desenharInsights();
}

export function atualizar(estado) {
  if (!dados) return;
  desenharKpis(estado.periodo);
  desenharSemanal(estado.periodo);
  desenharDeptos(estado.periodo);
}

// --------------------------------------------------------------------------- KPIs

function desenharKpis(periodo) {
  const cards = KPIS.map((cfg) => {
    const k = dados.kpis.find((l) => l.periodo === periodo && l.metrica === cfg.metrica);
    let variacao;
    if (k.variacao_pct === null) {
      variacao = el('p', { class: 'kpi__nota' }, 'sem ano anterior na base');
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
      el('p', { class: 'kpi__valor', title: cfg.titulo ? cfg.titulo(k.valor) : null }, cfg.formato(k.valor)),
      variacao,
      k.amostra_pequena ? el('p', { class: 'aviso-amostra' }, '⚠ amostra pequena') : null);
  });
  blocos.kpis.replaceChildren(...cards);
}

// --------------------------------------------------------------------------- faturamento semanal

function desenharSemanal(periodo) {
  const janela = dados.manifest.janelas[periodo];
  const semanas = dados.semanal.slice(janela.semana_ini - 1, janela.semana_fim);
  const lojas = dados.kpis.find((l) => l.periodo === '26s' && l.metrica === 'faturamento').lojas_comparaveis;
  const titulo = `Faturamento semanal, ${NOMES_PERIODO[periodo]}`;
  blocos.semanal.painel.querySelector('.painel__subtitulo')?.remove();
  blocos.semanal.painel.querySelector('.painel__titulo').after(
    el('p', { class: 'painel__subtitulo' }, `${fmt.contagem(lojas)} lojas comparáveis (as do chat). Em cinza tracejado, a mesma semana um ano antes.`));
  const ultima = semanas.at(-1);
  blocos.graficos.semanal.setOption({
    ...base(titulo, `${titulo}, nas ${lojas} lojas comparáveis. Linha do período atual e linha da mesma semana um ano antes. `
      + `${semanas.length} semanas; na última, ${fmt.usd(ultima.faturamento)} contra ${fmt.usd(ultima.faturamento_ano_anterior)} um ano antes. `
      + 'Os valores de cada semana estão na tabela.'),
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
    xAxis: { type: 'category', boundaryGap: false, data: semanas.map((s) => fmt.dataCurta(s.semana_inicio)),
             axisLabel: { color: COR.textoMudo, fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { color: COR.textoMudo, fontSize: 11, formatter: (v) => fmt.usdGrande(v) } },
    series: [
      { name: 'Ano anterior', type: 'line', data: semanas.map((s) => s.faturamento_ano_anterior),
        lineStyle: { color: COR.anoAnterior, type: 'dashed', width: 2 }, itemStyle: { color: COR.anoAnterior },
        symbol: 'none', connectNulls: false },
      { name: 'Período atual', type: 'line', data: semanas.map((s) => s.faturamento),
        lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie },
        symbol: semanas.length <= 13 ? 'circle' : 'none', symbolSize: 8,
        endLabel: { show: true, color: COR.textoSecundario, fontSize: 11, formatter: (p) => fmt.usdGrande(p.value) } },
    ],
  }, { notMerge: true });
  preencherTabela(blocos.semanal.tabela, [
    { titulo: 'Semana de', valor: (s) => fmt.data(s.semana_inicio) },
    { titulo: 'Período atual', valor: (s) => fmt.usd(s.faturamento), numero: true },
    { titulo: 'Ano anterior', valor: (s) => fmt.usd(s.faturamento_ano_anterior), numero: true },
  ], semanas, titulo);
}

// --------------------------------------------------------------------------- mapa de calor

function desenharCalor() {
  const valores = dados.calor.map((c) => c.faturamento);
  const dias = [1, 2, 3, 4, 5, 6, 7].map((d) => `Dia ${d}`);
  blocos.graficos.calor.setOption({
    ...base('Faturamento por dia do ciclo semanal e hora, base inteira',
      'Mapa de calor do faturamento por dia do ciclo semanal (sem nome: a base não tem calendário real) e hora do dia.'),
    grid: { left: 8, right: 8, top: 8, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const c = dados.calor[p.dataIndex];
        return `Dia ${c.dia_semana}, ${String(c.hora).padStart(2, '0')}h<br>${fmt.usd(c.faturamento)}<br>${fmt.contagem(c.cestas)} cestas`;
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
      data: dados.calor.map((c) => [c.hora, c.dia_semana - 1, c.faturamento]),
      itemStyle: { borderColor: COR.superficie, borderWidth: 2, borderRadius: 2 },
      emphasis: { itemStyle: { borderColor: COR.textoPrimario, borderWidth: 1 } },
    }],
  });
  preencherTabela(blocos.calor.tabela, [
    { titulo: 'Dia', valor: (c) => `Dia ${c.dia_semana}` },
    { titulo: 'Hora', valor: (c) => `${String(c.hora).padStart(2, '0')}h` },
    { titulo: 'Faturamento', valor: (c) => fmt.usd(c.faturamento), numero: true },
    { titulo: 'Cestas', valor: (c) => fmt.contagem(c.cestas), numero: true },
  ], dados.calor, 'Faturamento por dia do ciclo e hora');
}

// --------------------------------------------------------------------------- departamentos

function desenharDeptos(periodo) {
  const linhasPeriodo = dados.deptos.filter((d) => d.periodo === periodo);
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
