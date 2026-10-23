// Aba Clientes & Lojas (spec 5.3, redesenho v3: junção de Segmentos e Lojas). Onde estão os nossos clientes, quais
// lojas pesam e onde está o risco?
//   linha 1: os 4 cards de segmento (filtro de segmento e detalhe);
//   linha 2: a Roda dos segmentos (alterna com a matriz de migração), "Regiões: quem compra em cada área" (barras 100%
//            ou uma bolha por região; NÃO é geografia) e o perfil das lojas pela clientela;
//   linha 3: o ranking das lojas (top 10, 4 métricas) e, ao clicar numa loja, a ficha dela num painel lateral, com o CSV
//            dos clientes em risco da loja.
// Segmento, risco, migração e perfil são fixos (26 semanas); o resto responde ao período. A regra da loja principal (a de
// maior gasto do cliente nas 26 semanas) vale para o perfil e o valor em risco (spec, seção 6).
import { SEM_SEGMENTO, chaveSubconjunto } from '../agregados.js';
import { COR, SEG_CORES, SEGMENTOS, base, criarGrafico } from '../charts/tema.js';
import { avisoAmostra, el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA, clicar, ligarGrafico, ligarLista, limpar, registrarDimensao } from '../selecao.js';

// Área do círculo proporcional ao faturamento. Abaixo de 24 px o nó vira alvo de clique pequeno demais:
// o rótulo dá o número real, então o piso não engana.
const DIAMETRO_MAX = 120;
const DIAMETRO_MIN = 24;
const TOP_RANKING = 10;
const PEQUENAS = 'Lojas pequenas';
const AMOSTRA = 'Amostra pequena';
const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };
const METRICAS = [
  { chave: 'faturamento', rotulo: 'Faturamento' },
  { chave: 'ticket', rotulo: 'Ticket médio' },
  { chave: 'risco', rotulo: 'Valor em risco' },
  { chave: 'crescimento', rotulo: 'Crescimento' },
];
const SEM_COMPRA = 'Sem compra na janela';
const GRUPOS_MIGRACAO = [...SEGMENTOS, SEM_COMPRA];
const curto = (g) => (g === SEM_COMPRA ? 'Sem compra' : g);

// Seleções da aba (modelo único, selecao.js): região e perfil viram filtro (etiqueta); a loja só abre a ficha.
const ABA = 'painel-clientes';
const regioesSel = registrarDimensao('regiao', { aba: ABA, rotulo: 'Região' });
const perfisSel = registrarDimensao('perfil', { aba: ABA, rotulo: 'Perfil da loja' });
const lojaSel = registrarDimensao('loja', { aba: ABA, rotulo: 'Loja', filtro: false, unico: true });

let estado;
let dados;            // os arquivos fixos (não dependem do período)
let periodo = null;   // os do período desenhado: { periodo, ranking, fichas }
let ui;
let detalheAberto = null;   // segmento cujo detalhe está aberto (Esc fecha; o filtro continua)
let modo = 'roda';          // o painel da Roda mostra 'roda' ou 'migracao'
let modoRegioes = 'barras'; // 'barras' ou 'mapa' (uma bolha por região)
let metrica = 'faturamento';
let pedido = 0;

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  const cards = el('div', { class: 'sg-cards', role: 'group', 'aria-label': 'Segmentos: clique para filtrar e ver o detalhe' });
  const detalhe = el('section', { class: 'painel sg-detalhe', 'aria-labelledby': 'sg-detalhe-titulo', 'aria-live': 'polite', hidden: true });
  const roda = painelGrafico({ titulo: 'A roda dos segmentos', subtitulo: '', classe: 'sg-roda cl-roda' });
  const regioes = painelGrafico({ titulo: 'Regiões: quem compra em cada área', subtitulo: '', classe: 'cl-regioes' });
  const perfil = painelGrafico({ titulo: 'Perfil das lojas pela clientela', subtitulo: '', classe: 'cl-perfil' });
  perfil.painel.append(el('p', { class: 'cl-perfil__amostra' }));
  const ranking = painelGrafico({ titulo: 'Ranking das lojas', subtitulo: '', classe: 'cl-ranking' });
  const ficha = el('section', { class: 'painel cl-ficha', 'aria-labelledby': 'cl-ficha-titulo', 'aria-live': 'polite', hidden: true });
  container.classList.add('sg', 'cl');
  container.replaceChildren(cards, detalhe, roda.painel, regioes.painel, perfil.painel, ranking.painel, ficha);
  ui = { cards, detalhe, roda, regioes, perfil, ranking, ficha,
         graficos: { roda: criarGrafico(roda.grafico), regioes: criarGrafico(regioes.grafico), perfil: criarGrafico(perfil.grafico),
                     ranking: criarGrafico(ranking.grafico), mix: null } };
  for (const nome of ['roda', 'regioes', 'perfil', 'ranking']) {
    ui[nome].aoAlternar((tabela) => { if (!tabela) ui.graficos[nome].resize(); });
  }
  // Alternadores no cabeçalho dos painéis, antes do botão Tabela: Roda | Migração, Barras | Mapa, e as 4 métricas.
  ui.modos = alternador(roda.painel, [['roda', 'Roda'], ['migracao', 'Migração']], () => modo, (m) => { modo = m; desenharPainelRoda(); },
                        'O que o painel mostra');
  ui.modosRegioes = alternador(regioes.painel, [['barras', 'Barras'], ['mapa', 'Mapa']], () => modoRegioes,
                               (m) => { modoRegioes = m; desenharRegioes(); }, 'Barras ou uma bolha por região');
  ui.metricas = alternador(ranking.painel, METRICAS.map((m) => [m.chave, m.rotulo]), () => metrica,
                           (m) => { metrica = m; desenharRanking(); }, 'Métrica do ranking', true);

  try {
    const [segs, migracao, migracaoGrupos, listaAcao, lojas, regioes_, regioesSegmento, perfis, risco, manifest] = await Promise.all([
      linhas('segmentos.json'), linhas('migracao.json'), linhas('migracao_segmentos.json'), linhas('lista_acao.json'),
      linhas('lojas.json'), linhas('regioes.json'), linhas('regioes_segmento.json'), linhas('perfis.json'), linhas('lojas_risco.json'),
      carregar('manifest.json')]);
    dados = { segs: SEGMENTOS.map((nome) => segs.find((s) => s.segmento === nome)), migracao,
              migracaoGrupos: new Map(migracaoGrupos.map((g) => [g.segmento, g])), listaAcao,
              lojas: new Map(lojas.map((l) => [l.id, l])), regioes: regioes_, regioesSegmento, perfis, risco, manifest };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }

  ui.graficos.roda.on('click', (p) => {
    if (p.dataType === 'node') clicarSegmento(p.name, p.event?.event);
    // Migração: a célula filtra o segmento de agora (sem abrir o detalhe, que cobriria a matriz).
    const c = p.seriesType === 'heatmap' ? dados.migracao[p.dataIndex] : null;
    if (c && c.segmento_atual !== SEM_COMPRA) clicar('segmentos', c.segmento_atual, p.event?.event);
  });
  ui.graficos.regioes.on('click', (p) => {
    const regiao = p.data?.regiao;
    if (regiao) clicar('regiao', regiao, p.event?.event);
  });
  ui.graficos.perfil.on('click', (p) => { if (p.data?.perfil) clicar('perfil', p.data.perfil, p.event?.event); });
  ui.graficos.ranking.on('click', (p) => { if (p.data?.loja) clicar('loja', p.data.loja, p.event?.event); });
  ligarGrafico(ui.graficos.roda, 'segmentos');
  ligarGrafico(ui.graficos.regioes, 'regiao');
  ligarGrafico(ui.graficos.perfil, 'perfil');
  ligarGrafico(ui.graficos.ranking, 'loja');
  ligarLista(cards, '.sg-card', 'segmentos');
  window.addEventListener('selecao-mudou', (e) => {
    if (!['regiao', 'perfil', 'loja'].includes(e.detail.dimensao) || !periodo) return;
    if (e.detail.dimensao !== 'loja') { desenharRegioes(); desenharPerfil(); }
    desenharRanking();
    desenharFicha();
  });
  // A caixa quadrada da Roda depende do tamanho do gráfico: redesenha depois de cada redimensionamento.
  let ultimoTamanho = '';
  ui.graficos.roda.on('finished', () => {
    const tamanho = `${ui.graficos.roda.getWidth()}x${ui.graficos.roda.getHeight()}`;
    if (ultimoTamanho && tamanho !== ultimoTamanho && modo === 'roda') desenharRoda();
    ultimoTamanho = tamanho;
  });
  // Esc: com a ficha da loja aberta, fecha a ficha; com o detalhe do segmento aberto, fecha o detalhe (o filtro continua).
  // Sem nenhum dos dois, o Esc é do modelo de seleção (limpa o último gráfico usado).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || container.hidden) return;
    if (lojaSel.size) { e.preventDefault(); limpar('loja'); return; }
    if (detalheAberto) { e.preventDefault(); abrirDetalhe(null); }
  });
  window.addEventListener('resize', () => { if (detalheAberto) posicionarDetalhe(); });
}

/** Grupo de pílulas no cabeçalho de um painel (o estilo do seletor de visão). */
function alternador(painel, opcoes, atual, escolher, rotulo, linhaPropria = false) {
  const botoes = opcoes.map(([valor, texto]) => el('button', {
    class: 'botao-tabela', type: 'button', 'aria-pressed': String(valor === atual()),
    onclick: () => { escolher(valor); botoes.forEach((b, i) => b.setAttribute('aria-pressed', String(opcoes[i][0] === atual()))); },
  }, texto));
  const grupo = el('div', { class: linhaPropria ? 'sg-modos cl-metricas' : 'sg-modos', role: 'group', 'aria-label': rotulo }, ...botoes);
  // Na linha própria (o ranking), os botões ficam logo abaixo do cabeçalho: cabem mesmo com a ficha aberta ao lado.
  if (linhaPropria) painel.querySelector('.painel__cabecalho').after(grupo);
  else painel.querySelector('.botao-tabela').before(grupo);
  return botoes;
}

async function carregarPeriodo(p) {
  const [ranking, fichas] = await Promise.all([linhas(`lojas_ranking_${p}.json`), linhas(`lojas_ficha_${p}.json`)]);
  return { periodo: p, ranking, fichas: new Map(fichas.map((f) => [f.id, f])) };
}

export async function atualizar() {
  if (!dados) return;
  const meu = ++pedido;
  let carregado;
  try {
    carregado = await carregarPeriodo(estado.periodo);
  } catch (erro) {
    erroDeCarga(ui.ranking.grafico, erro);
    return;
  }
  if (meu !== pedido) return;   // outro período chegou enquanto este carregava
  periodo = carregado;
  // O detalhe aberto só continua se o segmento ainda estiver no filtro; a loja da ficha, se ainda tiver venda no período.
  if (detalheAberto && !estado.filtros.segmentos.has(detalheAberto)) detalheAberto = null;
  Object.values(ui.graficos).forEach((g) => g?.resize());
  desenharCards();
  desenharDetalhe();
  desenharPainelRoda();
  desenharRegioes();
  desenharPerfil();
  desenharRanking();
  desenharFicha();
  // As alturas das linhas só assentam depois do primeiro desenho: os gráficos medem de novo no quadro seguinte, e a Roda
  // (cuja caixa quadrada depende do tamanho) é redesenhada com a medida final.
  requestAnimationFrame(() => {
    Object.values(ui.graficos).forEach((g) => g?.resize());
    if (modo === 'roda') desenharRoda();
  });
}

/** Card ou nó da Roda: o modelo único de seleção; o detalhe abre quando o segmento entra no filtro. */
function clicarSegmento(segmento, evento) {
  detalheAberto = segmento;
  clicar('segmentos', segmento, evento);   // dispara 'filtros-mudaram' → atualizar(), que fecha o detalhe se ele saiu
}

/** No desktop o detalhe abre por cima da Roda (mesma posição e tamanho): não cobre a matriz nem a lista de ação. */
function posicionarDetalhe() {
  const r = ui.roda.painel;
  Object.assign(ui.detalhe.style, { top: `${r.offsetTop}px`, left: `${r.offsetLeft}px`, width: `${r.offsetWidth}px`, height: `${r.offsetHeight}px` });
}

function abrirDetalhe(segmento) {
  detalheAberto = segmento;
  desenharDetalhe();
}

const fora = (s) => estado.filtros.segmentos.size > 0 && !estado.filtros.segmentos.has(s);

/** Subtítulo de um painel de gráfico, criado se ainda não existir (painelGrafico não cria subtítulo vazio). */
function subtitulo(painel) {
  return painel.querySelector('.painel__subtitulo')
    ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
}

// --------------------------------------------------------------------------- cards e detalhe

function desenharCards() {
  ui.cards.replaceChildren(...dados.segs.map((s) => el('button', {
    class: 'sg-card', type: 'button', 'aria-pressed': String(estado.filtros.segmentos.has(s.segmento)),
    'data-fora': String(fora(s.segmento)), title: 'Clique para filtrar este segmento e ver o detalhe; Ctrl + clique soma',
    onclick: (e) => clicarSegmento(s.segmento, e),
  },
  el('span', { class: 'sg-card__nome' }, etiquetaSegmento(s.segmento, SEG_CORES[s.segmento])),
  el('span', { class: 'sg-card__numeros' },
    el('span', {}, el('strong', {}, fmt.pct(s.clientes_pct)), ' dos clientes'),
    el('span', {}, el('strong', {}, fmt.pct(s.faturamento_pct)), ' do faturamento'),
    el('span', {}, el('strong', {}, fmt.usd(s.ticket_medio)), ' de ticket médio')))));
}

function desenharDetalhe() {
  const s = dados.segs.find((x) => x.segmento === detalheAberto);
  ui.detalhe.hidden = !s;
  if (!s) return;
  posicionarDetalhe();
  const m = dados.manifest.modelo;
  // Cada item é um <div> com dt + dd (permitido em <dl>), para o detalhe caber em 2 colunas por cima da Roda.
  const linha = (rotulo, valor, nota) => el('div', {}, el('dt', {}, rotulo),
    el('dd', {}, valor, nota ? el('span', { class: 'detalhe__nota' }, nota) : null));
  const risco = s.risco_alto_pct === null
    ? linha('Em risco de pausa', '—', 'fora do modelo de risco: sem compra há mais de 8 semanas')
    : linha('Em risco de pausa', fmt.pct(s.risco_alto_pct), `risco alto (probabilidade ≥ ${fmt.decimal(m.limiar_alerta, 2)})`);
  ui.detalhe.replaceChildren(
    el('header', { class: 'painel__cabecalho' },
      el('h2', { class: 'painel__titulo', id: 'sg-detalhe-titulo' }, etiquetaSegmento(s.segmento, SEG_CORES[s.segmento])),
      el('button', { class: 'botao-tabela', type: 'button', onclick: () => abrirDetalhe(null) }, 'Fechar (Esc)')),
    el('dl', { class: 'detalhe' },
      linha('Clientes', fmt.pct(s.clientes_pct), `${fmt.contagem(s.clientes)} clientes`),
      linha('Faturamento', fmt.pct(s.faturamento_pct), `${fmt.usd(s.faturamento)} em 26 semanas`),
      linha('Ticket médio', fmt.usd(s.ticket_medio), 'média do ticket de cada cliente'),
      linha('CLV médio', fmt.usd(s.clv_medio), 'margem em 52 semanas (25%, premissa)'),
      risco,
      linha('Desconto mediano', fmt.pct(s.desconto_mediano_pct), 'do valor bruto, por cliente')));
}

// --------------------------------------------------------------------------- Roda

/** O painel da Roda no modo escolhido: título, subtítulo, gráfico e tabela gêmea. */
function desenharPainelRoda() {
  const titulo = ui.roda.painel.querySelector('.painel__titulo');
  if (modo === 'roda') {
    titulo.textContent = 'A roda dos segmentos';
    subtitulo(ui.roda.painel).textContent = 'Tamanho = faturamento das 26 semanas (RFM do chat). O segmento é fixo: atributo do cliente. Clique para filtrar.';
    desenharRoda();
    preencherTabela(ui.roda.tabela, [
      { titulo: 'Segmento', valor: (s) => etiquetaSegmento(s.segmento, SEG_CORES[s.segmento]) },
      { titulo: 'Clientes', valor: (s) => `${fmt.contagem(s.clientes)} (${fmt.pct(s.clientes_pct)})`, numero: true },
      { titulo: 'Faturamento', valor: (s) => `${fmt.usdGrande(s.faturamento)} (${fmt.pct(s.faturamento_pct)})`, numero: true },
    ], dados.segs, 'Os quatro segmentos, janela de 26 semanas');
  } else {
    titulo.textContent = 'Migração entre segmentos';
    desenharMigracao();
  }
  // O subtítulo muda de altura com o modo: o gráfico se ajusta ao espaço que sobrou.
  requestAnimationFrame(() => ui.graficos.roda.resize());
}

// --------------------------------------------------------------------------- Migração

function desenharMigracao() {
  const p = dados.manifest.parametros_migracao;
  const ant = p.janela_anterior;
  const idx = (g) => GRUPOS_MIGRACAO.indexOf(g);
  const filtro = estado.filtros.segmentos;
  const apagada = (c) => filtro.size > 0 && !filtro.has(c.segmento_atual) && !filtro.has(c.segmento_anterior);
  subtitulo(ui.roda.painel).textContent = `Linha = antes (${fmt.dataCurta(ant.data_ini)} a ${fmt.dataCurta(ant.data_fim)}), coluna = agora. `
    + `Clientes e % da linha; contorno = ficaram (${fmt.pct(p.ficaram_pct, 0)}).`;
  const titulo = 'Migração entre segmentos';
  const descricao = `${titulo}: ` + GRUPOS_MIGRACAO.map((g) => {
    const x = dados.migracaoGrupos.get(g);
    return `${g}: ${fmt.contagem(x.clientes_anterior)} antes, ${fmt.contagem(x.ficaram)} ficaram, ${fmt.contagem(x.clientes_atual)} agora`;
  }).join('; ') + '.';
  ui.graficos.roda.setOption({
    ...base(titulo, descricao),
    grid: { left: 8, right: 8, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (q) => {
      const c = dados.migracao[q.dataIndex];
      const antes = c.segmento_anterior === c.segmento_atual ? 'ficaram' : 'vieram';
      return `<b>${c.segmento_anterior} → ${c.segmento_atual}</b><br>${fmt.contagem(c.clientes)} clientes (${fmt.pct(c.clientes_pct_linha)} dos `
        + `${fmt.contagem(dados.migracaoGrupos.get(c.segmento_anterior).clientes_anterior)} ${c.segmento_anterior} de antes ${antes === 'ficaram' ? 'ficaram' : 'foram para cá'})`
        + `<br>Faturamento deles: ${fmt.usdGrande(c.faturamento_anterior)} antes → ${fmt.usdGrande(c.faturamento_atual)} agora`
        + (c.amostra_pequena ? `<br>⚠ amostra pequena (menos de ${p.minimo_clientes_celula} clientes)` : '')
        + (c.segmento_atual !== SEM_COMPRA ? `<br>Clique para filtrar ${c.segmento_atual}` : '');
    } },
    // No celular os nomes giram 40° para não se encostarem (como na matriz de afinidade); no desktop cabem retos.
    xAxis: { type: 'category', data: GRUPOS_MIGRACAO.map(curto), position: 'top',
             axisLabel: { color: COR.textoSecundario, fontSize: 11, interval: 0, rotate: ui.graficos.roda.getWidth() < 400 ? 40 : 0 },
             axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'category', data: GRUPOS_MIGRACAO.map(curto), inverse: true,
             axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    // A cor repete o % da linha impresso na célula (escala sequencial de um tom): sem legenda à parte.
    visualMap: { show: false, min: 0, max: 0.8, dimension: 2, inRange: { color: COR.sequencial } },
    series: [{
      type: 'heatmap', name: 'Clientes', cursor: 'pointer',
      data: dados.migracao.map((c) => {
        const diagonal = c.segmento_anterior === c.segmento_atual;
        return {
          value: [idx(c.segmento_atual), idx(c.segmento_anterior), Math.min(0.8, c.clientes_pct_linha ?? 0)],
          itemStyle: { opacity: apagada(c) ? OPACIDADE_FORA : c.amostra_pequena ? 0.6 : 1,
                       borderColor: diagonal ? COR.textoPrimario : COR.superficie, borderWidth: diagonal ? 2 : 3 },
          label: { formatter: () => `{n|${c.amostra_pequena && c.clientes > 0 ? '⚠ ' : ''}${fmt.contagem(c.clientes)}}\n{p|${fmt.pct(c.clientes_pct_linha, 0)}}` },
        };
      }),
      label: { show: true, textBorderColor: COR.superficie, textBorderWidth: 3,
               rich: { n: { color: COR.textoPrimario, fontSize: 12, fontWeight: 600, lineHeight: 15 }, p: { color: COR.textoSecundario, fontSize: 10, lineHeight: 12 } } },
      itemStyle: { borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: COR.textoPrimario, borderWidth: 1 } },
    }],
  }, { notMerge: true });
  preencherTabela(ui.roda.tabela, [
    { titulo: 'Antes', valor: (c) => c.segmento_anterior },
    { titulo: 'Agora', valor: (c) => c.segmento_atual },
    { titulo: 'Clientes', valor: (c) => `${c.amostra_pequena && c.clientes > 0 ? '⚠ ' : ''}${fmt.contagem(c.clientes)}`, numero: true },
    { titulo: '% da linha', valor: (c) => fmt.pct(c.clientes_pct_linha), numero: true },
    { titulo: 'Fat. antes', valor: (c) => fmt.usdGrande(c.faturamento_anterior), numero: true },
    { titulo: 'Fat. agora', valor: (c) => fmt.usdGrande(c.faturamento_atual), numero: true },
  ], dados.migracao, titulo);
}

const lado = () => Math.max(110, Math.min(ui.graficos.roda.getWidth() - 170, ui.graficos.roda.getHeight() - 110));

function desenharRoda() {
  const g = ui.graficos.roda;
  const maior = Math.max(...dados.segs.map((s) => s.faturamento));
  const diametroMax = Math.min(DIAMETRO_MAX, lado() * 0.55);
  g.setOption({
    ...base('A roda dos segmentos: tamanho proporcional ao faturamento',
      'Quatro segmentos em círculo, com a área proporcional ao faturamento das últimas 26 semanas: '
      + dados.segs.map((s) => `${s.segmento}, ${fmt.pct(s.faturamento_pct)} do faturamento e ${fmt.pct(s.clientes_pct)} dos clientes`).join('; ') + '.'),
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const s = dados.segs.find((x) => x.segmento === p.name);
        return `${s.segmento}<br>${fmt.pct(s.faturamento_pct)} do faturamento (${fmt.usdGrande(s.faturamento)})<br>`
          + `${fmt.pct(s.clientes_pct)} dos clientes (${fmt.contagem(s.clientes)})<br>Clique para filtrar e ver o detalhe`;
      },
    },
    series: [{
      // Posições fixas na ordem dos segmentos (topo, direita, baixo, esquerda): Regulares e Em pausa, o par de cores
      // que o validador reprova lado a lado, ficam em lados opostos da roda.
      // Caixa quadrada (a roda fica redonda) e nodeScaleRatio 0 (o tamanho do nó é só o do faturamento).
      type: 'graph', layout: 'none', roam: false, nodeScaleRatio: 0, animationDurationUpdate: 300, cursor: 'pointer',
      left: 'center', top: 'middle', width: lado(), height: lado(),
      data: dados.segs.map((s, i) => {
        const angulo = -Math.PI / 2 + (i * Math.PI) / 2;
        const pct = (v) => fmt.pct(v, v < 0.1 ? 1 : 0);
        const marcado = estado.filtros.segmentos.has(s.segmento);
        return {
          name: s.segmento, x: Math.cos(angulo), y: Math.sin(angulo),
          symbolSize: Math.max(DIAMETRO_MIN, diametroMax * Math.sqrt(s.faturamento / maior)),
          itemStyle: {
            color: SEG_CORES[s.segmento], opacity: fora(s.segmento) ? OPACIDADE_FORA : 1,
            borderColor: marcado ? COR.textoPrimario : COR.superficie, borderWidth: marcado ? 3 : 2,
          },
          label: {
            // opacity 1: sem isto o rótulo herda o esmaecimento do círculo e perde contraste.
            show: true, position: 'bottom', distance: 6, opacity: 1,
            formatter: () => `{nome|${s.segmento}}\n{num|${pct(s.faturamento_pct)} do fat.}`,
            rich: { nome: { fontWeight: 600, fontSize: 12, color: COR.textoPrimario, lineHeight: 16 },
                    num: { fontSize: 11, color: COR.textoSecundario, lineHeight: 14 } },
          },
        };
      }),
      // O aro da roda: estrutura, não dado (linha fina na cor da grade).
      links: dados.segs.map((s, i) => ({ source: s.segmento, target: dados.segs[(i + 1) % dados.segs.length].segmento })),
      lineStyle: { color: COR.grade, width: 1, curveness: 0.4, opacity: 1 },
      emphasis: { scale: 1.05, label: { show: true }, lineStyle: { width: 1 } },
    }],
  }, { notMerge: true });
}


// --------------------------------------------------------------------------- Regiões: quem compra em cada área

const cor = (g) => (g === SEM_SEGMENTO ? COR.outros : SEG_CORES[g]);
const segFora = (g) => estado.filtros.segmentos.size > 0 && !estado.filtros.segmentos.has(g);
const regiaoFora = (r) => regioesSel.size > 0 && !regioesSel.has(r);
const nomeRegiao = (r) => (r === PEQUENAS ? 'lojas pequenas' : r);

function desenharRegioes() {
  const p = estado.periodo;
  const nomes = dados.regioes.map((r) => r.regiao);
  const linhasP = dados.regioesSegmento.filter((x) => x.periodo === p);
  const grupos = [...SEGMENTOS, SEM_SEGMENTO].filter((g) => linhasP.some((x) => x.grupo === g && x.faturamento > 0));
  const porRegiao = nomes.map((r) => {
    const partes = Object.fromEntries(grupos.map((g) => [g, linhasP.find((x) => x.regiao === r && x.grupo === g)?.faturamento ?? 0]));
    const total = Object.values(partes).reduce((a, v) => a + v, 0);
    return { regiao: r, partes, total, info: dados.regioes.find((x) => x.regiao === r) };
  });
  const pr = dados.manifest.parametros_regioes;
  subtitulo(ui.regioes.painel).replaceChildren(
    el('strong', { class: 'lj-aviso' }, 'Região inferida pela clientela em comum, não é geografia. '),
    `${pr.k} regiões (${fmt.pct(pr.concentracao_dentro, 0)} da clientela em comum fica dentro delas, contra ${fmt.pct(pr.concentracao_ao_acaso, 0)} ao acaso), `
    + `${NOMES_PERIODO[p]}. Clique numa região para filtrar a aba.`);
  const titulo = `Regiões: quem compra em cada área, ${NOMES_PERIODO[p]}`;
  const descricao = `${titulo}. ` + porRegiao.map((r) => `${r.regiao}: ${fmt.usdGrande(r.total)}, `
    + grupos.map((g) => `${g} ${fmt.pct(r.total ? r.partes[g] / r.total : 0, 0)}`).join(', ')).join('; ') + '.';
  const tooltip = (r) => `<b>${r.regiao}</b> · ${fmt.usd(r.total)}<br>`
    + grupos.map((g) => `${g}: ${fmt.pct(r.total ? r.partes[g] / r.total : 0)} (${fmt.usdGrande(r.partes[g])})`).join('<br>')
    + `<br>${r.info.lojas} lojas com venda nas 26 semanas${r.info.ancora ? ` · âncora: loja ${r.info.ancora}` : ''}`
    + `<br>${regioesSel.has(r.regiao) ? 'Clique de novo para desfazer' : 'Clique para filtrar a região; Ctrl + clique soma'}`;
  if (modoRegioes === 'mapa') {
    // Uma bolha por região, na posição média das lojas dela no mapa de clientela (perto = clientes em comum).
    const comPosicao = porRegiao.filter((r) => r.info.x !== null);
    const maior = Math.max(...comPosicao.map((r) => r.total));
    ui.graficos.regioes.setOption({
      ...base(titulo, `${descricao} As lojas pequenas não têm posição no mapa.`),
      grid: { left: 24, right: 24, top: 24, bottom: 24 },
      xAxis: { type: 'value', show: false, min: (v) => v.min - 0.18, max: (v) => v.max + 0.18 },
      yAxis: { type: 'value', show: false, min: (v) => v.min - 0.18, max: (v) => v.max + 0.18 },
      tooltip: { trigger: 'item', formatter: (q) => tooltip(comPosicao[q.dataIndex]) },
      series: [{ type: 'scatter', cursor: 'pointer',
        data: comPosicao.map((r) => ({ value: [r.info.x, r.info.y], regiao: r.regiao, symbolSize: Math.max(18, 64 * Math.sqrt(r.total / maior)),
          itemStyle: { color: COR.serie, opacity: regiaoFora(r.regiao) ? OPACIDADE_FORA : 0.85, borderColor: regioesSel.has(r.regiao) ? COR.textoPrimario : COR.superficie, borderWidth: regioesSel.has(r.regiao) ? 3 : 1 },
          label: { show: true, position: 'bottom', color: COR.textoPrimario, fontSize: 11, opacity: regiaoFora(r.regiao) ? 0.5 : 1,
                   formatter: () => `${r.regiao}\n${fmt.usdGrande(r.total)}` } })) }],
    }, { notMerge: true });
  } else {
    ui.graficos.regioes.setOption({
      ...base(titulo, descricao),
      grid: { left: 8, right: 76, top: 22, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, itemGap: 10, data: grupos, selectedMode: false, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'item', formatter: (q) => tooltip(porRegiao[q.dataIndex]) },
      xAxis: { type: 'value', max: 1, show: false },
      yAxis: { type: 'category', inverse: true, data: nomes, axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false } },
      series: [
        ...grupos.map((g, i) => ({
          name: g, type: 'bar', stack: 'regiao', barMaxWidth: 18, cursor: 'pointer', itemStyle: { color: cor(g) },
          data: porRegiao.map((r) => ({ value: r.total ? r.partes[g] / r.total : 0, regiao: r.regiao,
            itemStyle: { color: cor(g), opacity: regiaoFora(r.regiao) || segFora(g) ? OPACIDADE_FORA : 1, borderColor: COR.superficie, borderWidth: 1,
                         borderRadius: i === 0 ? [4, 0, 0, 4] : i === grupos.length - 1 ? [0, 4, 4, 0] : 0 } })),
          label: { show: true, position: 'inside', color: COR.textoPrimario, fontSize: 10,
                   formatter: (q) => (q.value >= 0.12 ? fmt.pct(q.value, 0) : '') },
        })),
        // O faturamento da região escrito ao lado da barra.
        { name: 'faturamento', type: 'scatter', symbolSize: 0, silent: true, tooltip: { show: false },
          data: porRegiao.map((r) => ({ value: [1, r.regiao], label: { opacity: regiaoFora(r.regiao) ? 0.5 : 1 } })),
          label: { show: true, position: 'right', distance: 6, color: COR.textoSecundario, fontSize: 11,
                   formatter: (q) => fmt.usdGrande(porRegiao[q.dataIndex].total) } },
      ],
    }, { notMerge: true });
  }
  preencherTabela(ui.regioes.tabela, [
    { titulo: 'Região', valor: (r) => r.regiao },
    { titulo: 'Faturamento', valor: (r) => fmt.usdGrande(r.total), numero: true },
    ...grupos.map((g) => ({ titulo: g, valor: (r) => fmt.pct(r.total ? r.partes[g] / r.total : 0), numero: true })),
    { titulo: 'Lojas', valor: (r) => fmt.contagem(r.info.lojas), numero: true },
  ], porRegiao, titulo);
}

// --------------------------------------------------------------------------- perfil das lojas

function desenharPerfil() {
  const perfis = dados.perfis.filter((p) => p.perfil !== AMOSTRA);
  const amostra = dados.perfis.find((p) => p.perfil === AMOSTRA);
  const total = dados.perfis.reduce((a, p) => a + p.faturamento, 0);
  const minimo = dados.manifest.minimo_clientes;
  subtitulo(ui.perfil.painel).textContent = 'O segmento mais acima da média da rede entre os clientes que têm a loja como principal '
    + '(a de maior gasto nas 26 semanas). Fixo nas 26 semanas. Clique para filtrar o ranking.';
  ui.perfil.painel.querySelector('.cl-perfil__amostra').replaceChildren(el('span', { class: 'aviso-amostra' },
    `⚠ ${fmt.contagem(amostra.lojas)} lojas (${fmt.pct(amostra.faturamento / total, 0)} do faturamento) ficam sem perfil: `
    + `menos de ${minimo} clientes de loja principal.`));
  const fora = (p) => (perfisSel.size > 0 && !perfisSel.has(p)) || segFora(p);
  const titulo = 'Perfil das lojas pela clientela';
  ui.graficos.perfil.setOption({
    ...base(titulo, `${titulo}: ` + perfis.map((p) => `perfil ${p.perfil}, ${p.lojas} lojas e ${fmt.usdGrande(p.faturamento)}`).join('; ')
      + `. ${amostra.lojas} lojas sem perfil (amostra pequena).`),
    grid: { left: 8, right: 112, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', formatter: (q) => {
      const p = perfis[q.dataIndex];
      return `Lojas de perfil ${p.perfil}: ${p.lojas}<br>${fmt.contagem(p.clientes_principais)} clientes de loja principal<br>`
        + `${fmt.usd(p.faturamento)} nas 26 semanas (${fmt.pct(p.faturamento / total)})`
        + `<br>${perfisSel.has(p.perfil) ? 'Clique de novo para desfazer' : 'Clique para filtrar o ranking; Ctrl + clique soma'}`;
    } },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: perfis.map((p) => p.perfil), axisLabel: { color: COR.textoSecundario, fontSize: 11 }, axisLine: { show: false } },
    series: [{ type: 'bar', name: 'Lojas', barMaxWidth: 18, cursor: 'pointer',
      data: perfis.map((p) => ({ value: p.lojas, perfil: p.perfil,
        itemStyle: { color: SEG_CORES[p.perfil], opacity: fora(p.perfil) ? OPACIDADE_FORA : 1, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: COR.textoSecundario, fontSize: 11,
               formatter: (q) => `${perfis[q.dataIndex].lojas} lojas · ${fmt.usdGrande(perfis[q.dataIndex].faturamento)}` } }],
  }, { notMerge: true });
  preencherTabela(ui.perfil.tabela, [
    { titulo: 'Perfil', valor: (p) => p.perfil },
    { titulo: 'Lojas', valor: (p) => fmt.contagem(p.lojas), numero: true },
    { titulo: 'Clientes de loja principal', valor: (p) => fmt.contagem(p.clientes_principais), numero: true },
    { titulo: 'Faturamento (26 sem.)', valor: (p) => fmt.usdGrande(p.faturamento), numero: true },
  ], dados.perfis, titulo);
}

// --------------------------------------------------------------------------- ranking das lojas

/** As lojas que passam nos filtros da aba (região e perfil). */
function lojaPassa(id) {
  const l = dados.lojas.get(id);
  return l && (!regioesSel.size || regioesSel.has(l.regiao)) && (!perfisSel.size || perfisSel.has(l.perfil));
}

/** As linhas do ranking na métrica escolhida: { loja, valor, partes (por grupo, nas métricas que empilham) }. */
function linhasRanking() {
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const segs = estado.filtros.segmentos.size ? SEGMENTOS.filter((s) => estado.filtros.segmentos.has(s)) : SEGMENTOS;
  const doSub = periodo.ranking.filter((r) => r.subconjunto === sub && lojaPassa(r.loja));
  if (metrica === 'risco') {
    const porLoja = new Map();
    for (const r of dados.risco) {
      if (!segs.includes(r.segmento) || !lojaPassa(r.loja)) continue;
      const x = porLoja.get(r.loja) ?? { loja: r.loja, valor: 0, partes: {}, clientes: 0 };
      x.valor += r.valor_em_risco;
      x.clientes += r.clientes;
      x.partes[r.segmento] = r.valor_em_risco;
      porLoja.set(r.loja, x);
    }
    return { grupos: segs, linhas: [...porLoja.values()], excluidas: 0 };
  }
  if (metrica === 'faturamento') {
    const porSeg = new Map(periodo.ranking.filter((r) => !r.subconjunto.includes('+') && r.subconjunto !== 'todos')
      .map((r) => [`${r.subconjunto}|${r.loja}`, r.faturamento]));
    const grupos = sub === 'todos' ? [...segs, SEM_SEGMENTO] : segs;
    return { grupos, excluidas: 0, linhas: doSub.map((r) => ({ loja: r.loja, valor: r.faturamento, linha: r,
      partes: Object.fromEntries(grupos.map((g) => [g, g === SEM_SEGMENTO ? r.faturamento_sem_segmento : porSeg.get(`${g}|${r.loja}`) ?? 0])) })) };
  }
  // Ticket e crescimento são taxas: a regra do RAG para ranking de loja tira as de amostra pequena.
  const validas = doSub.filter((r) => !r.amostra_pequena && (metrica === 'ticket' || r.faturamento_variacao_pct !== null));
  return { grupos: [], excluidas: doSub.filter((r) => r.amostra_pequena).length,
           linhas: validas.map((r) => ({ loja: r.loja, valor: metrica === 'ticket' ? r.ticket_medio : r.faturamento_variacao_pct, linha: r })) };
}

function desenharRanking() {
  const g = ui.graficos.ranking;
  const p = estado.periodo;
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const filtros = [regioesSel.size ? [...regioesSel].map(nomeRegiao).join(', ') : null,
                   perfisSel.size ? `perfil ${[...perfisSel].join(', ')}` : null].filter(Boolean).join(' · ');
  const notas = {
    faturamento: `Faturamento de ${NOMES_PERIODO[p]}, todas as cestas da loja, aberto pelo segmento do cliente.`,
    ticket: `Ticket médio de ${NOMES_PERIODO[p]} (o ticket não se soma por segmento).`,
    risco: 'Faturamento de 26 semanas dos clientes na faixa ⚠ alta de risco de pausa, na loja principal deles. Fixo: o risco é uma foto do momento.',
    crescimento: `Crescimento contra o mesmo período um ano antes, só lojas comparáveis de ${NOMES_PERIODO[p]}.`,
  };
  if (metrica === 'crescimento' && p === 'base') {
    subtitulo(ui.ranking.painel).textContent = notas.crescimento;
    g.setOption({ ...base('Ranking das lojas por crescimento', 'Sem ano anterior na base inteira.'),
      graphic: { type: 'text', left: 'center', top: 'middle',
                 style: { text: 'A base inteira não tem ano anterior para comparar.\nEscolha 4, 13 ou 26 semanas.', fill: COR.textoMudo, font: '13px system-ui', align: 'center' } } },
    { notMerge: true });
    preencherTabela(ui.ranking.tabela, [{ titulo: 'Aviso', valor: (x) => x }], ['A base inteira não tem ano anterior.'], 'Ranking');
    return;
  }
  const { grupos: todosGrupos, linhas: todas, excluidas } = linhasRanking();
  const top = [...todas].sort((a, b) => b.valor - a.valor || a.loja - b.loja).slice(0, TOP_RANKING);
  // Só os grupos que aparecem nas lojas do top (ex.: "Sem segmento" só tem venda na base inteira).
  const grupos = todosGrupos.filter((gr) => top.some((x) => x.partes[gr] > 0));
  if (!top.length) {
    subtitulo(ui.ranking.painel).textContent = notas[metrica];
    g.setOption({ ...base('Ranking das lojas', 'Nenhuma loja neste recorte.'),
      graphic: { type: 'text', left: 'center', top: 'middle',
                 style: { text: metrica === 'risco' && estado.filtros.segmentos.has('Em pausa') && estado.filtros.segmentos.size === 1
                   ? 'Em pausa fica fora do modelo de risco (sem compra nas últimas 8 semanas).' : 'Nenhuma loja neste recorte.',
                          fill: COR.textoMudo, font: '13px system-ui', align: 'center' } } }, { notMerge: true });
    preencherTabela(ui.ranking.tabela, [{ titulo: 'Aviso', valor: (x) => x }], ['Nenhuma loja neste recorte.'], 'Ranking');
    return;
  }
  subtitulo(ui.ranking.painel).textContent = `Top ${TOP_RANKING} de ${fmt.contagem(todas.length)} lojas${filtros ? ` (${filtros})` : ''}, `
    + `${sub === 'todos' ? 'todos os clientes' : sub.split('+').join(', ')}. ${notas[metrica]}`
    + (excluidas ? ` ${fmt.contagem(excluidas)} lojas com amostra pequena ficam fora.` : '') + ' Clique numa loja para abrir a ficha.';
  const loja = [...lojaSel][0];
  const fora = (id) => loja !== undefined && id !== loja;
  const formato = { faturamento: fmt.usdGrande, ticket: fmt.usd, risco: fmt.usdGrande, crescimento: fmt.variacao }[metrica];
  const nome = (id) => `Loja ${id}`;
  const titulo = `Ranking das lojas: ${METRICAS.find((m) => m.chave === metrica).rotulo.toLowerCase()}, ${NOMES_PERIODO[p]}`;
  const tooltip = (x) => {
    const l = dados.lojas.get(x.loja);
    const partes = grupos.length ? '<br>' + grupos.filter((gr) => x.partes[gr]).map((gr) => `${gr}: ${formato(x.partes[gr])}`).join('<br>') : '';
    return `<b>${nome(x.loja)}</b> · ${l.regiao}${l.perfil ? ` · perfil ${l.perfil}` : ''}<br>${formato(x.valor)}${partes}`
      + `${x.clientes ? `<br>${fmt.contagem(x.clientes)} clientes em risco alto` : ''}`
      + `<br>${lojaSel.has(x.loja) ? 'Clique de novo para fechar a ficha' : 'Clique para abrir a ficha'}`;
  };
  const series = grupos.length
    ? grupos.map((gr, i) => ({
      name: gr, type: 'bar', stack: 'loja', barMaxWidth: 16, cursor: 'pointer', itemStyle: { color: cor(gr) },
      data: top.map((x) => ({ value: x.partes[gr] ?? 0, loja: x.loja,
        itemStyle: { color: cor(gr), opacity: fora(x.loja) ? OPACIDADE_FORA : 1, borderColor: COR.superficie, borderWidth: 1,
                     borderRadius: i === grupos.length - 1 ? [0, 4, 4, 0] : 0 } })),
    }))
    : [{ name: titulo, type: 'bar', barMaxWidth: 16, cursor: 'pointer',
      data: top.map((x) => ({ value: x.valor, loja: x.loja,
        itemStyle: { color: metrica === 'crescimento' ? (x.valor >= 0 ? COR.status.baixo : COR.status.alto) : COR.serie,
                     opacity: fora(x.loja) ? OPACIDADE_FORA : 1, borderRadius: x.valor >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })) }];
  g.setOption({
    ...base(titulo, `${titulo}: ` + top.map((x) => `${nome(x.loja)} ${formato(x.valor)}`).join('; ') + '.'),
    grid: { left: 8, right: 84, top: grupos.length > 1 ? 22 : 4, bottom: 4, containLabel: true },
    legend: grupos.length > 1 ? { top: 0, left: 0, itemGap: 10, data: grupos, selectedMode: false, textStyle: { fontSize: 11 } } : undefined,
    tooltip: { trigger: 'item', formatter: (q) => tooltip(top[q.dataIndex]) },
    xAxis: { type: 'value', show: false, min: metrica === 'crescimento' ? (v) => Math.min(0, v.min) : 0 },
    yAxis: { type: 'category', inverse: true, data: top.map((x) => nome(x.loja)), axisLabel: { color: COR.textoSecundario, fontSize: 11, interval: 0 },
             axisLine: { show: false, onZero: false }, axisTick: { show: false } },
    series: [...series,
      // O valor da loja depois da barra.
      { name: 'valor', type: 'scatter', symbolSize: 0, silent: true, tooltip: { show: false },
        data: top.map((x) => ({ value: [Math.max(0, x.valor), nome(x.loja)], label: { opacity: fora(x.loja) ? 0.6 : 1 } })),
        label: { show: true, position: 'right', distance: 6, color: COR.textoSecundario, fontSize: 11,
                 formatter: (q) => formato(top[q.dataIndex].valor) } }],
  }, { notMerge: true });
  preencherTabela(ui.ranking.tabela, [
    { titulo: '#', valor: (x) => String(top.indexOf(x) + 1), numero: true },
    { titulo: 'Loja', valor: (x) => nome(x.loja) },
    { titulo: 'Região', valor: (x) => dados.lojas.get(x.loja).regiao },
    { titulo: 'Perfil', valor: (x) => dados.lojas.get(x.loja).perfil ?? '—' },
    { titulo: METRICAS.find((m) => m.chave === metrica).rotulo, valor: (x) => formato(x.valor), numero: true },
  ], top, titulo);
}

// --------------------------------------------------------------------------- ficha da loja (painel lateral)

const FATORES = [
  { chave: 'clientes', rotulo: 'Clientes', formato: fmt.contagem },
  { chave: 'idas_por_cliente', rotulo: 'Idas por cliente', formato: (v) => fmt.decimal(v, 1) },
  { chave: 'ticket_medio', rotulo: 'Ticket médio', formato: fmt.usd },
];

function variacao(v) {
  if (v === null || v === undefined) return el('span', { class: 'kpi__nota' }, 'sem comparação');
  return el('span', { class: `variacao variacao--${v >= 0 ? 'bom' : 'critico'}` }, fmt.variacao(v));
}

function clientesEmRisco(id) {
  return dados.listaAcao.filter((c) => c.loja_principal === id);
}

function desenharFicha() {
  const id = [...lojaSel][0];
  const aberta = id !== undefined;
  ui.ficha.hidden = !aberta;
  ui.ranking.painel.closest('.cl').classList.toggle('cl--ficha', aberta);
  requestAnimationFrame(() => ui.graficos.ranking.resize());
  if (!aberta) return;
  const l = dados.lojas.get(id);
  const f = periodo.fichas.get(id);
  const emRisco = clientesEmRisco(id);
  const fechar = el('button', { class: 'botao-tabela', type: 'button', 'aria-label': 'Fechar a ficha da loja', title: 'Fechar (Esc)',
                                onclick: () => limpar('loja') }, '✕');
  const csv = el('button', { class: 'botao', type: 'button', disabled: emRisco.length === 0,
                             title: emRisco.length ? `${emRisco.length} clientes em risco alto ou médio com esta loja como principal` : 'Nenhum cliente em risco com esta loja como principal',
                             onclick: () => baixarCsv(id, emRisco) }, `Baixar clientes em risco desta loja (CSV, ${fmt.contagem(emRisco.length)})`);
  const cabecalho = el('header', { class: 'cl-ficha__cabecalho' },
    el('h2', { class: 'ct-cabecalho__titulo', id: 'cl-ficha-titulo' }, `Loja ${id}`),
    el('span', { class: 'ct-cabecalho__nota' }, `${l.regiao}${l.perfil ? ` · perfil ${l.perfil}` : ''} · ${NOMES_PERIODO[estado.periodo]}`),
    f?.amostra_pequena ? avisoAmostra(`${fmt.contagem(f.cestas)} cestas`) : null,
    el('span', { class: 'cl-ficha__acoes' }, csv, fechar));
  if (!f) {
    ui.ficha.replaceChildren(cabecalho, el('p', { class: 'painel__vazio' }, `A loja ${id} não teve venda em ${NOMES_PERIODO[estado.periodo]}.`));
    return;
  }
  const kpi = (rotulo, valor, v) => el('div', { class: 'lj-kpi' }, el('dt', {}, rotulo), el('dd', {}, valor),
    v === undefined ? null : el('dd', { class: 'lj-kpi__var' }, variacao(v)));
  const a = f.arvore;
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
    : el('p', { class: 'painel__vazio' }, estado.periodo === 'base' ? 'Sem árvore de vendas na base inteira: não há ano anterior.'
      : 'Sem árvore de vendas: a loja não é comparável neste período (não vendeu nas mesmas semanas do ano anterior).');
  const mix = el('div', { class: 'lj-mix__grafico' });
  const deps = el('div', { class: 'lj-deps' });
  ui.ficha.replaceChildren(cabecalho,
    el('dl', { class: 'lj-kpis' },
      kpi('Faturamento', fmt.usdGrande(f.faturamento), f.faturamento_variacao_pct),
      kpi('Cestas', fmt.contagem(f.cestas), f.cestas_variacao_pct),
      kpi('Clientes', fmt.contagem(f.clientes), f.clientes_variacao_pct),
      kpi('Ticket médio', fmt.usd(f.ticket_medio), f.ticket_medio_variacao_pct),
      kpi('Itens por cesta', fmt.decimal(f.itens_por_cesta, 1)),
      kpi('% de desconto', fmt.pct(f.desconto_pct))),
    el('p', { class: 'ct-rotulo' }, 'Árvore de vendas: por que o faturamento mudou'),
    arvore,
    el('div', { class: 'lj-mix' },
      el('div', {}, el('p', { class: 'ct-rotulo' }, 'Quem compra: loja × rede'), mix),
      el('div', {}, el('p', { class: 'ct-rotulo' }, 'Top 5 departamentos: loja × rede'), deps)));
  if (f.segmentos) {
    ui.graficos.mix?.dispose();
    ui.graficos.mix = criarGrafico(mix);
    ui.graficos.mix.setOption({
      ...base(`Quem compra na loja ${id} e na rede`, 'Faturamento por segmento: '
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
  }
  preencherTabela(deps, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: 'Loja', valor: (d) => fmt.pct(d.pct), numero: true },
    { titulo: 'Rede', valor: (d) => fmt.pct(d.rede_pct), numero: true },
    { titulo: 'Índice', valor: (d) => `${d.indice > 100.5 ? '▲ ' : d.indice < 99.5 ? '▼ ' : ''}${fmt.decimal(d.indice, 0)}`, numero: true },
  ], f.departamentos, `Top 5 departamentos da loja ${id} contra a rede`);
}

/** CSV dos clientes em risco da loja (os da antiga lista de ação com esta loja como principal): UTF-8 com BOM e ';'. */
function baixarCsv(id, clientes) {
  const decimal = (v, casas) => v.toFixed(casas).replace('.', ',');
  const cabecalho = ['id', 'segmento', 'faixa_risco', 'probabilidade_pausa', 'semanas_sem_comprar', 'faturamento_26s', 'faturamento_em_risco', 'loja_principal'];
  const linhasCsv = clientes.map((c) => [c.id, c.segmento, c.faixa, decimal(c.prob, 4), c.semanas_sem_comprar,
    decimal(c.faturamento_26s, 2), decimal(c.faturamento_em_risco, 2), c.loja_principal].join(';'));
  const texto = `﻿${[cabecalho.join(';'), ...linhasCsv].join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `clientes_em_risco_loja_${id}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
