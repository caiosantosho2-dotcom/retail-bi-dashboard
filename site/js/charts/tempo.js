// Gráfico de tempo, usado pela Visão Geral e por Categorias (decisões G2 e G3 do lakehouse).
// PROVISÓRIO (parada 4a da spec do painel v4): só o aviso. A parada 4b desenha aqui a série de faturamento_tempo_<periodo>.json.
import { preencherTabela } from '../componentes.js';
import { COR, base } from './tema.js';

export const TITULO_TEMPO = 'Faturamento ao longo do tempo';
const AVISO = 'Gráfico provisório: o novo gráfico de tempo entra na próxima etapa.';

/** painel: o retorno de painelGrafico; grafico: a instância do ECharts dele. */
export function desenharTempoProvisorio(painel, grafico) {
  grafico.setOption({
    ...base(TITULO_TEMPO, AVISO),
    graphic: { type: 'text', left: 'center', top: 'middle',
               style: { text: AVISO.replace(': ', ':\n'), fill: COR.textoMudo, font: '13px system-ui', align: 'center' } },
  }, { notMerge: true });
  preencherTabela(painel.tabela, [{ titulo: 'Aviso', valor: (x) => x }], [AVISO], TITULO_TEMPO);
}
