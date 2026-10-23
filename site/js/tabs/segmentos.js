// Aba Segmentos (spec 5.3): 4 cards ligados ao filtro de segmento, Roda (tamanho = faturamento), Matriz de afinidade
// segmento × departamento, evolução semanal em pequenos múltiplos e a lista de ação (clientes em risco, com CSV).
// O painel da Roda alterna com a matriz de migração (de qual segmento o cliente veio no semestre anterior).
// Janela de 26 semanas do RFM do RAG: o filtro de período não se aplica. O detalhe do segmento abre pelo card ou pela Roda.
import { chaveSubconjunto, serieSemanal } from '../agregados.js';
import { opcaoMultiplos } from '../charts/multiplos.js';
import { COR, SEG_CORES, SEGMENTOS, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA, clicar, clicarPar, ligarGrafico, ligarLista } from '../selecao.js';

// Área do círculo proporcional ao faturamento. Abaixo de 24 px o nó vira alvo de clique pequeno demais:
// o rótulo dá o número real, então o piso não engana.
const DIAMETRO_MAX = 120;
const DIAMETRO_MIN = 24;
const TOP_MATRIZ = 5;   // decisão do usuário (2026-10-22): os 5 maiores departamentos + os filtrados
const FAIXA = { alto: '⚠ alto', medio: '◐ médio' };

let estado;
let dados;
let ui;
let detalheAberto = null;   // segmento cujo detalhe está aberto (Esc fecha; o filtro continua)
let modo = 'roda';          // o painel da Roda mostra 'roda' ou 'migracao'
const SEM_COMPRA = 'Sem compra na janela';
const GRUPOS_MIGRACAO = [...SEGMENTOS, SEM_COMPRA];
const curto = (g) => (g === SEM_COMPRA ? 'Sem compra' : g);

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  const cards = el('div', { class: 'sg-cards', role: 'group', 'aria-label': 'Segmentos: clique para filtrar e ver o detalhe' });
  const detalhe = el('section', { class: 'painel sg-detalhe', 'aria-labelledby': 'sg-detalhe-titulo', 'aria-live': 'polite', hidden: true });
  const roda = painelGrafico({ titulo: 'A roda dos segmentos', subtitulo: 'Tamanho = faturamento das 26 semanas (RFM do chat). Clique para filtrar.', classe: 'sg-roda' });
  const matriz = painelGrafico({ titulo: 'Afinidade segmento × departamento', subtitulo: '', classe: 'sg-matriz' });
  const evolucao = painelGrafico({ titulo: 'Evolução semanal por segmento, últimas 52 semanas', subtitulo: '', classe: 'sg-evolucao' });
  const lista = el('section', { class: 'painel sg-lista', 'aria-labelledby': 'sg-lista-titulo' },
    el('header', { class: 'painel__cabecalho' },
      el('div', {},
        el('h2', { class: 'painel__titulo', id: 'sg-lista-titulo' }, 'Lista de ação: clientes em risco de pausa'),
        el('p', { class: 'painel__subtitulo sg-lista__resumo' }, '')),
      el('button', { class: 'botao', type: 'button', onclick: () => baixarCsv() }, 'Baixar CSV')),
    el('div', { class: 'sg-lista__tabela' }));
  container.classList.add('sg');
  container.replaceChildren(cards, detalhe, roda.painel, matriz.painel, evolucao.painel, lista);
  ui = { cards, detalhe, roda, matriz, evolucao, lista,
         graficos: { roda: criarGrafico(roda.grafico), matriz: criarGrafico(matriz.grafico), evolucao: criarGrafico(evolucao.grafico) } };
  for (const nome of ['roda', 'matriz', 'evolucao']) {
    ui[nome].aoAlternar((tabela) => { if (!tabela) ui.graficos[nome].resize(); });
  }
  // Alternador Roda | Migração no cabeçalho do painel, antes do botão Tabela.
  ui.modos = ['roda', 'migracao'].map((m) => el('button', {
    class: 'botao-tabela', type: 'button', 'aria-pressed': String(m === modo),
    onclick: () => { modo = m; ui.modos.forEach((b, i) => b.setAttribute('aria-pressed', String(['roda', 'migracao'][i] === modo))); desenharPainelRoda(); },
  }, m === 'roda' ? 'Roda' : 'Migração'));
  roda.painel.querySelector('.botao-tabela').before(el('div', { class: 'sg-modos', role: 'group', 'aria-label': 'O que o painel mostra' }, ...ui.modos));

  try {
    const [segs, afinidade, listaAcao, cubo, departamentos, migracao, migracaoGrupos, manifest] = await Promise.all([
      linhas('segmentos.json'), linhas('afinidade.json'), linhas('lista_acao.json'), linhas('cubo_faturamento.json'),
      linhas('departamentos.json'), linhas('migracao.json'), linhas('migracao_segmentos.json'), carregar('manifest.json')]);
    dados = { segs: SEGMENTOS.map((nome) => segs.find((s) => s.segmento === nome)), afinidade, listaAcao, cubo, departamentos,
              migracao, migracaoGrupos: new Map(migracaoGrupos.map((g) => [g.segmento, g])), manifest };
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
  ui.graficos.matriz.on('click', (p) => {
    const [i, j] = p.value;
    clicarPar(['segmentos', SEGMENTOS[j]], ['departamentos', ui.colunas[i]], p.event?.event);
  });
  ligarGrafico(ui.graficos.roda, 'segmentos');
  ligarGrafico(ui.graficos.matriz, 'segmentos', 'departamentos');
  ligarLista(cards, '.sg-card', 'segmentos');
  // A caixa quadrada da Roda depende do tamanho do gráfico: redesenha depois de cada redimensionamento.
  let ultimoTamanho = '';
  ui.graficos.roda.on('finished', () => {
    const tamanho = `${ui.graficos.roda.getWidth()}x${ui.graficos.roda.getHeight()}`;
    if (ultimoTamanho && tamanho !== ultimoTamanho && modo === 'roda') desenharRoda();
    ultimoTamanho = tamanho;
  });
  // Esc com o detalhe aberto fecha só o detalhe (o filtro continua); sem detalhe, o Esc é do modelo de seleção.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detalheAberto && !container.hidden) {
      e.preventDefault();
      abrirDetalhe(null);
    }
  });
  window.addEventListener('resize', () => { if (detalheAberto) posicionarDetalhe(); });
}

export function atualizar() {
  if (!dados) return;
  Object.values(ui.graficos).forEach((g) => g.resize());
  // O detalhe aberto só continua se o segmento ainda estiver no filtro.
  if (detalheAberto && !estado.filtros.segmentos.has(detalheAberto)) detalheAberto = null;
  desenharCards();
  desenharDetalhe();
  desenharPainelRoda();
  desenharMatriz();
  desenharEvolucao();
  desenharLista();
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

// Lado da caixa da Roda: o menor lado do gráfico menos espaço para os nós e os rótulos.
/** O painel da Roda no modo escolhido: título, subtítulo, gráfico e tabela gêmea. */
function desenharPainelRoda() {
  const titulo = ui.roda.painel.querySelector('.painel__titulo');
  if (modo === 'roda') {
    titulo.textContent = 'A roda dos segmentos';
    subtitulo(ui.roda.painel).textContent = 'Tamanho = faturamento das 26 semanas (RFM do chat). Clique para filtrar.';
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

// --------------------------------------------------------------------------- Matriz de afinidade

function desenharMatriz() {
  const deps = estado.filtros.departamentos;
  // Colunas: os 5 maiores departamentos das 26 semanas + os filtrados (decisão do usuário, 2026-10-22).
  const ordem = dados.departamentos.filter((d) => d.faturamento_26s > 0).map((d) => d.departamento);
  const comVenda = new Set(dados.afinidade.map((a) => a.departamento));
  ui.colunas = ordem.filter((d, i) => (i < TOP_MATRIZ || deps.has(d)) && comVenda.has(d));
  const celulas = [];
  ui.colunas.forEach((d, i) => SEGMENTOS.forEach((s, j) => {
    const a = dados.afinidade.find((x) => x.segmento === s && x.departamento === d);
    celulas.push({ i, j, a });
  }));
  const desvio = Math.min(100, Math.max(20, ...celulas.map((c) => Math.abs(c.a.indice - 100))));
  const apagada = (c) => (estado.filtros.segmentos.size && !estado.filtros.segmentos.has(SEGMENTOS[c.j]))
    || (deps.size && !deps.has(ui.colunas[c.i]));
  const minimo = dados.manifest.minimo_compradores_afinidade;
  const extras = ui.colunas.length - Math.min(TOP_MATRIZ, ui.colunas.length);
  subtitulo(ui.matriz.painel).textContent =
    `Índice: peso do departamento no faturamento do segmento ÷ peso na base × 100 (100 = média). Os ${TOP_MATRIZ} maiores departamentos`
    + `${extras > 0 ? ` e ${extras} do filtro` : ''}; 26 semanas. Clique numa célula para filtrar segmento e departamento.`;
  const titulo = 'Afinidade segmento × departamento';
  ui.graficos.matriz.setOption({
    ...base(titulo, `${titulo}, índice 100 = média: ` + celulas.map((c) => `${SEGMENTOS[c.j]} em ${ui.colunas[c.i]} ${fmt.decimal(c.a.indice, 0)}`).join('; ') + '.'),
    grid: { left: 8, right: 8, top: 4, bottom: 44, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p) => {
      const c = celulas[p.dataIndex];
      const pequena = c.a.amostra_pequena ? `<br>⚠ amostra pequena: ${c.a.compradores} compradores (mínimo ${minimo})` : '';
      return `${c.a.segmento} × ${c.a.departamento}<br>Índice ${fmt.decimal(c.a.indice, 0)}<br>`
        + `${fmt.pct(c.a.participacao_segmento_pct)} do faturamento do segmento × ${fmt.pct(c.a.participacao_base_pct)} na base`
        + `<br>${fmt.contagem(c.a.compradores)} compradores${pequena}<br>Clique para filtrar; Ctrl + clique soma`;
    } },
    // Em tela estreita os nomes giram 40° para não se encostarem.
    xAxis: { type: 'category', data: ui.colunas, position: 'top', splitArea: { show: false },
             axisLabel: { color: COR.textoSecundario, fontSize: 11, interval: 0, overflow: 'truncate', width: 110,
                          rotate: ui.graficos.matriz.getWidth() < 600 ? 40 : 0 }, axisLine: { show: false } },
    yAxis: { type: 'category', data: SEGMENTOS, inverse: true, axisLabel: { color: COR.textoSecundario, fontSize: 12 }, axisLine: { show: false } },
    visualMap: {
      type: 'continuous', min: 100 - desvio, max: 100 + desvio, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemHeight: 180, itemWidth: 10, inRange: { color: COR.divergente }, text: ['acima da média', 'abaixo'],
      textStyle: { color: COR.textoMudo, fontSize: 11 }, formatter: (v) => fmt.decimal(v, 0),
    },
    series: [{
      type: 'heatmap', name: 'Índice de afinidade', cursor: 'pointer',
      data: celulas.map((c) => ({
        value: [c.i, c.j, Math.max(100 - desvio, Math.min(100 + desvio, c.a.indice))],
        itemStyle: { opacity: c.a.amostra_pequena ? 0.45 : apagada(c) ? OPACIDADE_FORA : 1 },
        label: { formatter: () => `${c.a.amostra_pequena ? '⚠ ' : ''}${fmt.decimal(c.a.indice, 0)}` },
      })),
      label: { show: true, color: COR.textoPrimario, fontSize: 12, fontWeight: 600, textBorderColor: COR.superficie, textBorderWidth: 3 },
      itemStyle: { borderColor: COR.superficie, borderWidth: 3, borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: COR.textoPrimario, borderWidth: 1 } },
    }],
  }, { notMerge: true });
  preencherTabela(ui.matriz.tabela, [
    { titulo: 'Segmento', valor: (c) => c.a.segmento },
    { titulo: 'Departamento', valor: (c) => c.a.departamento },
    { titulo: 'Índice', valor: (c) => `${c.a.amostra_pequena ? '⚠ ' : ''}${fmt.decimal(c.a.indice, 0)}`, numero: true },
    { titulo: '% do segmento', valor: (c) => fmt.pct(c.a.participacao_segmento_pct), numero: true },
    { titulo: '% na base', valor: (c) => fmt.pct(c.a.participacao_base_pct), numero: true },
    { titulo: 'Compradores', valor: (c) => fmt.contagem(c.a.compradores), numero: true },
  ], celulas, titulo);
}

// --------------------------------------------------------------------------- evolução semanal

function desenharEvolucao() {
  // Os 4 segmentos sempre (é a comparação entre eles); os que estão fora do filtro ficam apagados.
  const deps = estado.filtros.departamentos;
  const semanas = serieSemanal(dados.cubo, { segmentos: new Set(), departamentos: deps }, { porGrupo: true });
  const rotulos = semanas.map((s) => fmt.dataCurta(s.semana_inicio));
  const nomeDeps = deps.size ? [...deps].join(', ') : 'todos os departamentos';
  subtitulo(ui.evolucao.painel).textContent =
    `Lojas comparáveis da janela de 26 semanas, ${nomeDeps}. Mesma escala nos 4.`;
  const titulo = `Faturamento semanal por segmento, ${nomeDeps}`;
  ui.graficos.evolucao.setOption({
    ...base(titulo, `${titulo}, em 4 gráficos lado a lado com a mesma escala. Os valores de cada semana estão na tabela.`),
    ...opcaoMultiplos(rotulos, SEGMENTOS.map((g) => ({ nome: g, cor: SEG_CORES[g], apagada: fora(g),
                                                       dados: semanas.map((s) => s.grupos[g] ?? 0) })), ui.graficos.evolucao.getWidth()),
  }, { notMerge: true });
  preencherTabela(ui.evolucao.tabela, [
    { titulo: 'Semana de', valor: (s) => fmt.data(s.semana_inicio) },
    ...SEGMENTOS.map((g) => ({ titulo: g, valor: (s) => fmt.usd(s.grupos[g] ?? 0), numero: true })),
  ], semanas, titulo);
}

// --------------------------------------------------------------------------- lista de ação e CSV

function clientesDaLista() {
  const segs = estado.filtros.segmentos;
  return dados.listaAcao.filter((c) => !segs.size || segs.has(c.segmento));
}

function desenharLista() {
  const clientes = clientesDaLista();
  const emRisco = clientes.reduce((a, c) => a + c.faturamento_em_risco, 0);
  const altos = clientes.filter((c) => c.faixa === 'alto').length;
  ui.lista.querySelector('.sg-lista__resumo').textContent =
    `Lista para campanha de reativação: ${fmt.contagem(clientes.length)} clientes (${fmt.contagem(altos)} com risco alto), `
    + `${fmt.usdGrande(emRisco)} de faturamento em risco. Segue o filtro de segmento; o de departamento não se aplica.`;
  const alvo = ui.lista.querySelector('.sg-lista__tabela');
  if (!clientes.length) {
    alvo.replaceChildren(el('p', { class: 'painel__vazio' },
      estado.filtros.segmentos.has('Em pausa') && estado.filtros.segmentos.size === 1
        ? 'Em pausa fica fora do modelo de risco (sem compra há mais de 8 semanas): não há clientes nesta lista.'
        : 'Nenhum cliente em risco nos segmentos selecionados.'));
    return;
  }
  preencherTabela(alvo, [
    { titulo: 'ID', valor: (c) => String(c.id) },
    { titulo: 'Segmento', valor: (c) => etiquetaSegmento(c.segmento, SEG_CORES[c.segmento]) },
    { titulo: 'Faixa', valor: (c) => el('span', { class: `faixa faixa--${c.faixa}` }, FAIXA[c.faixa]) },
    { titulo: 'Sem compra', valor: (c) => `${fmt.contagem(c.semanas_sem_comprar)} sem.`, numero: true },
    { titulo: 'Fat. 26 sem.', valor: (c) => fmt.usd(c.faturamento_26s), numero: true },
    { titulo: 'Em risco', valor: (c) => fmt.usd(c.faturamento_em_risco), numero: true },
  ], clientes, 'Clientes em risco de pausa, por faturamento em risco');
}

/** CSV gerado no navegador a partir de lista_acao.json: UTF-8 com BOM e ';' para abrir no Excel em português. */
function baixarCsv() {
  const decimal = (v, casas) => v.toFixed(casas).replace('.', ',');
  const cabecalho = ['id', 'segmento', 'faixa_risco', 'probabilidade_pausa', 'semanas_sem_comprar', 'faturamento_26s', 'faturamento_em_risco'];
  const linhasCsv = clientesDaLista().map((c) => [c.id, c.segmento, c.faixa, decimal(c.prob, 4), c.semanas_sem_comprar,
    decimal(c.faturamento_26s, 2), decimal(c.faturamento_em_risco, 2)].join(';'));
  const texto = `﻿${[cabecalho.join(';'), ...linhasCsv].join('\r\n')}\r\n`;
  const sub = chaveSubconjunto(estado.filtros.segmentos);
  const nome = `lista_acao_${sub === 'todos' ? 'todos' : sub.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\+/g, '_').replace(/\s+/g, '_')}.csv`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
