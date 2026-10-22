// Geometria do desenho dos mapas (mapa de clientela, rede de cestas). Só forma: os grupos e as posições vêm prontos
// do export.

/** Fecho convexo (cadeia monótona) dos pontos [x, y]. */
export function fecho(pontos) {
  const p = [...pontos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const meia = (lista) => {
    const h = [];
    for (const q of lista) {
      while (h.length >= 2 && cruz(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...meia(p), ...meia([...p].reverse())];
}

/** Contorno do grupo: o fecho afastado do centro, para os pontos da borda ficarem dentro. */
export function contorno(pontos, folga = 0.045) {
  const cx = pontos.reduce((a, q) => a + q[0], 0) / pontos.length;
  const cy = pontos.reduce((a, q) => a + q[1], 0) / pontos.length;
  return fecho(pontos).map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * folga, y + (dy / d) * folga];
  });
}

/** Contorno arredondado: o fecho de um círculo de raio `folga` em volta de cada ponto. Funciona com 1 ou 2 pontos. */
export function contornoArredondado(pontos, folga = 0.04, lados = 12) {
  const anel = [];
  for (const [x, y] of pontos) {
    for (let k = 0; k < lados; k++) {
      const t = (2 * Math.PI * k) / lados;
      anel.push([x + folga * Math.cos(t), y + folga * Math.sin(t)]);
    }
  }
  return fecho(anel);
}
