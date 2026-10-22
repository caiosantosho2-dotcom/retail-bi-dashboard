"""Ponte com o código do projeto de RAG: segmentação, CLV, risco de pausa e teste de desconto.

Segmento, CLV e risco por cliente não existem no DuckDB; o RAG os calcula em Python, em memória. Para não ter duas
definições (princípio 1 da spec), a exportação importa o código do RAG, SÓ PARA LEITURA:
- `sys.dont_write_bytecode = True` antes do import (nenhum __pycache__ no RAG);
- só funções sem o decorador `registrar_chamada`, que gravaria em logs/chamadas.jsonl do RAG;
- banco aberto pela conexão do próprio RAG, que é somente leitura;
- mesmas sementes e parâmetros: o config.yaml lido é o do RAG.

A probabilidade de pausa por cliente é calculada dentro de `churn._calcular`, mas não é devolvida. `_reproduzir`
repete os mesmos passos (plano de fotos, treino, limiar, foto final) com as funções do próprio RAG; a reconciliação
confere que o limiar, os alertas e as pausas esperadas por segmento batem com os de `churn._calcular`.
O mesmo treino dá as notas do conjunto de teste, de onde sai a curva ROC do Laboratório (`curvas_roc`, que para a
exportação se a AUC ou as matrizes de confusão não forem iguais às do RAG).
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd


def _importar(rag_dir: str):
    sys.dont_write_bytecode = True
    if rag_dir not in sys.path:
        sys.path.insert(0, rag_dir)
    from src.config import CFG
    from src.nucleo import banco, churn, clv, rfm, teste_desconto
    return CFG, banco, churn, clv, rfm, teste_desconto


def _reproduzir(cur, CFG, churn) -> dict:
    """Os passos de `churn._calcular` (src/nucleo/churn.py, linhas 249-276 e 302-304), sem o bootstrap e as métricas:
    a probabilidade por cliente na foto final e as notas do conjunto de teste (para a curva ROC do Laboratório)."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    cfg = CFG["analises"]["churn"]
    fim = int(cur.execute("SELECT semana_fim_atual FROM vw_janela").fetchone()[0])
    plano = churn.fotos_do_plano(fim, cfg)
    painel = churn.carregar_painel(cur, fim)
    treino = [churn.fotografar(painel, T, cfg) for T in plano["treino"]]
    X_tr = np.vstack([f[0] for f in treino])
    y_tr = np.concatenate([f[1] for f in treino])
    rec_tr = np.concatenate([f[3] for f in treino])
    escala = StandardScaler().fit(X_tr)
    modelo = LogisticRegression(C=cfg["l2_c"], max_iter=2000, random_state=CFG["semente"]).fit(escala.transform(X_tr), y_tr)
    X_v, y_v, _, _ = churn.fotografar(painel, plano["validacao"], cfg)
    limiar = churn.escolher_limiar(y_v, modelo.predict_proba(escala.transform(X_v))[:, 1])
    k = churn.escolher_k(rec_tr, y_tr, CFG["metricas"]["cliente_ativo_semanas"] - 1)
    teste = [churn.fotografar(painel, T, cfg) for T in plano["teste"]]
    X_t = np.vstack([f[0] for f in teste])
    X_f, _, hh_f, _ = churn.fotografar(painel, fim, cfg, com_rotulo=False)
    prob = modelo.predict_proba(escala.transform(X_f))[:, 1]
    return {
        "prob": pd.DataFrame({"household_key": hh_f.astype("int64"), "prob": prob.astype(float)}), "limiar": limiar,
        "teste": {"y": np.concatenate([f[1] for f in teste]), "modelo": modelo.predict_proba(escala.transform(X_t))[:, 1],
                  "regra_simples": np.concatenate([f[3] for f in teste]).astype(float), "k": k},
    }


def curvas_roc(teste: dict, churn_r: dict) -> tuple[pd.DataFrame, dict]:
    """Pontos da curva ROC do modelo e da regra simples no teste. Confere com o resultado do RAG antes de devolver:
    AUC, limiar, k e as duas matrizes de confusão têm de ser iguais aos de `churn._calcular`. Se não forem, a reprodução
    não é a mesma análise, e a exportação para (ERRO), em vez de publicar uma curva de outro modelo."""
    from sklearn.metrics import confusion_matrix, roc_auc_score, roc_curve

    y = teste["y"]
    cortes = {"modelo": churn_r["limiar"], "regra_simples": teste["k"]}
    pontos, conferencia = [], {}
    for nome, rag_nome in (("modelo", "modelo"), ("regra_simples", "baseline")):
        nota = teste[nome]
        tn, fp, fn, tp = (int(v) for v in confusion_matrix(y, nota >= cortes[nome]).ravel())
        rag = churn_r[rag_nome]
        conferencia[nome] = {"auc": float(roc_auc_score(y, nota)), "auc_rag": float(rag["auc"]),
                             "matriz": (tn, fp, fn, tp), "matriz_rag": tuple(int(rag[c]) for c in ("tn", "fp", "fn", "tp"))}
        fpr, tpr, corte = roc_curve(y, nota, drop_intermediate=True)
        for ordem, (a, b, c) in enumerate(zip(fpr, tpr, corte)):
            pontos.append({"classificador": nome, "ponto": ordem, "fpr": float(a), "tpr": float(b),
                           "corte": None if not np.isfinite(c) else float(c)})
    for nome, c in conferencia.items():
        if round(c["auc"], 4) != c["auc_rag"] or c["matriz"] != c["matriz_rag"]:   # o RAG arredonda na 4ª casa
            raise SystemExit(f"ERRO: a reprodução do teste do RAG não bate ({nome}): AUC {c['auc']:.6f} × {c['auc_rag']:.6f}, "
                             f"matriz {c['matriz']} × {c['matriz_rag']}. Parei sem exportar a curva ROC.")
    if teste["k"] != churn_r["k_baseline"]:
        raise SystemExit(f"ERRO: k da regra simples {teste['k']} × {churn_r['k_baseline']} do RAG.")
    return pd.DataFrame(pontos), conferencia


def segmentos_anteriores(cur, rfm, clv, seg: dict) -> tuple[pd.DataFrame, dict]:
    """Segmento de cada household no semestre anterior à janela (as 26 semanas antes dela), para a matriz de migração.
    É a mesma segmentação que o backtest do CLV do RAG faz nessa janela: `rfm.base_rfm` + `clv._segmentar`, que refaz o
    K-Means com o K atual e falha se os nomes não forem os mesmos (sem nomes iguais não há migração a medir)."""
    ini_atual, semanas = cur.execute("SELECT semana_ini_atual, semanas FROM vw_janela").fetchone()
    ini, fim = int(ini_atual) - int(semanas), int(ini_atual) - 1
    df, _ = rfm.base_rfm(cur, ini, fim)
    nomes = clv._segmentar(df, seg["k_usado"], {s["nome"] for s in seg["segmentos"]}, f"{ini}-{fim}")
    return (pd.DataFrame({"household_key": df["household_key"].astype("int64"), "segmento": nomes}),
            {"semana_ini": ini, "semana_fim": fim})


def calcular(cfg: dict) -> dict:
    """Roda as análises do RAG e devolve o necessário para a exportação. Fecha a conexão do RAG ao sair."""
    CFG, banco, churn, clv, rfm, teste_desconto = _importar(str(Path(cfg["rag_dir"]).resolve()))
    caminho = str(Path(cfg["duckdb_origem"]).resolve())
    try:
        cur = banco.cursor(caminho)
        seg, atribuicao = rfm._resultado(cur, None)
        clv_r = clv._calcular(cur)
        churn_r = churn._calcular(cur)
        desc_r = teste_desconto._calcular(cur)
        repro = _reproduzir(cur, CFG, churn)
        anterior, janela_anterior = segmentos_anteriores(cur, rfm, clv, seg)
    finally:
        banco.fechar_todas()   # libera o arquivo para a conexão em memória do painel
    return {
        "seg": seg, "clv": clv_r, "churn": churn_r, "desc": desc_r,
        "atribuicao": atribuicao.astype({"household_key": "int64"}),
        "prob": repro["prob"], "limiar": float(repro["limiar"]), "teste": repro["teste"],
        "seg_anterior": anterior, "janela_anterior": janela_anterior,
        "margem": CFG["analises"]["clv"]["margem"],
    }
