export const cssVar = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

export const SEG_CORES = {
  'Fiéis': cssVar('--seg-fieis'),
  'Regulares': cssVar('--seg-regulares'),
  'Esporádicos': cssVar('--seg-esporadicos'),
  'Em pausa': cssVar('--seg-em-pausa'),
};

export const NOME_TEMA = 'varejo-dark';

const eixo = () => ({
  axisLine: { lineStyle: { color: cssVar('--axis') } },
  axisTick: { lineStyle: { color: cssVar('--axis') } },
  axisLabel: { color: cssVar('--text-muted'), fontSize: 11 },
  splitLine: { lineStyle: { color: cssVar('--grid') } },
});

export function registrarTema() {
  echarts.registerTheme(NOME_TEMA, {
    backgroundColor: 'transparent',
    textStyle: { color: cssVar('--text-secondary'), fontFamily: cssVar('--font-ui'), fontSize: 12 },
    title: { textStyle: { color: cssVar('--text-primary'), fontSize: 15, fontWeight: 600 } },
    legend: { textStyle: { color: cssVar('--text-secondary') } },
    tooltip: {
      backgroundColor: cssVar('--surface-raised'),
      borderColor: cssVar('--border'),
      textStyle: { color: cssVar('--text-primary') },
    },
    categoryAxis: eixo(),
    valueAxis: eixo(),
    timeAxis: eixo(),
    logAxis: eixo(),
    line: { lineStyle: { width: 2 }, symbol: 'none' },
    bar: { barMaxWidth: 28, itemStyle: { borderRadius: [0, 4, 4, 0] } },
    aria: { show: true },
  });
}

// Cria o gráfico com o tema único; o redimensionamento usa debounce de 150 ms.
const graficos = new Set();
let temporizador;

export function criarGrafico(el) {
  const grafico = echarts.init(el, NOME_TEMA, { renderer: 'canvas' });
  graficos.add(grafico);
  return grafico;
}

window.addEventListener('resize', () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => graficos.forEach((g) => g.resize()), 150);
});

// Ao trocar de aba, o gráfico que ficou visível precisa recalcular o tamanho.
window.addEventListener('aba-visivel', () => graficos.forEach((g) => g.resize()));

if (typeof echarts !== 'undefined') registrarTema();
else console.warn('ECharts não carregou: tema não registrado.');
