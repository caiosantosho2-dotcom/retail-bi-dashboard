"""Exporta os JSONs agregados do painel a partir do banco e do código do projeto de RAG (ambos só leitura).

Uso:
  python scripts/exportar_dados.py                       todas as etapas, cada uma num processo, e o manifest
  python scripts/exportar_dados.py --etapa cubos         só essa etapa (repetível); as anteriores já devem ter rodado
  python scripts/exportar_dados.py --validar             valida site/data/ contra contracts/*.schema.json

Etapas, em ordem (spec, seção 8; um processo por etapa para devolver a memória ao terminar):
  rag                   análises do RAG (segmento, risco, CLV, desconto) -> data/tmp/rag_*.parquet e rag.json
  base                  cesta × departamento, cestas, lojas comparáveis, grupo do cliente -> data/tmp/*.parquet
  cubos                 cubo_faturamento, cubo_periodo, calor_dia_hora, calor/*, departamentos
  kpis_filtrados        kpis_filtrados
  cesta_departamentos   cesta_departamentos
  cesta_subcategorias   cesta_subcategorias (um departamento por vez)
  ficha_categoria       departamentos_ficha, departamentos_segmento, subcategorias
  segmentos             segmentos, afinidade, lista_acao, insights
  manifest              manifest.json (sempre por último)

Regras (skill exporting-dashboard-data e contrato 2.0): números crus, frações de 0 a 1, ausente = null, ordem
determinística, UTF-8 sem escape, JSON minificado, formato compacto nos arquivos grandes, manifest por último.
O DuckDB roda com o limite de memória e threads do config.yaml (`memoria`) e grava o excedente em data/tmp/duck.
"""

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from datetime import datetime
from decimal import Decimal

sys.dont_write_bytecode = True   # vale também para o código do RAG importado por rag_modelos

import comum  # noqa: E402

VERSAO_CONTRATO = "2.0"
LIMITE_BYTES = 1_572_864   # 1,5 MB: abertura e cada aba carregada sob demanda

ETAPAS = ["rag", "base", "cubos", "kpis_filtrados", "cesta_departamentos", "cesta_subcategorias", "ficha_categoria",
          "segmentos", "manifest"]
TABELAS_RAG = ["parametros", "rag_segmento_cliente", "rag_risco_cliente", "rag_clv_segmento", "rag_segmentos"]
TABELAS_BASE = ["cesta_departamento", "cestas", "lojas_comparaveis", "grupo_cliente"]

# nome -> (consulta, grão, etapa, carga, colunas de dimensão do formato compacto ou None para lista de objetos).
# carga: quando o front lê o arquivo — 'abertura' (Visão Geral), 'categoria' e 'segmentos' (ao abrir a aba).
ARQUIVOS = {
    "departamentos.json": ("departamentos.sql", "1 linha por departamento com venda na base inteira", "cubos", "abertura", None),
    "cubo_faturamento.json": ("cubo_faturamento.sql", "1 linha por semana (últimas 52) × grupo × departamento", "cubos",
                              "abertura", ["semana_inicio", "grupo", "departamento"]),
    "cubo_periodo.json": ("cubo_periodo.sql", "1 linha por período × grupo × departamento", "cubos", "abertura",
                          ["periodo", "grupo", "departamento"]),
    "calor_dia_hora.json": ("calor_dia_hora.sql", "1 linha por dia do ciclo × hora × grupo, base inteira", "cubos",
                            "abertura", ["grupo"]),
    "kpis_filtrados.json": ("kpis_filtrados.sql", "1 linha por período × subconjunto de segmentos × departamento",
                            "kpis_filtrados", "abertura", ["periodo", "subconjunto", "departamento"]),
    "insights.json": (None, "1 linha por insight", "segmentos", "abertura", None),
    "departamentos_ficha.json": ("departamentos_ficha.sql", "1 linha por departamento com faturamento nas 26 semanas",
                                 "ficha_categoria", "categoria", None),
    "departamentos_segmento.json": ("departamentos_segmento.sql", "1 linha por subconjunto de segmentos × departamento",
                                    "ficha_categoria", "categoria", None),
    "subcategorias.json": ("subcategorias.sql", "1 linha por departamento × subcategoria (top 10)", "ficha_categoria",
                           "categoria", None),
    "cesta_departamentos.json": ("cesta_departamentos.sql", "1 linha por subconjunto de segmentos × par de departamentos",
                                 "cesta_departamentos", "categoria", ["subconjunto", "departamento_a", "departamento_b"]),
    "cesta_subcategorias.json": ("cesta_subcategorias.sql",
                                 "1 linha por subconjunto × departamento (≥10% do faturamento) × par de subcategorias (top 20)",
                                 "cesta_subcategorias", "categoria",
                                 ["subconjunto", "departamento", "subcategoria_a", "subcategoria_b"]),
    "segmentos.json": ("segmentos.sql", "1 linha por segmento", "segmentos", "segmentos", None),
    "afinidade.json": ("afinidade.sql", "1 linha por segmento × departamento", "segmentos", "segmentos", None),
    "lista_acao.json": ("lista_acao.sql", "1 linha por cliente com risco de pausa alto ou médio", "segmentos", "segmentos", None),
}
CALOR_DEPARTAMENTO = ("calor_departamento.sql", ["grupo"])   # calor/<slug>.json, sob demanda, gerados na etapa cubos

ATRIBUTOS_DEPARTAMENTO = ["participacao", "crescimento", "penetracao", "frequencia", "desconto", "marca_propria"]


# --------------------------------------------------------------------------- conexão e intermediários

def _tmp(nome: str):
    return comum.PASTA_TMP / nome


def _carregar_intermediarios(con, tabelas: list[str]) -> None:
    for t in tabelas:
        caminho = _tmp(f"{t}.parquet")
        if not caminho.exists():
            raise SystemExit(f"ERRO: falta {caminho}. Rode antes a etapa que o gera (veja --help).")
        con.execute(f"CREATE VIEW painel.{t} AS SELECT * FROM read_parquet('{caminho.as_posix()}')")


def conectar(cfg: dict, com_views: bool = True):
    """Conexão do painel: origem anexada em somente leitura, resultados do RAG e tabelas-base lidos de data/tmp."""
    con = comum.conectar_origem(cfg)
    _carregar_intermediarios(con, TABELAS_RAG)
    con.execute(comum.ler_sql("painel_periodos.sql"))
    if com_views:
        _carregar_intermediarios(con, TABELAS_BASE)
        con.execute(comum.ler_sql("views_painel.sql"))
    return con


def _rag_json() -> dict:
    return json.loads(_tmp("rag.json").read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- etapas rag e base

def etapa_rag(cfg: dict) -> None:
    """Roda as análises do RAG (com a foto de antes e depois) e grava o que a exportação usa em data/tmp."""
    import pandas as pd
    import rag_modelos

    antes = comum.foto_rag(cfg["rag_dir"])
    print("Rodando as análises do RAG (segmentação, CLV, risco, desconto) ...", flush=True)
    rag = rag_modelos.calcular(cfg)
    comum.conferir_rag_intocado(antes, comum.foto_rag(cfg["rag_dir"]))

    nomes = [s["nome"] for s in rag["seg"]["segmentos"]]
    if sorted(nomes) != sorted(comum.SEGMENTOS):
        raise SystemExit(f"ERRO: os segmentos do RAG mudaram: {nomes}. A spec e o contrato esperam {comum.SEGMENTOS}.")
    cfg_rag = comum.config_rag(cfg)
    cesta = cfg.get("cesta", {})
    ordem = {s: i for i, s in enumerate(comum.SEGMENTOS)}
    parametros = {
        "limiar_alerta": rag["limiar"], "corte_medio": rag["limiar"] / 2,
        "loja_amostra_minima_cestas": cfg_rag["metricas"]["loja_amostra_minima_cestas"],
        "cliente_ativo_semanas": cfg_rag["metricas"]["cliente_ativo_semanas"],
        "tamanho_minimo_grupo": cfg_rag["analises"]["clv"]["tamanho_minimo_grupo"],
        "cesta_semanas": cesta.get("semanas", 26),
        "minimo_cestas_par": cesta.get("minimo_cestas_par", 200),
        "corte_departamento_pct": cesta.get("corte_departamento_pct", 0.10),
    }
    tabelas = {
        "parametros": pd.DataFrame({"chave": list(parametros), "valor": [float(v) for v in parametros.values()]}),
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
    comum.PASTA_TMP.mkdir(parents=True, exist_ok=True)
    for nome, df in tabelas.items():
        df.to_parquet(_tmp(f"{nome}.parquet"), index=False)
    # Só o que insights e manifest usam, em tipos simples.
    ch = rag["churn"]
    resumo = {
        "limiar": float(rag["limiar"]),
        "seg": {"conclusao": rag["seg"]["e_dai"]["conclusao"],
                "segmentos": [{"nome": s["nome"], "valor_total_usd": float(s["valor_total_usd"])} for s in rag["seg"]["segmentos"]]},
        "churn": {"conclusao": ch["e_dai"]["conclusao"], "auc_modelo": float(ch["auc_modelo"]),
                  "auc_baseline": float(ch["auc_baseline"]),
                  "risco_por_segmento": [{"nome": s["nome"], "households": int(s["households"]),
                                          "pausas_esperadas": float(s["pausas_esperadas"]), "alertas": int(s["alertas"])}
                                         for s in ch["risco_por_segmento"]]},
        "desc": {"conclusao": rag["desc"]["e_dai"]["conclusao"],
                 "medianas_pct": [float(g["mediana_pct"]) for g in rag["desc"]["grupos"]]},
    }
    _tmp("rag.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  data/tmp: {', '.join(tabelas)} e rag.json")


def etapa_base(cfg: dict) -> None:
    con = conectar(cfg, com_views=False)
    con.execute(comum.ler_sql("painel_base.sql"))
    for t in TABELAS_BASE:
        destino = _tmp(f"{t}.parquet")
        con.execute(f"COPY painel.{t} TO '{destino.as_posix()}' (FORMAT parquet)")
        n = con.execute(f"SELECT COUNT(*) FROM painel.{t}").fetchone()[0]
        print(f"  data/tmp/{t}.parquet: {n:,} linhas")
    con.close()


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


def _consultar(con, arquivo_sql: str, params=None) -> list[dict]:
    cur = con.execute(comum.ler_sql(arquivo_sql), params or {})
    colunas = [d[0] for d in cur.description]
    return [dict(zip(colunas, _limpo(list(linha)))) for linha in cur.fetchall()]


def compactar(grao: str, linhas: list[dict], dimensoes: list[str]) -> dict:
    """Formato compacto do contrato 2.0: cada coluna de dimensão vira um índice na lista `dimensoes[coluna]`, na ordem
    da primeira aparição (determinística, porque as linhas já vêm ordenadas)."""
    colunas = list(linhas[0]) if linhas else dimensoes
    valores = {d: [] for d in dimensoes}
    indice = {d: {} for d in dimensoes}
    saida = []
    for l in linhas:
        linha = []
        for c in colunas:
            v = l[c]
            if c in indice:
                if v not in indice[c]:
                    indice[c][v] = len(valores[c])
                    valores[c].append(v)
                v = indice[c][v]
            linha.append(v)
        saida.append(linha)
    return {"grao": grao, "dimensoes": valores, "colunas": colunas, "linhas": saida}


def _escrever(nome: str, dado: dict) -> None:
    destino = comum.PASTA_DADOS / nome
    destino.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(dado, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    destino.write_text(texto, encoding="utf-8", newline="\n")
    print(f"  {nome}: {len(dado['linhas'])} linhas, {destino.stat().st_size:,} bytes")


def exportar(con, nome: str, linhas: list[dict] | None = None) -> None:
    arquivo_sql, grao, _, _, dimensoes = ARQUIVOS[nome]
    if linhas is None:
        linhas = _consultar(con, arquivo_sql)
    _escrever(nome, compactar(grao, linhas, dimensoes) if dimensoes else {"grao": grao, "linhas": linhas})


def _atributos(l: dict, segundo: str) -> dict:
    """Junta as colunas <atributo>_valor e <atributo>_<segundo> no objeto `atributos` do contrato."""
    return {a: {"valor": l.pop(f"{a}_valor"), segundo: l.pop(f"{a}_{segundo}")} for a in ATRIBUTOS_DEPARTAMENTO}


def _com_atributos(con, nome: str, segundo: str) -> list[dict]:
    saida = []
    for l in _consultar(con, ARQUIVOS[nome][0]):
        atributos = _atributos(l, segundo)
        fixos = {k: v for k, v in l.items() if k not in ("dinheiro_em_risco", "dinheiro_em_risco_pct", "amostra_pequena")}
        saida.append({**fixos, "atributos": atributos, "dinheiro_em_risco": l["dinheiro_em_risco"],
                      "dinheiro_em_risco_pct": l["dinheiro_em_risco_pct"], "amostra_pequena": l["amostra_pequena"]})
    return saida


# --------------------------------------------------------------------------- etapas de exportação

def etapa_cubos(con) -> None:
    for nome in ("departamentos.json", "cubo_faturamento.json", "cubo_periodo.json", "calor_dia_hora.json"):
        exportar(con, nome)
    # Um arquivo de calor por departamento, sob demanda (só o faturamento soma entre departamentos).
    arquivo_sql, dimensoes = CALOR_DEPARTAMENTO
    por_departamento: dict[str, list[dict]] = {}
    for l in _consultar(con, arquivo_sql):
        por_departamento.setdefault(l.pop("departamento"), []).append(l)
    pasta = comum.PASTA_DADOS / "calor"
    for antigo in pasta.glob("*.json") if pasta.exists() else []:
        antigo.unlink()
    slugs = {}
    for departamento, linhas in por_departamento.items():
        s = comum.slug(departamento)
        if s in slugs:
            raise SystemExit(f"ERRO: '{departamento}' e '{slugs[s]}' têm o mesmo nome de arquivo calor/{s}.json")
        slugs[s] = departamento
        grao = f"1 linha por dia do ciclo × hora × grupo, departamento {departamento}, base inteira"
        destino = pasta / f"{s}.json"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(compactar(grao, linhas, dimensoes), ensure_ascii=False, separators=(",", ":")),
                           encoding="utf-8", newline="\n")
    print(f"  calor/*.json: {len(por_departamento)} arquivos")


def etapa_cesta_subcategorias(con) -> None:
    foco = [d for (d,) in con.execute("SELECT departamento FROM painel.departamentos_foco ORDER BY participacao DESC").fetchall()]
    linhas = []
    for departamento in foco:   # um por vez: GROCERY gera 3,4 milhões de pares antes de agregar
        parte = _consultar(con, "cesta_subcategorias.sql", {"dep": departamento})
        print(f"    {departamento}: {len(parte)} linhas")
        linhas += parte
    # Ordem do contrato: subconjunto (como em kpis_filtrados), depois departamento na ordem de foco, depois posição.
    ordem_sub = dict(con.execute("SELECT DISTINCT subconjunto, ordem FROM painel.subconjuntos").fetchall())
    linhas.sort(key=lambda l: (ordem_sub[l["subconjunto"]], foco.index(l["departamento"])))
    exportar(con, "cesta_subcategorias.json", linhas)


def etapa_ficha_categoria(con) -> None:
    exportar(con, "departamentos_ficha.json", _com_atributos(con, "departamentos_ficha.json", "percentil"))
    exportar(con, "departamentos_segmento.json", _com_atributos(con, "departamentos_segmento.json", "indice"))
    exportar(con, "subcategorias.json")


def _primeira_frase(texto: str) -> str:
    """Mesma regra de src/ui/aba_resumo.primeira_frase do RAG (não importada: o módulo depende do Streamlit)."""
    return re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])", texto.strip())[0]


def exportar_insights() -> None:
    """Os 3 cards da Visão Geral, com as frases e os números das análises do RAG (spec, 5.1). Não respondem a filtro."""
    rag = _rag_json()
    segs = rag["seg"]["segmentos"]
    total = sum(s["valor_total_usd"] for s in segs)
    fieis = next(s for s in segs if s["nome"] == "Fiéis")
    medianas = rag["desc"]["medianas_pct"]
    linhas = [
        {"id": "fieis_faturamento", "conclusao": rag["seg"]["conclusao"],
         "numero": round(fieis["valor_total_usd"] / total, 4), "unidade": "pct", "aba_destino": "segmentos"},
        # Sobre clientes (decisão do usuário, fase 3): a frase da aba de risco do RAG e as pausas esperadas que a
        # sustentam. Leva à lista de ação, na aba Segmentos (redesenho v2).
        {"id": "risco_pausa", "conclusao": rag["churn"]["conclusao"],
         "numero": round(sum(s["pausas_esperadas"] for s in rag["churn"]["risco_por_segmento"]), 2),
         "unidade": "clientes", "aba_destino": "segmentos"},
        {"id": "desconto_segmentos", "conclusao": rag["desc"]["conclusao"],
         # 6 casas: com 4, 1,2454 p.p. viraria 0,0125 e o front mostraria "1,3 p.p." em vez do "1,2" do app.
         "numero": round((max(medianas) - min(medianas)) / 100, 6), "unidade": "pp", "aba_destino": "segmentos"},
    ]
    exportar(None, "insights.json", linhas)


def etapa_segmentos(con) -> None:
    for nome in ("segmentos.json", "afinidade.json", "lista_acao.json"):
        exportar(con, nome)
    exportar_insights()


# --------------------------------------------------------------------------- manifest

def _arquivos_publicados() -> list[str]:
    calor = sorted(f"calor/{p.name}" for p in (comum.PASTA_DADOS / "calor").glob("*.json"))
    return list(ARQUIVOS) + calor


def _carga(nome: str) -> str:
    return "sob_demanda" if nome.startswith("calor/") else ARQUIVOS[nome][3]


def etapa_manifest(con, cfg: dict) -> None:
    base_hash = con.execute("SELECT valor FROM origem.meta WHERE chave = 'versao_base'").fetchone()[0]
    inicio, fim = con.execute("SELECT MIN(data), MAX(data) FROM origem.dim_data").fetchone()
    janelas = {}
    for periodo, ini, fim_s, d_ini, d_fim in con.execute("""
            SELECT p.periodo, p.semana_ini, p.semana_fim,
                   (SELECT MIN(data) FROM origem.dim_data WHERE WEEK_NO = p.semana_ini),
                   (SELECT MAX(data) FROM origem.dim_data WHERE WEEK_NO = p.semana_fim)
            FROM painel.periodos p ORDER BY p.ordem""").fetchall():
        janelas[periodo] = {"semana_ini": ini, "semana_fim": fim_s, "data_ini": str(d_ini), "data_fim": str(d_fim)}
    parametros = dict(con.execute("SELECT chave, valor FROM painel.parametros").fetchall())
    cesta_ini, cesta_fim = con.execute("SELECT semana_ini, semana_fim FROM painel.janela_cesta").fetchone()
    foco = [{"departamento": d, "participacao_pct": round(p, 4)} for d, p in con.execute(
        "SELECT departamento, participacao FROM painel.departamentos_foco ORDER BY participacao DESC").fetchall()]
    commit, sujo = comum.rag_commit(cfg["rag_dir"])
    rag = _rag_json()
    ch = rag["churn"]
    arquivos = []
    for nome in _arquivos_publicados():
        caminho = comum.PASTA_DADOS / nome
        if not caminho.exists():
            raise SystemExit(f"ERRO: {nome} não foi exportado. Rode todas as etapas antes do manifest.")
        conteudo = caminho.read_bytes()
        arquivos.append({"nome": nome, "carga": _carga(nome), "linhas": len(json.loads(conteudo)["linhas"]),
                         "bytes": len(conteudo), "sha256": hashlib.sha256(conteudo).hexdigest()})
    por_carga = {c: sum(a["bytes"] for a in arquivos if a["carga"] == c) for c in ("abertura", "categoria", "segmentos")}
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
        "parametros_cesta": {
            "semana_ini": cesta_ini, "semana_fim": cesta_fim,
            "minimo_cestas_par": int(parametros["minimo_cestas_par"]),
            "corte_departamento_pct": parametros["corte_departamento_pct"],
        },
        "departamentos_10pct": foco,
        "minimo_compradores_afinidade": int(parametros["tamanho_minimo_grupo"]),
        "bytes_abertura": por_carga["abertura"],   # o próprio manifest fica fora: é lido antes de tudo
        "bytes_por_aba": {"categoria": por_carga["categoria"], "segmentos": por_carga["segmentos"],
                          "calor_departamento_max": max((a["bytes"] for a in arquivos if a["carga"] == "sob_demanda"), default=0)},
        "arquivos": arquivos,
    }
    destino = comum.PASTA_DADOS / "manifest.json"
    destino.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"  manifest.json: {len(arquivos)} arquivos; abertura {por_carga['abertura']:,} bytes, "
          f"categoria {por_carga['categoria']:,}, segmentos {por_carga['segmentos']:,}")


# --------------------------------------------------------------------------- validação

# Colunas do grão de cada arquivo: nenhuma linha pode repetir a combinação. E o número de linhas esperado, se fixo.
GRAO = {
    "departamentos.json": (("departamento",), None),
    "cubo_faturamento.json": (("semana_inicio", "grupo", "departamento"), None),
    "cubo_periodo.json": (("periodo", "grupo", "departamento"), None),
    "calor_dia_hora.json": (("dia_semana", "hora", "grupo"), None),
    "kpis_filtrados.json": (("periodo", "subconjunto", "departamento"), None),
    "insights.json": (("id",), 3),
    "departamentos_ficha.json": (("departamento",), None),
    "departamentos_segmento.json": (("subconjunto", "departamento"), None),
    "subcategorias.json": (("departamento", "subcategoria"), None),
    "cesta_departamentos.json": (("subconjunto", "departamento_a", "departamento_b"), None),
    "cesta_subcategorias.json": (("subconjunto", "departamento", "subcategoria_a", "subcategoria_b"), None),
    "segmentos.json": (("segmento",), 4),
    "afinidade.json": (("segmento", "departamento"), None),
    "lista_acao.json": (("id",), None),
}


def expandir(dado: dict) -> list[dict]:
    """Lista de objetos a partir de qualquer um dos dois formatos do contrato."""
    if "colunas" not in dado:
        return dado["linhas"]
    dims = dado["dimensoes"]
    return [{c: (dims[c][v] if c in dims else v) for c, v in zip(dado["colunas"], linha)} for linha in dado["linhas"]]


def _schema_de(nome: str) -> str:
    return "calor_departamento" if nome.startswith("calor/") else nome.removesuffix(".json")


def validar() -> int:
    from jsonschema import Draft202012Validator

    erros = []
    nomes = _arquivos_publicados() + ["manifest.json"]
    for nome in nomes:
        caminho = comum.PASTA_DADOS / nome
        if not caminho.exists():
            erros.append(f"{nome}: arquivo não existe")
            continue
        dado = json.loads(caminho.read_text(encoding="utf-8"))
        schema = json.loads((comum.PASTA_CONTRATOS / f"{_schema_de(nome)}.schema.json").read_text(encoding="utf-8"))
        for e in Draft202012Validator(schema).iter_errors(dado):
            caminho_erro = "/".join(str(p) for p in e.absolute_path)
            erros.append(f"{nome}: {caminho_erro or '(raiz)'}: {e.message[:200]}")
        if "colunas" in dado:
            for coluna, valores in dado["dimensoes"].items():
                usados = {linha[dado["colunas"].index(coluna)] for linha in dado["linhas"]}
                if usados - set(range(len(valores))):
                    erros.append(f"{nome}: índice fora de dimensoes.{coluna}")
        chaves, esperado = GRAO.get(nome, (("dia_semana", "hora", "grupo"), None) if nome.startswith("calor/") else (None, None))
        if chaves:
            vistos = [tuple(l[c] for c in chaves) for l in expandir(dado)]
            if len(vistos) != len(set(vistos)):
                erros.append(f"{nome}: linhas repetidas no grão {chaves}")
            if esperado is not None and len(vistos) != esperado:
                erros.append(f"{nome}: {len(vistos)} linhas, esperado {esperado}")
    # Cada arquivo tem de ser o mesmo que o manifest descreve (nada editado depois da exportação), e o manifest tem de
    # listar todos os arquivos publicados.
    manifest = comum.PASTA_DADOS / "manifest.json"
    if manifest.exists():
        m = json.loads(manifest.read_text(encoding="utf-8"))
        listados = {a["nome"] for a in m["arquivos"]}
        for faltando in sorted(set(_arquivos_publicados()) - listados):
            erros.append(f"{faltando}: fora do manifest; exporte de novo")
        for a in m["arquivos"]:
            caminho = comum.PASTA_DADOS / a["nome"]
            if not caminho.exists():
                erros.append(f"{a['nome']}: está no manifest, mas não existe")
                continue
            conteudo = caminho.read_bytes()
            if (len(conteudo), hashlib.sha256(conteudo).hexdigest(), len(json.loads(conteudo)["linhas"])) != \
                    (a["bytes"], a["sha256"], a["linhas"]):
                erros.append(f"{a['nome']}: diferente do manifest (bytes, sha256 ou linhas); exporte de novo")
        for carga, total in [("abertura", m["bytes_abertura"]), ("categoria", m["bytes_por_aba"]["categoria"]),
                             ("segmentos", m["bytes_por_aba"]["segmentos"])]:
            if total > LIMITE_BYTES:
                erros.append(f"orçamento: {carga} com {total:,} bytes, acima de {LIMITE_BYTES:,}")
    # Arquivos antigos que não pertencem mais ao contrato.
    publicados = set(nomes)
    for p in comum.PASTA_DADOS.rglob("*.json"):
        rel = p.relative_to(comum.PASTA_DADOS).as_posix()
        if rel not in publicados:
            erros.append(f"{rel}: arquivo fora do contrato {VERSAO_CONTRATO}; apague")
    for e in erros:
        print("ERRO", e)
    print(f"Validação: {len(nomes)} arquivos, {len(erros)} erros")
    return 1 if erros else 0


# --------------------------------------------------------------------------- principal

def rodar_etapa(etapa: str, cfg: dict) -> None:
    print(f"[{etapa}]", flush=True)
    if etapa == "rag":
        etapa_rag(cfg)
        return
    if etapa == "base":
        etapa_base(cfg)
        return
    con = conectar(cfg)
    try:
        if etapa == "cubos":
            etapa_cubos(con)
        elif etapa == "kpis_filtrados":
            exportar(con, "kpis_filtrados.json")
        elif etapa == "cesta_departamentos":
            exportar(con, "cesta_departamentos.json")
        elif etapa == "cesta_subcategorias":
            etapa_cesta_subcategorias(con)
        elif etapa == "ficha_categoria":
            etapa_ficha_categoria(con)
        elif etapa == "segmentos":
            etapa_segmentos(con)
        elif etapa == "manifest":
            etapa_manifest(con, cfg)
    finally:
        con.close()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--etapa", action="append", choices=ETAPAS + ["todas"], help="roda só esta etapa (repetível)")
    parser.add_argument("--validar", action="store_true", help="só valida os arquivos em site/data contra os schemas")
    args = parser.parse_args()
    if args.validar:
        return validar()

    cfg = comum.carregar_config()
    etapas = args.etapa or ["todas"]
    if etapas == ["todas"]:
        # Cada etapa num processo novo: a memória do sklearn e do DuckDB volta ao sistema ao fim de cada uma.
        antes = comum.foto_rag(cfg["rag_dir"])
        for etapa in ETAPAS:
            r = subprocess.run([sys.executable, __file__, "--etapa", etapa])
            if r.returncode:
                print(f"ERRO na etapa {etapa}; as seguintes não rodaram.")
                return r.returncode
        comum.conferir_rag_intocado(antes, comum.foto_rag(cfg["rag_dir"]))
        print("RAG intocado.")
        return 0
    for etapa in etapas:
        rodar_etapa(etapa, cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
