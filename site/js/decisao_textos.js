// Textos dos dois blocos de decisão da Visão Geral (spec v4.1, G47 a G49). Sem DOM, para o teste rodar no Node
// (tests/decisao_textos.test.mjs). Todo número vem da linha do JSON; a única comparação é quem ganhou, e ela não vira número.
import { fmt } from './formatar.js';

export const CAPACIDADE_PADRAO = 100;
export const OBJETIVO_PADRAO = 'pausas';
export const OBJETIVOS = {
  pausas: { rotulo: 'Priorizar risco de pausa', criterio: 'mais chance de pausar', campo: 'precisao_historica' },
  valor: { rotulo: 'Priorizar valor em risco', criterio: 'mais chance de pausar e mais valor', campo: 'valor_capturado_historico' },
};
export const NOTA_FIXA_CRM = 'Mostra quem tende a pausar, não quantas pausas o contato evitaria.';
export const NOTA_SEM_CRESCIMENTO = 'Sem ano anterior, não há crescimento para comparar.';
export const NOTA_SO_EM_PAUSA = 'O segmento "Em pausa" é definido por ter parado de comprar, então o crescimento cai por construção. Por isso, só com ele, não há gráfico.';
export const AVISO_COM_EM_PAUSA = '⚠ Com "Em pausa" entre os segmentos, o crescimento cai em parte por construção: o segmento é definido por ter parado de comprar.';
/** v4.2: a etiqueta visível do aviso acima (o texto completo vai para o ⓘ do quadrante). */
export const ETIQUETA_COM_EM_PAUSA = '⚠ Com "Em pausa", o crescimento cai por construção';
export const NOME_QUADRANTE = { investir: 'Investir', manter: 'Manter', defender: 'Defender', rever: 'Rever' };

/** A linha de uma capacidade, objetivo e método. */
export const linhaCrm = (linhas, capacidade, objetivo, metodo) => linhas.find((l) => l.capacidade === capacidade && l.objetivo === objetivo && l.metodo === metodo);

/** As capacidades que existem no arquivo, em ordem. */
export const capacidadesDe = (linhas) => [...new Set(linhas.map((l) => l.capacidade))].sort((a, b) => a - b);

export const subtituloCrm = (capacidade, objetivo) => `Com capacidade para ${fmt.contagem(capacidade)} clientes, priorizando quem tem ${OBJETIVOS[objetivo].criterio}`;

/** G49: lê a calibração da capacidade e do objetivo escolhidos. Na regra simples as colunas são nulas: sem nota. */
export function notaCalibracao(modelo) {
  const { pausas_esperadas_historicas: esperadas, pausas_reais_historicas: reais, capacidade } = modelo;
  if (esperadas === null || reais === null) return '';
  return `No teste, ${fmt.decimal(esperadas, 1)} pausas esperadas viraram ${fmt.decimal(reais, 1)} reais nos ${fmt.contagem(capacidade)} primeiros (média das fotos do teste).`;
}

/**
 * A frase de uma capacidade: modelo contra a regra simples, na métrica do objetivo. v4.3: sem "O modelo ganha." (a frase já
 * mostra os dois números); se a regra simples ganhar ou empatar, a conclusão diz. Precisão sem decimal, dinheiro curto.
 */
export function fraseHistorica(objetivo, modelo, regra) {
  const n = fmt.contagem(modelo.capacidade);
  const { campo } = OBJETIVOS[objetivo];
  const vencedor = modelo[campo] > regra[campo] ? 'modelo' : modelo[campo] < regra[campo] ? 'regra' : 'empate';
  const conclusao = { modelo: '', regra: 'A regra simples ganha.', empate: 'Empate.' }[vencedor];
  const formato = objetivo === 'pausas' ? fmt.part : fmt.usdGrande;
  const [x, y] = [formato(modelo[campo]), formato(regra[campo])];
  // v4.2: a frase em pedaços, para a tela pôr X (modelo) e Y (regra simples) em destaque; o texto é o mesmo.
  const pedacos = objetivo === 'pausas'
    ? [`Dos ${n} primeiros, `, { forte: x }, ' pausaram de fato, contra ', { forte: y }, ' pela regra simples.']
    : [`Os ${n} primeiros concentravam `, { forte: x }, ' do valor das pausas reais, contra ', { forte: y }, ' pela regra simples.'];
  const texto = pedacos.map((p) => (typeof p === 'string' ? p : p.forte)).join('');
  const detalhe = objetivo === 'pausas'
    ? `Das pausas reais da foto, a lista pegou ${fmt.part(modelo.pausas_capturadas_historica)}; a regra simples, ${fmt.part(regra.pausas_capturadas_historica)}.`
    : `Do valor das pausas reais da foto, a lista pegou ${fmt.part(modelo.fracao_valor_capturado_historica)}; a regra simples, ${fmt.part(regra.fracao_valor_capturado_historica)}.`;
  return { texto, pedacos, conclusao, vencedor, detalhe };
}

/** As linhas do recorte com os destaques em ordem. */
export function destaquesDe(linhas) {
  return linhas.filter((l) => l.destaque !== null).sort((a, b) => a.destaque - b.destaque);
}

/** "Em pausa" sozinho não tem gráfico; junto de outros segmentos, leva o aviso. A chave é a de chaveSubconjunto. */
export const soEmPausa = (subconjunto) => subconjunto === 'Em pausa';
export const temEmPausa = (subconjunto) => subconjunto.split('+').includes('Em pausa');

/** G47: recorte sem dados ou com menos de 3 destaques mostra o que existe e esta nota. Vazia quando há os 3. */
export function notaRecorte(linhas) {
  const n = destaquesDe(linhas).length;
  if (!linhas.length) return 'Nenhum departamento com amostra suficiente neste período e segmento.';
  if (n >= 3) return '';
  const validos = `(${fmt.contagem(linhas.length)} com amostra suficiente)`;
  if (n === 0) return `Nenhum departamento em Defender neste período e segmento ${validos}.`;
  return `Só ${n} ${n === 1 ? 'departamento' : 'departamentos'} em Defender neste período e segmento ${validos}.`;
}
