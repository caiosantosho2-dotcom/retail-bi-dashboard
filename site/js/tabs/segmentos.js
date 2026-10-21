// Aba Segmentos (spec 5.3): Roda dos 4 segmentos (tamanho = faturamento) e painel de detalhe do segmento clicado.
// Os números são da janela de 26 semanas do RFM do RAG; o filtro de período não se aplica.
import { COR, SEG_CORES, SEGMENTOS, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';

// Área do círculo proporcional ao faturamento. Abaixo de 24 px o nó vira alvo de clique pequeno demais:
// o rótulo dá o número real, então o piso não engana.
const DIAMETRO_MAX = 150;
const DIAMETRO_MIN = 24;

const estadoAba = { selecionado: null };
let dados;
let ui;

export async function iniciar(container) {
  const roda = painelGrafico({
    titulo: 'A roda dos segmentos',
    subtitulo: 'Tamanho = faturamento das últimas 26 semanas (RFM do chat). Clique num segmento para ver o detalhe.',
    classe: 'sg-roda',
  });
  const seletor = el('div', { class: 'seletor-segmentos', role: 'group', 'aria-label': 'Escolher segmento' });
  roda.grafico.before(seletor);
  const detalhe = el('section', { class: 'painel sg-detalhe', 'aria-labelledby': 'sg-detalhe-titulo', 'aria-live': 'polite' });
  container.classList.add('sg');
  container.replaceChildren(roda.painel, detalhe);
  ui = { roda, seletor, detalhe, grafico: criarGrafico(roda.grafico) };
  roda.aoAlternar((tabela) => { seletor.hidden = tabela; if (!tabela) ui.grafico.resize(); });

  try {
    const [segs, manifest] = await Promise.all([linhas('segmentos.json'), carregar('manifest.json')]);
    dados = { segs: SEGMENTOS.map((nome) => segs.find((s) => s.segmento === nome)), manifest };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }

  seletor.replaceChildren(...dados.segs.map((s) => el('button', {
    class: 'botao botao--segmento', type: 'button', 'aria-pressed': 'false', dataset: { segmento: s.segmento },
    onclick: () => selecionar(estadoAba.selecionado === s.segmento ? null : s.segmento),
  }, etiquetaSegmento(s.segmento, SEG_CORES[s.segmento]))));
  ui.grafico.on('click', (p) => { if (p.dataType === 'node') selecionar(p.name); });
  // A caixa quadrada depende do tamanho do gráfico: redesenha depois de cada redimensionamento.
  let ultimoTamanho = '';
  ui.grafico.on('finished', () => {
    const tamanho = `${ui.grafico.getWidth()}x${ui.grafico.getHeight()}`;
    if (ultimoTamanho && tamanho !== ultimoTamanho) desenharRoda();
    ultimoTamanho = tamanho;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && estadoAba.selecionado && !container.hidden) selecionar(null);
  });

  preencherTabela(roda.tabela, [
    { titulo: 'Segmento', valor: (s) => etiquetaSegmento(s.segmento, SEG_CORES[s.segmento]) },
    { titulo: 'Clientes', valor: (s) => `${fmt.contagem(s.clientes)} (${fmt.pct(s.clientes_pct)})`, numero: true },
    { titulo: 'Faturamento', valor: (s) => `${fmt.usdGrande(s.faturamento)} (${fmt.pct(s.faturamento_pct)})`, numero: true },
    { titulo: 'Ticket médio', valor: (s) => fmt.usd(s.ticket_medio), numero: true },
    { titulo: 'CLV médio', valor: (s) => fmt.usd(s.clv_medio), numero: true },
    { titulo: 'Em risco alto', valor: (s) => fmt.pct(s.risco_alto_pct), numero: true },
    { titulo: 'Desconto mediano', valor: (s) => fmt.pct(s.desconto_mediano_pct), numero: true },
  ], dados.segs, 'Os quatro segmentos, janela de 26 semanas');
  selecionar(null);
}

function selecionar(segmento) {
  estadoAba.selecionado = segmento;
  ui.seletor.querySelectorAll('[data-segmento]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.segmento === segmento)));
  desenharRoda();
  desenharDetalhe();
  if (segmento && window.matchMedia('(max-width: 1023px)').matches) ui.detalhe.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Lado da caixa da roda: o menor lado do gráfico menos espaço para os nós e os rótulos.
// Em tela estreita o rótulo é curto (nome + % do faturamento) e precisa de menos folga nas laterais.
const estreito = () => ui.grafico.getWidth() < 600;
const lado = () => (estreito()
  ? Math.max(120, Math.min(ui.grafico.getWidth() - 150, ui.grafico.getHeight() - 150))
  : Math.max(120, Math.min(ui.grafico.getWidth() - 320, ui.grafico.getHeight() - 190)));

function desenharRoda() {
  const maior = Math.max(...dados.segs.map((s) => s.faturamento));
  const selecionado = estadoAba.selecionado;
  const diametroMax = Math.min(DIAMETRO_MAX, lado() * 0.55);
  const curto = estreito();
  ui.grafico.setOption({
    ...base('A roda dos segmentos: tamanho proporcional ao faturamento',
      'Quatro segmentos em círculo, com a área proporcional ao faturamento das últimas 26 semanas: '
      + dados.segs.map((s) => `${s.segmento}, ${fmt.pct(s.faturamento_pct)} do faturamento e ${fmt.pct(s.clientes_pct)} dos clientes`).join('; ') + '.'),
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const s = dados.segs.find((x) => x.segmento === p.name);
        return `${s.segmento}<br>${fmt.pct(s.faturamento_pct)} do faturamento (${fmt.usdGrande(s.faturamento)})<br>`
          + `${fmt.pct(s.clientes_pct)} dos clientes (${fmt.contagem(s.clientes)})`;
      },
    },
    series: [{
      // Posições fixas na ordem dos segmentos (topo, direita, baixo, esquerda): Regulares e Em pausa, o par de cores
      // que o validador reprova lado a lado, ficam em lados opostos da roda.
      // Caixa quadrada (a roda fica redonda) e nodeScaleRatio 0 (o tamanho do nó é só o do faturamento).
      type: 'graph', layout: 'none', roam: false, nodeScaleRatio: 0, animationDurationUpdate: 300,
      left: 'center', top: 'middle', width: lado(), height: lado(),
      data: dados.segs.map((s, i) => {
        const ativo = !selecionado || selecionado === s.segmento;
        const angulo = -Math.PI / 2 + (i * Math.PI) / 2;
        const pct = (v) => fmt.pct(v, v < 0.1 ? 1 : 0);
        return {
          name: s.segmento, x: Math.cos(angulo), y: Math.sin(angulo),
          symbolSize: Math.max(DIAMETRO_MIN, diametroMax * Math.sqrt(s.faturamento / maior)),
          itemStyle: {
            color: SEG_CORES[s.segmento], opacity: ativo ? 1 : 0.4,
            borderColor: selecionado === s.segmento ? COR.textoPrimario : COR.superficie, borderWidth: selecionado === s.segmento ? 3 : 2,
          },
          label: {
            // opacity 1: sem isto o rótulo herda o esmaecimento do círculo e perde contraste.
            show: true, position: 'bottom', distance: 8, opacity: 1,
            formatter: () => (curto
              ? `{nome|${s.segmento}}\n{num|${pct(s.faturamento_pct)} do faturamento}`
              : `{nome|${s.segmento}}\n{num|${pct(s.faturamento_pct)} do faturamento · ${pct(s.clientes_pct)} dos clientes}`),
            rich: { nome: { fontWeight: 600, fontSize: 13, color: COR.textoPrimario, lineHeight: 18 },
                    num: { fontSize: 11, color: COR.textoSecundario, lineHeight: 16 } },
          },
        };
      }),
      // O aro da roda: estrutura, não dado (linha fina na cor da grade).
      links: dados.segs.map((s, i) => ({ source: s.segmento, target: dados.segs[(i + 1) % dados.segs.length].segmento })),
      lineStyle: { color: COR.grade, width: 1, curveness: 0.4, opacity: 1 },
      emphasis: { scale: 1.05, label: { show: true }, lineStyle: { width: 1 } },
    }],
  });
}

function desenharDetalhe() {
  const s = dados.segs.find((x) => x.segmento === estadoAba.selecionado);
  if (!s) {
    ui.detalhe.replaceChildren(
      el('h2', { class: 'painel__titulo', id: 'sg-detalhe-titulo' }, 'Detalhe do segmento'),
      el('p', { class: 'painel__vazio' }, 'Clique em um item para ver o detalhe.'));
    return;
  }
  const m = dados.manifest.modelo;
  const risco = s.risco_alto_pct === null
    ? el('dd', {}, '—', el('span', { class: 'detalhe__nota' }, 'Fora do modelo de risco: sem compra há mais de 8 semanas.'))
    : el('dd', {}, fmt.pct(s.risco_alto_pct),
      el('span', { class: 'detalhe__nota' }, `dos clientes avaliados com risco alto (probabilidade ≥ ${fmt.decimal(m.limiar_alerta, 2)} de pausar 8 semanas)`));
  const linha = (rotulo, valor, nota) => [el('dt', {}, rotulo), el('dd', {}, valor, nota ? el('span', { class: 'detalhe__nota' }, nota) : null)];
  ui.detalhe.replaceChildren(
    el('header', { class: 'painel__cabecalho' },
      el('h2', { class: 'painel__titulo', id: 'sg-detalhe-titulo' }, etiquetaSegmento(s.segmento, SEG_CORES[s.segmento])),
      el('button', { class: 'botao-tabela', type: 'button', onclick: () => selecionar(null) }, 'Fechar (Esc)')),
    el('dl', { class: 'detalhe' },
      linha('Clientes', fmt.pct(s.clientes_pct), `${fmt.contagem(s.clientes)} clientes`),
      linha('Faturamento', fmt.pct(s.faturamento_pct), `${fmt.usd(s.faturamento)} em 26 semanas`),
      linha('Ticket médio', fmt.usd(s.ticket_medio), 'média do ticket de cada cliente'),
      linha('CLV médio', fmt.usd(s.clv_medio), 'margem esperada em 52 semanas, com margem de 25% (premissa)'),
      [el('dt', {}, 'Em risco de pausa'), risco],
      linha('Desconto mediano', fmt.pct(s.desconto_mediano_pct), 'do valor bruto, por cliente')));
}
