export const cssVar = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

export const SEG_CORES = {
  'Fiéis': cssVar('--seg-fieis'),
  'Regulares': cssVar('--seg-regulares'),
  'Esporádicos': cssVar('--seg-esporadicos'),
  'Em pausa': cssVar('--seg-em-pausa'),
};
export const SEGMENTOS = Object.keys(SEG_CORES);

// Cores de função fora dos segmentos. Série única sem segmento usa um passo da escala sequencial (spec, seção 7).
export const COR = {
  serie: cssVar('--seq-4'),
  outros: cssVar('--seg-outros'),
  anoAnterior: cssVar('--text-muted'),
  textoPrimario: cssVar('--text-primary'),
  textoSecundario: cssVar('--text-secondary'),
  textoMudo: cssVar('--text-muted'),
  superficie: cssVar('--surface-panel'),
  // Faixa do período selecionado na linha de 52 semanas: estrutura, não dado (a mesma cor do hover).
  sombreado: cssVar('--surface-raised'),
  grade: cssVar('--grid'),
  eixo: cssVar('--axis'),
  // --seq-2 fica de fora: o validador de paleta acusou passo curto demais entre --seq-1 e --seq-2.
  sequencial: ['--seq-1', '--seq-3', '--seq-4', '--seq-5', '--seq-6'].map(cssVar),
  // Índice contra uma média (afinidade): azul abaixo de 100, cinza no 100, vermelho acima.
  divergente: ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-mid', '--div-pos-1', '--div-pos-2', '--div-pos-3'].map(cssVar),
  status: { baixo: cssVar('--status-good'), medio: cssVar('--status-warning'), alto: cssVar('--status-critical') },
};

export const NOME_TEMA = 'varejo-dark';

const eixo = () => ({
  axisLine: { lineStyle: { color: COR.eixo } },
  axisTick: { show: false },
  axisLabel: { color: COR.textoMudo, fontSize: 11 },
  splitLine: { lineStyle: { color: COR.grade, type: 'solid' } },
});

export function registrarTema() {
  echarts.registerTheme(NOME_TEMA, {
    backgroundColor: 'transparent',
    textStyle: { color: COR.textoSecundario, fontFamily: cssVar('--font-ui'), fontSize: 12 },
    title: { textStyle: { color: COR.textoPrimario, fontSize: 15, fontWeight: 600 } },
    legend: { textStyle: { color: COR.textoSecundario }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
    tooltip: {
      backgroundColor: cssVar('--surface-raised'),
      borderColor: cssVar('--border'),
      textStyle: { color: COR.textoPrimario, fontSize: 12 },
    },
    categoryAxis: eixo(),
    valueAxis: eixo(),
    timeAxis: eixo(),
    logAxis: eixo(),
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
window.addEventListener('resize', () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(redimensionar, 150);
});
window.addEventListener('aba-visivel', () => requestAnimationFrame(redimensionar));

if (typeof echarts !== 'undefined') registrarTema();
else console.warn('ECharts não carregou: tema não registrado.');
