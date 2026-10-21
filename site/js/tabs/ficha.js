// Aba Ficha do Cliente (spec 5.2): seleção (busca, filtro, sorteio) | ficha (radar + tabela, risco, histórico,
// departamentos) | contexto (o cliente contra a média do seu segmento). Janela de 26 semanas do RFM.
import { COR, SEG_CORES, SEGMENTOS, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';

const SLUG = { 'Fiéis': 'fieis', 'Regulares': 'regulares', 'Esporádicos': 'esporadicos', 'Em pausa': 'em_pausa' };
const LIMITE_LISTA = 200;   // a lista mostra até 200 clientes; a busca e o filtro chegam aos demais

const ATRIBUTOS = [
  { chave: 'recencia', curto: 'Recência', nome: 'Recência', nota: 'invertida: maior = comprou há menos tempo',
    valor: (v) => `${fmt.contagem(v)} dias`, media: (v) => `${fmt.decimal(v, 1)} dias` },
  { chave: 'frequencia', curto: 'Frequência', nome: 'Frequência', valor: (v) => `${fmt.contagem(v)} cestas`, media: (v) => `${fmt.decimal(v, 1)} cestas` },
  { chave: 'valor', curto: 'Valor', nome: 'Valor', valor: fmt.usd, media: fmt.usd },
  { chave: 'clv', curto: 'CLV', nome: 'CLV', nota: 'margem esperada em 52 semanas', valor: fmt.usd, media: fmt.usd },
  { chave: 'sensibilidade_desconto', curto: 'Desconto', nome: 'Sensibilidade a desconto', nota: '% do valor bruto em desconto',
    valor: (v) => fmt.pct(v), media: (v) => fmt.pct(v) },
  { chave: 'variedade_departamentos', curto: 'Variedade', nome: 'Variedade de departamentos',
    valor: (v) => `${fmt.contagem(v)} deptos`, media: (v) => `${fmt.decimal(v, 1)} deptos` },
];
const FAIXA = {
  alto: { texto: 'Risco alto', icone: '⚠', classe: 'critico' },
  medio: { texto: 'Risco médio', icone: '◐', classe: 'atencao' },
  baixo: { texto: 'Risco baixo', icone: '✓', classe: 'bom' },
};

const estadoAba = { segmento: null, busca: '', selecionado: null };
let dados;
let ui;

export async function iniciar(container) {
  const lista = el('ul', { class: 'lista-clientes', 'aria-label': 'Clientes' });
  const busca = el('input', { class: 'campo', type: 'search', inputmode: 'numeric', id: 'fc-busca', placeholder: 'ID do cliente', autocomplete: 'off' });
  const filtros = el('div', { class: 'seletor-segmentos', role: 'group', 'aria-label': 'Filtrar por segmento' });
  const contagem = el('p', { class: 'painel__subtitulo', 'aria-live': 'polite' });
  const selecao = el('section', { class: 'painel fc-selecao', 'aria-labelledby': 'fc-selecao-titulo' },
    el('h2', { class: 'painel__titulo', id: 'fc-selecao-titulo' }, 'Clientes'),
    el('label', { class: 'campo__rotulo', for: 'fc-busca' }, 'Buscar por ID'),
    el('div', { class: 'fc-busca' }, busca,
      el('button', { class: 'botao', type: 'button', onclick: () => sortear() }, 'Sortear cliente')),
    filtros, contagem, lista);

  const cabecalho = el('header', { class: 'fc-cabecalho' });
  const radarGrafico = el('div', { class: 'fc-radar__grafico' });
  const radarTabela = el('div', { class: 'fc-radar__tabela' });
  const radar = el('section', { class: 'painel fc-radar', 'aria-label': 'Perfil do cliente' }, cabecalho,
    el('div', { class: 'fc-radar__corpo' }, radarGrafico, radarTabela));
  const risco = el('section', { class: 'painel fc-risco', 'aria-labelledby': 'fc-risco-titulo' });
  const historico = painelGrafico({ titulo: 'Faturamento semanal do cliente', subtitulo: 'Semanas 1 a 101, todas as lojas.', classe: 'fc-historico' });
  const deptos = painelGrafico({ titulo: 'Onde o cliente gasta', subtitulo: 'Top 5 departamentos, % do gasto dele em 26 semanas.', classe: 'fc-deptos' });
  const centro = el('div', { class: 'fc-centro' }, radar, risco, historico.painel, deptos.painel);
  const contexto = el('section', { class: 'painel fc-contexto', 'aria-labelledby': 'fc-contexto-titulo' });

  container.classList.add('fc');
  container.replaceChildren(selecao, centro, contexto);
  ui = { lista, busca, filtros, contagem, cabecalho, radarTabela, risco, historico, deptos, contexto,
         graficos: { radar: criarGrafico(radarGrafico), historico: criarGrafico(historico.grafico), deptos: criarGrafico(deptos.grafico) } };
  historico.aoAlternar((t) => { if (!t) ui.graficos.historico.resize(); });
  deptos.aoAlternar((t) => { if (!t) ui.graficos.deptos.resize(); });

  try {
    const [indice, medias, semanas, manifest] = await Promise.all([linhas('clientes_indice.json'), linhas('medias_segmento.json'),
      linhas('vendas_semanais.json'), carregar('manifest.json')]);
    const mediaDe = {};
    for (const m of medias) (mediaDe[m.segmento] ??= {})[m.atributo] = m;
    dados = { indice, mediaDe, semanas, manifest, porId: new Map(indice.map((c) => [c.id, c])) };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }

  filtros.replaceChildren(
    el('button', { class: 'botao', type: 'button', 'aria-pressed': 'true', dataset: { segmento: '' }, onclick: () => filtrar(null) }, 'Todos'),
    ...SEGMENTOS.map((s) => el('button', { class: 'botao botao--segmento', type: 'button', 'aria-pressed': 'false', dataset: { segmento: s },
      onclick: () => filtrar(s) }, etiquetaSegmento(s, SEG_CORES[s]))));
  busca.addEventListener('input', () => { estadoAba.busca = busca.value.trim(); desenharLista(); });
  busca.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const exato = dados.porId.get(Number(estadoAba.busca));
    const primeiro = exato || filtrados()[0];
    if (primeiro) selecionar(primeiro.id);
  });
  desenharLista();
  sortear();
}

// --------------------------------------------------------------------------- seleção

function filtrados() {
  return dados.indice.filter((c) => (!estadoAba.segmento || c.segmento === estadoAba.segmento)
    && (!estadoAba.busca || String(c.id).startsWith(estadoAba.busca)));
}

function filtrar(segmento) {
  estadoAba.segmento = segmento;
  ui.filtros.querySelectorAll('[data-segmento]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.segmento || null) === segmento)));
  desenharLista();
}

function sortear() {
  const candidatos = filtrados();
  if (candidatos.length) selecionar(candidatos[Math.floor(Math.random() * candidatos.length)].id);
}

function desenharLista() {
  const todos = filtrados();
  const mostrados = todos.slice(0, LIMITE_LISTA);
  ui.contagem.textContent = todos.length > LIMITE_LISTA
    ? `${fmt.contagem(todos.length)} clientes; mostrando os ${LIMITE_LISTA} primeiros. Busque pelo ID para achar os demais.`
    : `${fmt.contagem(todos.length)} ${todos.length === 1 ? 'cliente' : 'clientes'}`;
  ui.lista.replaceChildren(...mostrados.map((c) => el('li', {},
    el('button', { class: 'item-cliente', type: 'button', 'aria-current': c.id === estadoAba.selecionado ? 'true' : null,
                   dataset: { id: c.id }, onclick: () => selecionar(c.id) },
      etiquetaSegmento(`Cliente ${c.id}`, SEG_CORES[c.segmento]),
      el('span', { class: 'item-cliente__risco' }, c.risco_faixa ? FAIXA[c.risco_faixa].texto.toLowerCase() : 'sem risco calculado')))));
  if (!todos.length) ui.lista.replaceChildren(el('li', { class: 'painel__vazio' }, 'Nenhum cliente com esse filtro.'));
}

async function selecionar(id) {
  const resumo = dados.porId.get(id);
  if (!resumo) return;
  estadoAba.selecionado = id;
  ui.lista.querySelectorAll('[data-id]').forEach((b) => b.toggleAttribute('aria-current', Number(b.dataset.id) === id));
  let cliente;
  try {
    const doSegmento = await carregarSegmento(resumo.segmento);
    cliente = doSegmento.get(id);
  } catch (erro) {
    erroDeCarga(ui.contexto, erro);
    return;
  }
  if (estadoAba.selecionado !== id) return;   // outro clique chegou antes deste arquivo
  // Mede só a montagem da ficha, com o arquivo do segmento já carregado (critério de aceite: < 300 ms).
  performance.mark('ficha-inicio');
  desenharFicha(cliente);
  performance.mark('ficha-fim');
  performance.measure('ficha', 'ficha-inicio', 'ficha-fim');
}

const porSegmento = new Map();
function carregarSegmento(segmento) {
  if (!porSegmento.has(segmento)) {
    porSegmento.set(segmento, linhas(`clientes/${SLUG[segmento]}.json`).then((ls) => new Map(ls.map((c) => [c.id, c]))));
  }
  return porSegmento.get(segmento);
}

// --------------------------------------------------------------------------- ficha

function desenharFicha(c) {
  // A tabela ao lado do radar e a lista mudam o espaço dos gráficos depois da criação: mede de novo antes de desenhar.
  Object.values(ui.graficos).forEach((g) => g.resize());
  const media = dados.mediaDe[c.segmento];
  const cor = SEG_CORES[c.segmento];
  const semanas = c.semanas_sem_comprar;
  ui.cabecalho.replaceChildren(
    el('h2', { class: 'fc-cabecalho__titulo' }, `Cliente ${c.id}`),
    etiquetaSegmento(c.segmento, cor),
    el('span', { class: 'fc-cabecalho__nota' },
      semanas === 0 ? 'comprou há menos de 1 semana' : `há ${semanas} ${semanas === 1 ? 'semana' : 'semanas'} sem comprar`));

  // Radar: percentil de 0 a 100 entre os clientes segmentados; o cliente contra a média do próprio segmento.
  const valoresCliente = ATRIBUTOS.map((a) => c.atributos[a.chave].percentil ?? '-');
  const valoresMedia = ATRIBUTOS.map((a) => media[a.chave].percentil_medio ?? '-');
  ui.graficos.radar.setOption({
    ...base(`Perfil do cliente ${c.id} em percentil, contra a média dos ${c.segmento}`,
      `Radar do cliente ${c.id} (${c.segmento}) em percentil de 0 a 100: `
      + ATRIBUTOS.map((a) => `${a.nome} ${fmt.decimal(c.atributos[a.chave].percentil, 0)}`).join(', ')
      + `. A média dos ${c.segmento} está na tabela ao lado.`),
    legend: { top: 0, left: 'center', data: ['Cliente', `Média dos ${c.segmento}`] },
    tooltip: { trigger: 'item' },
    radar: {
      center: ['50%', '54%'], radius: '52%', splitNumber: 4, shape: 'polygon',
      indicator: ATRIBUTOS.map((a) => ({ name: a.curto, max: 100, min: 0 })),
      axisName: { color: COR.textoSecundario, fontSize: 11 },
      splitLine: { lineStyle: { color: COR.grade } }, splitArea: { show: false }, axisLine: { lineStyle: { color: COR.grade } },
    },
    series: [{
      type: 'radar', symbol: 'circle', symbolSize: 6,
      data: [
        { name: `Média dos ${c.segmento}`, value: valoresMedia,
          lineStyle: { color: COR.textoMudo, width: 1.5 }, itemStyle: { color: COR.textoMudo }, symbol: 'none' },
        { name: 'Cliente', value: valoresCliente,
          lineStyle: { color: cor, width: 2 }, itemStyle: { color: cor, borderColor: COR.superficie, borderWidth: 2 },
          areaStyle: { color: cor, opacity: 0.12 } },
      ],
    }],
  }, { notMerge: true });

  // Tabela ao lado do radar: sempre visível (critério de aceite), com os valores reais.
  preencherTabela(ui.radarTabela, [
    { titulo: 'Atributo', valor: (a) => el('span', { title: a.nota || null }, a.nome) },
    { titulo: 'Cliente', valor: (a) => a.valor(c.atributos[a.chave].valor), numero: true },
    { titulo: 'Percentil', valor: (a) => fmt.decimal(c.atributos[a.chave].percentil, 0), numero: true },
    { titulo: `Média ${c.segmento}`, valor: (a) => a.media(media[a.chave].valor_medio), numero: true },
  ], ATRIBUTOS, `Atributos do cliente ${c.id}: valor real, percentil e média do segmento`);

  desenharRisco(c);
  desenharHistorico(c, cor);
  desenharDeptos(c, cor);
  desenharContexto(c, media, cor);
}

function desenharRisco(c) {
  const m = dados.manifest.modelo;
  const titulo = el('h2', { class: 'painel__titulo', id: 'fc-risco-titulo' }, 'Risco de pausa (8 semanas sem comprar)');
  if (c.risco.score === null) {
    ui.risco.replaceChildren(titulo, el('p', { class: 'painel__vazio' },
      'Fora do modelo de risco: o modelo só avalia quem comprou nas últimas 8 semanas e tem pelo menos 16 semanas de histórico.'));
    return;
  }
  const f = FAIXA[c.risco.faixa];
  const pos = (v) => `${Math.min(100, v * 100)}%`;
  ui.risco.replaceChildren(titulo,
    el('p', { class: `risco__rotulo risco__rotulo--${f.classe}` },
      el('span', { 'aria-hidden': 'true' }, `${f.icone} `), f.texto,
      el('span', { class: 'risco__prob' }, ` · ${fmt.pct(c.risco.score)} de chance de pausar`)),
    el('div', { class: 'risco', role: 'img',
                'aria-label': `${f.texto}: probabilidade de ${fmt.pct(c.risco.score)}. Faixas: baixo abaixo de ${fmt.pct(m.corte_medio)}, médio até ${fmt.pct(m.limiar_alerta)}, alto a partir de ${fmt.pct(m.limiar_alerta)}.` },
      el('div', { class: 'risco__trilho' },
        el('span', { class: 'risco__faixa risco__faixa--bom', style: `width:${pos(m.corte_medio)}` }),
        el('span', { class: 'risco__faixa risco__faixa--atencao', style: `width:${pos(m.limiar_alerta - m.corte_medio)}` }),
        el('span', { class: 'risco__faixa risco__faixa--critico', style: 'flex:1' }),
        el('span', { class: 'risco__marcador', style: `left:${pos(c.risco.score)}` })),
      el('div', { class: 'risco__escala', 'aria-hidden': 'true' },
        el('span', {}, '0%'),
        el('span', { style: `left:${pos(m.corte_medio)}` }, fmt.pct(m.corte_medio)),
        el('span', { style: `left:${pos(m.limiar_alerta)}` }, `${fmt.pct(m.limiar_alerta, 0)} alerta`),
        el('span', { style: 'left:100%' }, '100%'))));
}

function desenharHistorico(c, cor) {
  const datas = dados.semanas.map((s) => s.semana_inicio);
  ui.graficos.historico.setOption({
    ...base(`Faturamento semanal do cliente ${c.id}`,
      `Linha do faturamento semanal do cliente ${c.id}, semanas 1 a 101; ${c.historico_semanal.filter((v) => v > 0).length} semanas com compra. Os valores estão na tabela.`),
    grid: { left: 4, right: 12, top: 10, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, formatter: (p) => `Semana de ${fmt.data(datas[p[0].dataIndex])}<br>${fmt.usd(p[0].value)}` },
    xAxis: { type: 'category', boundaryGap: false, data: datas.map(fmt.dataCurta), axisLabel: { color: COR.textoMudo, fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', splitNumber: 3, axisLabel: { color: COR.textoMudo, fontSize: 11, formatter: (v) => fmt.usdGrande(v) } },
    series: [{ name: 'Faturamento', type: 'line', data: c.historico_semanal, symbol: 'none', lineStyle: { color: cor, width: 1.5 }, itemStyle: { color: cor } }],
  }, { notMerge: true });
  preencherTabela(ui.historico.tabela, [
    { titulo: 'Semana de', valor: (i) => fmt.data(datas[i]) },
    { titulo: 'Faturamento', valor: (i) => fmt.usd(c.historico_semanal[i]), numero: true },
  ], [...c.historico_semanal.keys()], `Faturamento semanal do cliente ${c.id}`);
}

function desenharDeptos(c, cor) {
  const top = c.top_departamentos;
  ui.graficos.deptos.setOption({
    ...base(`Top 5 departamentos do cliente ${c.id}`,
      `Departamentos com maior gasto do cliente ${c.id}: ${top.map((d) => `${d.departamento} ${fmt.pct(d.gasto_pct, 0)}`).join('; ')}.`),
    grid: { left: 4, right: 48, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => `${top[p.dataIndex].departamento}<br>${fmt.pct(top[p.dataIndex].gasto_pct)} do gasto do cliente` },
    xAxis: { type: 'value', max: 1, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', inverse: true, data: top.map((d) => d.departamento), axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false } },
    series: [{ type: 'bar', barMaxWidth: 14, data: top.map((d) => d.gasto_pct), itemStyle: { color: cor, borderRadius: [0, 4, 4, 0] },
               label: { show: true, position: 'right', color: COR.textoSecundario, fontSize: 11, formatter: (p) => fmt.pct(p.value, 0) } }],
  }, { notMerge: true });
  preencherTabela(ui.deptos.tabela, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: '% do gasto', valor: (d) => fmt.pct(d.gasto_pct), numero: true },
  ], top, `Top 5 departamentos do cliente ${c.id}`);
}

function desenharContexto(c, media, cor) {
  ui.contexto.replaceChildren(
    el('h2', { class: 'painel__titulo', id: 'fc-contexto-titulo' }, `Comparado à média dos ${c.segmento}`),
    el('p', { class: 'painel__subtitulo' }, 'Percentil de 0 a 100 entre todos os clientes. O ponto é o cliente; o traço, a média do segmento.'),
    el('ul', { class: 'contexto' }, ATRIBUTOS.map((a) => {
      const p = c.atributos[a.chave].percentil;
      const pm = media[a.chave].percentil_medio;
      const comparacao = p === null || pm === null ? 'sem comparação'
        : Math.abs(p - pm) < 5 ? 'na média do segmento' : p > pm ? '▲ acima da média do segmento' : '▼ abaixo da média do segmento';
      return el('li', { class: 'contexto__item' },
        el('div', { class: 'contexto__linha' },
          el('span', { class: 'contexto__nome', title: a.nota || null }, a.nome),
          el('span', { class: 'contexto__valor' }, a.valor(c.atributos[a.chave].valor))),
        el('div', { class: 'contexto__trilho', role: 'img',
                    'aria-label': `${a.nome}: percentil ${fmt.decimal(p, 0)} do cliente contra ${fmt.decimal(pm, 0)} da média do segmento` },
          pm === null ? null : el('span', { class: 'contexto__media', style: `left:${pm}%` }),
          p === null ? null : el('span', { class: 'contexto__ponto', style: `left:${p}%;background:${cor}` })),
        el('p', { class: 'contexto__nota' }, `${comparacao} · média ${a.media(media[a.chave].valor_medio)}`));
    })));
}
