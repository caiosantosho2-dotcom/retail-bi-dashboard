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


def posicoes_em_dois_niveis(semelhanca: np.ndarray, rotulos: np.ndarray, compacto: bool = False) -> np.ndarray:
    """Posições em dois níveis: cada grupo é um disco (área ∝ número de itens) e os discos não se sobrepõem;
    os itens ficam dentro do disco do seu grupo. Usado no mapa de clientela (grupos = regiões) e na rede de cestas
    (grupos = departamentos).

    compacto=True (rede de cestas): o maior grupo fica no centro e os outros em volta dele, no ângulo que o MDS deu,
    o mais perto possível sem sobreposição. Sem isso, um grupo pouco ligado aos outros vai para longe e espreme o maior
    num canto (validação da P2: GROCERY, com mais da metade dos nós, virava um novelo ilegível)."""
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
    if compacto:
        centros = _em_volta_do_maior(centros, [raio[g] for g in grupos], folga)
    # 2. Itens dentro do disco do grupo, pela semelhança entre eles.
    xy = np.zeros((len(rotulos), 2))
    for a, g in enumerate(grupos):
        idx = membros[g]
        local = mds(distancia_no_grafo(semelhanca[np.ix_(idx, idx)]))
        local = local - local.mean(axis=0)
        alcance = np.linalg.norm(local, axis=1).max() or 1.0
        xy[idx] = centros[a] + local / alcance * raio[g] * 0.85
    return xy


def _em_volta_do_maior(centros: np.ndarray, raios: list, folga: float) -> np.ndarray:
    """O maior disco no centro; os outros encostados nele, no ângulo original em volta dele, afastados o mínimo entre si."""
    raios = np.asarray(raios, dtype=float)
    maior = int(np.argmax(raios))
    outros = [i for i in range(len(raios)) if i != maior]
    if not outros:
        return np.zeros_like(centros)
    angulo = {i: np.arctan2(*(centros[i] - centros[maior])[::-1]) for i in outros}
    distancia = {i: raios[maior] + raios[i] + folga for i in outros}
    ordem = sorted(outros, key=lambda i: angulo[i])
    # Abre os ângulos até nenhum par vizinho se sobrepor (poucos grupos: o laço termina rápido).
    for _ in range(200):
        mudou = False
        for a, b in zip(ordem, ordem[1:] + ordem[:1]):
            d = (distancia[a] + distancia[b]) / 2
            minimo = 2 * np.arcsin(min(1.0, (raios[a] + raios[b] + folga) / (2 * d)))
            gap = (angulo[b] - angulo[a]) % (2 * np.pi)
            if len(ordem) > 1 and gap < minimo:
                falta = (minimo - gap) / 2
                angulo[a] -= falta
                angulo[b] += falta
                mudou = True
        if not mudou:
            break
    novo = np.zeros_like(centros)
    for i in outros:
        novo[i] = distancia[i] * np.array([np.cos(angulo[i]), np.sin(angulo[i])])
    return novo

