"""Regiões inferidas pela clientela em comum (spec, seção 6, "Região inferida").

A base não tem localização das lojas (dim_loja só tem STORE_ID). Clientes compram em várias lojas, e duas lojas que
dividem muitos clientes provavelmente estão perto. Por isso:
- semelhança entre duas lojas = Jaccard dos clientes (painel.loja_par, SQL), no universo de lojas com 100+ cestas na
  base inteira (painel.lojas_universo);
- regiões = agrupamento espectral dessa matriz (scikit-learn, semente fixa); k = a maior silhueta entre K_MIN e K_MAX;
- posições do "mapa de clientela", em dois níveis (perto = clientes em comum, não quilômetros):
  1. cada região é um disco com área proporcional ao número de lojas; os centros saem de um MDS sobre a distância
     entre regiões (−log da semelhança média entre as lojas de uma e de outra) e são afastados o mínimo para os discos
     não se sobreporem;
  2. dentro do disco, as lojas ficam pelo MDS sobre a distância no grafo dos VIZINHOS_LAYOUT vizinhos mais fortes
     (comprimento −log(Jaccard)), só entre as lojas da região.
  O MDS sobre todas as lojas juntas (L1) deixava as regiões misturadas na tela: os contornos se cruzavam e os nomes
  se sobrepunham (validação da L2);
- ligações desenhadas = as LIGACOES_POR_LOJA mais fortes de cada loja.

É uma hipótese tirada dos dados, não geografia: o painel diz isso, e o manifest guarda a concentração da clientela em
comum dentro das regiões contra a de uma divisão ao acaso com os mesmos tamanhos.
"""

import numpy as np
import pandas as pd

from layout import VIZINHOS_LAYOUT, posicoes_em_dois_niveis

SEMENTE = 42
K_MIN, K_MAX = 3, 8
LIGACOES_POR_LOJA = 3


def calcular(con) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Devolve (região por loja com x e y, ligações desenhadas, parâmetros para o manifest)."""
    from sklearn.cluster import SpectralClustering
    from sklearn.metrics import silhouette_score

    universo = con.execute("SELECT STORE_ID, faturamento::DOUBLE AS faturamento FROM painel.lojas_universo ORDER BY STORE_ID").df()
    pares = con.execute("SELECT loja_a, loja_b, comuns, jaccard FROM painel.loja_par").df()
    lojas = universo["STORE_ID"].astype(int).tolist()
    indice = {s: i for i, s in enumerate(lojas)}
    n = len(lojas)
    semelhanca = np.eye(n)
    for a, b, _, j in pares.itertuples(index=False):
        semelhanca[indice[a], indice[b]] = semelhanca[indice[b], indice[a]] = j
    distancia = 1 - semelhanca

    melhor = None
    for k in range(K_MIN, K_MAX + 1):
        rotulos = SpectralClustering(n_clusters=k, affinity="precomputed", random_state=SEMENTE).fit_predict(semelhanca)
        silhueta = silhouette_score(distancia, rotulos, metric="precomputed")
        if melhor is None or silhueta > melhor[1]:
            melhor = (k, silhueta, rotulos)
    k, silhueta, rotulos = melhor

    # Concentração: parte da semelhança total que fica dentro da mesma região, contra a esperada ao acaso.
    fora_da_diagonal = ~np.eye(n, dtype=bool)
    mesma_regiao = rotulos[:, None] == rotulos[None, :]
    dentro = semelhanca[fora_da_diagonal & mesma_regiao].sum() / semelhanca[fora_da_diagonal].sum()
    tamanhos = np.bincount(rotulos)
    ao_acaso = (tamanhos * (tamanhos - 1)).sum() / (n * (n - 1))

    # Nomes em ordem de faturamento na base inteira: a Região A é a que mais vende.
    faturamento = universo["faturamento"].to_numpy()
    ordem = sorted(range(k), key=lambda g: -faturamento[rotulos == g].sum())
    nome = {g: f"Região {chr(ord('A') + i)}" for i, g in enumerate(ordem)}

    xy = posicoes_em_dois_niveis(semelhanca, rotulos)
    # Mesma escala nos dois eixos (um círculo continua círculo), de 0 a 1 no eixo mais longo.
    xy = (xy - xy.min(axis=0)) / (xy.max(axis=0) - xy.min(axis=0)).max()
    regiao = pd.DataFrame({"STORE_ID": lojas, "regiao": [nome[g] for g in rotulos], "x": xy[:, 0], "y": xy[:, 1]})

    # As ligações mais fortes de cada loja (por clientes em comum), sem repetir o par.
    longos = pd.concat([pares.rename(columns={"loja_a": "loja", "loja_b": "outra"}),
                        pares.rename(columns={"loja_b": "loja", "loja_a": "outra"})])
    fortes = longos.sort_values(["loja", "comuns", "outra"], ascending=[True, False, True]).groupby("loja").head(LIGACOES_POR_LOJA)
    fortes = fortes.assign(loja_a=fortes[["loja", "outra"]].min(axis=1), loja_b=fortes[["loja", "outra"]].max(axis=1))
    ligacoes = fortes[["loja_a", "loja_b", "comuns", "jaccard"]].drop_duplicates(["loja_a", "loja_b"]).sort_values(["loja_a", "loja_b"])

    parametros = {
        "universo_lojas": n, "minimo_cestas": "loja_amostra_minima_cestas do RAG (100), base inteira",
        "algoritmo": "SpectralClustering(affinity='precomputed') sobre o Jaccard dos clientes",
        "k": int(k), "k_candidatos": [K_MIN, K_MAX], "silhueta": round(float(silhueta), 4), "semente": SEMENTE,
        "tamanhos": sorted((int(t) for t in tamanhos), reverse=True),
        "concentracao_dentro": round(float(dentro), 4), "concentracao_ao_acaso": round(float(ao_acaso), 4),
        "ligacoes_por_loja": LIGACOES_POR_LOJA,
        "posicoes": f"dois níveis: regiões como discos (MDS entre regiões, sem sobreposição); lojas por MDS no grafo dos {VIZINHOS_LAYOUT} vizinhos dentro da região",
    }
    return regiao, ligacoes.reset_index(drop=True), parametros
