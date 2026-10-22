"""Posições deterministas para os mapas do painel (mapa de clientela da aba Lojas, rede de cestas da aba Produtos).

Perto na tela = parecido nos dados (clientes ou cestas em comum), nunca geografia. MDS do scikit-learn com início
clássico e semente fixa: o mesmo dado dá sempre o mesmo desenho.
"""

import numpy as np

SEMENTE = 42
VIZINHOS_LAYOUT = 8


def distancia_no_grafo(semelhanca: np.ndarray) -> np.ndarray:
    """Caminho mais curto no grafo dos VIZINHOS_LAYOUT vizinhos mais fortes de cada item, comprimento −log(Jaccard).
    Itens sem caminho (componentes separados) ficam a 1,2 × a maior distância encontrada."""
    from scipy.sparse.csgraph import shortest_path

    n = len(semelhanca)
    comprimento = -np.log(np.clip(semelhanca, 1e-4, 1))
    grafo = np.zeros_like(semelhanca)
    for i in range(n):
        vizinhos = [j for j in np.argsort(-semelhanca[i], kind="stable") if j != i][:VIZINHOS_LAYOUT]
        grafo[i, vizinhos] = comprimento[i, vizinhos]
        grafo[vizinhos, i] = comprimento[vizinhos, i]
    distancia = shortest_path(grafo, directed=False)
    finita = np.isfinite(distancia)
    distancia[~finita] = distancia[finita].max() * 1.2
    return distancia


def mds(distancia: np.ndarray) -> np.ndarray:
    from sklearn.manifold import MDS

    if len(distancia) <= 2:
        return np.array([[-1.0, 0.0], [1.0, 0.0]][: len(distancia)])
    return MDS(n_components=2, metric="precomputed", init="classical_mds", n_init=1, random_state=SEMENTE,
               normalized_stress="auto").fit_transform(distancia)


def posicoes_em_dois_niveis(semelhanca: np.ndarray, rotulos: np.ndarray) -> np.ndarray:
    """Posições em dois níveis: cada grupo é um disco (área ∝ número de itens) e os discos não se sobrepõem;
    os itens ficam dentro do disco do seu grupo. Usado no mapa de clientela (grupos = regiões) e na rede de cestas
    (grupos = departamentos)."""
    grupos = sorted(set(rotulos))
    membros = {g: np.flatnonzero(rotulos == g) for g in grupos}
    raio = {g: np.sqrt(len(membros[g])) for g in grupos}
    # 1. Centros dos grupos: MDS sobre −log da semelhança média entre os itens de dois grupos.
    entre = np.zeros((len(grupos), len(grupos)))
    for a, ga in enumerate(grupos):
        for b, gb in enumerate(grupos):
            if a != b:
                media = semelhanca[np.ix_(membros[ga], membros[gb])].mean()
                entre[a, b] = -np.log(max(media, 1e-4))
    centros = mds(entre)
    # Afasta o mínimo para nenhum par de discos se sobrepor (a mesma escala para todos: a arrumação relativa fica).
    folga = 1.2
    escala = max((raio[ga] + raio[gb] + folga) / max(np.linalg.norm(centros[a] - centros[b]), 1e-6)
                 for a, ga in enumerate(grupos) for b, gb in enumerate(grupos) if a < b)
    centros = centros * escala
    # 2. Itens dentro do disco do grupo, pela semelhança entre eles.
    xy = np.zeros((len(rotulos), 2))
    for a, g in enumerate(grupos):
        idx = membros[g]
        local = mds(distancia_no_grafo(semelhanca[np.ix_(idx, idx)]))
        local = local - local.mean(axis=0)
        alcance = np.linalg.norm(local, axis=1).max() or 1.0
        xy[idx] = centros[a] + local / alcance * raio[g] * 0.85
    return xy
