export const cssVar = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
const px = (nome) => parseFloat(cssVar(nome));

export const SEG_CORES = {
  'Fiéis': cssVar('--seg-fieis'),
  'Regulares': cssVar('--seg-regulares'),
  'Esporádicos': cssVar('--seg-esporadicos'),
  'Em pausa': cssVar('--seg-em-pausa'),
};
export const SEGMENTOS = Object.keys(SEG_CORES);

// Cores de função fora dos segmentos (v4.2: tema claro, todas lidas de tokens.css).
export const COR = {
  serie: cssVar('--data-primaria'),
  secundaria: cssVar('--data-secundaria'),
  outros: cssVar('--seg-outros'),
  anoAnterior: cssVar('--data-anterior'),
  textoPrimario: cssVar('--text-primary'),
  textoSecundario: cssVar('--text-secondary'),
  textoMudo: cssVar('--text-muted'),
  textoSobreCor: cssVar('--text-on-color'),
  superficie: cssVar('--surface-panel'),
  // Faixa de destaque estrutural (não é dado): a mesma cor do hover.
  sombreado: cssVar('--surface-raised'),
  grade: cssVar('--grid'),
  eixo: cssVar('--axis'),
  sequencial: ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6'].map(cssVar),
  // Índice contra uma média (afinidade): primária abaixo de 100, neutro no 100, rosa escurecido acima.
  divergente: ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-mid', '--div-pos-1', '--div-pos-2', '--div-pos-3'].map(cssVar),
  status: { baixo: cssVar('--status-good'), medio: cssVar('--status-warning'), alto: cssVar('--status-critical') },
  // Quadrantes do "Onde agir no mix": áreas de fundo, sempre com o nome no canto.
  quadrante: { investir: cssVar('--quad-investir'), manter: cssVar('--quad-manter'),
               defender: cssVar('--quad-defender'), rever: cssVar('--quad-rever') },
};

// Tamanhos de texto dos gráficos (v4.2: nada abaixo de 13 px). Quem precisar de um tamanho explícito usa estes.
export const FONTE = {
  familia: cssVar('--font-ui'),
  eixo: px('--chart-fs-axis'),
  rotulo: px('--chart-fs-label'),
  legenda: px('--chart-fs-legend'),
  tooltip: px('--chart-fs-tooltip'),
  peso: Number(cssVar('--fw-body')),
  pesoForte: Number(cssVar('--fw-strong')),
};

function luminancia(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** Cor do texto escrito sobre uma marca colorida: a de maior contraste entre o texto principal e o branco. */
export const textoSobre = (cor) => (contraste(cor, COR.textoSobreCor) >= contraste(cor, COR.textoPrimario) ? COR.textoSobreCor : COR.textoPrimario);

export const NOME_TEMA = 'varejo-claro';

const eixo = () => ({
  axisLine: { lineStyle: { color: COR.eixo } },
  axisTick: { show: false },
  axisLabel: { color: COR.textoMudo, fontSize: FONTE.eixo, fontWeight: FONTE.peso },
  nameTextStyle: { color: COR.textoMudo, fontSize: FONTE.eixo, fontWeight: FONTE.peso },
  splitLine: { lineStyle: { color: COR.grade, type: 'solid' } },
});

/** O tema único de todos os gráficos: cores e tamanhos vêm dos tokens. */
export function registrarTema() {
  echarts.registerTheme(NOME_TEMA, {
    color: [COR.serie, COR.secundaria, SEG_CORES['Esporádicos'], SEG_CORES['Em pausa'], COR.outros],
    backgroundColor: 'transparent',
    textStyle: { color: COR.textoSecundario, fontFamily: FONTE.familia, fontSize: FONTE.rotulo, fontWeight: FONTE.peso },
    title: { textStyle: { color: COR.textoPrimario, fontSize: 17, fontWeight: FONTE.pesoForte } },
    legend: { textStyle: { color: COR.textoSecundario, fontSize: FONTE.legenda, fontWeight: FONTE.peso }, icon: 'roundRect', itemWidth: 14, itemHeight: 4 },
    tooltip: {
      backgroundColor: COR.superficie,
      borderColor: cssVar('--border'),
      textStyle: { color: COR.textoPrimario, fontSize: FONTE.tooltip, fontWeight: FONTE.peso },
    },
    categoryAxis: eixo(),
    valueAxis: eixo(),
    timeAxis: eixo(),
    logAxis: eixo(),
    radar: { axisName: { color: COR.textoSecundario, fontSize: FONTE.rotulo } },
    line: { lineStyle: { width: 2 }, symbol: 'none' },
    bar: { barMaxWidth: 28, itemStyle: { borderRadius: [0, 4, 4, 0] } },
  });
}

// Modo alto contraste: textura (aria.decal) em todos os gráficos, desligada por padrão.
let altoContraste = false;
const graficos = new Set();

/** Opções comuns a todo gráfico: título para o leitor de tela (escondido na tela) e aria ligado. */
export function base(titulo, descricao) {
  return {
    title: { text: titulo, show: false },
    aria: { enabled: true, decal: { show: altoContraste }, ...(descricao ? { label: { description: descricao } } : {}) },
    animationDuration: 300,
  };
}

export function criarGrafico(el) {
  const grafico = echarts.init(el, NOME_TEMA, { renderer: 'canvas' });
  graficos.add(grafico);
  return grafico;
}

export function definirAltoContraste(ativo) {
  altoContraste = ativo;
  graficos.forEach((g) => g.setOption({ aria: { enabled: true, decal: { show: ativo } } }));
}

// Redimensionamento com debounce de 150 ms; ao trocar de aba, o gráfico que ficou visível recalcula o tamanho.
let temporizador;
// Gráfico descartado (dispose) sai da lista: o DOM dele não existe mais.
const redimensionar = () => graficos.forEach((g) => {
  if (g.isDisposed()) graficos.delete(g);
  else if (g.getDom().offsetParent) g.resize();
});
const agendar = () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(redimensionar, 150);
};
window.addEventListener('resize', agendar);
window.addEventListener('aba-visivel', () => requestAnimationFrame(redimensionar));
// v4.2: a barra lateral de filtros muda a largura da área dos gráficos sem mudar a janela (abrir, fechar, fonte
// carregando): quem observa é a área de conteúdo, não só a janela.
if (typeof ResizeObserver !== 'undefined') {
  const area = document.querySelector('.conteudo');
  if (area) new ResizeObserver(agendar).observe(area);
}

if (typeof echarts !== 'undefined') registrarTema();
else console.warn('ECharts não carregou: tema não registrado.');
