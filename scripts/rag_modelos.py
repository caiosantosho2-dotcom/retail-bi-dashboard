"""Ponte com o código do projeto de RAG: segmentação, CLV, risco de pausa e teste de desconto.

Segmento, CLV e risco por cliente não existem no DuckDB; o RAG os calcula em Python, em memória. Para não ter duas
definições (princípio 1 da spec), a exportação importa o código do RAG, SÓ PARA LEITURA:
- `sys.dont_write_bytecode = True` antes do import (nenhum __pycache__ no RAG);
- só funções sem o decorador `registrar_chamada`, que gravaria em logs/chamadas.jsonl do RAG;
- banco aberto pela conexão do próprio RAG, que é somente leitura;
- mesmas sementes e parâmetros: o config.yaml lido é o do RAG.

A probabilidade de pausa por cliente é calculada dentro de `churn._calcular`, mas não é devolvida. `_probabilidades`
repete os mesmos passos (plano de fotos, treino, limiar, foto final) com as funções do próprio RAG; a reconciliação
confere que o limiar, os alertas e as pausas esperadas por segmento batem com os de `churn._calcular`.
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


def _probabilidades(cur, CFG, churn) -> tuple[pd.DataFrame, float]:
    """Os passos de `churn._calcular` (src/nucleo/churn.py, linhas 249-268 e 302-304), sem o bootstrap e as métricas."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    cfg = CFG["analises"]["churn"]
    fim = int(cur.execute("SELECT semana_fim_atual FROM vw_janela").fetchone()[0])
    plano = churn.fotos_do_plano(fim, cfg)
    painel = churn.carregar_painel(cur, fim)
    treino = [churn.fotografar(painel, T, cfg) for T in plano["treino"]]
    X_tr = np.vstack([f[0] for f in treino])
    y_tr = np.concatenate([f[1] for f in treino])
    escala = StandardScaler().fit(X_tr)
    modelo = LogisticRegression(C=cfg["l2_c"], max_iter=2000, random_state=CFG["semente"]).fit(escala.transform(X_tr), y_tr)
    X_v, y_v, _, _ = churn.fotografar(painel, plano["validacao"], cfg)
    limiar = churn.escolher_limiar(y_v, modelo.predict_proba(escala.transform(X_v))[:, 1])
    X_f, _, hh_f, _ = churn.fotografar(painel, fim, cfg, com_rotulo=False)
    prob = modelo.predict_proba(escala.transform(X_f))[:, 1]
    return pd.DataFrame({"household_key": hh_f.astype("int64"), "prob": prob.astype(float)}), limiar


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
        prob, limiar = _probabilidades(cur, CFG, churn)
    finally:
        banco.fechar_todas()   # libera o arquivo para a conexão em memória do painel
    return {
        "seg": seg, "clv": clv_r, "churn": churn_r, "desc": desc_r,
        "atribuicao": atribuicao.astype({"household_key": "int64"}),
        "prob": prob, "limiar": float(limiar),
        "margem": CFG["analises"]["clv"]["margem"],
    }
