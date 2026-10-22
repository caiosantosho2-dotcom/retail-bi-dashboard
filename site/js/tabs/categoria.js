// Aba Ficha da Categoria (spec 5.2): o departamento no centro, na janela de 26 semanas da segmentação.
// Lista (esquerda) → card da categoria (centro) → comparação com todos os clientes, top 10 subcategorias e dinheiro em
// risco (direita). Responde aos filtros de segmento e departamento; o de período não se aplica.
import { SEGMENTOS, chaveSubconjunto, serieSemanal } from '../agregados.js';
import { COR, SEG_CORES, base, criarGrafico } from '../charts/tema.js';
import { avisoAmostra, el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { aplicarCliqueGrafico, avisar } from '../filtros.js';
import { fmt } from '../formatar.js';

const OPACIDADE_FORA = 0.35;
const TOP_CESTA = 5;
const ATRIBUTOS = [
  { chave: 'participacao', nome: 'Participação no faturamento', curto: 'Participação', formato: (v) => fmt.pct(v) },
  { chave: 'crescimento', nome: 'Crescimento (lojas comparáveis)', curto: 'Crescimento', formato: (v) => fmt.variacao(v) },
  { chave: 'penetracao', nome: 'Penetração', curto: 'Penetração', formato: (v) => fmt.pct(v),
    dica: 'Definição do chat: % dos clientes com compra no período que compraram o departamento, nas lojas comparáveis.' },
  { chave: 'frequencia', nome: 'Frequência (cestas por cliente)', curto: 'Frequência', formato: (v) => fmt.decimal(v, 1) },
  { chave: 'desconto', nome: '% de desconto', curto: 'Desconto', formato: (v) => fmt.pct(v) },
  { chave: 'marca_propria', nome: '% de marca própria', curto: 'Marca própria', formato: (v) => fmt.pct(v) },
];
const ORDENS = [
  { chave: 'faturamento', rotulo: 'Faturamento' },
  { chave: 'crescimento', rotulo: 'Crescimento' },
  { chave: 'desconto', rotulo: '% desconto' },
];

let estado;
let dados;
let blocos;
let ordem = 'faturamento';

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  container.classList.add('ct');

  // Esquerda: lista com busca e ordem.
  const busca = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar departamento', 'aria-label': 'Buscar departamento',
                              autocomplete: 'off', oninput: () => desenharLista() });
  const ordens = el('div', { class: 'ct-ordem', role: 'group', 'aria-label': 'Ordenar por' },
    el('span', { class: 'filtros__rotulo' }, 'Ordenar'),
    ORDENS.map((o) => el('button', { class: 'botao', type: 'button', 'aria-pressed': String(o.chave === ordem), dataset: { ordem: o.chave },
                                     onclick: () => { ordem = o.chave; desenharLista(); } }, o.rotulo)));
  const lista = el('ul', { class: 'lista-itens', 'aria-label': 'Departamentos' });
  const colunaLista = el('section', { class: 'painel ct-lista', 'aria-labelledby': 'ct-lista-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-lista-titulo' }, 'Departamentos'),
    el('p', { class: 'painel__subtitulo' }, '26 semanas. Clique para abrir a ficha (vira o filtro de departamento).'),
    busca, ordens, lista);

  // Centro: cabeçalho + quem compra, radar com tabela, semanal por segmento, compra junto com.
  const cabecalho = el('section', { class: 'painel ct-cabecalho', 'aria-live': 'polite' });
  const quemCompra = el('div', { class: 'ct-quem-compra' });
  const radar = el('section', { class: 'painel ct-radar', 'aria-labelledby': 'ct-radar-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-radar-titulo' }, 'Perfil entre os departamentos'),
    el('p', { class: 'painel__subtitulo' }, 'Percentil de 0 a 100 entre os 26 departamentos, todos os clientes. Os valores reais estão na tabela "Valores reais e comparação".'),
    el('div', { class: 'ct-radar__grafico' }));
  const semanal = painelGrafico({ titulo: 'Faturamento semanal, últimas 52 semanas', subtitulo: '', classe: 'ct-semanal' });
  const subcategorias = painelGrafico({ titulo: 'Top 10 subcategorias', subtitulo: '26 semanas, todos os clientes, todas as lojas.', classe: 'ct-subcategorias' });
  const centro = el('div', { class: 'ct-centro' }, cabecalho,
    el('div', { class: 'ct-linha' }, subcategorias.painel, radar), semanal.painel);

  // Direita: valores reais do radar e a comparação, compra junto com. O dinheiro em risco fica embaixo da lista.
  const comparacao = el('section', { class: 'painel ct-comparacao', 'aria-labelledby': 'ct-comp-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-comp-titulo' }, 'Valores reais e comparação'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('div', { class: 'ct-comparacao__tabela' }));
  const cesta = el('section', { class: 'painel ct-cesta', 'aria-labelledby': 'ct-cesta-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-cesta-titulo' }, 'Compra junto com'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('div', { class: 'ct-cesta__colunas' }, el('div', { class: 'ct-cesta__deps' }), el('div', { class: 'ct-cesta__subs' })));
  const risco = el('section', { class: 'painel ct-risco', 'aria-labelledby': 'ct-risco-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-risco-titulo' }, 'Dinheiro em risco'), el('div', { class: 'ct-risco__corpo' }));
  const direita = el('div', { class: 'ct-direita' }, comparacao, cesta);
  const esquerda = el('div', { class: 'ct-esquerda' }, colunaLista, risco);

  container.replaceChildren(esquerda, centro, direita);

  blocos = {
    busca, ordens, lista, cabecalho, quemCompra, radar, semanal, cesta, comparacao, subcategorias, risco,
    graficos: {
      quemCompra: null,
      radar: criarGrafico(radar.querySelector('.ct-radar__grafico')),
      semanal: criarGrafico(semanal.grafico),
      subcategorias: criarGrafico(subcategorias.grafico),
    },
  };
  for (const nome of ['semanal', 'subcategorias']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }

  try {
    const [ficha, porSegmento, subs, pares, paresSub, cubo, cuboPeriodo, manifest] = await Promise.all([
      linhas('departamentos_ficha.json'), linhas('departamentos_segmento.json'), linhas('subcategorias.json'),
      linhas('cesta_departamentos.json'), linhas('cesta_subcategorias.json'), linhas('cubo_faturamento.json'),
      linhas('cubo_periodo.json'), carregar('manifest.json')]);
    dados = { ficha, porSegmento, subs, pares, paresSub, cubo, cuboPeriodo, manifest,
              foco: new Set(manifest.departamentos_10pct.map((d) => d.departamento)) };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  // "Quem compra" é uma barra fina: o gráfico é criado agora, já com o espaço medido.
  const grafico = el('div', { class: 'ct-quem-compra__grafico' });
  quemCompra.replaceChildren(el('p', { class: 'ct-rotulo' }, 'Quem compra (faturamento por segmento)'), grafico);
  blocos.graficos.quemCompra = criarGrafico(grafico);
  blocos.graficos.quemCompra.on('click', (p) => {
    const e = p.event?.event;
    aplicarCliqueGrafico('segmentos', p.seriesName, Boolean(e?.ctrlKey || e?.metaKey));
  });
}

export function atualizar() {
  if (!dados) return;
  const dep = departamentoAtual();
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  // Os gráficos medem o espaço antes de desenhar (a lista e as tabelas podem ter mudado a altura).
  Object.values(blocos.graficos).forEach((g) => g?.resize());
  desenharLista(dep);
  blocos.cabecalho.closest('.ct').classList.toggle('ct--vazio', !dep);
  if (!dep) {
    blocos.cabecalho.replaceChildren(el('p', { class: 'painel__vazio' },
      'Os departamentos filtrados não tiveram venda nas 26 semanas. Escolha outro na lista ou limpe o filtro.'));
    return;
  }
  const ficha = dados.ficha.find((d) => d.departamento === dep);
  const seg = dados.porSegmento.find((d) => d.subconjunto === sub && d.departamento === dep) ?? null;
  const todos = dados.porSegmento.find((d) => d.subconjunto === 'todos' && d.departamento === dep);
  desenharCabecalho(ficha, seg, sub);
  desenharQuemCompra(dep);
  desenharRadar(ficha);
  desenharSemanal(dep);
  desenharCesta(dep, sub);
  desenharComparacao(ficha, seg, todos, sub);
  desenharSubcategorias(dep);
  desenharRisco(seg, sub);
}

// --------------------------------------------------------------------------- qual departamento e a lista

/** Sem filtro: o maior (GROCERY). Com um: ele. Com vários: o maior deles. Null se o filtrado não vendeu nas 26 semanas. */
function departamentoAtual() {
  const filtro = estado.filtros.departamentos;
  if (!filtro.size) return dados.ficha[0].departamento;
  return dados.ficha.find((d) => filtro.has(d.departamento))?.departamento ?? null;
}

function desenharLista(atual = departamentoAtual()) {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const termo = blocos.busca.value.trim().toLowerCase();
  const filtro = estado.filtros.departamentos;
  const valores = new Map(dados.porSegmento.filter((d) => d.subconjunto === sub).map((d) => [d.departamento, d]));
  const chave = { faturamento: (d) => d?.faturamento, crescimento: (d) => d?.atributos.crescimento.valor, desconto: (d) => d?.atributos.desconto.valor }[ordem];
  const itens = dados.ficha
    .filter((f) => f.departamento.toLowerCase().includes(termo))
    .map((f) => ({ f, d: valores.get(f.departamento) }))
    .sort((a, b) => (a.f.amostra_pequena - b.f.amostra_pequena) || ((chave(b.d) ?? -Infinity) - (chave(a.d) ?? -Infinity))
      || a.f.departamento.localeCompare(b.f.departamento));
  blocos.ordens.querySelectorAll('[data-ordem]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ordem === ordem)));
  blocos.lista.replaceChildren(...itens.map(({ f, d }) => {
    const variacao = d?.atributos.crescimento.valor;
    return el('li', {},
      el('button', {
        class: 'item-lista', type: 'button', 'aria-current': f.departamento === atual ? 'true' : null,
        onclick: () => { filtro.clear(); filtro.add(f.departamento); avisar(); },
      },
      el('span', { class: 'item-lista__nome' }, f.amostra_pequena ? '⚠ ' : '', f.departamento,
        filtro.has(f.departamento) && f.departamento !== atual ? el('span', { class: 'item-lista__marca' }, ' · no filtro') : null),
      el('span', { class: 'item-lista__valor' },
        ordem === 'desconto' ? fmt.pct(d?.atributos.desconto.valor) : fmt.usdGrande(d?.faturamento),
        el('span', { class: 'item-lista__variacao' }, variacao === null || variacao === undefined ? '' : ` ${fmt.variacao(variacao)}`))));
  }));
  if (!itens.length) blocos.lista.replaceChildren(el('li', { class: 'painel__vazio' }, 'Nenhum departamento com essa busca.'));
}

// --------------------------------------------------------------------------- cabeçalho e quem compra

function nomeSubconjunto(sub) {
  return sub === 'todos' ? 'todos os clientes' : sub.split('+').join(', ');
}

function desenharCabecalho(ficha, seg, sub) {
  const valor = seg ?? null;
  const cresc = valor?.atributos.crescimento.valor;
  const tom = cresc === null || cresc === undefined ? 'neutro' : cresc >= 0 ? 'bom' : 'critico';
  const quem = blocos.quemCompra;
  blocos.cabecalho.replaceChildren(...[
    el('div', { class: 'ct-cabecalho__linha' },
      el('h2', { class: 'ct-cabecalho__titulo' }, ficha.departamento),
      ficha.amostra_pequena ? avisoAmostra(`${fmt.contagem(ficha.compradores)} clientes`) : null,
      el('span', { class: 'ct-cabecalho__nota' }, `26 semanas · ${nomeSubconjunto(sub)}`)),
    el('div', { class: 'ct-cabecalho__corpo' },
    el('dl', { class: 'ct-numeros' },
      el('div', {}, el('dt', {}, 'Faturamento'), el('dd', { title: fmt.usd(valor?.faturamento) }, fmt.usdGrande(valor?.faturamento))),
      el('div', {}, el('dt', {}, 'Participação'), el('dd', {}, fmt.pct(valor?.atributos.participacao.valor))),
      el('div', {}, el('dt', {}, 'vs ano anterior'),
        el('dd', {}, el('span', { class: `variacao variacao--${tom}` }, fmt.variacao(cresc)),
          el('span', { class: 'kpi__nota' }, 'lojas comparáveis'))),
      el('div', {}, el('dt', {}, 'Clientes'), el('dd', {}, fmt.contagem(valor?.compradores)))),
    quem),
    sub !== 'todos' && seg?.amostra_pequena && !ficha.amostra_pequena
      ? el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: ${fmt.contagem(seg.compradores)} clientes dos segmentos selecionados compraram`) : null,
    !seg ? el('p', { class: 'painel__vazio' }, 'Os segmentos selecionados não compraram este departamento nas 26 semanas.') : null,
  ].filter(Boolean));
}

function desenharQuemCompra(dep) {
  const linhasDep = dados.cuboPeriodo.filter((l) => l.periodo === '26s' && l.departamento === dep);
  const total = linhasDep.reduce((a, l) => a + l.faturamento, 0);
  const partes = SEGMENTOS.map((s) => ({ segmento: s, faturamento: linhasDep.filter((l) => l.grupo === s).reduce((a, l) => a + l.faturamento, 0) }));
  partes.forEach((p) => { p.pct = total ? p.faturamento / total : 0; });
  const selecionados = estado.filtros.segmentos;
  const fora = (s) => selecionados.size > 0 && !selecionados.has(s);
  blocos.graficos.quemCompra.setOption({
    ...base(`Quem compra ${dep}`, `Divisão do faturamento de ${dep} nas 26 semanas entre os segmentos: `
      + partes.map((p) => `${p.segmento} ${fmt.pct(p.pct)}`).join('; ') + '.'),
    grid: { left: 0, right: 0, top: 0, height: 16 },
    legend: { top: 22, left: 0, itemGap: 10, data: SEGMENTOS, selectedMode: false,
              formatter: (nome) => `${nome} ${fmt.pct(partes.find((p) => p.segmento === nome).pct, 0)}` },
    tooltip: { trigger: 'item', formatter: (p) => `${p.seriesName}: ${fmt.usd(partes[p.seriesIndex].faturamento)} · ${fmt.pct(partes[p.seriesIndex].pct)} do departamento`
      + '<br>Clique para filtrar o segmento; Ctrl + clique soma' },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: { type: 'category', data: [dep], show: false },
    series: partes.map((p, i) => ({
      name: p.segmento, type: 'bar', stack: 'total', barWidth: 16, cursor: 'pointer',
      data: [p.pct],
      itemStyle: { color: SEG_CORES[p.segmento], opacity: fora(p.segmento) ? OPACIDADE_FORA : 1,
                   borderColor: COR.superficie, borderWidth: 1,
                   borderRadius: i === 0 ? [4, 0, 0, 4] : i === partes.length - 1 ? [0, 4, 4, 0] : 0 },
      label: { show: p.pct >= 0.08, position: 'inside', color: COR.textoPrimario, fontSize: 11, formatter: () => fmt.pct(p.pct, 0) },
    })),
  }, { notMerge: true });
}

// --------------------------------------------------------------------------- radar com a tabela

function desenharRadar(ficha) {
  const a = ficha.atributos;
  blocos.graficos.radar.setOption({
    ...base(`Perfil de ${ficha.departamento} entre os departamentos`, `Radar de ${ficha.departamento} em percentil entre os departamentos: `
      + ATRIBUTOS.map((x) => `${x.curto} ${fmt.decimal(a[x.chave].percentil, 0)}`).join('; ') + '. Os valores reais estão na tabela "Valores reais e comparação".'),
    radar: {
      indicator: ATRIBUTOS.map((x) => ({ name: x.curto, max: 100, min: 0 })),
      // Em tela estreita os nomes dos eixos precisam de mais margem.
      center: ['50%', '52%'], radius: blocos.radar.clientWidth < 420 ? '52%' : '66%', splitNumber: 4,
      axisName: { color: COR.textoSecundario, fontSize: 11 },
      splitLine: { lineStyle: { color: COR.grade } }, splitArea: { show: false }, axisLine: { lineStyle: { color: COR.grade } },
    },
    tooltip: { trigger: 'item', formatter: () => ATRIBUTOS.map((x) => `${x.curto}: percentil ${fmt.decimal(a[x.chave].percentil, 0)}`).join('<br>') },
    series: [{
      type: 'radar', name: ficha.departamento, symbolSize: 6,
      data: [{ value: ATRIBUTOS.map((x) => a[x.chave].percentil ?? 0), name: ficha.departamento }],
      lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie }, areaStyle: { color: COR.serie, opacity: 0.18 },
    }],
  }, { notMerge: true });
}

// --------------------------------------------------------------------------- semanal por segmento

function desenharSemanal(dep) {
  const selecionados = SEGMENTOS.filter((s) => estado.filtros.segmentos.has(s));
  const filtro = { segmentos: estado.filtros.segmentos, departamentos: new Set([dep]) };
  const semanas = serieSemanal(dados.cubo, filtro, { porGrupo: true });
  const rotulos = semanas.map((s) => fmt.dataCurta(s.semana_inicio));
  const titulo = `Faturamento semanal de ${dep}, últimas 52 semanas`;
  const sub = blocos.semanal.painel.querySelector('.painel__subtitulo') ?? el('p', { class: 'painel__subtitulo' });
  blocos.semanal.painel.querySelector('.painel__titulo').after(sub);
  const tooltip = { trigger: 'axis', axisPointer: { type: 'line' },
                    valueFormatter: (v) => fmt.usd(v) };
  let opcao;
  if (selecionados.length === SEGMENTOS.length) {
    // Os 4 segmentos: pequenos múltiplos lado a lado, no mesmo eixo Y (spec 5.2; regra da paleta, seção 7).
    sub.textContent = 'Lojas comparáveis da janela de 26 semanas. Os 4 segmentos em gráficos separados, na mesma escala.';
    // Mesmo eixo Y nos 4: o máximo arredondado para cima (1, 2 ou 5 × 10^n), para os rótulos ficarem redondos.
    const bruto = Math.max(...semanas.flatMap((s) => SEGMENTOS.map((g) => s.grupos[g] ?? 0)));
    const escala = 10 ** Math.floor(Math.log10(bruto || 1));
    const maximo = [1, 2, 5, 10].map((m) => m * escala).find((m) => m >= bruto);
    const largura = 100 / SEGMENTOS.length;
    opcao = {
      title: SEGMENTOS.map((g, i) => ({ text: g, left: `${i * largura + 1}%`, top: 0, textStyle: { fontSize: 11, color: COR.textoSecundario, fontWeight: 600 } })),
      grid: SEGMENTOS.map((_, i) => ({ left: `${i * largura + 1}%`, width: `${largura - 3}%`, top: 30, bottom: 20, containLabel: true })),
      xAxis: SEGMENTOS.map((_, i) => ({ type: 'category', gridIndex: i, data: rotulos, boundaryGap: false,
                                        axisLabel: { color: COR.textoMudo, fontSize: 11, interval: (n) => n % 26 === 0 } })),
      yAxis: SEGMENTOS.map((_, i) => ({ type: 'value', gridIndex: i, max: maximo, axisLabel: { show: i === 0, color: COR.textoMudo, fontSize: 11, formatter: fmt.usdGrande } })),
      series: SEGMENTOS.map((g, i) => ({ name: g, type: 'line', xAxisIndex: i, yAxisIndex: i, symbol: 'none',
                                         data: semanas.map((s) => s.grupos[g] ?? 0), lineStyle: { color: SEG_CORES[g], width: 2 }, itemStyle: { color: SEG_CORES[g] } })),
      tooltip,
    };
  } else {
    const series = selecionados.length
      ? selecionados.map((g) => ({ nome: g, cor: SEG_CORES[g], dados: semanas.map((s) => s.grupos[g] ?? 0) }))
      : [{ nome: 'Todos os clientes', cor: COR.serie, dados: semanas.map((s) => s.faturamento) }];
    sub.textContent = selecionados.length
      ? 'Lojas comparáveis da janela de 26 semanas. Uma linha por segmento selecionado.'
      : 'Lojas comparáveis da janela de 26 semanas. Selecione segmentos no filtro para ver uma linha por segmento.';
    opcao = {
      grid: { left: 8, right: 96, top: 24, bottom: 8, containLabel: true },
      legend: series.length > 1 ? { top: 0, right: 0, data: series.map((x) => x.nome) } : undefined,
      xAxis: { type: 'category', boundaryGap: false, data: rotulos, axisLabel: { color: COR.textoMudo, fontSize: 11, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { color: COR.textoMudo, fontSize: 11, formatter: fmt.usdGrande } },
      series: series.map((x) => ({ name: x.nome, type: 'line', symbol: 'none', data: x.dados,
                                   lineStyle: { color: x.cor, width: 2 }, itemStyle: { color: x.cor },
                                   endLabel: { show: true, color: COR.textoSecundario, fontSize: 11, formatter: (p) => `${x.nome === 'Todos os clientes' ? '' : `${x.nome} `}${fmt.usdGrande(p.value)}` } })),
      tooltip,
    };
  }
  const nomes = selecionados.length ? selecionados : ['Todos os clientes'];
  blocos.graficos.semanal.setOption({
    ...base(titulo, `${titulo}, ${nomes.join(', ')}. Os valores de cada semana estão na tabela.`), ...opcao,
  }, { notMerge: true });
  preencherTabela(blocos.semanal.tabela, [
    { titulo: 'Semana de', valor: (s) => fmt.data(s.semana_inicio) },
    ...nomes.map((g) => ({ titulo: g, valor: (s) => fmt.usd(g === 'Todos os clientes' ? s.faturamento : s.grupos[g] ?? 0), numero: true })),
  ], semanas, titulo);
}

// --------------------------------------------------------------------------- compra junto com

/** Pares do departamento (lado a ou b), sem amostra pequena, por lift decrescente. */
function paresDe(lista, dep, campoA, campoB, sub) {
  return lista.filter((p) => p.subconjunto === sub && (p[campoA] === dep || p[campoB] === dep))
    .map((p) => {
      const a = p[campoA] === dep;
      return { ...p, outro: a ? p[campoB] : p[campoA], confianca: a ? p.confianca_a_b : p.confianca_b_a };
    })
    .sort((x, y) => y.lift - x.lift);
}

function desenharCesta(dep, sub) {
  const minimo = dados.manifest.parametros_cesta.minimo_cestas_par;
  blocos.cesta.querySelector('.painel__subtitulo').textContent =
    `Lift: 1 = acaso · pares com ${minimo}+ cestas`;
  const deps = paresDe(dados.pares, dep, 'departamento_a', 'departamento_b', sub);
  const validos = deps.filter((p) => !p.amostra_pequena).slice(0, TOP_CESTA);
  const colunaDeps = blocos.cesta.querySelector('.ct-cesta__deps');
  colunaDeps.replaceChildren(...[el('p', { class: 'ct-rotulo' }, 'Departamentos'), listaPares(validos, (p) => p.outro, (p) => `${fmt.pct(p.confianca, 0)} das cestas com ${dep} têm ${p.outro}`, true),
    validos.length > 0 && validos.length < TOP_CESTA ? el('p', { class: 'aviso-amostra' }, `⚠ só ${validos.length} pares com ${minimo} cestas ou mais`) : null].filter(Boolean));

  const colunaSubs = blocos.cesta.querySelector('.ct-cesta__subs');
  if (!dados.foco.has(dep)) {
    colunaSubs.replaceChildren(el('p', { class: 'ct-rotulo' }, 'Subcategorias'),
      el('p', { class: 'painel__vazio' }, `Pares de subcategorias só nos departamentos com 10% ou mais do faturamento (${[...dados.foco].join(' e ')}).`));
    return;
  }
  const subs = dados.paresSub.filter((p) => p.subconjunto === sub && p.departamento === dep && !p.amostra_pequena)
    .sort((x, y) => y.lift - x.lift).slice(0, TOP_CESTA);
  colunaSubs.replaceChildren(...[el('p', { class: 'ct-rotulo' }, `Subcategorias dentro de ${dep}`),
    listaPares(subs, (p) => `${p.subcategoria_a} + ${p.subcategoria_b}`, (p) => `${fmt.contagem(p.cestas_par)} cestas com os dois`, false),
    subs.length > 0 && subs.length < TOP_CESTA ? el('p', { class: 'aviso-amostra' }, `⚠ só ${subs.length} pares com ${minimo} cestas ou mais`) : null].filter(Boolean));
}

function listaPares(pares, nome, detalhe, clicavel) {
  if (!pares.length) {
    return el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: nenhum par com ${dados.manifest.parametros_cesta.minimo_cestas_par} cestas ou mais neste recorte`);
  }
  return el('ol', { class: 'pares' }, pares.map((p) => {
    const conteudo = [
      el('span', { class: 'pares__nome' }, nome(p)),
      el('span', { class: 'pares__lift' }, `lift ${fmt.decimal(p.lift, 2)}`),
    ];
    const dica = `${nome(p)}: lift ${fmt.decimal(p.lift, 2)}; ${detalhe(p)}`;
    return el('li', {}, clicavel
      ? el('button', { class: 'pares__item', type: 'button', title: `${dica}. Clique para abrir ${p.outro}.`,
                       onclick: () => { estado.filtros.departamentos.clear(); estado.filtros.departamentos.add(p.outro); avisar(); } }, conteudo)
      : el('div', { class: 'pares__item', title: dica }, conteudo));
  }));
}

// --------------------------------------------------------------------------- direita: comparação, subcategorias, risco

function desenharComparacao(ficha, seg, todos, sub) {
  blocos.comparacao.querySelector('.painel__subtitulo').textContent = sub === 'todos'
    ? 'Valor e percentil (todos). Ligue segmentos para comparar.'
    : 'Selecionados × todos os clientes. Índice 100 = igual.';
  const alvo = blocos.comparacao.querySelector('.ct-comparacao__tabela');
  const a = ficha.atributos;
  preencherTabela(alvo, [
    { titulo: 'Atributo', valor: (x) => el('span', { title: x.dica ? `${x.nome}. ${x.dica}` : x.nome }, x.curto, x.dica ? ' ⓘ' : '') },
    { titulo: 'Todos', valor: (x) => x.formato(todos.atributos[x.chave].valor), numero: true },
    { titulo: 'Pctl.', valor: (x) => fmt.decimal(a[x.chave].percentil, 0), numero: true },
    { titulo: 'Selec.', valor: (x) => (seg ? x.formato(seg.atributos[x.chave].valor) : '—'), numero: true },
    { titulo: 'Índice', valor: (x) => indice(seg?.atributos[x.chave].indice), numero: true },
  ], ATRIBUTOS, `Valores reais de ${ficha.departamento}, percentil e comparação com todos os clientes`);
  alvo.querySelector('.aviso-amostra')?.remove();
  if (sub !== 'todos' && seg?.amostra_pequena) alvo.append(el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: ${fmt.contagem(seg.compradores)} clientes`));
}

function indice(v) {
  if (v === null || v === undefined) return '—';
  const seta = v > 100.5 ? '▲ ' : v < 99.5 ? '▼ ' : '';
  return `${seta}${fmt.decimal(v, 0)}`;
}

function desenharSubcategorias(dep) {
  const linhasDep = dados.subs.filter((s) => s.departamento === dep);
  const titulo = `Top 10 subcategorias de ${dep}`;
  blocos.graficos.subcategorias.setOption({
    ...base(titulo, `${titulo}, 26 semanas: ` + linhasDep.map((s) => `${s.subcategoria} ${fmt.pct(s.participacao_pct, 0)}`).join('; ') + '.'),
    grid: { left: 4, right: 52, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => {
      const s = linhasDep[p.dataIndex];
      return `${s.subcategoria}<br>${fmt.usd(s.faturamento)} · ${fmt.pct(s.participacao_pct)} do departamento`;
    } },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: linhasDep.map((s) => s.subcategoria),
             axisLabel: { color: COR.textoSecundario, fontSize: 11, width: 130, overflow: 'truncate' }, axisLine: { show: false } },
    series: [{ type: 'bar', name: 'Faturamento', barMaxWidth: 12, barCategoryGap: '30%',
               data: linhasDep.map((s) => s.faturamento), itemStyle: { color: COR.serie, borderRadius: [0, 4, 4, 0] },
               label: { show: true, position: 'right', color: COR.textoSecundario, fontSize: 11, formatter: (p) => fmt.pct(linhasDep[p.dataIndex].participacao_pct, 0) } }],
  }, { notMerge: true });
  preencherTabela(blocos.subcategorias.tabela, [
    { titulo: 'Subcategoria', valor: (s) => s.subcategoria },
    { titulo: 'Faturamento', valor: (s) => fmt.usd(s.faturamento), numero: true },
    { titulo: '% do depto.', valor: (s) => fmt.pct(s.participacao_pct), numero: true },
  ], linhasDep, titulo);
}

function desenharRisco(seg, sub) {
  const corpo = blocos.risco.querySelector('.ct-risco__corpo');
  const soPausa = sub === 'Em pausa';
  corpo.replaceChildren(
    el('p', { class: 'ct-risco__valor' }, fmt.usdGrande(seg?.dinheiro_em_risco),
      el('span', { class: 'ct-risco__pct' }, seg?.dinheiro_em_risco_pct === null || seg?.dinheiro_em_risco_pct === undefined ? '' : ` · ${fmt.pct(seg.dinheiro_em_risco_pct)} do departamento`)),
    el('p', { class: 'painel__subtitulo' }, soPausa
      ? 'Em pausa fica fora do modelo de risco (sem compra nas últimas 8 semanas).'
      : `Faturamento de clientes na faixa ⚠ alta de risco de pausa, ${nomeSubconjunto(sub)}, 26 semanas. `,
      soPausa ? null : el('a', { class: 'insight__link', href: '#painel-segmentos', 'data-ir-para': 'painel-segmentos' }, 'ver lista de ação →')));
}
