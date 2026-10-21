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

export const linhas = async (nome) => (await carregar(nome)).linhas;
