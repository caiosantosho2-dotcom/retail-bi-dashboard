// Pequenos múltiplos (skill designing-dashboard-ui, "Que gráfico usar"): a mesma série em vários grupos, lado a lado,
// no mesmo eixo Y. Usados com os 4 segmentos, para Regulares e Em pausa não ficarem na mesma área (spec, seção 7).
import { COR } from './tema.js';
import { fmt } from '../formatar.js';

/** Máximo redondo para cima (1, 2 ou 5 × 10^n), para o eixo comum ter rótulos redondos. */
export function maximoRedondo(valor) {
  const escala = 10 ** Math.floor(Math.log10(valor || 1));
  return [1, 2, 5, 10].map((m) => m * escala).find((m) => m >= valor);
}

/**
 * Opções do ECharts para N gráficos num só contêiner: lado a lado, ou em 2 colunas quando o gráfico é estreito
 * (largura < 600 px; no celular os 4 lado a lado ficariam finos demais para ler).
 * series: [{ nome, cor, dados, apagada }] — apagada = fora do filtro (opacidade 0,35, cross-filter).
 */
export function opcaoMultiplos(rotulos, series, largura = Infinity) {
  const maximo = maximoRedondo(Math.max(...series.flatMap((s) => s.dados)));
  const colunas = largura < 600 ? 2 : series.length;
  const linhas = Math.ceil(series.length / colunas);
  const larg = 100 / colunas;
  const alt = 100 / linhas;
  const pos = (i) => ({ col: i % colunas, lin: Math.floor(i / colunas) });
  return {
    title: series.map((s, i) => ({ text: s.nome, left: `${pos(i).col * larg + 1}%`, top: `${pos(i).lin * alt}%`,
                                   textStyle: { fontSize: 11, color: COR.textoSecundario, fontWeight: 600, opacity: s.apagada ? 0.6 : 1 } })),
    grid: series.map((_, i) => ({ left: `${pos(i).col * larg + 1}%`, width: `${larg - 3}%`,
                                  top: linhas === 1 ? 30 : `${pos(i).lin * alt + 9}%`, height: linhas === 1 ? undefined : `${alt - 20}%`,
                                  bottom: linhas === 1 ? 20 : undefined, containLabel: true })),
    xAxis: series.map((_, i) => ({ type: 'category', gridIndex: i, data: rotulos, boundaryGap: false,
                                   axisLabel: { color: COR.textoMudo, fontSize: 11, interval: (n) => n % 26 === 0 } })),
    yAxis: series.map((_, i) => ({ type: 'value', gridIndex: i, max: maximo,
                                   axisLabel: { show: pos(i).col === 0, color: COR.textoMudo, fontSize: 11, formatter: fmt.usdGrande } })),
    series: series.map((s, i) => ({ name: s.nome, type: 'line', xAxisIndex: i, yAxisIndex: i, symbol: 'none', data: s.dados,
                                    lineStyle: { color: s.cor, width: 2, opacity: s.apagada ? 0.35 : 1 }, itemStyle: { color: s.cor } })),
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, valueFormatter: (v) => fmt.usd(v) },
  };
}
