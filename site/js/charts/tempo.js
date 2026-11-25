// Gráfico de tempo, o mesmo na Visão Geral e em Categorias (decisões G2 e G3 do lakehouse): só o período selecionado,
// um ponto por dia em 4 semanas e por semana no resto, com o ano anterior tracejado (dia − 364 no diário, semana − 52 no
// semanal). Em 4, 13 e 26 semanas, a linha é das lojas comparáveis do período; na base inteira, de todas as lojas, sem ano
// anterior. O ponto não filtra: só mostra o tooltip, como no gráfico que este substitui.
import { serieTempo } from '../agregados.js';
import { definirEtiquetas, definirInfo, preencherTabela } from '../componentes.js';
import { linhas } from '../dados.js';
import { fmt } from '../formatar.js';
import { COR, FONTE, base } from './tema.js';

export const TITULO_TEMPO = 'Faturamento ao longo do tempo';
const PERIODOS = ['4s', '13s', '26s', 'base'];

/** Os 4 arquivos do gráfico (lista de abertura do manifest), como { periodo: linhas }. */
export async function carregarTempo() {
  const listas = await Promise.all(PERIODOS.map((p) => linhas(`faturamento_tempo_${p}.json`)));
  return Object.fromEntries(PERIODOS.map((p, i) => [p, listas[i]]));
}

/** O texto completo do método (vai para o ⓘ e para a descrição acessível do gráfico). */
function textoLojas(comAnterior, diario, lojas) {
  if (!comAnterior) return 'Todas as lojas, um ponto por semana. Sem ano anterior: a base inteira começa no primeiro dado, e não há um ano antes dele.';
  return `Lojas comparáveis do período (${fmt.contagem(lojas)} lojas), um ponto por ${diario ? 'dia' : 'semana'}. `
    + `Tracejado: ${diario ? 'o mesmo dia' : 'a mesma semana'} um ano antes. O KPI de faturamento soma todas as lojas.`;
}

/** v4.2: subtítulo curto; as lojas viram etiqueta (mudam a leitura) e o resto vai para o ⓘ. */
function subtituloCurto(comAnterior, diario) {
  if (!comAnterior) return 'Por semana, sem ano anterior';
  return `Por ${diario ? 'dia' : 'semana'}; tracejado: um ano antes`;
}

/**
 * painel e grafico: o retorno de painelGrafico e a instância do ECharts dele. dados: { linhas (do período), periodo,
 * filtros, lojas (comparáveis do período), compacto (menos marcas no eixo, para o painel baixo de Categorias), nome }.
 * O ponto não filtra (só mostra o tooltip); isso também está no ⓘ.
 */
export function desenharTempo(painel, grafico, { linhas: dadosPeriodo, periodo, filtros, lojas, compacto = false, nome = '' }) {
  const serie = serieTempo(dadosPeriodo, filtros);
  const diario = periodo === '4s';
  const comAnterior = serie.some((p) => p.faturamento_ano_anterior !== null);
  const rotuloPonto = diario ? 'Dia' : 'Semana de';
  const titulo = nome ? `${TITULO_TEMPO}, ${nome}` : TITULO_TEMPO;
  const nota = textoLojas(comAnterior, diario, lojas);

  painel.subtitulo.textContent = subtituloCurto(comAnterior, diario);
  // v4.3: "todas as lojas" saiu (repetia o filtro); "lojas comparáveis" fica, porque muda a leitura da linha.
  definirEtiquetas(painel.etiquetas, [comAnterior ? [`${fmt.contagem(lojas)} lojas comparáveis`] : null]);
  definirInfo(painel.info, [nota, 'Passe o mouse ou toque num ponto para ver o valor; o ponto não filtra.']);

  const ultimo = serie.at(-1);
  grafico.setOption({
    ...base(titulo, `${titulo}. ${nota} No último ponto, ${fmt.usd(ultimo.faturamento)}`
      + `${comAnterior ? ` contra ${fmt.usd(ultimo.faturamento_ano_anterior)} um ano antes` : ''}. Os valores de cada ponto estão na tabela.`),
    // v4.3: margem direita para o rótulo do último ponto ("US$ 72,3 mil") caber inteiro.
    grid: { left: 8, right: 104, top: comAnterior ? 26 : 8, bottom: 4, containLabel: true },
    legend: comAnterior ? { top: 0, right: 0, data: ['Período atual', 'Ano anterior'] } : undefined,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      formatter: (itens) => {
        const atual = itens.find((x) => x.seriesName === 'Período atual')?.value;
        const anterior = itens.find((x) => x.seriesName === 'Ano anterior')?.value;
        const cabecalho = `${rotuloPonto} ${itens[0].axisValue}<br>Período atual: ${fmt.usd(atual)}`;
        if (!comAnterior) return cabecalho;
        return `${cabecalho}<br>Ano anterior: ${fmt.usd(anterior)}<br>Variação: ${atual != null && anterior ? fmt.variacao(atual / anterior - 1) : '—'}`;
      },
    },
    xAxis: { type: 'category', boundaryGap: false, data: serie.map((p) => fmt.dataCurta(p.inicio)),
             axisLabel: { color: COR.textoMudo, fontSize: FONTE.rotulo, hideOverlap: true } },
    yAxis: { type: 'value', splitNumber: compacto ? 2 : undefined, axisLabel: { color: COR.textoMudo, fontSize: FONTE.rotulo, formatter: (v) => fmt.usdGrande(v) } },
    series: [
      ...(comAnterior ? [{ name: 'Ano anterior', type: 'line', symbol: 'none', data: serie.map((p) => p.faturamento_ano_anterior),
                           lineStyle: { color: COR.anoAnterior, type: 'dashed', width: 2 }, itemStyle: { color: COR.anoAnterior } }] : []),
      { name: 'Período atual', type: 'line', symbol: 'none', data: serie.map((p) => p.faturamento),
        lineStyle: { color: COR.serie, width: 2 }, itemStyle: { color: COR.serie },
        endLabel: { show: true, color: COR.textoSecundario, fontSize: FONTE.rotulo, formatter: (p) => fmt.usdGrande(p.value) } },
    ],
  }, { notMerge: true });

  preencherTabela(painel.tabela, [
    { titulo: rotuloPonto, valor: (p) => fmt.data(p.inicio) },
    { titulo: 'Período atual', valor: (p) => fmt.usd(p.faturamento), numero: true },
    ...(comAnterior ? [{ titulo: 'Ano anterior', valor: (p) => fmt.usd(p.faturamento_ano_anterior), numero: true }] : []),
  ], serie, titulo);
}
