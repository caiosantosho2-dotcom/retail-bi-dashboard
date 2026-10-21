"""Exporta os JSONs agregados do painel a partir do banco e do código do projeto de RAG (ambos só leitura).

Uso:
  python scripts/exportar_dados.py                      exporta tudo e gera o manifest
  python scripts/exportar_dados.py --apenas kpis.json   exporta só esse arquivo (repetível) e regera o manifest
  python scripts/exportar_dados.py --validar            valida site/data/*.json contra contracts/*.schema.json

Regras (skill exporting-dashboard-data e contrato): números crus, frações de 0 a 1, ausente = null, ordem
determinística, UTF-8 sem escape, JSON minificado, manifest sempre por último.
"""

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime
from decimal import Decimal

sys.dont_write_bytecode = True   # vale também para o código do RAG importado por rag_modelos

import comum  # noqa: E402

VERSAO_CONTRATO = "1.1"
LIMITE_BYTES = 1_572_864   # 1,5 MB: abertura (no schema do manifest) e cada clientes/<segmento>.json

# nome do arquivo -> (consulta em scripts/sql/, grão declarado)
CONSULTAS = {
    "kpis.json": ("kpis.sql", "1 linha por período × métrica"),
    "vendas_semanais.json": ("vendas_semanais.sql", "1 linha por semana, da 1 à última completa"),
    "calor_dia_hora.json": ("calor_dia_hora.sql", "1 linha por dia do ciclo semanal × hora"),
    "departamentos.json": ("departamentos.sql", "1 linha por período × departamento (top 10 + Outros)"),
    "segmentos.json": ("segmentos.sql", "1 linha por segmento"),
    "medias_segmento.json": ("medias_segmento.sql", "1 linha por segmento × atributo"),
}
# Arquivos montados em Python: insights (frases do RAG) e os de cliente (uma consulta, vários arquivos).
DERIVADOS = ["insights.json", "clientes_indice.json"] + [f"clientes/{s}.json" for s in comum.SLUG.values()]
TODOS = list(CONSULTAS) + DERIVADOS

ATRIBUTOS = ["recencia", "frequencia", "valor", "clv", "sensibilidade_desconto", "variedade_departamentos"]
INTEIROS = {"recencia", "frequencia", "variedade_departamentos"}


# --------------------------------------------------------------------------- preparação

def preparar(cfg: dict):
    """Roda as análises do RAG (com a foto de antes e depois) e devolve a conexão do painel com as views prontas."""
    import pandas as pd
    import rag_modelos

    antes = comum.foto_rag(cfg["rag_dir"])
    print("Rodando as análises do RAG (segmentação, CLV, risco, desconto) ...", flush=True)
    rag = rag_modelos.calcular(cfg)
    comum.conferir_rag_intocado(antes, comum.foto_rag(cfg["rag_dir"]))

    cfg_rag = comum.config_rag(cfg)
    con = comum.conectar_origem(cfg)
    ordem = {s: i for i, s in enumerate(comum.SEGMENTOS)}
    nomes = [s["nome"] for s in rag["seg"]["segmentos"]]
    if sorted(nomes) != sorted(comum.SEGMENTOS):
        raise SystemExit(f"ERRO: os segmentos do RAG mudaram: {nomes}. A spec e o contrato esperam {comum.SEGMENTOS}.")

    tabelas = {
        "parametros": pd.DataFrame({
            "chave": ["limiar_alerta", "corte_medio", "loja_amostra_minima_cestas"],
            "valor": [rag["limiar"], rag["limiar"] / 2, float(cfg_rag["metricas"]["loja_amostra_minima_cestas"])]}),
        "rag_segmento_cliente": rag["atribuicao"][["household_key", "segmento"]],
        "rag_risco_cliente": rag["prob"],
        "rag_clv_segmento": pd.DataFrame([{"segmento": s["nome"], "clv_medio": float(s["clv_medio"]),
                                           "valor_medio": float(s["valor_medio_janela_usd"])}
                                          for s in rag["clv"]["segmentos"] if s["nome"] in ordem]),
        "rag_segmentos": pd.DataFrame([{
            "segmento": s["nome"], "ordem": ordem[s["nome"]], "households": int(s["households"]),
            "valor_total": float(s["valor_total_usd"]), "ticket_medio": float(s["ticket_medio_usd"]),
            "desconto_mediano_pct": next((g["mediana_pct"] / 100 for g in rag["desc"]["grupos"] if g["segmento"] == s["nome"]), None),
        } for s in rag["seg"]["segmentos"]]),
    }
    for nome, df in tabelas.items():
        con.register(f"_df_{nome}", df)
        con.execute(f"CREATE TABLE painel.{nome} AS SELECT * FROM _df_{nome}")
        con.unregister(f"_df_{nome}")
    con.execute(comum.ler_sql("views_painel.sql"))
    return con, rag


# --------------------------------------------------------------------------- escrita

def _limpo(v):
    """Tipos do DuckDB/numpy para JSON: Decimal e numpy viram float, NaN vira null."""
    if isinstance(v, dict):
        return {k: _limpo(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_limpo(x) for x in v]
    if isinstance(v, Decimal):
        v = float(v)
    if hasattr(v, "item"):   # numpy
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def _consultar(con, arquivo_sql: str) -> list[dict]:
    cur = con.execute(comum.ler_sql(arquivo_sql))
    colunas = [d[0] for d in cur.description]
    return [dict(zip(colunas, _limpo(list(linha)))) for linha in cur.fetchall()]


def _escrever(nome: str, grao: str, linhas: list[dict]) -> None:
    destino = comum.PASTA_DADOS / nome
    destino.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps({"grao": grao, "linhas": linhas}, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    destino.write_text(texto, encoding="utf-8", newline="\n")
    print(f"  {nome}: {len(linhas)} linhas, {destino.stat().st_size:,} bytes")


def _inteiro(v):
    return None if v is None else int(round(v))


def exportar_consulta(con, nome: str) -> None:
    arquivo_sql, grao = CONSULTAS[nome]
    linhas = _consultar(con, arquivo_sql)
    if nome == "kpis.json":
        for l in linhas:
            if l["metrica"] in ("cestas", "clientes_ativos"):
                for campo in ("valor", "valor_comparavel", "valor_ano_anterior"):
                    l[campo] = _inteiro(l[campo])
    _escrever(nome, grao, linhas)


def _primeira_frase(texto: str) -> str:
    """Mesma regra de src/ui/aba_resumo.primeira_frase do RAG (não importada: o módulo depende do Streamlit)."""
    return re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])", texto.strip())[0]


def exportar_insights(rag: dict) -> None:
    """Os 3 cards da Visão Geral, com as frases e os números das análises do RAG (spec, 5.1)."""
    segs = rag["seg"]["segmentos"]
    total = sum(s["valor_total_usd"] for s in segs)
    fieis = next(s for s in segs if s["nome"] == "Fiéis")
    medianas = [g["mediana_pct"] for g in rag["desc"]["grupos"]]
    linhas = [
        {"id": "fieis_faturamento", "conclusao": rag["seg"]["e_dai"]["conclusao"],
         "numero": round(fieis["valor_total_usd"] / total, 4), "unidade": "pct", "aba_destino": "segmentos"},
        {"id": "risco_pausa", "conclusao": _primeira_frase(rag["churn"]["e_dai"]["impacto_estimado"]),
         "numero": round(rag["churn"]["valor_em_risco_usd"], 2), "unidade": "usd", "aba_destino": "segmentos"},
        {"id": "desconto_segmentos", "conclusao": rag["desc"]["e_dai"]["conclusao"],
         # 6 casas: com 4, 1,2454 p.p. viraria 0,0125 e o front mostraria "1,3 p.p." em vez do "1,2" do app.
         "numero": round((max(medianas) - min(medianas)) / 100, 6), "unidade": "pp", "aba_destino": "segmentos"},
    ]
    _escrever("insights.json", "1 linha por insight", linhas)


def exportar_clientes(con) -> None:
    linhas = _consultar(con, "clientes.sql")
    indice, por_segmento = [], {s: [] for s in comum.SEGMENTOS}
    for l in linhas:
        atributos = {}
        for a in ATRIBUTOS:
            valor = l[f"{a}_valor"]
            atributos[a] = {"valor": _inteiro(valor) if a in INTEIROS else valor, "percentil": l[f"{a}_percentil"]}
        por_segmento[l["segmento"]].append({
            "id": l["id"], "segmento": l["segmento"], "semanas_sem_comprar": l["semanas_sem_comprar"],
            "atributos": atributos,
            "risco": {"score": l["risco_score"], "faixa": l["risco_faixa"]},
            "historico_semanal": l["historico_semanal"],
            "top_departamentos": l["top_departamentos"],
        })
        indice.append({"id": l["id"], "segmento": l["segmento"], "faturamento_total": atributos["valor"]["valor"],
                       "risco_faixa": l["risco_faixa"]})
    _escrever("clientes_indice.json", "1 linha por cliente segmentado", indice)
    for segmento, clientes in por_segmento.items():
        _escrever(f"clientes/{comum.SLUG[segmento]}.json", f"1 linha por cliente do segmento {segmento}", clientes)


# --------------------------------------------------------------------------- manifest

def exportar_manifest(con, cfg: dict, rag: dict) -> None:
    base_hash = con.execute("SELECT valor FROM origem.meta WHERE chave = 'versao_base'").fetchone()[0]
    inicio, fim = con.execute("SELECT MIN(data), MAX(data) FROM origem.dim_data").fetchone()
    janelas = {}
    for periodo, ini, fim_s, d_ini, d_fim in con.execute("""
            SELECT p.periodo, p.semana_ini, p.semana_fim,
                   (SELECT MIN(data) FROM origem.dim_data WHERE WEEK_NO = p.semana_ini),
                   (SELECT MAX(data) FROM origem.dim_data WHERE WEEK_NO = p.semana_fim)
            FROM painel.periodos p ORDER BY p.ordem""").fetchall():
        janelas[periodo] = {"semana_ini": ini, "semana_fim": fim_s, "data_ini": str(d_ini), "data_fim": str(d_fim)}
    commit, sujo = comum.rag_commit(cfg["rag_dir"])
    ch = rag["churn"]
    arquivos = []
    for nome in TODOS:
        caminho = comum.PASTA_DADOS / nome
        if not caminho.exists():
            continue
        conteudo = caminho.read_bytes()
        arquivos.append({"nome": nome, "linhas": len(json.loads(conteudo)["linhas"]), "bytes": len(conteudo),
                         "sha256": hashlib.sha256(conteudo).hexdigest()})
    manifest = {
        "versao_contrato": VERSAO_CONTRATO,
        "gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "base_hash": base_hash,
        "periodo_base": {"inicio": str(inicio), "fim": str(fim)},
        "janelas": janelas,
        "rag_commit": commit,
        "rag_sujo": sujo,
        "modelo": {
            "limiar_alerta": rag["limiar"], "corte_medio": round(rag["limiar"] / 2, 4),
            "auc_modelo": ch["auc_modelo"], "auc_regra_simples": ch["auc_baseline"],
            "pausas_esperadas": round(sum(s["pausas_esperadas"] for s in ch["risco_por_segmento"]), 4),
            "alertas": sum(s["alertas"] for s in ch["risco_por_segmento"]),
            "risco_por_segmento": [{"segmento": s["nome"], "clientes": s["households"],
                                    "pausas_esperadas": s["pausas_esperadas"], "alertas": s["alertas"]}
                                   for s in ch["risco_por_segmento"]],
        },
        "bytes_abertura": sum(a["bytes"] for a in arquivos if not a["nome"].startswith("clientes/")),
        "arquivos": arquivos,
    }
    destino = comum.PASTA_DADOS / "manifest.json"
    destino.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"  manifest.json: {len(arquivos)} arquivos, abertura {manifest['bytes_abertura']:,} bytes")


# --------------------------------------------------------------------------- validação

# Chaves do grão de cada arquivo: nenhuma linha pode repetir a combinação. E o número de linhas esperado, se fixo.
GRAO = {
    "kpis.json": (("periodo", "metrica"), 24),
    "vendas_semanais.json": (("semana_inicio",), None),
    "calor_dia_hora.json": (("dia_semana", "hora"), 168),
    "departamentos.json": (("periodo", "departamento"), None),
    "insights.json": (("id",), 3),
    "segmentos.json": (("segmento",), 4),
    "medias_segmento.json": (("segmento", "atributo"), 24),
    "clientes_indice.json": (("id",), None),
}


def _schema_de(nome: str) -> str:
    return "clientes_segmento" if nome.startswith("clientes/") else nome.removesuffix(".json")


def validar() -> int:
    from jsonschema import Draft202012Validator

    erros = []
    for nome in TODOS + ["manifest.json"]:
        caminho = comum.PASTA_DADOS / nome
        if not caminho.exists():
            erros.append(f"{nome}: arquivo não existe")
            continue
        dado = json.loads(caminho.read_text(encoding="utf-8"))
        schema = json.loads((comum.PASTA_CONTRATOS / f"{_schema_de(nome)}.schema.json").read_text(encoding="utf-8"))
        for e in Draft202012Validator(schema).iter_errors(dado):
            caminho_erro = "/".join(str(p) for p in e.absolute_path)
            erros.append(f"{nome}: {caminho_erro or '(raiz)'}: {e.message[:200]}")
        if nome in GRAO:
            chaves, esperado = GRAO[nome]
            vistos = [tuple(l[c] for c in chaves) for l in dado["linhas"]]
            if len(vistos) != len(set(vistos)):
                erros.append(f"{nome}: linhas repetidas no grão {chaves}")
            if esperado is not None and len(vistos) != esperado:
                erros.append(f"{nome}: {len(vistos)} linhas, esperado {esperado}")
        if nome.startswith("clientes/") and caminho.stat().st_size > LIMITE_BYTES:
            erros.append(f"{nome}: {caminho.stat().st_size:,} bytes, acima do orçamento de {LIMITE_BYTES:,} por segmento")
    # Cada arquivo tem de ser o mesmo que o manifest descreve (nada editado depois da exportação).
    manifest = comum.PASTA_DADOS / "manifest.json"
    if manifest.exists():
        for a in json.loads(manifest.read_text(encoding="utf-8"))["arquivos"]:
            caminho = comum.PASTA_DADOS / a["nome"]
            if not caminho.exists():
                continue
            conteudo = caminho.read_bytes()
            if (len(conteudo), hashlib.sha256(conteudo).hexdigest(), len(json.loads(conteudo)["linhas"])) != \
                    (a["bytes"], a["sha256"], a["linhas"]):
                erros.append(f"{a['nome']}: diferente do manifest (bytes, sha256 ou linhas); exporte de novo")
    for e in erros:
        print("ERRO", e)
    print(f"Validação: {len(TODOS) + 1} arquivos, {len(erros)} erros")
    return 1 if erros else 0


# --------------------------------------------------------------------------- principal

def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apenas", action="append", choices=TODOS, help="exporta só este arquivo (repetível)")
    parser.add_argument("--validar", action="store_true", help="só valida os arquivos em site/data contra os schemas")
    args = parser.parse_args()
    if args.validar:
        return validar()

    cfg = comum.carregar_config()
    con, rag = preparar(cfg)
    alvo = args.apenas or TODOS
    print("Exportando:")
    for nome in alvo:
        if nome in CONSULTAS:
            exportar_consulta(con, nome)
    if "insights.json" in alvo:
        exportar_insights(rag)
    if any(n == "clientes_indice.json" or n.startswith("clientes/") for n in alvo):
        exportar_clientes(con)
    exportar_manifest(con, cfg, rag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
