// Números em pt-BR (skill designing-dashboard-ui, "Formatação de números"). Ausente vira "—".
const nf = (opcoes) => new Intl.NumberFormat('pt-BR', { useGrouping: 'always', ...opcoes });
const casas = (n) => nf({ minimumFractionDigits: n, maximumFractionDigits: n });
const compacto = nf({ notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 });
const ausente = (v) => v === null || v === undefined || Number.isNaN(v);

export const fmt = {
  /** US$ 482,3 mil · US$ 1,2 mi */
  usdGrande: (v) => (ausente(v) ? '—' : `US$ ${compacto.format(v)}`),
  /** US$ 31,47 */
  usd: (v) => (ausente(v) ? '—' : `US$ ${casas(2).format(v)}`),
  /** fração -> 35,2% */
  pct: (v, n = 1) => (ausente(v) ? '—' : `${casas(n).format(v * 100)}%`),
  /** fração de pontos percentuais -> +1,2 p.p. */
  pp: (v) => (ausente(v) ? '—' : `${v > 0 ? '+' : ''}${casas(1).format(v * 100)} p.p.`),
  /** fração -> ▲ 4,1% (seta + número; a cor fica com quem chama) */
  variacao: (v) => (ausente(v) ? '—' : `${v >= 0 ? '▲' : '▼'} ${casas(1).format(Math.abs(v * 100))}%`),
  /** 2.500 */
  contagem: (v) => (ausente(v) ? '—' : nf({ maximumFractionDigits: 0 }).format(v)),
  decimal: (v, n = 1) => (ausente(v) ? '—' : casas(n).format(v)),
  data: (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR'),
  dataCurta: (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
};
