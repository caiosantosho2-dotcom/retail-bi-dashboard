// Dispersão "Onde agir no mix" (spec v4.1, B3): participação × crescimento comparável, com os dois cortes do arquivo e os
// 4 quadrantes. A participação vai de 0,2% a 56%: o eixo x é logarítmico para os departamentos pequenos não virarem um
// só ponto. Os limites dos eixos são só desenho; cortes, quadrantes e destaques vêm prontos do JSON.
import { NOME_QUADRANTE } from '../decisao_textos.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA } from '../selecao.js';
import { COR, FONTE, base } from './tema.js';

/** Rótulo de cada quadrante no seu canto: participação baixa à esquerda, crescimento alto em cima. */
const CANTOS = { investir: 'insideTopLeft', manter: 'insideTopRight', defender: 'insideBottomRight', rever: 'insideBottomLeft' };

function limites(linhas, corteP, corteC) {
  const participacoes = [...linhas.map((l) => l.participacao), corteP];
  const crescimentos = [...linhas.map((l) => l.crescimento), corteC];
  return {
    xMin: 10 ** Math.floor(Math.log10(Math.min(...participacoes))),
    xMax: 1,
    // De 5 em 5 pontos, com folga para o rótulo do canto não encostar no ponto mais alto ou mais baixo.
    yMin: Math.floor((Math.min(...crescimentos) - 0.03) * 20) / 20,
    yMax: Math.ceil((Math.max(...crescimentos) + 0.03) * 20) / 20,
  };
}

/** Ordem do maior para o menor: o índice da série fica estável, e o ponto pequeno é desenhado por cima do grande. */
export const ordemDoGrafico = (linhas) => [...linhas].sort((a, b) => b.participacao - a.participacao || a.departamento.localeCompare(b.departamento));

/** Posição do rótulo de cada destaque. Da esquerda para a direita, alterna embaixo e em cima: destaques vizinhos ficam em
 *  lados opostos do ponto. Os dois de baixo descem o necessário para não encostar, com a menor altura de área de desenho do
 *  painel (em tela maior os pontos ficam mais longe). Sem estado e sem depender da largura. */
function rotulosDosDestaques(lista, yMin, yMax) {
  const ALTURA_MINIMA = 272;
  const LINHA = 17; // Texto de 13 px mais o contorno (v4.2).
  const rotulos = new Map();
  const porX = lista.filter((l) => l.destaque).sort((a, b) => a.participacao - b.participacao);
  porX.forEach((l, i) => { if (i % 2) rotulos.set(l.departamento, { position: 'top', dy: 0 }); });
  let anterior = -Infinity;
  for (const l of porX.filter((x) => !rotulos.has(x.departamento)).sort((a, b) => b.crescimento - a.crescimento)) {
    const y = ((yMax - l.crescimento) / (yMax - yMin)) * ALTURA_MINIMA;
    const alvo = Math.max(y, anterior + LINHA);
    rotulos.set(l.departamento, { position: 'bottom', dy: alvo - y });
    anterior = alvo;
  }
  return rotulos;
}

/** linhas: um recorte de departamentos_quadrante_<periodo>.json, com ao menos uma linha. */
export function opcaoQuadrante(linhas, selecionados, titulo) {
  const lista = ordemDoGrafico(linhas);
  const { corte_participacao: corteP, corte_crescimento: corteC } = lista[0];
  const { xMin, xMax, yMin, yMax } = limites(lista, corteP, corteC);
  const fora = (l) => selecionados.size > 0 && !selecionados.has(l.departamento);
  const rotulos = rotulosDosDestaques(lista, yMin, yMax);
  // Rótulo só nos destaques e no que está selecionado; os outros pontos só têm tooltip.
  const comRotulo = (l) => Boolean(l.destaque) || selecionados.has(l.departamento);
  const area = (quadrante, x0, y0, x1, y1) => [
    // Cada quadrante com o seu fundo da paleta (v4.2); o nome no canto continua: a cor nunca é a única pista.
    { name: NOME_QUADRANTE[quadrante], coord: [x0, y0], label: { position: CANTOS[quadrante] }, itemStyle: { color: COR.quadrante[quadrante] } },
    { coord: [x1, y1] },
  ];
  const nomeEixo = { nameTextStyle: { color: COR.textoMudo, fontSize: FONTE.rotulo }, nameLocation: 'middle' };
  return {
    ...base(titulo, `${titulo}. Cortes: participação ${fmt.pct(corteP)} e crescimento ${fmt.pct(corteC)}. `
      + lista.map((l) => `${l.departamento}: ${NOME_QUADRANTE[l.quadrante]}${l.destaque ? `, destaque ${l.destaque}` : ''}`).join('; ') + '.'),
    grid: { left: 52, right: 12, top: 8, bottom: 40 },
    tooltip: { trigger: 'item', formatter: (p) => {
      const l = lista[p.dataIndex];
      const acao = selecionados.has(l.departamento) ? 'Clique de novo para desfazer' : 'Clique para filtrar; Ctrl + clique soma';
      return `${l.departamento}: ${NOME_QUADRANTE[l.quadrante]}${l.destaque ? ` (destaque ${l.destaque})` : ''}<br>`
        + `Participação: ${fmt.pct(l.participacao)}<br>Crescimento comparável: ${fmt.pct(l.crescimento)}<br>`
        + `Contra o crescimento do recorte: ${fmt.gap(l.valor_gap)}<br>${acao}`;
    } },
    xAxis: { type: 'log', logBase: 10, min: xMin, max: xMax, name: 'Participação no faturamento (escala logarítmica)', nameGap: 22, ...nomeEixo,
             splitLine: { show: false }, axisLabel: { color: COR.textoMudo, fontSize: FONTE.rotulo, formatter: (v) => fmt.pct(v, v < 0.01 ? 1 : 0) } },
    yAxis: { type: 'value', min: yMin, max: yMax, name: 'Crescimento comparável', nameGap: 38, nameRotate: 90, ...nomeEixo,
             axisLabel: { color: COR.textoMudo, fontSize: FONTE.rotulo, formatter: (v) => fmt.pct(v, 0) } },
    series: [{
      name: 'Departamentos', type: 'scatter', cursor: 'pointer',
      data: lista.map((l) => ({
        name: l.departamento, value: [l.participacao, l.crescimento],
        symbolSize: l.destaque ? 15 : 10,
        // Destaque marcado pelo contorno, pelo tamanho e pelo número no rótulo: nunca só pela cor. v4.2: o rótulo é só o
        // número (1, 2, 3), porque o nome já está na lista "Defender primeiro" ao lado e no tooltip.
        itemStyle: { color: COR.serie, opacity: fora(l) ? OPACIDADE_FORA : 1,
                     borderColor: l.destaque ? COR.textoPrimario : COR.superficie, borderWidth: l.destaque ? 2 : 1 },
        // Fora da seleção, o ponto apaga e o nome fica em --text-muted: texto nunca abaixo de 4,5:1 (v4.2).
        label: { show: comRotulo(l), color: fora(l) ? COR.textoMudo : COR.textoPrimario,
                 position: rotulos.get(l.departamento)?.position ?? 'top', formatter: l.destaque ? String(l.destaque) : l.departamento },
      })),
      // Em recortes apertados o nome pode passar sobre um ponto: o contorno na cor do fundo o mantém legível.
      label: { show: false, distance: 4, fontSize: FONTE.rotulo, color: COR.textoPrimario, fontWeight: 600, textBorderColor: COR.superficie, textBorderWidth: 3 },
      labelLayout: (p) => ({ dy: rotulos.get(lista[p.dataIndex]?.departamento)?.dy ?? 0 }),
      markLine: { silent: true, symbol: 'none', label: { show: false }, animation: false,
                  lineStyle: { color: COR.textoMudo, type: 'dashed', width: 1 },
                  data: [{ xAxis: corteP }, { yAxis: corteC }] },
      markArea: { silent: true, animation: false,
                  label: { show: true, color: COR.textoSecundario, fontSize: FONTE.rotulo, fontWeight: 600 },
                  data: [area('investir', xMin, corteC, corteP, yMax), area('manter', corteP, corteC, xMax, yMax),
                         area('defender', corteP, yMin, xMax, corteC), area('rever', xMin, yMin, corteP, corteC)] },
    }],
  };
}
