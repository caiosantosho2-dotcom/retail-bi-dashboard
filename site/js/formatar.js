// Números em pt-BR (skill designing-dashboard-ui, "Formatação de números"). Ausente vira "—".
// v4.3 (só exibição): dinheiro em blocos de decisão e listas com até 1 casa e "mil"/"mi" (usdGrande, gapCurto); centavos
// só nas tabelas detalhadas (usd, gap). Participação e precisão sem decimal (part); variação com 1 casa (variacao).
const nf = (opcoes) => new Intl.NumberFormat('pt-BR', { useGrouping: 'always', ...opcoes });
const casas = (n) => nf({ minimumFractionDigits: n, maximumFractionDigits: n });
const compacto = nf({ notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 });
const inteiro = nf({ maximumFractionDigits: 0 });
const ausente = (v) => v === null || v === undefined || Number.isNaN(v);
// Fração × 100 sem o ruído do ponto flutuante (0,2875 × 100 = 28,749999…, que arredondaria para 28,7 e não 28,8).
const cem = (v) => Number((v * 100).toPrecision(12));

const curto = (v) => (v < 1000 ? inteiro.format(v) : compacto.format(v));

export const fmt = {
  /** US$ 482,3 mil, US$ 1,2 mi; abaixo de mil, sem centavos (US$ 691) */
  usdGrande: (v) => (ausente(v) ? '—' : `${v < 0 ? '−' : ''}US$ ${curto(Math.abs(v))}`),
  /** diferença em dinheiro, curta e com sinal: −US$ 9,2 mil, +US$ 718 */
  gapCurto: (v) => (ausente(v) ? '—' : `${v < 0 ? '−' : '+'}US$ ${curto(Math.abs(v))}`),
  /** US$ 31,47 */
  usd: (v) => (ausente(v) ? '—' : `US$ ${casas(2).format(v)}`),
  /** diferença em dinheiro, sempre com sinal: −US$ 9.201,43 · +US$ 718,22 */
  gap: (v) => (ausente(v) ? '—' : `${v < 0 ? '−' : '+'}US$ ${casas(2).format(Math.abs(v))}`),
  /** participação ou precisão, fração -> 32% (abaixo de 1%, uma casa: 0,4%) */
  part: (v) => (ausente(v) ? '—' : `${casas(Math.abs(v) < 0.01 && v !== 0 ? 1 : 0).format(cem(v))}%`),
  /** fração -> 35,2% */
  pct: (v, n = 1) => (ausente(v) ? '—' : `${casas(n).format(cem(v))}%`),
  /** fração de pontos percentuais -> +1,2 p.p. */
  pp: (v) => (ausente(v) ? '—' : `${v > 0 ? '+' : ''}${casas(1).format(cem(v))} p.p.`),
  /** fração -> ▲ 4,1% (seta + número; a cor fica com quem chama) */
  variacao: (v) => (ausente(v) ? '—' : `${v >= 0 ? '▲' : '▼'} ${casas(1).format(Math.abs(cem(v)))}%`),
  /** 2.500 */
  contagem: (v) => (ausente(v) ? '—' : nf({ maximumFractionDigits: 0 }).format(v)),
  decimal: (v, n = 1) => (ausente(v) ? '—' : casas(n).format(v)),
  data: (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR'),
  dataCurta: (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
};
