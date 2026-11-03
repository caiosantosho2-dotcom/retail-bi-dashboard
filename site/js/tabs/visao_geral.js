// Aba Visão Geral (spec 5.1, painel v4): 6 KPIs, faturamento ao longo do tempo, faturamento por segmento e faturamento
// por departamento (com o marcador do ano anterior). Métricas que somam vêm dos cubos (somadas aqui); as que não somam,
// prontas de kpis_filtrados.json.
import { SEM_SEGMENTO, chaveSubconjunto, departamentosPeriodo, gruposPeriodo, somarPeriodo } from '../agregados.js';
import { COR, SEG_CORES, base, criarGrafico } from '../charts/tema.js';
import { TITULO_TEMPO, carregarTempo, desenharTempo } from '../charts/tempo.js';
import { el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { linhas } from '../dados.js';
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
    dica: 'Comprou nas últimas 8 semanas do período. 4, 13 e 26 semanas terminam na mesma semana, por isso o número se repete.' },
];

const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };
const SEM_FILTRO = { segmentos: new Set(), departamentos: new Set() };
const TOP_DEPTOS = 10;

let dados;
let blocos;

export async function iniciar(container) {
  const kpis = el('div', { class: 'kpis', role: 'list', 'aria-label': 'Indicadores do período' });
  const semanal = painelGrafico({ titulo: TITULO_TEMPO, subtitulo: '', classe: 'vg-semanal' });
  const segmentos = painelGrafico({ titulo: 'Faturamento por segmento', subtitulo: '', classe: 'vg-segmentos' });
  segmentos.painel.append(el('ul', { class: 'vg-segmentos__lista', 'aria-label': 'Faturamento de cada segmento' }));
  const deptos = painelGrafico({ titulo: 'Faturamento por departamento', subtitulo: '', classe: 'vg-deptos' });
  container.classList.add('vg');
  container.replaceChildren(kpis, semanal.painel, segmentos.painel, deptos.painel);

  blocos = { kpis, semanal, segmentos, deptos,
             graficos: { semanal: criarGrafico(semanal.grafico), segmentos: criarGrafico(segmentos.grafico),
                         deptos: criarGrafico(deptos.grafico) } };
  for (const nome of ['semanal', 'segmentos', 'deptos']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }
  // Modelo único de seleção (selecao.js): a barra de departamento filtra o departamento, a fatia do segmento filtra o
  // segmento. "Outros" e "Sem segmento" não filtram.
  blocos.graficos.deptos.on('click', (p) => {
    if (p.seriesName !== 'Ano anterior' && p.name !== 'Outros') clicar('departamentos', p.name, p.event?.event);
  });
  ligarGrafico(blocos.graficos.deptos, 'departamentos');
  blocos.graficos.segmentos.on('click', (p) => {
    if (p.seriesName !== SEM_SEGMENTO) clicar('segmentos', p.seriesName, p.event?.event);
  });
  ligarGrafico(blocos.graficos.segmentos, 'segmentos');

  try {
    const [kf, cp, deps, tempo] = await Promise.all([linhas('kpis_filtrados.json'), linhas('cubo_periodo.json'), linhas('departamentos.json'), carregarTempo()]);
    // Departamentos com menos de 0,1% do faturamento das 26 semanas (spec, seção 6): a variação deles leva ⚠.
    dados = { kpisFiltrados: kf, cuboPeriodo: cp, tempo,
              pequenos: new Set(deps.filter((d) => d.amostra_pequena).map((d) => d.departamento)) };
  } catch (erro) {
    erroDeCarga(container, erro);
  }
}

export function atualizar(estado) {
  if (!dados) return;
  const filtros = estado.filtros ?? SEM_FILTRO;
  Object.values(blocos.graficos).forEach((g) => g.resize());
  desenharKpis(estado.periodo, filtros);
  desenharTempo(blocos.semanal, blocos.graficos.semanal, { linhas: dados.tempo[estado.periodo], periodo: estado.periodo, filtros, lojas: lojasComparaveis(estado.periodo) });
  desenharSegmentos(estado.periodo, filtros);
  desenharDeptos(estado.periodo, filtros);
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

// --------------------------------------------------------------------------- comuns

/** Subtítulo de um painel de gráfico, trocado a cada desenho. */
function subtitulo(painel, texto) {
  const p = painel.querySelector('.painel__subtitulo') ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
  p.textContent = texto;
}

const lojasComparaveis = (periodo) => dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
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
