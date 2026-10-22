// Carrega cada JSON de site/data uma vez só; quem pede de novo recebe a mesma promessa.
const cache = new Map();

export function carregar(nome) {
  if (!cache.has(nome)) {
    cache.set(nome, fetch(`data/${nome}`).then((r) => {
      if (!r.ok) throw new Error(`data/${nome}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(nome);
}

/**
 * Linhas como lista de objetos, nos dois formatos do contrato 2.0. No formato compacto, cada coluna de dimensão
 * guarda o índice na lista `dimensoes[coluna]` (contrato, "Convenções gerais").
 */
export function expandir(dado) {
  if (!dado.colunas) return dado.linhas;
  const { colunas, dimensoes } = dado;
  return dado.linhas.map((linha) => {
    const objeto = {};
    colunas.forEach((c, i) => { objeto[c] = dimensoes[c] ? dimensoes[c][linha[i]] : linha[i]; });
    return objeto;
  });
}

const expandidos = new Map();

export async function linhas(nome) {
  if (!expandidos.has(nome)) expandidos.set(nome, carregar(nome).then(expandir));
  return expandidos.get(nome);
}
