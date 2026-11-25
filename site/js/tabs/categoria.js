// Aba Categorias (spec 5.2, redesenho v3): como está cada departamento no período e o que se compra junto dentro dele.
// Lista (esquerda) → cabeçalho, faturamento ao longo do tempo e "Compra junto com" (centro) → perfil entre os departamentos com a
// comparação e o top 10 de subcategorias (direita). Responde ao período, ao segmento e ao departamento; sem departamento
// selecionado, a ficha é "Todos os departamentos". O dinheiro em risco é fixo nas 26 semanas (o risco é uma foto).
import { SEGMENTOS, chaveSubconjunto } from '../agregados.js';
import { COR, FONTE, SEG_CORES, base, criarGrafico, misturar, textoSobre } from '../charts/tema.js';
import { TITULO_TEMPO, carregarTempo, desenharTempo } from '../charts/tempo.js';
import { avisoAmostra, cabecalhoCard, controleSegmentado, definirEtiquetas, definirInfo, el, erroDeCarga, info, painelGrafico, preencherTabela, tabelaPares } from '../componentes.js';
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
    dica: '% dos clientes com compra no período que compraram o departamento, nas lojas comparáveis.' },
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
  // v4.3 (item 18): "Ordenar" é controle segmentado.
  const ordens = controleSegmentado('ct-ordem', 'Ordenar', ORDENS.map((o) => ({
    rotulo: o.rotulo, ligado: o.chave === ordem, dataset: { ordem: o.chave }, aoClicar: () => { ordem = o.chave; desenharLista(); } })));
  const lista = el('ul', { class: 'lista-itens', 'aria-label': 'Departamentos' });
  // v4.3 (item 15): sem o ⇄ e a legenda dele; quem tem pares de cesta está no ⓘ (redesenhado com o período e o segmento).
  const cabLista = cabecalhoCard({ id: 'ct-lista-titulo', titulo: 'Departamentos' });
  const colunaLista = el('section', { class: 'painel ct-lista', 'aria-labelledby': 'ct-lista-titulo' }, cabLista.cabecalho, busca, ordens, lista);
  const cabRisco = cabecalhoCard({ id: 'ct-risco-titulo', titulo: 'Dinheiro em risco' });
  const risco = el('section', { class: 'painel ct-risco', 'aria-labelledby': 'ct-risco-titulo' }, cabRisco.cabecalho, el('div', { class: 'ct-risco__corpo' }));

  // Centro: cabeçalho com quem compra, faturamento ao longo do tempo (baixo) e "Compra junto com".
  const cabecalho = el('section', { class: 'painel ct-cabecalho', 'aria-live': 'polite' });
  const quemCompra = el('div', { class: 'ct-quem-compra' });
  const semanal = painelGrafico({ titulo: TITULO_TEMPO, subtitulo: '', classe: 'ct-semanal' });
  // v4.3 (item 6): os pares viram uma tabela compacta, visível (sem gráfico nem botão Tabela).
  const cabCesta = cabecalhoCard({ id: 'ct-cesta-titulo', titulo: 'Compra junto com' });
  const corpoCesta = el('div', { class: 'ct-cesta__lista' });
  const cesta = { painel: el('section', { class: 'painel ct-cesta', 'aria-labelledby': 'ct-cesta-titulo' }, cabCesta.cabecalho, corpoCesta),
                  grafico: corpoCesta, subtitulo: cabCesta.subtitulo, etiquetas: cabCesta.etiquetas, info: cabCesta.info };

  // Direita: perfil (radar com a tabela dos valores reais e a comparação) e top 10 subcategorias.
  const cabPerfil = cabecalhoCard({ id: 'ct-perfil-titulo', titulo: 'Perfil entre os departamentos' });
  const perfil = el('section', { class: 'painel ct-perfil', 'aria-labelledby': 'ct-perfil-titulo' },
    cabPerfil.cabecalho,
    el('div', { class: 'ct-radar__grafico' }),
    el('div', { class: 'ct-comparacao__tabela' }));
  const subcategorias = painelGrafico({ titulo: 'Top 10 subcategorias', subtitulo: '', classe: 'ct-subcategorias' });

  container.replaceChildren(
    el('div', { class: 'ct-esquerda' }, colunaLista, risco),
    el('div', { class: 'ct-centro' }, cabecalho, semanal.painel, cesta.painel),
    el('div', { class: 'ct-direita' }, perfil, subcategorias.painel));

  blocos = {
    busca, ordens, lista, cabecalho, quemCompra, semanal, cesta, perfil, subcategorias, risco, cabRisco, cabPerfil, cabLista,
    graficos: { quemCompra: null, radar: criarGrafico(perfil.querySelector('.ct-radar__grafico')),
                semanal: criarGrafico(semanal.grafico), subcategorias: criarGrafico(subcategorias.grafico) },
  };
  for (const nome of ['semanal', 'subcategorias']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }
  ligarLista(lista, '.item-lista', 'departamentos');

  try {
    const [cuboPeriodo, risco_, manifest, kpisFiltrados, tempo] = await Promise.all([
      linhas('cubo_periodo.json'), linhas('departamentos_risco.json'), carregar('manifest.json'), linhas('kpis_filtrados.json'), carregarTempo()]);
    fixos = { cuboPeriodo, risco: risco_, manifest, kpisFiltrados, tempo };
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
  desenharTempoDep(dep);
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
  // Departamentos com ao menos um par de subcategorias com 200+ cestas no período e segmento (v4.3: vão para o ⓘ da lista).
  const comPares = [...new Set(porPeriodo.pares.filter((p) => p.subconjunto === sub).map((p) => p.departamento))];
  definirInfo(blocos.cabLista.info, [
    'Clique para abrir a ficha (vira o filtro de departamento); clique de novo para voltar a todos. Ctrl + clique soma ou tira do filtro.',
    comPares.length
      ? `Têm pares de cesta confiáveis (${fixos.manifest.parametros_cesta.minimo_cestas_par}+ cestas) neste período e segmento: ${comPares.join(', ')}.`
      : 'Nenhum departamento tem pares de cesta confiáveis neste período e segmento.',
    '⚠ = amostra pequena (vai para o fim da lista).',
    'O valor ao lado é o faturamento (ou o % de desconto, na ordem por desconto) e a variação nas lojas comparáveis.',
  ]);
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
      filtro.has(f.departamento) && f.departamento !== atual ? el('span', { class: 'item-lista__marca' }, ' (no filtro)') : null),
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
      info(nomeDep(dep), [
        'Números do período e dos segmentos selecionados na barra lateral.',
        dep === TODOS ? null : 'Participação: % do faturamento do período.',
        semAnterior ? 'A base inteira não tem ano anterior.' : 'Vs. ano anterior: crescimento nas lojas comparáveis do período (abertas nos dois anos).',
        'Clientes: quem comprou no período e nos segmentos selecionados. A barra "Quem compra" divide o faturamento entre os segmentos; clique numa parte para filtrar o segmento, clique de novo para desfazer, Ctrl + clique soma.',
      ]),
      ficha?.amostra_pequena ? avisoAmostra(`${fmt.contagem(ficha.compradores)} clientes`) : null),
    el('div', { class: 'ct-cabecalho__corpo' },
      el('dl', { class: 'ct-numeros' },
        el('div', {}, el('dt', {}, 'Faturamento'), el('dd', { title: fmt.usd(seg?.faturamento) }, fmt.usdGrande(seg?.faturamento))),
        dep === TODOS ? null : el('div', {}, el('dt', {}, 'Participação'), el('dd', {}, fmt.pct(seg?.atributos.participacao.valor))),
        el('div', {}, el('dt', {}, 'Vs. ano anterior'),
          el('dd', {}, semAnterior ? el('span', { class: 'kpi__nota' }, 'sem ano anterior') : el('span', { class: `variacao variacao--${tom}` }, fmt.variacao(cresc)),
            semAnterior ? null : el('span', { class: 'kpi__nota' }, 'lojas comparáveis'))),
        el('div', {}, el('dt', {}, 'Clientes'), el('dd', {}, fmt.contagem(seg?.compradores)))),
      blocos.quemCompra),
    sub !== 'todos' && seg?.amostra_pequena && !ficha?.amostra_pequena
      ? el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: ${fmt.contagem(seg.compradores)} clientes dos segmentos selecionados compraram`) : null,
    !seg ? el('p', { class: 'painel__vazio' }, 'Os segmentos selecionados não compraram neste período.') : null,
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
    // v4.3 (item 14): a legenda não repete a % que já está na barra; só a das partes estreitas demais para o rótulo.
    legend: { top: 22, left: 0, itemGap: 10, data: SEGMENTOS, selectedMode: false,
              formatter: (nome) => { const p = partes.find((x) => x.segmento === nome); return p.pct >= 0.08 ? nome : `${nome} ${fmt.part(p.pct)}`; } },
    tooltip: { trigger: 'item', formatter: (p) => `${p.seriesName}: ${fmt.usd(partes[p.seriesIndex].faturamento)}<br>${fmt.part(partes[p.seriesIndex].pct)} do faturamento`
      + (selecionados.has(p.seriesName) ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar o segmento; Ctrl + clique soma') },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: { type: 'category', data: [nomeDep(dep)], show: false },
    series: partes.map((p, i) => ({
      name: p.segmento, type: 'bar', stack: 'total', barWidth: 16, cursor: 'pointer',
      data: [p.pct],
      // v4.3 (item 4): fora da seleção, cor já clara e opacidade 1 (o rótulo não herda a opacidade da barra).
      itemStyle: { color: fora(p.segmento) ? misturar(SEG_CORES[p.segmento], OPACIDADE_FORA) : SEG_CORES[p.segmento], opacity: 1,
                   borderColor: COR.superficie, borderWidth: 1,
                   borderRadius: i === 0 ? [4, 0, 0, 4] : i === partes.length - 1 ? [0, 4, 4, 0] : 0 },
      label: { show: p.pct >= 0.08, position: 'inside', color: textoSobre(SEG_CORES[p.segmento], fora(p.segmento) ? OPACIDADE_FORA : 1),
               fontSize: FONTE.rotulo, fontWeight: FONTE.pesoForte, formatter: () => fmt.part(p.pct) },
    })),
  }, { notMerge: true });
}

// --------------------------------------------------------------------------- faturamento ao longo do tempo

function desenharTempoDep(dep) {
  const { periodo, filtros } = estado;
  const lojas = fixos.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
  desenharTempo(blocos.semanal, blocos.graficos.semanal, {
    linhas: fixos.tempo[periodo], periodo, lojas, compacto: true, nome: nomeDep(dep),
    filtros: { segmentos: filtros.segmentos, departamentos: dep === TODOS ? new Set() : new Set([dep]) },
  });
}

// --------------------------------------------------------------------------- compra junto com

/** O par na direção de maior confiança: "quem compra A também leva B em X% das vezes". */
function frase(p) {
  const aParaB = p.confianca_a_b >= p.confianca_b_a;
  return { de: aParaB ? p.subcategoria_a : p.subcategoria_b, leva: aParaB ? p.subcategoria_b : p.subcategoria_a,
           confianca: Math.max(p.confianca_a_b, p.confianca_b_a) };
}

function desenharCesta(dep, sub) {
  const minimo = fixos.manifest.parametros_cesta.minimo_cestas_par;
  const doRecorte = porPeriodo.pares.filter((p) => p.subconjunto === sub && (dep === TODOS || p.departamento === dep));
  const pares = [...doRecorte].sort((x, y) => y.lift - x.lift).slice(0, TOP_PARES);
  const curto = estado.periodo === '4s';
  blocos.cesta.subtitulo.textContent = `Subcategorias que mais vão juntas na cesta${dep === TODOS ? '' : `, dentro de ${dep}`}`;
  definirEtiquetas(blocos.cesta.etiquetas, [curto ? ['⚠ poucos pares no período', 'aviso'] : null]);
  definirInfo(blocos.cesta.info, [
    `Os ${TOP_PARES} pares de subcategorias que mais vão juntos na mesma cesta ${dep === TODOS ? 'dentro de cada departamento' : `dentro de ${dep}`}, `
      + `nos segmentos selecionados e no período. Só pares com ${minimo}+ cestas: abaixo disso o lift oscila demais para ser confiável.`,
    '"Vezes mais que o normal" é o lift: quantas vezes o par aparece junto além do esperado ao acaso. "% das vezes" é a confiança: de quem compra a primeira, quantos levam a segunda (na direção mais forte).',
    dep === TODOS ? 'A coluna "Departamento" diz de onde é o par.' : null,
    curto ? '⚠ Período curto (4 semanas): poucos pares confiáveis.' : null,
    'Passe o mouse numa linha para ver o número exato e em quantas de todas as cestas os dois aparecem juntos (o suporte).',
  ]);
  const lista = blocos.cesta.grafico;
  if (!pares.length) {
    const comPares = [...new Set(porPeriodo.pares.filter((p) => p.subconjunto === sub).map((p) => p.departamento))];
    lista.replaceChildren(el('div', { class: 'ct-sem-pares' },
      el('p', { class: 'ct-sem-pares__titulo' }, '⚠ Poucos dados para pares confiáveis'),
      el('p', {}, `Nenhum par de subcategorias ${dep === TODOS ? '' : `de ${dep} `}aparece em ${minimo} cestas ou mais `
        + `(${nomeSubconjunto(sub)}, ${NOMES_PERIODO[estado.periodo]}). Abaixo disso, as "vezes mais que o normal" oscilam demais para serem confiáveis.`),
      el('p', {}, comPares.length
        ? `Têm pares neste período e segmento: ${comPares.join(', ')}.`
        : 'Nenhum departamento tem pares neste período e segmento: escolha outro período ou segmento.')));
  } else {
    lista.replaceChildren(tabelaPares(pares.map((p) => ({ ...frase(p), lift: p.lift, cestas: p.cestas_par, departamento: p.departamento,
      dica: `${fmt.decimal(p.lift, 2)} vezes mais que o normal; juntos em ${fmt.pct(p.suporte, 2)} de todas as cestas` })),
    { legenda: `Pares de subcategorias de ${nomeDep(dep)}`, departamento: dep === TODOS }));
  }
}

// --------------------------------------------------------------------------- direita: perfil e subcategorias

function indice(v) {
  if (v === null || v === undefined) return '—';
  const seta = v > 100.5 ? '▲ ' : v < 99.5 ? '▼ ' : '';
  return `${seta}${fmt.decimal(v, 0)}`;
}

function desenharPerfil(dep, ficha, seg, todos, sub) {
  const { subtitulo: nota, info: infoPerfil } = blocos.cabPerfil;
  const radar = blocos.perfil.querySelector('.ct-radar__grafico');
  radar.hidden = dep === TODOS;
  if (dep === TODOS) {
    nota.textContent = 'Escolha um departamento para ver o radar';
    definirInfo(infoPerfil, ['O perfil compara um departamento com os outros: escolha um na lista. Com segmentos ligados, a tabela compara os selecionados com todos os clientes.',
      'Índice: valor dos selecionados ÷ valor de todos os clientes × 100 (100 = igual; ▲ acima, ▼ abaixo).']);
  } else {
    nota.textContent = 'Percentil de 0 a 100 entre os departamentos';
    definirInfo(infoPerfil, [`Percentil de 0 a 100 entre os ${fmt.contagem(porPeriodo.ficha.length)} departamentos do período, todos os clientes. Os valores reais estão na tabela.`,
      sub === 'todos' ? 'Ligue segmentos para comparar os selecionados com todos os clientes ("Selec." e "Índice").' : 'Selecionados vs. todos os clientes: índice 100 = igual (▲ acima, ▼ abaixo).']);
    const a = ficha.atributos;
    blocos.graficos.radar.resize();
    blocos.graficos.radar.setOption({
      ...base(`Perfil de ${dep} entre os departamentos`, `Radar de ${dep} em percentil entre os departamentos: `
        + ATRIBUTOS.map((x) => `${x.curto} ${fmt.decimal(a[x.chave].percentil, 0)}`).join('; ') + '. Os valores reais estão na tabela logo abaixo.'),
      radar: {
        indicator: ATRIBUTOS.map((x) => ({ name: x.curto, max: 100, min: 0 })),
        center: ['50%', '53%'], radius: '58%', splitNumber: 4,
        axisName: { color: COR.textoSecundario, fontSize: FONTE.rotulo },
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
    { titulo: 'Atributo', valor: (x) => el('span', { class: 'ct-atributo', title: x.nome }, x.curto, x.dica ? info(x.nome, `${x.nome}: ${x.dica}`) : null) },
    { titulo: 'Todos', valor: (x) => x.formato(todos?.atributos[x.chave].valor), numero: true },
    ...(dep === TODOS ? [] : [{ titulo: 'Pctl.', valor: (x) => fmt.decimal(ficha.atributos[x.chave].percentil, 0), numero: true }]),
    // v4.3 (item 24): "Selec." e "Índice" só com segmento ligado (sem ele, as duas colunas seriam só "—").
    ...(sub === 'todos' ? [] : [
      { titulo: 'Selec.', valor: (x) => (seg ? x.formato(seg.atributos[x.chave].valor) : '—'), numero: true },
      { titulo: 'Índice', valor: (x) => indice(seg?.atributos[x.chave].indice), numero: true }]),
  ], atributos, `Valores reais de ${nomeDep(dep)}${dep === TODOS ? '' : ', percentil'}${sub === 'todos' ? '' : ' e comparação com todos os clientes'}`);
  if (sub !== 'todos' && seg?.amostra_pequena) alvo.append(el('p', { class: 'aviso-amostra' }, `⚠ amostra pequena: ${fmt.contagem(seg.compradores)} clientes`));
}

function desenharSubcategorias(dep) {
  const linhasDep = porPeriodo.subs.filter((s) => s.departamento === dep);
  const nome = (s) => (dep === TODOS ? `${s.subcategoria} (${s.departamento_origem})` : s.subcategoria);
  const titulo = `Top 10 subcategorias de ${nomeDep(dep)}`;
  // v4.3 (item 10): a etiqueta "todos os clientes" saiu; o ⓘ diz que o card não segue o filtro de segmento.
  blocos.subcategorias.subtitulo.textContent = `% do ${dep === TODOS ? 'faturamento total' : 'faturamento do departamento'}`;
  definirEtiquetas(blocos.subcategorias.etiquetas, []);
  definirInfo(blocos.subcategorias.info, [`As 10 maiores subcategorias ${dep === TODOS ? 'de todos os departamentos' : `de ${dep}`} no período, todos os clientes (não segue o filtro de segmento), todas as lojas.`,
    dep === TODOS ? 'Entre parênteses, o departamento de cada subcategoria.' : null]);
  blocos.graficos.subcategorias.setOption({
    ...base(titulo, `${titulo}: ` + linhasDep.map((s) => `${nome(s)} ${fmt.pct(s.participacao_pct, 0)}`).join('; ') + '.'),
    grid: { left: 4, right: 40, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => {
      const s = linhasDep[p.dataIndex];
      return `${nome(s)}<br>${fmt.usd(s.faturamento)}<br>${fmt.part(s.participacao_pct)} do ${dep === TODOS ? 'total' : 'departamento'}`;
    } },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: linhasDep.map(nome),
             // v4.3 (item 22): nome inteiro, quebrando a linha (sem "…"); o nome completo também está no tooltip.
             axisLabel: { color: COR.textoPrimario, fontSize: FONTE.rotulo, width: 150, overflow: 'break', lineHeight: 15 }, axisLine: { show: false } },
    series: [{ type: 'bar', name: 'Faturamento', barMaxWidth: 12, barCategoryGap: '30%',
               data: linhasDep.map((s) => s.faturamento), itemStyle: { color: COR.serie, borderRadius: [0, 4, 4, 0] },
               label: { show: true, position: 'right', color: COR.textoPrimario, fontSize: FONTE.rotulo, formatter: (p) => fmt.part(linhasDep[p.dataIndex].participacao_pct) } }],
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
  const { subtitulo: subRisco, etiquetas: etqRisco, info: infoRisco } = blocos.cabRisco;
  subRisco.textContent = soPausa ? '' : 'Faturamento de clientes com risco alto de pausa';
  definirEtiquetas(etqRisco, [['fixo: últimas 26 semanas']]);
  definirInfo(infoRisco, [
    `Faturamento de clientes na faixa ⚠ alta de risco de pausa, ${nomeSubconjunto(sub)}, ${dep === TODOS ? 'em todos os departamentos' : `em ${dep}`}.`,
    'Fixo nas 26 semanas: o risco é uma foto do momento e não muda com o período.',
    'Em pausa fica fora do modelo de risco (sem compra nas últimas 8 semanas).',
  ]);
  // v4.3 (item 1): o replaceChildren do navegador escreve "null" quando recebe null (o el() filtra, ele não): os nulos saem antes.
  corpo.replaceChildren(...[
    el('p', { class: 'ct-risco__valor', title: fmt.usd(r?.dinheiro_em_risco) }, fmt.usdGrande(r?.dinheiro_em_risco)),
    r?.dinheiro_em_risco_pct == null ? null
      : el('p', { class: 'ct-risco__pct' }, `${fmt.part(r.dinheiro_em_risco_pct)} do ${dep === TODOS ? 'faturamento total' : 'faturamento do departamento'}`),
    soPausa ? el('p', { class: 'painel__subtitulo' }, 'Em pausa fica fora do modelo de risco (sem compra nas últimas 8 semanas).') : null,
  ].filter(Boolean));
}
