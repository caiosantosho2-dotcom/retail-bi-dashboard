// Aba Categorias (spec 5.2, redesenho v3): como está cada departamento no período e o que se compra junto dentro dele.
// Lista (esquerda) → cabeçalho, faturamento semanal e "Compra junto com" (centro) → perfil entre os departamentos com a
// comparação e o top 10 de subcategorias (direita). Responde ao período, ao segmento e ao departamento; sem departamento
// selecionado, a ficha é "Todos os departamentos". O dinheiro em risco é fixo nas 26 semanas (o risco é uma foto).
import { SEGMENTOS, chaveSubconjunto, serieSemanal } from '../agregados.js';
import { COR, SEG_CORES, base, criarGrafico } from '../charts/tema.js';
import { avisoAmostra, el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA, clicar, ligarGrafico, ligarLista, limpar } from '../selecao.js';

const TODOS = 'todos';
const TOP_PARES = 10;
const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };
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
let fixos;            // arquivos que não dependem do período
let porPeriodo;       // os do período desenhado
let blocos;
let ordem = 'faturamento';
let pedido = 0;

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  container.classList.add('ct');

  // Esquerda: lista com busca e ordem, e o dinheiro em risco.
  const busca = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar departamento', 'aria-label': 'Buscar departamento',
                              autocomplete: 'off', oninput: () => desenharLista() });
  const ordens = el('div', { class: 'ct-ordem', role: 'group', 'aria-label': 'Ordenar por' },
    el('span', { class: 'filtros__rotulo' }, 'Ordenar'),
    ORDENS.map((o) => el('button', { class: 'botao', type: 'button', 'aria-pressed': String(o.chave === ordem), dataset: { ordem: o.chave },
                                     onclick: () => { ordem = o.chave; desenharLista(); } }, o.rotulo)));
  const lista = el('ul', { class: 'lista-itens', 'aria-label': 'Departamentos' });
  const colunaLista = el('section', { class: 'painel ct-lista', 'aria-labelledby': 'ct-lista-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-lista-titulo' }, 'Departamentos'),
    el('p', { class: 'painel__subtitulo' }, 'Clique para abrir a ficha (vira o filtro de departamento); clique de novo para voltar a todos.'),
    busca, ordens, lista);
  const risco = el('section', { class: 'painel ct-risco', 'aria-labelledby': 'ct-risco-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-risco-titulo' }, 'Dinheiro em risco'), el('div', { class: 'ct-risco__corpo' }));

  // Centro: cabeçalho com quem compra, faturamento semanal baixo e "Compra junto com".
  const cabecalho = el('section', { class: 'painel ct-cabecalho', 'aria-live': 'polite' });
  const quemCompra = el('div', { class: 'ct-quem-compra' });
  const semanal = painelGrafico({ titulo: 'Faturamento semanal, últimas 52 semanas', subtitulo: '', classe: 'ct-semanal' });
  const cesta = painelGrafico({ titulo: 'Compra junto com', subtitulo: '', classe: 'ct-cesta' });
  cesta.grafico.classList.add('ct-cesta__lista');

  // Direita: perfil (radar com a tabela dos valores reais e a comparação) e top 10 subcategorias.
  const perfil = el('section', { class: 'painel ct-perfil', 'aria-labelledby': 'ct-perfil-titulo' },
    el('h2', { class: 'painel__titulo', id: 'ct-perfil-titulo' }, 'Perfil entre os departamentos'),
    el('p', { class: 'painel__subtitulo ct-perfil__nota' }, ''),
    el('div', { class: 'ct-radar__grafico' }),
    el('div', { class: 'ct-comparacao__tabela' }));
  const subcategorias = painelGrafico({ titulo: 'Top 10 subcategorias', subtitulo: '', classe: 'ct-subcategorias' });

  container.replaceChildren(
    el('div', { class: 'ct-esquerda' }, colunaLista, risco),
    el('div', { class: 'ct-centro' }, cabecalho, semanal.painel, cesta.painel),
    el('div', { class: 'ct-direita' }, perfil, subcategorias.painel));

  blocos = {
    busca, ordens, lista, cabecalho, quemCompra, semanal, cesta, perfil, subcategorias, risco,
    graficos: { quemCompra: null, radar: criarGrafico(perfil.querySelector('.ct-radar__grafico')),
                semanal: criarGrafico(semanal.grafico), subcategorias: criarGrafico(subcategorias.grafico) },
  };
  for (const nome of ['semanal', 'subcategorias']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }
  ligarLista(lista, '.item-lista', 'departamentos');

  try {
    const [cubo, cuboPeriodo, risco_, manifest] = await Promise.all([
      linhas('cubo_faturamento.json'), linhas('cubo_periodo.json'), linhas('departamentos_risco.json'), carregar('manifest.json')]);
    fixos = { cubo, cuboPeriodo, risco: risco_, manifest };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
  // "Quem compra" é uma barra fina: o gráfico é criado agora, já com o espaço medido.
  const grafico = el('div', { class: 'ct-quem-compra__grafico' });
  quemCompra.replaceChildren(el('p', { class: 'ct-rotulo' }, 'Quem compra (faturamento por segmento)'), grafico);
  blocos.graficos.quemCompra = criarGrafico(grafico);
  blocos.graficos.quemCompra.on('click', (p) => clicar('segmentos', p.seriesName, p.event?.event));
  ligarGrafico(blocos.graficos.quemCompra, 'segmentos');
}

/** Os 4 arquivos do período (sob demanda: só os do período selecionado são baixados). */
async function carregarPeriodo(periodo) {
  const [ficha, porSegmento, subs, pares] = await Promise.all([
    linhas(`departamentos_ficha_${periodo}.json`), linhas(`departamentos_segmento_${periodo}.json`),
    linhas(`subcategorias_${periodo}.json`), linhas(`cesta_subcategorias_${periodo}.json`)]);
  return { periodo, ficha, porSegmento, subs, pares };
}

export async function atualizar() {
  if (!fixos) return;
  const meu = ++pedido;
  let dados;
  try {
    dados = await carregarPeriodo(estado.periodo);
  } catch (erro) {
    erroDeCarga(blocos.cabecalho, erro);
    return;
  }
  if (meu !== pedido) return;   // outro período chegou enquanto este carregava
  porPeriodo = dados;
  const dep = departamentoAtual();
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  // Os gráficos medem o espaço antes de desenhar (a lista e as tabelas podem ter mudado a altura).
  Object.values(blocos.graficos).forEach((g) => g?.resize());
  desenharLista(dep);
  blocos.cabecalho.closest('.ct').classList.toggle('ct--vazio', dep === null);
  blocos.cabecalho.closest('.ct').classList.toggle('ct--todos', dep === TODOS);
  if (dep === null) {
    blocos.cabecalho.replaceChildren(el('p', { class: 'painel__vazio' },
      `Os departamentos filtrados não tiveram venda em ${NOMES_PERIODO[estado.periodo]}. Escolha outro na lista ou limpe o filtro.`));
    return;
  }
  const chave = dep ?? TODOS;
  const seg = porPeriodo.porSegmento.find((d) => d.subconjunto === sub && d.departamento === chave) ?? null;
  const todos = porPeriodo.porSegmento.find((d) => d.subconjunto === 'todos' && d.departamento === chave);
  const ficha = dep === TODOS ? null : porPeriodo.ficha.find((d) => d.departamento === dep);
  desenharCabecalho(dep, ficha, seg, sub);
  desenharQuemCompra(dep);
  desenharSemanal(dep);
  desenharCesta(dep, sub);
  desenharPerfil(dep, ficha, seg, todos, sub);
  desenharSubcategorias(dep);
  desenharRisco(dep, sub);
  // As alturas dos blocos só assentam depois do texto novo: os gráficos medem o espaço de novo no quadro seguinte.
  requestAnimationFrame(() => Object.values(blocos.graficos).forEach((g) => g?.resize()));
}

// --------------------------------------------------------------------------- qual departamento e a lista

/** Sem filtro: 'todos'. Com um: ele. Com vários: o maior deles no período. Null se nenhum filtrado vendeu no período. */
function departamentoAtual() {
  const filtro = estado.filtros.departamentos;
  if (!filtro.size) return TODOS;
  return porPeriodo.ficha.find((d) => filtro.has(d.departamento))?.departamento ?? null;
}

const nomeDep = (dep) => (dep === TODOS ? 'Todos os departamentos' : dep);

function desenharLista(atual = departamentoAtual()) {
  if (!porPeriodo) return;
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const termo = blocos.busca.value.trim().toLowerCase();
  const filtro = estado.filtros.departamentos;
  const valores = new Map(porPeriodo.porSegmento.filter((d) => d.subconjunto === sub).map((d) => [d.departamento, d]));
  const chave = { faturamento: (d) => d?.faturamento, crescimento: (d) => d?.atributos.crescimento.valor, desconto: (d) => d?.atributos.desconto.valor }[ordem];
  const itens = porPeriodo.ficha
    .filter((f) => f.departamento.toLowerCase().includes(termo))
    .map((f) => ({ f, d: valores.get(f.departamento) }))
    .sort((a, b) => (a.f.amostra_pequena - b.f.amostra_pequena) || ((chave(b.d) ?? -Infinity) - (chave(a.d) ?? -Infinity))
      || a.f.departamento.localeCompare(b.f.departamento));
  blocos.ordens.querySelectorAll('[data-ordem]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ordem === ordem)));
  const valor = (d) => el('span', { class: 'item-lista__valor' },
    ordem === 'desconto' ? fmt.pct(d?.atributos.desconto.valor) : fmt.usdGrande(d?.faturamento),
    el('span', { class: 'item-lista__variacao' }, d?.atributos.crescimento.valor == null ? '' : ` ${fmt.variacao(d.atributos.crescimento.valor)}`));
  // "Todos os departamentos" no topo: é a ficha sem filtro, e clicar nele limpa o filtro de departamento.
  const todos = el('li', {}, el('button', {
    class: 'item-lista item-lista--todos', type: 'button', 'aria-current': atual === TODOS ? 'true' : null,
    onclick: () => limpar('departamentos') }, el('span', { class: 'item-lista__nome' }, 'Todos os departamentos'), valor(valores.get(TODOS))));
  blocos.lista.replaceChildren(...(termo ? [] : [todos]), ...itens.map(({ f, d }) => el('li', {},
    el('button', {
      class: 'item-lista', type: 'button', 'aria-current': f.departamento === atual ? 'true' : null,
      'data-fora': String(filtro.size > 0 && !filtro.has(f.departamento)),
      title: filtro.has(f.departamento) ? 'Clique de novo para voltar a todos; Ctrl + clique soma ou tira' : 'Clique para abrir; Ctrl + clique soma ao filtro',
      onclick: (e) => clicar('departamentos', f.departamento, e),
    },
    el('span', { class: 'item-lista__nome' }, f.amostra_pequena ? '⚠ ' : '', f.departamento,
      filtro.has(f.departamento) && f.departamento !== atual ? el('span', { class: 'item-lista__marca' }, ' · no filtro') : null),
    valor(d)))));
  if (!itens.length && termo) blocos.lista.replaceChildren(el('li', { class: 'painel__vazio' }, 'Nenhum departamento com essa busca.'));
}

// --------------------------------------------------------------------------- cabeçalho e quem compra

function nomeSubconjunto(sub) {
  return sub === 'todos' ? 'todos os clientes' : sub.split('+').join(', ');
}

function desenharCabecalho(dep, ficha, seg, sub) {
  const cresc = seg?.atributos.crescimento.valor;
  const tom = cresc === null || cresc === undefined ? 'neutro' : cresc >= 0 ? 'bom' : 'critico';
  const semAnterior = estado.periodo === 'base';
  blocos.cabecalho.replaceChildren(...[
    el('div', { class: 'ct-cabecalho__linha' },
      el('h2', { class: 'ct-cabecalho__titulo' }, nomeDep(dep)),
      ficha?.amostra_pequena ? avisoAmostra(`${fmt.contagem(ficha.compradores)} clientes`) : null,
      el('span', { class: 'ct-cabecalho__nota' }, `${NOMES_PERIODO[estado.periodo]} · ${nomeSubconjunto(sub)}`)),
    el('div', { class: 'ct-cabecalho__corpo' },
      el('dl', { class: 'ct-numeros' },
        el('div', {}, el('dt', {}, 'Faturamento'), el('dd', { title: fmt.usd(seg?.faturamento) }, fmt.usdGrande(seg?.faturamento))),
        dep === TODOS ? null : el('div', {}, el('dt', {}, 'Participação'), el('dd', {}, fmt.pct(seg?.atributos.participacao.valor))),
        el('div', {}, el('dt', {}, 'vs ano anterior'),
          el('dd', {}, semAnterior ? el('span', { class: 'kpi__nota' }, 'sem ano anterior') : el('span', { class: `variacao variacao--${tom}` }, fmt.variacao(cresc)),
            semAnterior ? null : el('span', { class: 'kpi__nota' }, 'lojas comparáveis'))),
        el('div', {}, el('dt', {}, 'Clientes'), el('dd', {}, fmt.contagem(seg?.compradores)))),
      blocos.quemCompra),
    sub !== 'todos' && seg?.amostra_pequena && !ficha?.amostra_pequena
      ? el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: ${fmt.contagem(seg.compradores)} clientes dos segmentos selecionados compraram`) : null,
    !seg ? el('p', { class: 'painel__vazio' }, 'Os segmentos selecionados não compraram neste recorte.') : null,
  ].filter(Boolean));
}

function desenharQuemCompra(dep) {
  blocos.graficos.quemCompra.resize();   // a barra mora no cabeçalho, que acabou de ser redesenhado
  const linhasDep = fixos.cuboPeriodo.filter((l) => l.periodo === estado.periodo && (dep === TODOS || l.departamento === dep));
  const total = linhasDep.reduce((a, l) => a + l.faturamento, 0);
  const partes = SEGMENTOS.map((s) => ({ segmento: s, faturamento: linhasDep.filter((l) => l.grupo === s).reduce((a, l) => a + l.faturamento, 0) }));
  partes.forEach((p) => { p.pct = total ? p.faturamento / total : 0; });
  const selecionados = estado.filtros.segmentos;
  const fora = (s) => selecionados.size > 0 && !selecionados.has(s);
  blocos.graficos.quemCompra.setOption({
    ...base(`Quem compra ${nomeDep(dep)}`, `Divisão do faturamento de ${nomeDep(dep)} (${NOMES_PERIODO[estado.periodo]}) entre os segmentos: `
      + partes.map((p) => `${p.segmento} ${fmt.pct(p.pct)}`).join('; ') + '.'),
    grid: { left: 0, right: 0, top: 0, height: 16 },
    legend: { top: 22, left: 0, itemGap: 10, data: SEGMENTOS, selectedMode: false,
              formatter: (nome) => `${nome} ${fmt.pct(partes.find((p) => p.segmento === nome).pct, 0)}` },
    tooltip: { trigger: 'item', formatter: (p) => `${p.seriesName}: ${fmt.usd(partes[p.seriesIndex].faturamento)} · ${fmt.pct(partes[p.seriesIndex].pct)} do faturamento`
      + (selecionados.has(p.seriesName) ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar o segmento; Ctrl + clique soma') },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: { type: 'category', data: [nomeDep(dep)], show: false },
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

// --------------------------------------------------------------------------- faturamento semanal (faixa baixa)

function desenharSemanal(dep) {
  // 52 semanas, uma linha só (os segmentos selecionados somados), com o período selecionado sombreado, como na Visão Geral.
  const filtro = { segmentos: estado.filtros.segmentos, departamentos: dep === TODOS ? new Set() : new Set([dep]) };
  const semanas = serieSemanal(fixos.cubo, filtro);
  const janela = fixos.manifest.janelas[estado.periodo];
  const inicio = semanas.find((s) => s.semana_inicio >= janela.data_ini) ?? semanas[0];
  const rotulos = semanas.map((s) => fmt.dataCurta(s.semana_inicio));
  const titulo = `Faturamento semanal de ${nomeDep(dep)}, últimas 52 semanas`;
  const sub = blocos.semanal.painel.querySelector('.painel__subtitulo') ?? el('p', { class: 'painel__subtitulo' });
  blocos.semanal.painel.querySelector('.painel__titulo').after(sub);
  sub.textContent = `Lojas comparáveis da janela de 26 semanas, ${nomeSubconjunto(chaveSubconjunto(estado.filtros.segmentos))}. `
    + (estado.periodo === 'base' ? 'A base inteira cobre todo o gráfico.' : `Sombreado: ${NOMES_PERIODO[estado.periodo]}.`);
  blocos.graficos.semanal.setOption({
    ...base(titulo, `${titulo}. Na última semana, ${fmt.usd(semanas.at(-1).faturamento)}. Os valores de cada semana estão na tabela.`),
    grid: { left: 8, right: 64, top: 6, bottom: 2, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, valueFormatter: (v) => fmt.usd(v) },
    xAxis: { type: 'category', boundaryGap: false, data: rotulos, axisLabel: { color: COR.textoMudo, fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', splitNumber: 2, axisLabel: { color: COR.textoMudo, fontSize: 11, formatter: fmt.usdGrande } },
    series: [{ name: 'Faturamento', type: 'line', symbol: 'none', data: semanas.map((s) => s.faturamento),
               lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie },
               endLabel: { show: true, color: COR.textoSecundario, fontSize: 11, formatter: (p) => fmt.usdGrande(p.value) },
               markArea: { silent: true, itemStyle: { color: COR.sombreado },
                           data: [[{ xAxis: fmt.dataCurta(inicio.semana_inicio) }, { xAxis: rotulos.at(-1) }]] } }],
  }, { notMerge: true });
  preencherTabela(blocos.semanal.tabela, [
    { titulo: 'Semana de', valor: (s) => fmt.data(s.semana_inicio) },
    { titulo: 'Faturamento', valor: (s) => fmt.usd(s.faturamento), numero: true },
  ], semanas, titulo);
}

// --------------------------------------------------------------------------- compra junto com

/** O par na direção de maior confiança: "quem compra A também leva B em X% das vezes". */
function frase(p) {
  const aParaB = p.confianca_a_b >= p.confianca_b_a;
  return { de: aParaB ? p.subcategoria_a : p.subcategoria_b, leva: aParaB ? p.subcategoria_b : p.subcategoria_a,
           confianca: Math.max(p.confianca_a_b, p.confianca_b_a) };
}

/** "11× mais que o normal" (o lift arredondado, com uma casa abaixo de 10). */
const vezes = (lift) => `${fmt.decimal(lift, lift < 10 ? 1 : 0)}× mais que o normal`;

function desenharCesta(dep, sub) {
  const minimo = fixos.manifest.parametros_cesta.minimo_cestas_par;
  const doRecorte = porPeriodo.pares.filter((p) => p.subconjunto === sub && (dep === TODOS || p.departamento === dep));
  const pares = [...doRecorte].sort((x, y) => y.lift - x.lift).slice(0, TOP_PARES);
  const curto = estado.periodo === '4s';
  blocos.cesta.painel.querySelector('.painel__subtitulo')?.remove();
  blocos.cesta.painel.querySelector('.painel__titulo').after(el('p', { class: 'painel__subtitulo' },
    `Os ${TOP_PARES} pares de subcategorias que mais vão juntos na mesma cesta ${dep === TODOS ? 'dentro de cada departamento' : `dentro de ${dep}`}, `
    + `${nomeSubconjunto(sub)}, ${NOMES_PERIODO[estado.periodo]}. Só pares com ${minimo}+ cestas.`,
    curto ? el('span', { class: 'aviso-amostra' }, ' ⚠ período curto: poucos pares confiáveis.') : null));
  const lista = blocos.cesta.grafico;
  if (!pares.length) {
    lista.replaceChildren(el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: nenhum par com ${minimo} cestas ou mais neste recorte`
      + `${dep === TODOS ? '' : ` (${dep})`}. Escolha outro período, segmento ou departamento.`));
  } else {
    lista.replaceChildren(el('ol', { class: 'ct-pares' }, pares.map((p) => {
      const f = frase(p);
      const tecnico = `lift ${fmt.decimal(p.lift, 2)} · confiança ${fmt.pct(f.confianca)} · ${fmt.contagem(p.cestas_par)} cestas com os dois · suporte ${fmt.pct(p.suporte, 2)}`;
      return el('li', { class: 'ct-par', title: tecnico },
        el('p', { class: 'ct-par__frase' }, 'Quem compra ', el('strong', {}, f.de), ' também leva ', el('strong', {}, f.leva),
          ` em ${fmt.pct(f.confianca, 0)} das vezes`),
        el('p', { class: 'ct-par__detalhe' }, el('span', { class: 'ct-par__vezes' }, vezes(p.lift)),
          dep === TODOS ? ` · ${p.departamento}` : '', ` · ${fmt.contagem(p.cestas_par)} cestas`));
    })));
  }
  preencherTabela(blocos.cesta.tabela, [
    { titulo: 'Subcategoria A', valor: (p) => p.subcategoria_a },
    { titulo: 'Subcategoria B', valor: (p) => p.subcategoria_b },
    ...(dep === TODOS ? [{ titulo: 'Departamento', valor: (p) => p.departamento }] : []),
    { titulo: 'Lift', valor: (p) => fmt.decimal(p.lift, 2), numero: true },
    { titulo: 'Conf. A→B', valor: (p) => fmt.pct(p.confianca_a_b), numero: true },
    { titulo: 'Conf. B→A', valor: (p) => fmt.pct(p.confianca_b_a), numero: true },
    { titulo: 'Cestas', valor: (p) => fmt.contagem(p.cestas_par), numero: true },
  ], pares, `Pares de subcategorias de ${nomeDep(dep)}`);
}

// --------------------------------------------------------------------------- direita: perfil e subcategorias

function indice(v) {
  if (v === null || v === undefined) return '—';
  const seta = v > 100.5 ? '▲ ' : v < 99.5 ? '▼ ' : '';
  return `${seta}${fmt.decimal(v, 0)}`;
}

function desenharPerfil(dep, ficha, seg, todos, sub) {
  const nota = blocos.perfil.querySelector('.ct-perfil__nota');
  const radar = blocos.perfil.querySelector('.ct-radar__grafico');
  radar.hidden = dep === TODOS;
  if (dep === TODOS) {
    nota.textContent = 'O perfil compara um departamento com os outros: escolha um na lista. A tabela compara os segmentos selecionados com todos os clientes.';
  } else {
    nota.textContent = `Percentil de 0 a 100 entre os ${fmt.contagem(porPeriodo.ficha.length)} departamentos do período, todos os clientes. `
      + (sub === 'todos' ? 'Ligue segmentos para comparar.' : 'Selecionados × todos os clientes: índice 100 = igual.');
    const a = ficha.atributos;
    blocos.graficos.radar.resize();
    blocos.graficos.radar.setOption({
      ...base(`Perfil de ${dep} entre os departamentos`, `Radar de ${dep} em percentil entre os departamentos: `
        + ATRIBUTOS.map((x) => `${x.curto} ${fmt.decimal(a[x.chave].percentil, 0)}`).join('; ') + '. Os valores reais estão na tabela logo abaixo.'),
      radar: {
        indicator: ATRIBUTOS.map((x) => ({ name: x.curto, max: 100, min: 0 })),
        center: ['50%', '53%'], radius: '58%', splitNumber: 4,
        axisName: { color: COR.textoSecundario, fontSize: 11 },
        splitLine: { lineStyle: { color: COR.grade } }, splitArea: { show: false }, axisLine: { lineStyle: { color: COR.grade } },
      },
      tooltip: { trigger: 'item', formatter: () => ATRIBUTOS.map((x) => `${x.curto}: percentil ${fmt.decimal(a[x.chave].percentil, 0)}`).join('<br>') },
      series: [{
        type: 'radar', name: dep, symbolSize: 6,
        data: [{ value: ATRIBUTOS.map((x) => a[x.chave].percentil ?? 0), name: dep }],
        lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie }, areaStyle: { color: COR.serie, opacity: 0.18 },
      }],
    }, { notMerge: true });
  }
  const alvo = blocos.perfil.querySelector('.ct-comparacao__tabela');
  const atributos = dep === TODOS ? ATRIBUTOS.filter((x) => x.chave !== 'participacao' && x.chave !== 'penetracao') : ATRIBUTOS;
  preencherTabela(alvo, [
    { titulo: 'Atributo', valor: (x) => el('span', { title: x.dica ? `${x.nome}. ${x.dica}` : x.nome }, x.curto, x.dica ? ' ⓘ' : '') },
    { titulo: 'Todos', valor: (x) => x.formato(todos?.atributos[x.chave].valor), numero: true },
    ...(dep === TODOS ? [] : [{ titulo: 'Pctl.', valor: (x) => fmt.decimal(ficha.atributos[x.chave].percentil, 0), numero: true }]),
    { titulo: 'Selec.', valor: (x) => (seg && sub !== 'todos' ? x.formato(seg.atributos[x.chave].valor) : '—'), numero: true },
    { titulo: 'Índice', valor: (x) => (sub === 'todos' ? '—' : indice(seg?.atributos[x.chave].indice)), numero: true },
  ], atributos, `Valores reais de ${nomeDep(dep)}${dep === TODOS ? '' : ', percentil'} e comparação com todos os clientes`);
  if (sub !== 'todos' && seg?.amostra_pequena) alvo.append(el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: ${fmt.contagem(seg.compradores)} clientes`));
}

function desenharSubcategorias(dep) {
  const linhasDep = porPeriodo.subs.filter((s) => s.departamento === dep);
  const nome = (s) => (dep === TODOS ? `${s.subcategoria} (${s.departamento_origem})` : s.subcategoria);
  const titulo = `Top 10 subcategorias de ${nomeDep(dep)}`;
  blocos.subcategorias.painel.querySelector('.painel__subtitulo')?.remove();
  blocos.subcategorias.painel.querySelector('.painel__titulo').after(el('p', { class: 'painel__subtitulo' },
    `${NOMES_PERIODO[estado.periodo]}, todos os clientes, todas as lojas; % do ${dep === TODOS ? 'faturamento total' : 'departamento'}.`));
  blocos.graficos.subcategorias.setOption({
    ...base(titulo, `${titulo}: ` + linhasDep.map((s) => `${nome(s)} ${fmt.pct(s.participacao_pct, 0)}`).join('; ') + '.'),
    grid: { left: 4, right: 40, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => {
      const s = linhasDep[p.dataIndex];
      return `${nome(s)}<br>${fmt.usd(s.faturamento)} · ${fmt.pct(s.participacao_pct)} do ${dep === TODOS ? 'total' : 'departamento'}`;
    } },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: linhasDep.map(nome),
             axisLabel: { color: COR.textoSecundario, fontSize: 11, width: 130, overflow: 'truncate' }, axisLine: { show: false } },
    series: [{ type: 'bar', name: 'Faturamento', barMaxWidth: 12, barCategoryGap: '30%',
               data: linhasDep.map((s) => s.faturamento), itemStyle: { color: COR.serie, borderRadius: [0, 4, 4, 0] },
               label: { show: true, position: 'right', color: COR.textoSecundario, fontSize: 11, formatter: (p) => fmt.pct(linhasDep[p.dataIndex].participacao_pct, 0) } }],
  }, { notMerge: true });
  preencherTabela(blocos.subcategorias.tabela, [
    { titulo: 'Subcategoria', valor: nome },
    { titulo: 'Faturamento', valor: (s) => fmt.usd(s.faturamento), numero: true },
    { titulo: '%', valor: (s) => fmt.pct(s.participacao_pct), numero: true },
  ], linhasDep, titulo);
}

function desenharRisco(dep, sub) {
  const corpo = blocos.risco.querySelector('.ct-risco__corpo');
  const r = fixos.risco.find((x) => x.subconjunto === sub && x.departamento === dep);
  const soPausa = sub === 'Em pausa';
  corpo.replaceChildren(
    el('p', { class: 'ct-risco__valor' }, fmt.usdGrande(r?.dinheiro_em_risco),
      el('span', { class: 'ct-risco__pct' }, r?.dinheiro_em_risco_pct == null ? '' : ` · ${fmt.pct(r.dinheiro_em_risco_pct)} do ${dep === TODOS ? 'total' : 'departamento'}`)),
    el('p', { class: 'painel__subtitulo' }, soPausa
      ? 'Em pausa fica fora do modelo de risco (sem compra nas últimas 8 semanas).'
      : `Faturamento de clientes na faixa ⚠ alta de risco de pausa, ${nomeSubconjunto(sub)}. Fixo nas 26 semanas: o risco é uma foto do momento. `,
      soPausa ? null : el('a', { class: 'insight__link', href: '#painel-clientes', 'data-ir-para': 'painel-clientes' }, 'ver valor em risco por loja →')));
}
