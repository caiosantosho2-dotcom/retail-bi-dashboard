// Carrega cada JSON de site/data uma vez só; quem pede de novo recebe a mesma promessa.
// Falha passageira do servidor (5xx ou rede, como o 503 do GitHub Pages logo depois de publicar): mais uma tentativa.
// Se ainda falhar, a promessa sai do cache: a próxima aba que pedir o arquivo tenta de novo, em vez de herdar o erro.
const cache = new Map();
const TENTATIVAS = 2;
const ESPERA_MS = 800;

async function buscar(nome) {
  for (let tentativa = 1; ; tentativa += 1) {
    let resposta = null;
    try {
      resposta = await fetch(`data/${nome}`);
    } catch (erro) {
      if (tentativa >= TENTATIVAS) throw erro;
    }
    if (resposta?.ok) return resposta.json();
    if (resposta && (resposta.status < 500 || tentativa >= TENTATIVAS)) throw new Error(`data/${nome}: HTTP ${resposta.status}`);
    await new Promise((pronto) => { setTimeout(pronto, ESPERA_MS); });
  }
}

/** Guarda a promessa no mapa e a tira de lá se ela falhar. */
function lembrar(mapa, nome, criar) {
  if (!mapa.has(nome)) {
    const promessa = criar();
    promessa.catch(() => { if (mapa.get(nome) === promessa) mapa.delete(nome); });
    mapa.set(nome, promessa);
  }
  return mapa.get(nome);
}

export function carregar(nome) {
  return lembrar(cache, nome, () => buscar(nome));
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
  return lembrar(expandidos, nome, () => carregar(nome).then(expandir));
}
