// Aba Visão Geral (spec 5.1, redesenho v3): 6 KPIs, faturamento semanal (52 semanas), faturamento por segmento,
// faturamento por departamento (com o marcador do ano anterior) e "O que puxou a variação" (contribuição de cada
// departamento para a variação contra o ano anterior). Métricas que somam vêm dos cubos (somadas aqui); as que não
// somam, prontas de kpis_filtrados.json.
import { SEM_SEGMENTO, chaveSubconjunto, departamentosPeriodo, gruposPeriodo, serieSemanal, somarPeriodo } from '../agregados.js';
import { COR, SEG_CORES, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA, clicar, ligarGrafico } from '../selecao.js';

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
const SEM_FILTRO = { segmentos: new Set(), departamentos: new Set() };
const TOP_DEPTOS = 10;
const TOP_VARIACAO = 10;
const LARGURA_ESTREITA = 500;

let dados;
let blocos;
let ultimo = null;   // período e filtros do último desenho (para redesenhar ao mudar de largura)

export async function iniciar(container) {
  const kpis = el('div', { class: 'kpis', role: 'list', 'aria-label': 'Indicadores do período' });
  const semanal = painelGrafico({ titulo: 'Faturamento semanal, últimas 52 semanas', subtitulo: '', classe: 'vg-semanal' });
  const segmentos = painelGrafico({ titulo: 'Faturamento por segmento', subtitulo: '', classe: 'vg-segmentos' });
  segmentos.painel.append(el('ul', { class: 'vg-segmentos__lista', 'aria-label': 'Faturamento de cada segmento' }));
  const deptos = painelGrafico({ titulo: 'Faturamento por departamento', subtitulo: '', classe: 'vg-deptos' });
  const variacao = painelGrafico({ titulo: 'O que puxou a variação', subtitulo: '', classe: 'vg-variacao' });
  container.classList.add('vg');
  container.replaceChildren(kpis, semanal.painel, segmentos.painel, deptos.painel, variacao.painel);

  blocos = { kpis, semanal, segmentos, deptos, variacao,
             graficos: { semanal: criarGrafico(semanal.grafico), segmentos: criarGrafico(segmentos.grafico),
                         deptos: criarGrafico(deptos.grafico), variacao: criarGrafico(variacao.grafico) } };
  for (const nome of ['semanal', 'segmentos', 'deptos', 'variacao']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }
  // Modelo único de seleção (selecao.js): a barra de departamento (nos dois gráficos) filtra o departamento, a fatia do
  // segmento filtra o segmento. "Outros" e "Sem segmento" não filtram.
  for (const nome of ['deptos', 'variacao']) {
    blocos.graficos[nome].on('click', (p) => {
      if (p.seriesName !== 'Ano anterior' && p.name !== 'Outros') clicar('departamentos', p.name, p.event?.event);
    });
    ligarGrafico(blocos.graficos[nome], 'departamentos');
  }
  // O rótulo da variação depende da largura (curto em tela estreita): redesenha quando ela cruza o corte.
  let estreitoAntes = null;
  blocos.graficos.variacao.on('finished', () => {
    const estreito = blocos.graficos.variacao.getWidth() < LARGURA_ESTREITA;
    if (estreitoAntes !== null && estreito !== estreitoAntes && ultimo) desenharVariacao(ultimo.periodo, ultimo.filtros);
    estreitoAntes = estreito;
  });
  blocos.graficos.segmentos.on('click', (p) => {
    if (p.seriesName !== SEM_SEGMENTO) clicar('segmentos', p.seriesName, p.event?.event);
  });
  ligarGrafico(blocos.graficos.segmentos, 'segmentos');

  try {
    const [kf, cp, cf, deps, m] = await Promise.all([linhas('kpis_filtrados.json'), linhas('cubo_periodo.json'),
      linhas('cubo_faturamento.json'), linhas('departamentos.json'), carregar('manifest.json')]);
    // Departamentos com menos de 0,1% do faturamento das 26 semanas (spec, seção 6): a variação deles leva ⚠.
    dados = { kpisFiltrados: kf, cuboPeriodo: cp, cuboSemanal: cf, manifest: m,
              pequenos: new Set(deps.filter((d) => d.amostra_pequena).map((d) => d.departamento)) };
  } catch (erro) {
    erroDeCarga(container, erro);
  }
}

export function atualizar(estado) {
  if (!dados) return;
  const filtros = estado.filtros ?? SEM_FILTRO;
  ultimo = { periodo: estado.periodo, filtros };
  Object.values(blocos.graficos).forEach((g) => g.resize());
  desenharKpis(estado.periodo, filtros);
  desenharSemanal(estado.periodo, filtros);
  desenharSegmentos(estado.periodo, filtros);
  desenharDeptos(estado.periodo, filtros);
  desenharVariacao(estado.periodo, filtros);
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
    if (k.semDados) {
      return el('article', { class: 'kpi', role: 'listitem' },
        el('h3', { class: 'kpi__rotulo' }, cfg.rotulo),
        el('p', { class: 'kpi__valor' }, '—'),
        el('p', { class: 'kpi__nota' }, 'sem compras neste recorte'));
    }
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

// --------------------------------------------------------------------------- comuns

/** Subtítulo de um painel de gráfico, trocado a cada desenho. */
function subtitulo(painel, texto) {
  const p = painel.querySelector('.painel__subtitulo') ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
  p.textContent = texto;
}

const lojasComparaveis = (periodo) => dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
/** Diferença em dinheiro com sinal: +US$ 12,3 mil · −US$ 4,1 mil. */
const diferenca = (v) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : '−'}${fmt.usdGrande(Math.abs(v))}`);
const variacaoDe = (atual, anterior) => (atual === null || !anterior ? null : atual / anterior - 1);
/** Variação com o aviso de amostra pequena nos departamentos com menos de 0,1% do faturamento. */
const variacaoDep = (d) => (dados.pequenos.has(d.departamento) ? `⚠ ${fmt.variacao(d.variacao)}` : fmt.variacao(d.variacao));
const avisoDep = (d) => (dados.pequenos.has(d.departamento) ? '<br>⚠ amostra pequena: menos de 0,1% do faturamento' : '');

// --------------------------------------------------------------------------- faturamento por segmento

function desenharSegmentos(periodo, filtros) {
  // O gráfico que filtra não se filtra: mostra todos os grupos e destaca os segmentos selecionados.
  const grupos = gruposPeriodo(dados.cuboPeriodo, periodo, filtros).filter((g) => g.faturamento > 0);
  const total = grupos.reduce((a, g) => a + g.faturamento, 0);
  grupos.forEach((g) => { g.pct = total ? g.faturamento / total : 0; });
  const selecionados = filtros.segmentos;
  const fora = (g) => selecionados.size > 0 && !selecionados.has(g);
  const cor = (g) => (g === SEM_SEGMENTO ? COR.outros : SEG_CORES[g]);
  const deps = [...filtros.departamentos];
  subtitulo(blocos.segmentos.painel, `${NOMES_PERIODO[periodo]}, ${deps.length ? deps.join(', ') : 'todos os departamentos'}, todas as lojas. `
    + 'O segmento é fixo (atributo do cliente, calculado nas 26 semanas). Clique para filtrar.');
  const titulo = `Faturamento por segmento, ${NOMES_PERIODO[periodo]}`;
  blocos.graficos.segmentos.setOption({
    ...base(titulo, `${titulo}: ` + grupos.map((g) => `${g.grupo} ${fmt.pct(g.pct)} (${fmt.usdGrande(g.faturamento)})`).join('; ') + '.'),
    grid: { left: 0, right: 0, top: 4, height: 22 },
    tooltip: { trigger: 'item', formatter: (p) => {
      const g = grupos[p.seriesIndex];
      const acao = g.grupo === SEM_SEGMENTO ? '<br>Clientes sem compra nas 26 semanas: não têm segmento'
        : selecionados.has(g.grupo) ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar; Ctrl + clique soma';
      return `${g.grupo}: ${fmt.usd(g.faturamento)} · ${fmt.pct(g.pct)}${acao}`;
    } },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: { type: 'category', data: ['Faturamento'], show: false },
    series: grupos.map((g, i) => ({
      name: g.grupo, type: 'bar', stack: 'total', barWidth: 22, cursor: g.grupo === SEM_SEGMENTO ? 'default' : 'pointer',
      data: [g.pct],
      itemStyle: { color: cor(g.grupo), opacity: fora(g.grupo) ? OPACIDADE_FORA : 1, borderColor: COR.superficie, borderWidth: 1,
                   borderRadius: i === 0 ? [4, 0, 0, 4] : i === grupos.length - 1 ? [0, 4, 4, 0] : 0 },
      label: { show: g.pct >= 0.08, position: 'inside', color: COR.textoPrimario, fontSize: 11, formatter: () => fmt.pct(g.pct, 0) },
    })),
  }, { notMerge: true });
  // Rótulo direto de cada segmento (nome, % e valor), na ordem da barra: a cor nunca fica sozinha.
  blocos.segmentos.painel.querySelector('.vg-segmentos__lista').replaceChildren(...grupos.map((g) => el('li', {
    class: 'vg-segmentos__item', 'data-fora': String(fora(g.grupo)) },
  etiquetaSegmento(g.grupo, cor(g.grupo)),
  el('span', { class: 'vg-segmentos__pct' }, fmt.pct(g.pct)),
  el('span', { class: 'vg-segmentos__valor' }, fmt.usdGrande(g.faturamento)))));
  preencherTabela(blocos.segmentos.tabela, [
    { titulo: 'Segmento', valor: (g) => g.grupo },
    { titulo: 'Faturamento', valor: (g) => fmt.usd(g.faturamento), numero: true },
    { titulo: '% do total', valor: (g) => fmt.pct(g.pct), numero: true },
  ], grupos, titulo);
}

// --------------------------------------------------------------------------- departamentos (com o ano anterior)

function desenharDeptos(periodo, filtros) {
  // O gráfico que filtra não se filtra: mostra todos os departamentos e destaca os selecionados (cross-filter).
  // Com ano anterior, as barras são das lojas comparáveis do período, para o traço do ano anterior ser das mesmas lojas.
  const selecionados = filtros.departamentos;
  const comAnterior = periodo !== 'base';
  const lista = departamentosPeriodo(dados.cuboPeriodo, periodo, filtros)
    .map((d) => ({ departamento: d.departamento, valor: (comAnterior ? d.faturamento_comparavel : d.faturamento) ?? 0,
                   anterior: comAnterior ? d.faturamento_ano_anterior ?? 0 : null }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.departamento.localeCompare(b.departamento));
  const total = lista.reduce((a, d) => a + d.valor, 0);
  const linhasDeps = lista.filter((d, i) => i < TOP_DEPTOS || selecionados.has(d.departamento));
  const resto = lista.filter((d) => !linhasDeps.includes(d));
  if (resto.length) {
    linhasDeps.push({ departamento: 'Outros', valor: resto.reduce((a, d) => a + d.valor, 0),
                      anterior: comAnterior ? resto.reduce((a, d) => a + d.anterior, 0) : null });
  }
  linhasDeps.forEach((d) => { d.pct = d.valor / total; d.variacao = comAnterior ? variacaoDe(d.valor, d.anterior) : null; });
  const fora = (d) => selecionados.size > 0 && !selecionados.has(d.departamento);
  subtitulo(blocos.deptos.painel, comAnterior
    ? `Nas ${fmt.contagem(lojasComparaveis(periodo))} lojas comparáveis; o traço branco é o mesmo período um ano antes, nas mesmas lojas. Clique para filtrar.`
    : 'Todas as lojas: a base inteira não tem ano anterior. Clique para filtrar.');
  const titulo = `Faturamento por departamento, ${NOMES_PERIODO[periodo]}`;
  const nomes = linhasDeps.map((d) => d.departamento);
  blocos.graficos.deptos.setOption({
    ...base(titulo, `${titulo}. Barras horizontais em ordem decrescente: `
      + linhasDeps.map((d) => `${d.departamento} ${fmt.usdGrande(d.valor)}${comAnterior ? `, ${fmt.variacao(d.variacao)} contra ${fmt.usdGrande(d.anterior)} um ano antes` : ''}`).join('; ') + '.'),
    grid: { left: 8, right: 104, top: comAnterior ? 22 : 4, bottom: 4, containLabel: true },
    legend: comAnterior ? { top: 0, right: 0, data: ['Faturamento', 'Ano anterior'], selectedMode: false } : undefined,
    tooltip: { trigger: 'item', formatter: (p) => {
      const d = linhasDeps[p.dataIndex];
      const acao = d.departamento === 'Outros' ? '' : selecionados.has(d.departamento)
        ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar; Ctrl + clique soma';
      const anterior = comAnterior ? `<br>Um ano antes: ${fmt.usd(d.anterior)} · ${fmt.variacao(d.variacao)}` : '';
      return `${d.departamento}<br>${fmt.usd(d.valor)} · ${fmt.pct(d.pct)} do período${anterior}${avisoDep(d)}${acao}`;
    } },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', inverse: true, data: nomes, axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false } },
    series: [
      { name: 'Faturamento', type: 'bar', barMaxWidth: 16, barCategoryGap: '30%', cursor: 'pointer',
        data: linhasDeps.map((d) => ({ value: d.valor,
          itemStyle: { color: d.departamento === 'Outros' ? COR.outros : COR.serie, borderRadius: [0, 4, 4, 0], opacity: fora(d) ? OPACIDADE_FORA : 1 } })),
        itemStyle: { color: COR.serie } },
      ...(comAnterior ? [{
        // O traço do ano anterior: uma marca fina sobre a barra, na mesma escala (sem segundo eixo).
        name: 'Ano anterior', type: 'scatter', symbol: 'rect', symbolSize: [3, 20], cursor: 'pointer', z: 3,
        data: linhasDeps.map((d) => ({ value: [d.anterior, d.departamento], itemStyle: { opacity: fora(d) ? OPACIDADE_FORA : 1 } })),
        itemStyle: { color: COR.textoPrimario },
      }] : []),
      // Rótulo depois da barra e do traço (o que for mais longe), para o traço nunca cobrir o número.
      { name: 'rótulo', type: 'scatter', symbolSize: 0, silent: true, tooltip: { show: false },
        data: linhasDeps.map((d) => ({ value: [Math.max(d.valor, d.anterior ?? 0), d.departamento], label: { opacity: fora(d) ? 0.6 : 1 } })),
        label: { show: true, position: 'right', distance: 6, color: COR.textoSecundario, fontSize: 11,
                 formatter: (p) => { const d = linhasDeps[p.dataIndex]; return `${fmt.usdGrande(d.valor)} · ${comAnterior ? variacaoDep(d) : fmt.pct(d.pct, 0)}`; } } },
    ],
  }, { notMerge: true });
  preencherTabela(blocos.deptos.tabela, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: comAnterior ? 'Faturamento (comparáveis)' : 'Faturamento', valor: (d) => fmt.usd(d.valor), numero: true },
    { titulo: '% do período', valor: (d) => fmt.pct(d.pct), numero: true },
    ...(comAnterior ? [{ titulo: 'Um ano antes', valor: (d) => fmt.usd(d.anterior), numero: true },
                       { titulo: 'Variação', valor: (d) => fmt.variacao(d.variacao), numero: true }] : []),
    { titulo: 'No filtro', valor: (d) => (selecionados.has(d.departamento) ? 'sim' : '') },
  ], linhasDeps, titulo);
}

// --------------------------------------------------------------------------- o que puxou a variação

function desenharVariacao(periodo, filtros) {
  const g = blocos.graficos.variacao;
  if (periodo === 'base') {
    subtitulo(blocos.variacao.painel, 'Diferença em US$ contra o mesmo período um ano antes, por departamento.');
    g.setOption({ ...base('O que puxou a variação', 'Sem ano anterior na base inteira.'),
      graphic: { type: 'text', left: 'center', top: 'middle',
                 style: { text: 'A base inteira não tem ano anterior para comparar.\nEscolha 4, 13 ou 26 semanas.', fill: COR.textoMudo, font: '13px system-ui', align: 'center' } } },
    { notMerge: true });
    preencherTabela(blocos.variacao.tabela, [{ titulo: 'Aviso', valor: (x) => x }], ['A base inteira não tem ano anterior.'], 'O que puxou a variação');
    return;
  }
  const selecionados = filtros.departamentos;
  const todos = departamentosPeriodo(dados.cuboPeriodo, periodo, filtros)
    .map((d) => ({ departamento: d.departamento, atual: d.faturamento_comparavel ?? 0, anterior: d.faturamento_ano_anterior ?? 0 }))
    .map((d) => ({ ...d, diferenca: d.atual - d.anterior }))
    .filter((d) => d.atual > 0 || d.anterior > 0);
  const atual = todos.reduce((a, d) => a + d.atual, 0);
  const anterior = todos.reduce((a, d) => a + d.anterior, 0);
  // Os maiores em módulo (mais os filtrados), o resto somado em "Outros"; depois em ordem, da maior alta à maior queda.
  const porModulo = [...todos].sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || a.departamento.localeCompare(b.departamento));
  const linhasV = porModulo.filter((d, i) => i < TOP_VARIACAO || selecionados.has(d.departamento));
  const resto = porModulo.filter((d) => !linhasV.includes(d));
  if (resto.length) {
    const r = { departamento: 'Outros', atual: resto.reduce((a, d) => a + d.atual, 0), anterior: resto.reduce((a, d) => a + d.anterior, 0) };
    linhasV.push({ ...r, diferenca: r.atual - r.anterior });
  }
  linhasV.sort((a, b) => (a.departamento === 'Outros') - (b.departamento === 'Outros') || b.diferenca - a.diferenca);
  linhasV.forEach((d) => { d.variacao = variacaoDe(d.atual, d.anterior); });
  const fora = (d) => selecionados.size > 0 && !selecionados.has(d.departamento);
  const total = atual - anterior;
  subtitulo(blocos.variacao.painel, `Diferença em US$ contra o mesmo período um ano antes, nas ${fmt.contagem(lojasComparaveis(periodo))} lojas comparáveis. `
    + `Total: ${diferenca(total)} (${fmt.variacao(variacaoDe(atual, anterior))}). Clique para filtrar.`);
  const titulo = `O que puxou a variação, ${NOMES_PERIODO[periodo]}`;
  const rotulo = (d) => `${diferenca(d.diferenca)} · ${variacaoDep(d)}`;
  // Em tela estreita o rótulo fica só com a diferença (a variação continua no tooltip e na tabela) e a margem cresce.
  const estreito = g.getWidth() < LARGURA_ESTREITA;
  const margem = estreito ? 1.1 : 0.55;
  g.setOption({
    ...base(titulo, `${titulo}: variação total ${diferenca(total)}. Por departamento, da maior alta à maior queda: `
      + linhasV.map((d) => `${d.departamento} ${rotulo(d)}`).join('; ') + '.'),
    grid: { left: 8, right: 8, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => {
      const d = linhasV[p.dataIndex];
      const acao = d.departamento === 'Outros' ? '' : selecionados.has(d.departamento)
        ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar; Ctrl + clique soma';
      return `${d.departamento}<br>${fmt.usd(d.atual)} agora contra ${fmt.usd(d.anterior)} um ano antes`
        + `<br>${rotulo(d)} · ${fmt.pct(total ? d.diferenca / total : null)} da variação total${avisoDep(d)}${acao}`;
    } },
    // Os nomes ficam na borda esquerda (não no zero): as barras de queda crescem para a esquerda sem cobri-los.
    // Margem dos dois lados para os rótulos caberem.
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false },
             max: (v) => v.max + (v.max - Math.min(0, v.min)) * margem, min: (v) => Math.min(0, v.min) - (v.max - Math.min(0, v.min)) * margem },
    yAxis: { type: 'category', inverse: true, data: linhasV.map((d) => d.departamento),
             axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false, onZero: false }, axisTick: { show: false } },
    series: [{
      name: 'Diferença contra o ano anterior', type: 'bar', barMaxWidth: 16, barCategoryGap: '30%', cursor: 'pointer',
      data: linhasV.map((d) => ({
        value: d.diferenca,
        itemStyle: { color: d.departamento === 'Outros' ? COR.outros : d.diferenca >= 0 ? COR.status.baixo : COR.status.alto,
                     borderRadius: d.diferenca >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4], opacity: fora(d) ? OPACIDADE_FORA : 1 },
        label: { position: d.diferenca >= 0 ? 'right' : 'left', opacity: fora(d) ? 0.6 : 1 },
      })),
      label: { show: true, color: COR.textoSecundario, fontSize: 11,
               formatter: (p) => (estreito ? diferenca(linhasV[p.dataIndex].diferenca) : rotulo(linhasV[p.dataIndex])) },
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: COR.eixo, type: 'solid' }, data: [{ xAxis: 0 }] },
    }],
  }, { notMerge: true });
  preencherTabela(blocos.variacao.tabela, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: 'Agora', valor: (d) => fmt.usd(d.atual), numero: true },
    { titulo: 'Um ano antes', valor: (d) => fmt.usd(d.anterior), numero: true },
    { titulo: 'Diferença', valor: (d) => diferenca(d.diferenca), numero: true },
    { titulo: 'Variação', valor: (d) => fmt.variacao(d.variacao), numero: true },
  ], linhasV, titulo);
}
