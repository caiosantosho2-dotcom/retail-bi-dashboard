"""Reconciliação: cada número dos JSONs contra a origem, sem reaproveitar as consultas da exportação.

- Números do banco: SQL próprio e simples, direto nas views do RAG (vw_metricas_cesta, vw_yoy_resumo,
  vw_yoy_categoria, vw_contexto_periodo, vw_metricas_cliente) ou na tabela fato, nunca nas views do painel.
- Segmento, CLV e risco: as funções do próprio RAG (rfm, clv, churn), e não a réplica de scripts/rag_modelos.py.
- Por último, os números que o app de RAG mostra (spec, "Origem dos dados por cliente").

Tolerâncias (skill validating-dashboard): contagens exatas; dinheiro ±0,01; frações ±0,0001; índice ±1. Somas de
parcelas arredondadas a 2 casas: ±0,005 por parcela, que é só o arredondamento de cada parcela no JSON.
Saída: uma linha por verificação; código de saída 1 se houver qualquer divergência.
"""

import json
import math
import random
import sys
from collections import defaultdict

sys.dont_write_bytecode = True

import comum  # noqa: E402

TOL_DINHEIRO, TOL_FRACAO, TOL_INDICE = 0.01, 0.0001, 1.0
SEG4 = "+".join(comum.SEGMENTOS)

# O que o app de RAG mostra (README do RAG e aba Resumo), conferido pelo usuário.
APP = {"fieis_clientes_pct": 35, "fieis_faturamento_pct": 71, "auc_modelo": 0.85, "auc_regra_simples": 0.74,
       "pausas_esperadas": 136, "alertas": 243}

resultados: list[tuple[bool, str, object, object, str]] = []


def conferir(nome: str, esperado, encontrado, arquivo: str, tol: float = 0.0) -> None:
    if esperado is None or encontrado is None:
        ok = esperado is None and encontrado is None
    elif tol:
        ok = abs(float(esperado) - float(encontrado)) <= tol + 1e-9
    else:
        ok = esperado == encontrado
    resultados.append((ok, nome, esperado, encontrado, arquivo))


def ler(nome: str):
    return json.loads((comum.PASTA_DADOS / nome).read_text(encoding="utf-8"))


def linhas(nome: str) -> list[dict]:
    """Lista de objetos nos dois formatos do contrato 2.0 (objetos ou compacto)."""
    dado = ler(nome)
    if "colunas" not in dado:
        return dado["linhas"]
    dims = dado["dimensoes"]
    return [{c: (dims[c][v] if c in dims else v) for c, v in zip(dado["colunas"], l)} for l in dado["linhas"]]


def um(con, sql: str, params=None):
    return con.execute(sql, params or []).fetchone()


def soma(itens, campo):
    valores = [i[campo] for i in itens]
    return None if any(v is None for v in valores) else sum(valores)


def grupos_do(subconjunto: str) -> list[str]:
    return comum.GRUPOS if subconjunto == "todos" else subconjunto.split("+")


# --------------------------------------------------------------------------- SQL próprio sobre a tabela fato

ITENS_SQL = """
CREATE TEMP VIEW it AS
SELECT f.BASKET_ID, f.household_key, f.STORE_ID, d.WEEK_NO, f.hora, d.dia_semana,
       p.DEPARTMENT AS dep, p.COMMODITY_DESC AS com, p.BRAND AS marca,
       f.SALES_VALUE::DOUBLE AS fat, f.QUANTITY::DOUBLE AS qtd,
       -(f.RETAIL_DISC + f.COUPON_DISC + f.COUPON_MATCH_DISC)::DOUBLE AS descontos,
       (f.SALES_VALUE - (f.RETAIL_DISC + f.COUPON_DISC + f.COUPON_MATCH_DISC))::DOUBLE AS bruto
FROM origem.fato_transacoes f
JOIN origem.dim_data d ON d.data_id = f.data_id
JOIN origem.dim_produto p ON p.PRODUCT_ID = f.PRODUCT_ID
WHERE d.WEEK_NO <= (SELECT semana_fim_atual FROM origem.vw_janela);
CREATE TEMP VIEW lfl AS SELECT STORE_ID FROM origem.vw_lojas_like_for_like;
"""


def hh_filtro(subconjunto: str) -> str:
    """Condição SQL sobre it.household_key para um subconjunto de segmentos (tabela _atrib, a atribuição do RAG)."""
    if subconjunto == "todos":
        return "TRUE"
    segs = ", ".join("'" + s.replace("'", "''") + "'" for s in subconjunto.split("+"))
    return f"household_key IN (SELECT household_key FROM _atrib WHERE segmento IN ({segs}))"


# --------------------------------------------------------------------------- KPIs (todos × todos)

def _metricas(fat, cestas, itens, desconto, bruto) -> dict:
    return {"faturamento": fat, "cestas": cestas, "ticket_medio": fat / cestas, "itens_por_cesta": itens / cestas,
            "desconto_pct": desconto / bruto}


def _janela_cesta(con, semana_ini: int, semana_fim: int) -> dict:
    """4, 13 e 26 semanas direto de vw_metricas_cesta (semana_alinhada alinha a base com a semana atual)."""
    sql = """
        WITH c AS (SELECT * FROM origem.vw_metricas_cesta WHERE semana_alinhada BETWEEN ? AND ?),
        l AS (SELECT STORE_ID FROM c GROUP BY STORE_ID
              HAVING COUNT(*) FILTER (WHERE periodo = 'atual') > 0 AND COUNT(*) FILTER (WHERE periodo = 'base') > 0)
        SELECT recorte, SUM(faturamento)::DOUBLE, COUNT(*), SUM(itens)::DOUBLE, SUM(desconto_total)::DOUBLE,
               SUM(valor_bruto)::DOUBLE, (SELECT COUNT(*) FROM l)
        FROM (SELECT 'todas' AS recorte, * FROM c WHERE periodo = 'atual'
              UNION ALL SELECT 'comparavel', * FROM c WHERE periodo = 'atual' AND STORE_ID IN (SELECT STORE_ID FROM l)
              UNION ALL SELECT 'ano_anterior', * FROM c WHERE periodo = 'base' AND STORE_ID IN (SELECT STORE_ID FROM l))
        GROUP BY recorte"""
    saida = {}
    for recorte, fat, ces, it, dt, vb, lojas in con.execute(sql, [semana_ini, semana_fim]).fetchall():
        saida[recorte] = _metricas(fat, ces, it, dt, vb)
        saida["lojas"] = lojas
    return saida


def _base_inteira(con) -> dict:
    fat, ces, it, dt, vb = um(con, "SELECT SUM(fat), COUNT(DISTINCT BASKET_ID), SUM(qtd), SUM(descontos), SUM(bruto) FROM it")
    return {"todas": _metricas(fat, ces, it, dt, vb)}


def reconciliar_kpis(con) -> dict:
    j = dict(zip(["ini_mes", "ini_tri", "ini", "fim", "off"], um(con, """
        SELECT semana_ini_ultimo_mes, semana_ini_ultimo_trimestre, semana_ini_atual, semana_fim_atual, offset_semanas
        FROM origem.vw_janela""")))
    esperado = {"4s": _janela_cesta(con, j["ini_mes"], j["fim"]), "13s": _janela_cesta(con, j["ini_tri"], j["fim"]),
                "26s": _janela_cesta(con, j["ini"], j["fim"]), "base": _base_inteira(con)}
    ativos = dict(con.execute("SELECT periodo, COUNT(*) FILTER (WHERE cliente_ativo) FROM origem.vw_metricas_cliente "
                              "GROUP BY periodo").fetchall())
    cubo = linhas("cubo_periodo.json")
    kf = {(l["periodo"], l["subconjunto"], l["departamento"]): l for l in linhas("kpis_filtrados.json")}
    obtido = {}
    for periodo, e in esperado.items():
        partes = [c for c in cubo if c["periodo"] == periodo]
        tol = 0.005 * len(partes)
        k = kf[(periodo, "todos", "todos")]
        # Métricas que somam: soma do cubo com todos os grupos e departamentos.
        recortes = {"todas": "", "comparavel": "_comparavel", "ano_anterior": "_ano_anterior"}
        for recorte, sufixo in recortes.items():
            if recorte not in e:
                conferir(f"cubo_periodo {periodo}: sem {recorte}", None, soma(partes, f"faturamento{sufixo}"), "cubo_periodo.json")
                continue
            fat = soma(partes, f"faturamento{sufixo}")
            conferir(f"cubo_periodo {periodo} {recorte}: faturamento", e[recorte]["faturamento"], fat, "cubo_periodo.json", tol)
            conferir(f"cubo_periodo {periodo} {recorte}: % de desconto (somas)", e[recorte]["desconto_pct"],
                     soma(partes, f"desconto{sufixo}") / soma(partes, f"valor_bruto{sufixo}"), "cubo_periodo.json", TOL_FRACAO)
            for metrica, tol_m in [("cestas", 0), ("ticket_medio", TOL_DINHEIRO), ("itens_por_cesta", TOL_FRACAO)]:
                conferir(f"kpis_filtrados {periodo} {recorte}: {metrica}", e[recorte][metrica],
                         k[f"{metrica}{'' if recorte == 'todas' else sufixo}"], "kpis_filtrados.json", tol_m)
        if periodo != "base":
            for metrica in ("cestas", "ticket_medio", "itens_por_cesta"):
                conferir(f"kpis_filtrados {periodo}: variação {metrica}",
                         e["comparavel"][metrica] / e["ano_anterior"][metrica] - 1, k[f"{metrica}_variacao_pct"],
                         "kpis_filtrados.json", TOL_FRACAO)
            conferir(f"kpis_filtrados {periodo}: lojas comparáveis", e["lojas"], k["lojas_comparaveis"], "kpis_filtrados.json")
        conferir(f"kpis_filtrados {periodo}: clientes ativos", ativos["atual"], k["clientes_ativos"], "kpis_filtrados.json")
        conferir(f"kpis_filtrados {periodo}: clientes ativos um ano antes", None if periodo == "base" else ativos["base"],
                 k["clientes_ativos_ano_anterior"], "kpis_filtrados.json")
        obtido[periodo] = {"faturamento": e["todas"]["faturamento"], "cestas": e["todas"]["cestas"]}   # SQL independente

    # 26 semanas também contra as views agregadas do RAG que o chat usa (vw_yoy_resumo, vw_contexto_periodo).
    fat_a, fat_b, lojas, ces_a, ces_b, tic_a, tic_b = um(con, """
        SELECT faturamento_atual::DOUBLE, faturamento_base::DOUBLE, lojas_like_for_like,
               cestas_atual, cestas_base, ticket_atual, ticket_base FROM origem.vw_yoy_resumo""")
    p26 = [c for c in cubo if c["periodo"] == "26s"]
    k = kf[("26s", "todos", "todos")]
    conferir("vw_yoy_resumo faturamento atual", fat_a, soma(p26, "faturamento_comparavel"), "cubo_periodo.json", 0.005 * len(p26))
    conferir("vw_yoy_resumo faturamento base", fat_b, soma(p26, "faturamento_ano_anterior"), "cubo_periodo.json", 0.005 * len(p26))
    conferir("vw_yoy_resumo lojas like-for-like", lojas, k["lojas_comparaveis"], "kpis_filtrados.json")
    conferir("vw_yoy_resumo cestas atual", ces_a, k["cestas_comparavel"], "kpis_filtrados.json")
    conferir("vw_yoy_resumo cestas base", ces_b, k["cestas_ano_anterior"], "kpis_filtrados.json")
    conferir("vw_yoy_resumo ticket atual", tic_a, k["ticket_medio_comparavel"], "kpis_filtrados.json", TOL_DINHEIRO)
    conferir("vw_yoy_resumo ticket base", tic_b, k["ticket_medio_ano_anterior"], "kpis_filtrados.json", TOL_DINHEIRO)
    desconto = um(con, "SELECT pct_desconto FROM origem.vw_contexto_periodo WHERE periodo = 'atual'")[0]
    conferir("vw_contexto_periodo % desconto atual", desconto / 100,
             soma(p26, "desconto") / soma(p26, "valor_bruto"), "cubo_periodo.json", TOL_FRACAO)
    return {"janela": j, "total": obtido, "yoy": (fat_a, fat_b)}


# --------------------------------------------------------------------------- grupos: 4 segmentos + sem segmento = todos

def reconciliar_grupos(con, ctx: dict) -> None:
    cubo = linhas("cubo_periodo.json")
    sem_fat, sem_cestas = um(con, "SELECT SUM(fat), COUNT(DISTINCT BASKET_ID) FROM it "
                                  "WHERE household_key NOT IN (SELECT household_key FROM _atrib)")
    base_sem = [c for c in cubo if c["periodo"] == "base" and c["grupo"] == comum.SEM_SEGMENTO]
    conferir("sem segmento: faturamento na base inteira (SQL)", sem_fat, soma(base_sem, "faturamento"),
             "cubo_periodo.json", 0.005 * len(base_sem))
    for periodo in ("4s", "13s", "26s"):
        conferir(f"sem segmento: zero em {periodo}", 0.0,
                 sum(c["faturamento"] for c in cubo if c["periodo"] == periodo and c["grupo"] == comum.SEM_SEGMENTO),
                 "cubo_periodo.json")
    for periodo in comum.PERIODOS:
        partes = [c for c in cubo if c["periodo"] == periodo]
        por_grupo = sum(sum(c["faturamento"] for c in partes if c["grupo"] == g) for g in comum.GRUPOS)
        conferir(f"cubo_periodo {periodo}: 4 segmentos + sem segmento = todos", ctx["total"][periodo]["faturamento"],
                 por_grupo, "cubo_periodo.json", 0.005 * len(partes))

    kf = linhas("kpis_filtrados.json")
    idx = {(l["periodo"], l["subconjunto"], l["departamento"]): l for l in kf}
    conferir("kpis_filtrados base: todos − 4 segmentos = cestas sem segmento (SQL)", sem_cestas,
             idx[("base", "todos", "todos")]["cestas"] - idx[("base", SEG4, "todos")]["cestas"], "kpis_filtrados.json")
    # Cada subconjunto = soma dos seus segmentos (cestas e clientes ativos são exclusivos por cliente).
    erros = 0
    for l in kf:
        if l["subconjunto"] == "todos":
            continue
        partes = [idx.get((l["periodo"], s, l["departamento"])) for s in l["subconjunto"].split("+")]
        for campo in ("cestas", "cestas_ano_anterior", "clientes_ativos"):
            if l[campo] is None:
                continue
            if l[campo] != sum((p[campo] or 0) if p else 0 for p in partes):
                erros += 1
    conferir("kpis_filtrados: cada subconjunto = soma dos seus segmentos (cestas e ativos)", 0, erros, "kpis_filtrados.json")
    subconjuntos = {l["subconjunto"] for l in kf}
    conferir("kpis_filtrados: 16 subconjuntos (15 combinações + todos)", 16, len(subconjuntos), "kpis_filtrados.json")


# --------------------------------------------------------------------------- cubo semanal, calor e lista de departamentos

def reconciliar_cubos(con, ctx: dict) -> None:
    j = ctx["janela"]
    cubo = linhas("cubo_faturamento.json")
    semanas = sorted({c["semana_inicio"] for c in cubo})
    conferir("cubo_faturamento: 52 semanas", 52, len(semanas), "cubo_faturamento.json")
    primeira = um(con, "SELECT strftime(MIN(data), '%Y-%m-%d') FROM origem.dim_data WHERE WEEK_NO = ?", [j["fim"] - 51])[0]
    conferir("cubo_faturamento: começa na semana fim − 51", primeira, semanas[0], "cubo_faturamento.json")
    ini26 = um(con, "SELECT strftime(MIN(data), '%Y-%m-%d') FROM origem.dim_data WHERE WEEK_NO = ?", [j["ini"]])[0]
    janela = [c for c in cubo if c["semana_inicio"] >= ini26]
    fat_a, fat_b = ctx["yoy"]
    conferir("cubo_faturamento 26s (lojas do chat) = vw_yoy_resumo atual", fat_a, sum(c["faturamento"] for c in janela),
             "cubo_faturamento.json", 0.005 * len(janela))
    conferir("cubo_faturamento 26s ano anterior = vw_yoy_resumo base", fat_b,
             sum(c["faturamento_ano_anterior"] for c in janela), "cubo_faturamento.json", 0.005 * len(janela))
    sem_ano_anterior = sorted({c["semana_inicio"] for c in cubo if c["faturamento_ano_anterior"] is None})
    esperado = [s for s in semanas if s < ini26]
    conferir("cubo_faturamento: ano anterior só nas 26 semanas (nulo antes)", esperado, sem_ano_anterior,
             "cubo_faturamento.json")
    # Por departamento, contra a view do RAG por categoria (lojas like-for-like).
    cat = dict(con.execute("""SELECT DEPARTMENT, SUM(faturamento_atual)::DOUBLE FROM origem.vw_yoy_categoria
                              WHERE marca = 'TODAS' GROUP BY DEPARTMENT""").fetchall())
    for dep in ("GROCERY", "MEAT", "PASTRY"):
        partes = [c for c in janela if c["departamento"] == dep]
        conferir(f"cubo_faturamento 26s {dep} = vw_yoy_categoria", cat[dep], sum(c["faturamento"] for c in partes),
                 "cubo_faturamento.json", 0.005 * len(partes))

    calor = linhas("calor_dia_hora.json")
    conferir("calor: soma = faturamento da base inteira", ctx["total"]["base"]["faturamento"],
             sum(c["faturamento"] for c in calor), "calor_dia_hora.json", 0.005 * len(calor))
    conferir("calor: soma das cestas = cestas da base inteira", ctx["total"]["base"]["cestas"],
             sum(c["cestas"] for c in calor), "calor_dia_hora.json")
    celula = um(con, "SELECT SUM(fat) FROM it WHERE dia_semana = 2 AND hora = 17")[0]
    conferir("calor: célula dia 2, 17h (SQL)", celula,
             sum(c["faturamento"] for c in calor if c["dia_semana"] == 2 and c["hora"] == 17), "calor_dia_hora.json", 0.03)

    deps = linhas("departamentos.json")
    n_deps = um(con, "SELECT COUNT(DISTINCT dep) FROM it")[0]
    conferir("departamentos: um por departamento com venda na base", n_deps, len(deps), "departamentos.json")
    conferir("departamentos: soma das 26 semanas = faturamento do período", ctx["total"]["26s"]["faturamento"],
             sum(d["faturamento_26s"] for d in deps), "departamentos.json", 0.005 * len(deps))
    conferir("departamentos: soma da base inteira = faturamento da base", ctx["total"]["base"]["faturamento"],
             sum(d["faturamento_base"] for d in deps), "departamentos.json", 0.005 * len(deps))
    conferir("departamentos: participação soma 1", 1.0, sum(d["participacao_26s_pct"] for d in deps), "departamentos.json",
             0.00005 * len(deps))
    for d in deps:
        arquivo = f"calor/{comum.slug(d['departamento'])}.json"
        if not (comum.PASTA_DADOS / arquivo).exists():
            conferir(f"calor por departamento: {arquivo} existe", True, False, arquivo)
    for dep in ("DRUG GM", "PRODUCE", "SPIRITS"):
        arquivo = f"calor/{comum.slug(dep)}.json"
        partes = linhas(arquivo)
        conferir(f"calor {dep}: soma = faturamento da base inteira (SQL)", um(con, "SELECT SUM(fat) FROM it WHERE dep = ?", [dep])[0],
                 sum(c["faturamento"] for c in partes), arquivo, 0.005 * len(partes))


# --------------------------------------------------------------------------- departamento (Visão Geral filtrada e Ficha)

def reconciliar_departamentos(con, ctx: dict) -> None:
    j = ctx["janela"]
    ficha = {d["departamento"]: d for d in linhas("departamentos_ficha.json")}
    kf = {(l["periodo"], l["subconjunto"], l["departamento"]): l for l in linhas("kpis_filtrados.json")}
    cubo = linhas("cubo_periodo.json")
    risco_alto = [l["id"] for l in linhas("lista_acao.json") if l["faixa"] == "alto"]
    con.execute("CREATE OR REPLACE TEMP TABLE _alto AS SELECT UNNEST(?::BIGINT[]) AS household_key", [risco_alto])
    n_deps = um(con, "SELECT COUNT(DISTINCT dep) FROM it WHERE WEEK_NO BETWEEN ? AND ?", [j["ini"], j["fim"]])[0]
    conferir("ficha: um departamento por departamento com venda nas 26 semanas", n_deps, len(ficha), "departamentos_ficha.json")
    fora = sum(1 for d in ficha.values() for a in d["atributos"].values()
               if a["percentil"] is not None and not 0 <= a["percentil"] <= 100)
    conferir("ficha: percentis entre 0 e 100", 0, fora, "departamentos_ficha.json")
    conferir("ficha: 6 atributos em cada departamento", 0, sum(1 for d in ficha.values() if len(d["atributos"]) != 6),
             "departamentos_ficha.json")
    total26 = ctx["total"]["26s"]["faturamento"]
    cat = {d: (a, b) for d, a, b in con.execute("""SELECT DEPARTMENT, SUM(faturamento_atual)::DOUBLE, SUM(faturamento_base)::DOUBLE
        FROM origem.vw_yoy_categoria WHERE marca = 'TODAS' GROUP BY DEPARTMENT""").fetchall()}
    clientes_lfl = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE WEEK_NO BETWEEN ? AND ? "
                           "AND STORE_ID IN (SELECT * FROM lfl)", [j["ini"], j["fim"]])[0]

    random.seed(42)
    grandes = sorted(d for d, f in ficha.items() if not f["amostra_pequena"])
    for dep in random.sample(grandes, 3):
        f = ficha[dep]
        a = f["atributos"]
        fat, desc, bruto, priv, cestas, compradores, risco = um(con, """
            SELECT SUM(fat), SUM(descontos), SUM(bruto), SUM(fat) FILTER (WHERE marca = 'Private'),
                   COUNT(DISTINCT BASKET_ID), COUNT(DISTINCT household_key),
                   SUM(fat) FILTER (WHERE household_key IN (SELECT household_key FROM _alto))
            FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?""", [dep, j["ini"], j["fim"]])
        compradores_lfl = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ? "
                                  "AND STORE_ID IN (SELECT * FROM lfl)", [dep, j["ini"], j["fim"]])[0]
        conferir(f"ficha {dep}: faturamento", fat, f["faturamento"], "departamentos_ficha.json", TOL_DINHEIRO)
        conferir(f"ficha {dep}: participação", fat / total26, a["participacao"]["valor"], "departamentos_ficha.json", TOL_FRACAO)
        conferir(f"ficha {dep}: crescimento = vw_yoy_categoria", cat[dep][0] / cat[dep][1] - 1, a["crescimento"]["valor"],
                 "departamentos_ficha.json", TOL_FRACAO)
        conferir(f"ficha {dep}: penetração (definição do RAG)", compradores_lfl / clientes_lfl, a["penetracao"]["valor"],
                 "departamentos_ficha.json", TOL_FRACAO)
        conferir(f"ficha {dep}: frequência", cestas / compradores, a["frequencia"]["valor"], "departamentos_ficha.json", TOL_FRACAO)
        conferir(f"ficha {dep}: % de desconto", desc / bruto, a["desconto"]["valor"], "departamentos_ficha.json", TOL_FRACAO)
        conferir(f"ficha {dep}: % marca própria", (priv or 0) / fat, a["marca_propria"]["valor"], "departamentos_ficha.json",
                 TOL_FRACAO)
        conferir(f"ficha {dep}: dinheiro em risco", risco or 0.0, f["dinheiro_em_risco"], "departamentos_ficha.json", TOL_DINHEIRO)
        # Visão Geral filtrada por esse departamento: kpis_filtrados e cubo_periodo.
        k = kf[("26s", "todos", dep)]
        conferir(f"kpis_filtrados 26s {dep}: cestas com o departamento", cestas, k["cestas"], "kpis_filtrados.json")
        conferir(f"kpis_filtrados 26s {dep}: ticket", fat / cestas, k["ticket_medio"], "kpis_filtrados.json", TOL_DINHEIRO)
        itens = um(con, "SELECT SUM(qtd) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?", [dep, j["ini"], j["fim"]])[0]
        conferir(f"kpis_filtrados 26s {dep}: itens por cesta", itens / cestas, k["itens_por_cesta"], "kpis_filtrados.json", TOL_FRACAO)
        ces_c, ces_a = um(con, """SELECT COUNT(DISTINCT BASKET_ID) FILTER (WHERE WEEK_NO BETWEEN ? AND ?),
                                         COUNT(DISTINCT BASKET_ID) FILTER (WHERE WEEK_NO BETWEEN ? AND ?)
                                  FROM it WHERE dep = ? AND STORE_ID IN (SELECT * FROM lfl)""",
                          [j["ini"], j["fim"], j["ini"] - j["off"], j["fim"] - j["off"], dep])
        conferir(f"kpis_filtrados 26s {dep}: cestas comparáveis", ces_c, k["cestas_comparavel"], "kpis_filtrados.json")
        conferir(f"kpis_filtrados 26s {dep}: cestas um ano antes", ces_a, k["cestas_ano_anterior"], "kpis_filtrados.json")
        ativos = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?",
                    [dep, j["fim"] - 7, j["fim"]])[0]
        conferir(f"kpis_filtrados 26s {dep}: clientes ativos que compraram nas últimas 8 semanas", ativos,
                 k["clientes_ativos"], "kpis_filtrados.json")
        partes = [c for c in cubo if c["periodo"] == "26s" and c["departamento"] == dep]
        conferir(f"cubo_periodo 26s {dep}: faturamento", fat, sum(c["faturamento"] for c in partes), "cubo_periodo.json",
                 0.005 * len(partes))
        # Fiéis contra todos, para a comparação da direita.
        fat_f, total_f = um(con, f"""SELECT SUM(fat) FILTER (WHERE dep = ?), SUM(fat) FROM it
                                     WHERE WEEK_NO BETWEEN ? AND ? AND {hh_filtro('Fiéis')}""", [dep, j["ini"], j["fim"]])
        seg = next(s for s in linhas("departamentos_segmento.json") if s["subconjunto"] == "Fiéis" and s["departamento"] == dep)
        conferir(f"departamentos_segmento Fiéis {dep}: participação", fat_f / total_f, seg["atributos"]["participacao"]["valor"],
                 "departamentos_segmento.json", TOL_FRACAO)
        conferir(f"departamentos_segmento Fiéis {dep}: índice da participação",
                 100 * (fat_f / total_f) / (fat / total26), seg["atributos"]["participacao"]["indice"],
                 "departamentos_segmento.json", TOL_INDICE)
        top = um(con, """SELECT com, SUM(fat) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?
                         GROUP BY com ORDER BY 2 DESC, 1 LIMIT 1""", [dep, j["ini"], j["fim"]])
        sub = next(s for s in linhas("subcategorias.json") if s["departamento"] == dep and s["posicao"] == 1)
        conferir(f"subcategorias {dep}: a maior", top[0], sub["subcategoria"], "subcategorias.json")
        conferir(f"subcategorias {dep}: faturamento da maior", top[1], sub["faturamento"], "subcategorias.json", TOL_DINHEIRO)

    todos = {s["departamento"]: s for s in linhas("departamentos_segmento.json") if s["subconjunto"] == "todos"}
    diferentes = sum(1 for d, f in ficha.items()
                     for a in f["atributos"] if todos[d]["atributos"][a]["valor"] != f["atributos"][a]["valor"])
    conferir("departamentos_segmento 'todos' = departamentos_ficha", 0, diferentes, "departamentos_segmento.json")
    fora = sum(1 for s in todos.values() for a in s["atributos"].values() if a["indice"] not in (None, 100.0))
    conferir("departamentos_segmento 'todos': índice 100", 0, fora, "departamentos_segmento.json")


# --------------------------------------------------------------------------- análise de cesta

def _par(con, subconjunto: str, ini: int, fim: int, nivel: str, a: str, b: str, dep: str | None = None) -> dict:
    """Suporte, confiança e lift de um par, recontados direto da tabela fato (cesta como unidade)."""
    # Subcategorias: só dentro do departamento (o mesmo nome pode existir em outro). O total é de todas as cestas.
    no_dep = "dep = ?" if dep else "TRUE"
    params = [ini, fim] + ([dep, a, dep, b] if dep else [a, b])
    n, na, nb, nab = um(con, f"""
        WITH c AS (SELECT BASKET_ID, dep, {nivel} AS x FROM it WHERE WEEK_NO BETWEEN ? AND ? AND {hh_filtro(subconjunto)}),
        alvo AS (SELECT BASKET_ID, BOOL_OR({no_dep} AND x = ?) AS tem_a, BOOL_OR({no_dep} AND x = ?) AS tem_b
                 FROM c GROUP BY BASKET_ID)
        SELECT COUNT(*), COUNT(*) FILTER (WHERE tem_a), COUNT(*) FILTER (WHERE tem_b),
               COUNT(*) FILTER (WHERE tem_a AND tem_b) FROM alvo""", params)
    return {"cestas_total": n, "cestas_a": na, "cestas_b": nb, "cestas_par": nab, "suporte": nab / n,
            "confianca_a_b": nab / na, "confianca_b_a": nab / nb, "lift": nab * n / (na * nb)}


def reconciliar_cesta(con) -> None:
    m = ler("manifest.json")
    pc = m["parametros_cesta"]
    ini, fim = pc["semana_ini"], pc["semana_fim"]
    foco = [d for d, p in con.execute("""
        WITH v AS (SELECT dep, SUM(fat) AS f FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY dep)
        SELECT dep, f / SUM(f) OVER () FROM v ORDER BY 2 DESC""", [ini, fim]).fetchall() if p >= pc["corte_departamento_pct"]]
    conferir("manifest: departamentos com 10% ou mais (SQL)", foco, [d["departamento"] for d in m["departamentos_10pct"]],
             "manifest.json")
    conferir("manifest: janela da cesta = 26 semanas da segmentação", (76, 101), (ini, fim), "manifest.json")

    deps = linhas("cesta_departamentos.json")
    n_pares = um(con, """WITH c AS (SELECT DISTINCT BASKET_ID, dep FROM it WHERE WEEK_NO BETWEEN ? AND ?)
                         SELECT COUNT(*) FROM (SELECT DISTINCT a.dep, b.dep FROM c a JOIN c b
                                               ON a.BASKET_ID = b.BASKET_ID AND a.dep < b.dep)""", [ini, fim])[0]
    conferir("cesta_departamentos 'todos': todos os pares com ao menos uma cesta", n_pares,
             sum(1 for p in deps if p["subconjunto"] == "todos"), "cesta_departamentos.json")
    pequenas = sum(1 for p in deps if p["amostra_pequena"] != (p["cestas_par"] < pc["minimo_cestas_par"]))
    conferir("cesta: amostra_pequena ⇔ menos de 200 cestas com o par", 0, pequenas, "cesta_departamentos.json")

    random.seed(42)
    sorteados = [("cesta_departamentos.json", p) for p in random.sample(deps, 7)]
    subs = linhas("cesta_subcategorias.json")
    sorteados += [("cesta_subcategorias.json", p) for p in random.sample(subs, 3)]
    for arquivo, p in sorteados:
        if arquivo == "cesta_departamentos.json":
            a, b, nivel, dep = p["departamento_a"], p["departamento_b"], "dep", None
        else:
            a, b, nivel, dep = p["subcategoria_a"], p["subcategoria_b"], "com", p["departamento"]
        e = _par(con, p["subconjunto"], ini, fim, nivel, a, b, dep)
        nome = f"par {p['subconjunto']} {a} × {b}"
        for campo in ("cestas_total", "cestas_a", "cestas_b", "cestas_par"):
            conferir(f"{nome}: {campo}", e[campo], p[campo], arquivo)
        conferir(f"{nome}: suporte", e["suporte"], p["suporte"], arquivo, 0.000001)
        for campo in ("confianca_a_b", "confianca_b_a", "lift"):
            conferir(f"{nome}: {campo}", e[campo], p[campo], arquivo, TOL_FRACAO)


# --------------------------------------------------------------------------- Segmentos, lista de ação e app

def rodar_rag(cfg: dict) -> dict:
    """As funções do próprio RAG (não a réplica da exportação). A conexão do RAG precisa estar sozinha no arquivo."""
    import rag_modelos

    CFG, banco, churn, clv, rfm, _ = rag_modelos._importar(cfg["rag_dir"])
    cur = banco.cursor(cfg["duckdb_origem"])
    try:
        seg, atribuicao = rfm._resultado(cur, None)
        return {"CFG": CFG, "seg": seg, "atribuicao": atribuicao, "clv": clv._calcular(cur), "churn": churn._calcular(cur)}
    finally:
        banco.fechar_todas()


def reconciliar_segmentos(con, rag: dict, ctx: dict) -> None:
    j = ctx["janela"]
    seg, atribuicao, clv_r, churn_r = rag["seg"], rag["atribuicao"], rag["clv"], rag["churn"]
    segmento_de = dict(zip(atribuicao["household_key"].astype(int), atribuicao["segmento"]))
    clv_de = {s["nome"]: s for s in clv_r["segmentos"]}
    risco_de = {s["nome"]: s for s in churn_r["risco_por_segmento"]}

    segs = {s["segmento"]: s for s in linhas("segmentos.json")}
    conferir("segmentos: soma dos clientes = clientes segmentados", len(segmento_de), sum(s["clientes"] for s in segs.values()),
             "segmentos.json")
    conferir("segmentos: soma de clientes_pct = 1", 1.0, sum(s["clientes_pct"] for s in segs.values()), "segmentos.json", TOL_FRACAO * 4)
    conferir("segmentos: soma de faturamento_pct = 1", 1.0, sum(s["faturamento_pct"] for s in segs.values()), "segmentos.json",
             TOL_FRACAO * 4)
    valor_sql = dict(con.execute("""SELECT a.segmento, SUM(c.valor)::DOUBLE FROM _atrib a
        JOIN origem.vw_metricas_cliente c ON c.household_key = a.household_key AND c.periodo = 'atual' GROUP BY 1""").fetchall())
    for nome, s in segs.items():
        conferir(f"segmento {nome}: clientes", int((atribuicao["segmento"] == nome).sum()), s["clientes"], "segmentos.json")
        conferir(f"segmento {nome}: faturamento (SQL)", valor_sql[nome], s["faturamento"], "segmentos.json", TOL_DINHEIRO)
        conferir(f"segmento {nome}: CLV médio", clv_de[nome]["clv_medio"], s["clv_medio"], "segmentos.json", TOL_DINHEIRO)
        r = risco_de.get(nome)
        conferir(f"segmento {nome}: % em risco alto = alertas ÷ população do modelo",
                 r["alertas"] / r["households"] if r else None, s["risco_alto_pct"], "segmentos.json", TOL_FRACAO)

    # Afinidade segmento × departamento, 26 semanas.
    afin = linhas("afinidade.json")
    n_deps = um(con, "SELECT COUNT(DISTINCT dep) FROM it WHERE WEEK_NO BETWEEN ? AND ?", [j["ini"], j["fim"]])[0]
    conferir("afinidade: 4 segmentos × departamentos com venda nas 26 semanas", 4 * n_deps, len(afin), "afinidade.json")
    for nome in comum.SEGMENTOS:
        partes = [a for a in afin if a["segmento"] == nome]
        conferir(f"afinidade {nome}: soma = faturamento do segmento", segs[nome]["faturamento"],
                 sum(a["faturamento"] for a in partes), "afinidade.json", 0.005 * len(partes) + TOL_DINHEIRO)
        conferir(f"afinidade {nome}: participações somam 1", 1.0, sum(a["participacao_segmento_pct"] for a in partes),
                 "afinidade.json", 0.00005 * len(partes))
    random.seed(42)
    for a in random.sample([x for x in afin if x["faturamento"] > 0], 3):
        f_sd, f_s, f_d, f_t, compradores = um(con, f"""
            SELECT SUM(fat) FILTER (WHERE dep = ? AND {hh_filtro(a['segmento'])}), SUM(fat) FILTER (WHERE {hh_filtro(a['segmento'])}),
                   SUM(fat) FILTER (WHERE dep = ? AND household_key IN (SELECT household_key FROM _atrib)),
                   SUM(fat) FILTER (WHERE household_key IN (SELECT household_key FROM _atrib)),
                   COUNT(DISTINCT household_key) FILTER (WHERE dep = ? AND {hh_filtro(a['segmento'])})
            FROM it WHERE WEEK_NO BETWEEN ? AND ?""", [a["departamento"], a["departamento"], a["departamento"], j["ini"], j["fim"]])
        nome = f"afinidade {a['segmento']} × {a['departamento']}"
        conferir(f"{nome}: índice", 100 * (f_sd / f_s) / (f_d / f_t), a["indice"], "afinidade.json", TOL_INDICE)
        conferir(f"{nome}: compradores", compradores, a["compradores"], "afinidade.json")
        conferir(f"{nome}: amostra pequena ⇔ menos de 30 compradores", compradores < 30, a["amostra_pequena"], "afinidade.json")

    # Lista de ação: risco alto e médio.
    lista = linhas("lista_acao.json")
    limiar = churn_r["limiar"]
    for nome in comum.SEGMENTOS:
        r = risco_de.get(nome)
        conferir(f"lista de ação {nome}: faixa alta = alertas do RAG", r["alertas"] if r else 0,
                 sum(1 for l in lista if l["segmento"] == nome and l["faixa"] == "alto"), "lista_acao.json")
    incoerentes = sum(1 for l in lista if not (
        (l["faixa"] == "alto" and l["prob"] >= round(limiar, 4) - TOL_FRACAO) or
        (l["faixa"] == "medio" and limiar / 2 - TOL_FRACAO <= l["prob"] <= limiar + TOL_FRACAO)))
    conferir("lista de ação: faixa coerente com a probabilidade e os cortes", 0, incoerentes, "lista_acao.json")
    conferir("lista de ação: ordem por faturamento em risco decrescente", True,
             all(a["faturamento_em_risco"] >= b["faturamento_em_risco"] for a, b in zip(lista, lista[1:])), "lista_acao.json")
    risco_errado = sum(1 for l in lista if abs(l["prob"] * l["faturamento_26s"] - l["faturamento_em_risco"])
                       > l["faturamento_26s"] * 0.00005 + TOL_DINHEIRO)
    conferir("lista de ação: faturamento em risco = prob × faturamento", 0, risco_errado, "lista_acao.json")
    conferir("lista de ação: um cliente por linha", len(lista), len({l["id"] for l in lista}), "lista_acao.json")
    random.seed(42)
    for l in random.sample(lista, 5):
        valor, rec = um(con, "SELECT valor::DOUBLE, recencia_dias FROM origem.vw_metricas_cliente WHERE household_key = ? "
                             "AND periodo = 'atual'", [l["id"]])
        conferir(f"lista {l['id']}: segmento = RFM do RAG", segmento_de[l["id"]], l["segmento"], "lista_acao.json")
        conferir(f"lista {l['id']}: faturamento 26 semanas", valor, l["faturamento_26s"], "lista_acao.json", TOL_DINHEIRO)
        conferir(f"lista {l['id']}: semanas sem comprar", math.floor(rec / 7), l["semanas_sem_comprar"], "lista_acao.json")

    # Insights e manifest contra o RAG; depois, contra o que o app mostra.
    ins = {l["id"]: l for l in linhas("insights.json")}
    total = sum(s["valor_total_usd"] for s in seg["segmentos"])
    fieis = next(s for s in seg["segmentos"] if s["nome"] == "Fiéis")
    conferir("insight Fiéis: frase = a do RAG", seg["e_dai"]["conclusao"], ins["fieis_faturamento"]["conclusao"], "insights.json")
    conferir("insight Fiéis: número", fieis["valor_total_usd"] / total, ins["fieis_faturamento"]["numero"], "insights.json", TOL_FRACAO)
    conferir("insight risco: frase = a do RAG", churn_r["e_dai"]["conclusao"], ins["risco_pausa"]["conclusao"], "insights.json")
    conferir("insight risco: número = pausas esperadas do RAG", sum(s["pausas_esperadas"] for s in churn_r["risco_por_segmento"]),
             ins["risco_pausa"]["numero"], "insights.json", TOL_DINHEIRO)
    conferir("insight risco: leva à lista de ação (aba Segmentos)", "segmentos", ins["risco_pausa"]["aba_destino"], "insights.json")
    manifest = ler("manifest.json")["modelo"]
    conferir("manifest: limiar = o do RAG", limiar, manifest["limiar_alerta"], "manifest.json")
    conferir("manifest: AUC do modelo = a do RAG", churn_r["auc_modelo"], manifest["auc_modelo"], "manifest.json")

    conferir("app: Fiéis = 35% dos clientes", APP["fieis_clientes_pct"], round(100 * segs["Fiéis"]["clientes_pct"]), "segmentos.json")
    conferir("app: Fiéis = 71% do faturamento", APP["fieis_faturamento_pct"], round(100 * segs["Fiéis"]["faturamento_pct"]),
             "segmentos.json")
    conferir("app: AUC do modelo 0,85", APP["auc_modelo"], round(manifest["auc_modelo"], 2), "manifest.json")
    conferir("app: AUC da regra simples 0,74", APP["auc_regra_simples"], round(manifest["auc_regra_simples"], 2), "manifest.json")
    conferir("app: 136 clientes em risco (pausas esperadas)", APP["pausas_esperadas"], round(ins["risco_pausa"]["numero"]),
             "insights.json")
    conferir("app: 243 alertas (faixa alta da lista de ação)", APP["alertas"],
             sum(1 for l in lista if l["faixa"] == "alto"), "lista_acao.json")


# --------------------------------------------------------------------------- Lojas e regiões pela clientela

def reconciliar_lojas(con, ctx: dict, cfg: dict) -> None:
    j = ctx["janela"]
    lojas = {l["id"]: l for l in linhas("lojas.json")}
    yoy = {r[0]: r for r in con.execute("""
        SELECT STORE_ID, faturamento_atual::DOUBLE, faturamento_base::DOUBLE, var_faturamento_pct, var_cestas_pct,
               var_clientes_pct, var_ticket_pct, amostra_pequena, cestas_atual, clientes_atual, cestas_base, clientes_base,
               ticket_atual, ticket_base
        FROM origem.vw_yoy_loja""").fetchall()}
    conferir("lojas: comparáveis = vw_yoy_loja", len(yoy), sum(1 for l in lojas.values() if l["comparavel"]), "lojas.json")
    erros = 0
    for sid, y in yoy.items():
        l = lojas[sid]
        esperado = [y[1], y[2], y[3] / 100, y[4] / 100, y[5] / 100, y[6] / 100, y[7]]
        obtido = [l["faturamento"], l["faturamento_ano_anterior"], l["faturamento_variacao_pct"], l["cestas_variacao_pct"],
                  l["clientes_variacao_pct"], l["ticket_variacao_pct"], l["amostra_pequena"]]
        tol = [TOL_DINHEIRO, TOL_DINHEIRO] + [TOL_FRACAO] * 4
        if any(abs(e - o) > t + 1e-9 for e, o, t in zip(esperado[:6], obtido[:6], tol)) or esperado[6] != obtido[6]:
            erros += 1
    conferir("lojas: as 214 comparáveis = vw_yoy_loja (faturamento, ano anterior, 4 variações, amostra pequena)", 0, erros, "lojas.json")
    por_loja = dict(con.execute("SELECT STORE_ID, SUM(fat) FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY 1", [j["ini"], j["fim"]]).fetchall())
    conferir("lojas: uma linha por loja com cesta nas 26 semanas", len(por_loja), sum(1 for l in lojas.values() if l["cestas"] > 0), "lojas.json")
    conferir("lojas: soma = faturamento das 26 semanas", ctx["total"]["26s"]["faturamento"],
             sum(l["faturamento"] for l in lojas.values()), "lojas.json", 0.005 * len(lojas))
    errados = sum(1 for sid, f in por_loja.items() if abs(lojas[sid]["faturamento"] - f) > TOL_DINHEIRO)
    conferir("lojas: faturamento de cada loja (SQL)", 0, errados, "lojas.json")

    # Regiões: o universo (100+ cestas na base inteira), uma região por loja, somas e a semana.
    universo = {s for (s,) in con.execute("SELECT STORE_ID FROM it GROUP BY STORE_ID HAVING COUNT(DISTINCT BASKET_ID) >= 100").fetchall()}
    com_regiao = {sid for sid, l in lojas.items() if l["regiao"] != "Lojas pequenas"}
    conferir("regiões: universo = lojas com 100+ cestas na base inteira (SQL)", sorted(universo), sorted(com_regiao), "lojas.json")
    conferir("regiões: todas as lojas do universo têm posição no mapa", 0,
             sum(1 for sid in com_regiao if lojas[sid]["x"] is None or lojas[sid]["y"] is None), "lojas.json")
    regioes = {r["regiao"]: r for r in linhas("regioes.json")}
    for nome, r in regioes.items():
        partes = [l for l in lojas.values() if l["regiao"] == nome]
        conferir(f"{nome}: faturamento = soma das lojas", sum(l["faturamento"] for l in partes), r["faturamento"],
                 "regioes.json", 0.005 * len(partes) + TOL_DINHEIRO)
    conferir("regiões + lojas pequenas = faturamento das 26 semanas", ctx["total"]["26s"]["faturamento"],
             sum(r["faturamento"] for r in regioes.values()), "regioes.json", 0.05)
    semana = linhas("regioes_semana.json")
    total_semana = {str(d): f for d, f in con.execute("""
        WITH s AS (SELECT WEEK_NO, SUM(fat) AS fat FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY WEEK_NO),
             d AS (SELECT WEEK_NO, strftime(MIN(data), '%Y-%m-%d') AS inicio FROM origem.dim_data GROUP BY WEEK_NO)
        SELECT d.inicio, s.fat FROM s JOIN d USING (WEEK_NO)""", [j["fim"] - 51, j["fim"]]).fetchall()}
    por_semana = defaultdict(float)
    for l in semana:
        por_semana[l["semana_inicio"]] += l["faturamento"]
    conferir("regioes_semana: 52 semanas", 52, len(por_semana), "regioes_semana.json")
    conferir("regioes_semana: soma das regiões = faturamento da semana (SQL)", 0,
             sum(1 for d, f in por_semana.items() if abs(total_semana[d] - f) > 0.005 * len(regioes) + TOL_DINHEIRO), "regioes_semana.json")
    for nome in regioes:
        indices = [l["indice"] for l in semana if l["regiao"] == nome]
        conferir(f"regioes_semana {nome}: índice médio = 100", 100.0, sum(indices) / len(indices), "regioes_semana.json", 0.1)
    params = ler("manifest.json")["parametros_regioes"]
    conferir("regiões: clientela em comum mais concentrada que ao acaso", True,
             params["concentracao_dentro"] > params["concentracao_ao_acaso"], "manifest.json")
    random.seed(42)
    for p in random.sample(linhas("lojas_pares.json"), 5):
        comuns, uniao = um(con, """
            WITH a AS (SELECT DISTINCT household_key FROM it WHERE STORE_ID = ?),
                 b AS (SELECT DISTINCT household_key FROM it WHERE STORE_ID = ?)
            SELECT (SELECT COUNT(*) FROM a JOIN b USING (household_key)),
                   (SELECT COUNT(*) FROM (SELECT * FROM a UNION SELECT * FROM b))""", [p["loja_a"], p["loja_b"]])
        conferir(f"par {p['loja_a']} × {p['loja_b']}: clientes em comum (SQL)", comuns, p["comuns"], "lojas_pares.json")
        conferir(f"par {p['loja_a']} × {p['loja_b']}: Jaccard (SQL)", comuns / uniao, p["jaccard"], "lojas_pares.json", TOL_FRACAO)
    # Reprodutível: o mesmo código com a mesma semente dá as mesmas regiões.
    import exportar_dados
    import regioes as modulo_regioes
    con_painel = exportar_dados.conectar(cfg)
    try:
        regiao, _, _ = modulo_regioes.calcular(con_painel)
    finally:
        con_painel.close()
    conferir("regiões: rodar de novo dá as mesmas regiões", 0,
             sum(1 for sid, r in zip(regiao["STORE_ID"], regiao["regiao"]) if lojas[int(sid)]["regiao"] != r), "lojas.json")

    # Ficha: árvore de vendas (identidade e origem) e mix.
    fichas = {f["id"]: f for f in linhas("lojas_ficha.json")}
    conferir("ficha da loja: uma por loja com cesta nas 26 semanas", len(por_loja), len(fichas), "lojas_ficha.json")
    fora, origem = 0, 0
    for sid, f in fichas.items():
        a = f["arvore"]
        if a is None:
            continue
        produto = a["clientes"]["atual"] * a["idas_por_cliente"]["atual"] * a["ticket_medio"]["atual"]
        if abs(produto - a["faturamento"]["atual"]) > 0.001 * a["faturamento"]["atual"] + 0.05:
            fora += 1
        y = yoy[sid]
        if (a["clientes"]["atual"], a["clientes"]["base"]) != (y[9], y[11]) or abs(a["ticket_medio"]["atual"] - y[12]) > TOL_DINHEIRO \
                or abs(a["idas_por_cliente"]["atual"] - y[8] / y[9]) > TOL_FRACAO:
            origem += 1
    conferir("árvore de vendas: clientes × idas × ticket = faturamento, em cada loja", 0, fora, "lojas_ficha.json")
    conferir("árvore de vendas: fatores = vw_yoy_loja", 0, origem, "lojas_ficha.json")
    conferir("árvore de vendas: só nas lojas comparáveis", len(yoy), sum(1 for f in fichas.values() if f["arvore"]), "lojas_ficha.json")
    conferir("mix de segmentos: soma 1 em cada loja", 0,
             sum(1 for f in fichas.values() if f["segmentos"] and abs(sum(x["pct"] for x in f["segmentos"]) - 1) > 0.0005), "lojas_ficha.json")
    random.seed(42)
    for sid in random.sample(sorted(s for s in fichas if lojas[s]["cestas"] >= 100), 3):
        f = fichas[sid]
        seg = dict(con.execute("""SELECT a.segmento, SUM(it.fat) / SUM(SUM(it.fat)) OVER () FROM it JOIN _atrib a USING (household_key)
                                  WHERE it.STORE_ID = ? AND it.WEEK_NO BETWEEN ? AND ? GROUP BY 1""", [sid, j["ini"], j["fim"]]).fetchall())
        for x in f["segmentos"]:
            conferir(f"loja {sid}: {x['segmento']} no faturamento (SQL)", seg.get(x["segmento"], 0.0), x["pct"], "lojas_ficha.json", TOL_FRACAO)
        dep, pct = um(con, """SELECT dep, SUM(fat) / (SELECT SUM(fat) FROM it WHERE STORE_ID = ? AND WEEK_NO BETWEEN ? AND ?)
                              FROM it WHERE STORE_ID = ? AND WEEK_NO BETWEEN ? AND ? GROUP BY dep ORDER BY 2 DESC, 1 LIMIT 1""",
                      [sid, j["ini"], j["fim"], sid, j["ini"], j["fim"]])
        conferir(f"loja {sid}: maior departamento (SQL)", (dep, round(pct, 4)),
                 (f["departamentos"][0]["departamento"], f["departamentos"][0]["pct"]), "lojas_ficha.json")


# --------------------------------------------------------------------------- Produtos: ABC, marcas e rede de cestas

def _par_nos(con, subconjunto: str, ini: int, fim: int, a: tuple, b: tuple) -> dict:
    """Cestas com as duas subcategorias (departamento, subcategoria), recontadas da tabela fato."""
    n, na, nb, nab = um(con, f"""
        WITH c AS (SELECT BASKET_ID, dep, com FROM it WHERE WEEK_NO BETWEEN ? AND ? AND {hh_filtro(subconjunto)}),
        alvo AS (SELECT BASKET_ID, BOOL_OR(dep = ? AND com = ?) AS tem_a, BOOL_OR(dep = ? AND com = ?) AS tem_b FROM c GROUP BY BASKET_ID)
        SELECT COUNT(*), COUNT(*) FILTER (WHERE tem_a), COUNT(*) FILTER (WHERE tem_b), COUNT(*) FILTER (WHERE tem_a AND tem_b) FROM alvo""",
        [ini, fim, a[0], a[1], b[0], b[1]])
    return {"cestas_par": nab, "lift": nab * n / (na * nb)}


def reconciliar_produtos(con, ctx: dict) -> None:
    j = ctx["janela"]
    total26 = ctx["total"]["26s"]["faturamento"]
    abc = linhas("abc.json")
    combos = um(con, "SELECT COUNT(*) FROM (SELECT DISTINCT dep, com FROM it WHERE WEEK_NO BETWEEN ? AND ?)", [j["ini"], j["fim"]])[0]
    conferir("abc: uma linha por departamento × subcategoria com venda nas 26 semanas", combos, len(abc), "abc.json")
    conferir("abc: soma = faturamento das 26 semanas", total26, sum(a["faturamento"] for a in abc), "abc.json", 0.005 * len(abc))
    conferir("abc: acumulado termina em 100%", 1.0, abc[-1]["acumulado_pct"], "abc.json", TOL_FRACAO)
    antes, erros_classe = 0.0, 0
    for a in abc:
        esperado = "A" if antes < 0.80 - 1e-6 else "B" if antes < 0.95 - 1e-6 else "C"
        if esperado != a["classe"] and abs(antes - 0.80) > 1e-5 and abs(antes - 0.95) > 1e-5:
            erros_classe += 1
        antes += a["participacao_pct"]
    conferir("abc: classe A/B/C pela participação acumulada antes da subcategoria", 0, erros_classe, "abc.json")
    yoy = {(d, c): v for d, c, v in con.execute(
        "SELECT DEPARTMENT, COMMODITY_DESC, var_faturamento_pct FROM origem.vw_yoy_categoria WHERE marca = 'TODAS'").fetchall()}
    diferentes = sum(1 for a in abc if (yoy.get((a["departamento"], a["subcategoria"])) is None) != (a["crescimento_pct"] is None)
                     or (a["crescimento_pct"] is not None and abs(yoy[(a["departamento"], a["subcategoria"])] / 100 - a["crescimento_pct"]) > TOL_FRACAO))
    conferir("abc: crescimento de cada subcategoria = vw_yoy_categoria", 0, diferentes, "abc.json")
    random.seed(42)
    for a in random.sample(abc[:150], 3):
        fat, mp = um(con, """SELECT SUM(fat), SUM(fat) FILTER (WHERE marca = 'Private') FROM it
                             WHERE dep = ? AND com = ? AND WEEK_NO BETWEEN ? AND ?""", [a["departamento"], a["subcategoria"], j["ini"], j["fim"]])
        conferir(f"abc {a['subcategoria']}: faturamento (SQL)", fat, a["faturamento"], "abc.json", TOL_DINHEIRO)
        conferir(f"abc {a['subcategoria']}: % marca própria (SQL)", (mp or 0) / fat, a["marca_propria_pct"], "abc.json", TOL_FRACAO)

    marcas = {m["departamento"]: m for m in linhas("marcas.json")}
    conferir("marcas: soma = faturamento das 26 semanas", total26, sum(m["faturamento"] for m in marcas.values()), "marcas.json",
             0.005 * len(marcas))
    mp_sql = dict(con.execute("""SELECT dep, SUM(fat) FILTER (WHERE marca = 'Private') / SUM(fat) FROM it
                                 WHERE WEEK_NO BETWEEN ? AND ? GROUP BY dep""", [j["ini"], j["fim"]]).fetchall())
    conferir("marcas: % marca própria de cada departamento (SQL)", 0,
             sum(1 for d, m in marcas.items() if abs((mp_sql[d] or 0) - m["marca_propria_pct"]) > TOL_FRACAO), "marcas.json")
    cresc = {d: (pa, pb, na, nb) for d, pa, pb, na, nb in con.execute("""
        SELECT DEPARTMENT, SUM(faturamento_atual) FILTER (WHERE marca = 'Private')::DOUBLE, SUM(faturamento_base) FILTER (WHERE marca = 'Private')::DOUBLE,
               SUM(faturamento_atual) FILTER (WHERE marca = 'National')::DOUBLE, SUM(faturamento_base) FILTER (WHERE marca = 'National')::DOUBLE
        FROM origem.vw_yoy_categoria GROUP BY DEPARTMENT""").fetchall()}
    errados = 0
    for d, m in marcas.items():
        pa, pb, na, nb = cresc.get(d, (None, None, None, None))
        for esperado, obtido in [((pa / pb - 1) if pb else None, m["marca_propria_crescimento_pct"]),
                                 ((na / nb - 1) if nb else None, m["nacional_crescimento_pct"])]:
            if (esperado is None) != (obtido is None) or (esperado is not None and abs(esperado - obtido) > TOL_FRACAO):
                errados += 1
    conferir("marcas: crescimento da marca própria e da nacional = vw_yoy_categoria", 0, errados, "marcas.json")
    for d in ("GROCERY", "PRODUCE", "MEAT"):
        fabs = [f for (f,) in con.execute(f"""SELECT SUM(f.SALES_VALUE)::DOUBLE FROM origem.fato_transacoes f
            JOIN origem.dim_data dd ON dd.data_id = f.data_id JOIN origem.dim_produto p ON p.PRODUCT_ID = f.PRODUCT_ID
            WHERE p.DEPARTMENT = ? AND p.BRAND = 'National' AND dd.WEEK_NO BETWEEN ? AND ?
            GROUP BY p.MANUFACTURER HAVING SUM(f.SALES_VALUE) > 0 ORDER BY 1 DESC""", [d, j["ini"], j["fim"]]).fetchall()]
        total, acum, n80 = sum(fabs), 0.0, None
        for i, f in enumerate(fabs, 1):
            acum += f
            if n80 is None and acum / total >= 0.8 - 1e-12:
                n80 = i
        m = marcas[d]
        conferir(f"marcas {d}: fabricantes nacionais (SQL)", len(fabs), m["fabricantes_nacionais"], "marcas.json")
        conferir(f"marcas {d}: fabricantes para 80% (SQL)", n80, m["fabricantes_80"], "marcas.json")
        conferir(f"marcas {d}: parte do maior fabricante (SQL)", fabs[0] / total, m["maior_fabricante_pct"], "marcas.json", TOL_FRACAO)

    pc = ler("manifest.json")["parametros_cesta"]
    ini, fim = pc["semana_ini"], pc["semana_fim"]
    nos = linhas("rede_nos.json")
    topo = con.execute("""SELECT dep, com FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY dep, com ORDER BY SUM(fat) DESC, dep, com LIMIT ?""",
                       [ini, fim, len(nos)]).fetchall()
    conferir("rede: os nós são as maiores subcategorias da janela da cesta (SQL)", [tuple(t) for t in topo],
             [(n["departamento"], n["subcategoria"]) for n in nos], "rede_nos.json")
    no = {n["no"]: (n["departamento"], n["subcategoria"]) for n in nos}
    pares = linhas("rede_pares.json")
    conferir("rede: amostra_pequena ⇔ menos de 200 cestas com o par", 0,
             sum(1 for p in pares if p["amostra_pequena"] != (p["cestas_par"] < pc["minimo_cestas_par"])), "rede_pares.json")
    random.seed(42)
    for p in random.sample(pares, 6):
        e = _par_nos(con, p["subconjunto"], ini, fim, no[p["no_a"]], no[p["no_b"]])
        nome = f"rede {p['subconjunto']} {no[p['no_a']][1]} × {no[p['no_b']][1]}"
        conferir(f"{nome}: cestas com os dois (SQL)", e["cestas_par"], p["cestas_par"], "rede_pares.json")
        conferir(f"{nome}: lift (SQL)", e["lift"], p["lift"], "rede_pares.json", TOL_FRACAO)
    caract = linhas("rede_caracteristicos.json")
    conferir("rede: índice dos característicos = lift ÷ lift com todos", 0,
             sum(1 for c in caract if abs(c["lift"] / c["lift_todos"] - c["indice"]) > 0.0002), "rede_caracteristicos.json")
    conferir("rede: característicos sem amostra pequena", 0,
             sum(1 for c in caract if c["cestas_par"] < pc["minimo_cestas_par"]), "rede_caracteristicos.json")
    for c in random.sample(caract, 4):
        e = _par_nos(con, c["subconjunto"], ini, fim, no[c["no_a"]], no[c["no_b"]])
        t = _par_nos(con, "todos", ini, fim, no[c["no_a"]], no[c["no_b"]])
        nome = f"característico {c['subconjunto']} {no[c['no_a']][1]} × {no[c['no_b']][1]}"
        conferir(f"{nome}: lift (SQL)", e["lift"], c["lift"], "rede_caracteristicos.json", TOL_FRACAO)
        conferir(f"{nome}: lift com todos (SQL)", t["lift"], c["lift_todos"], "rede_caracteristicos.json", TOL_FRACAO)
    conferir("rede: posições entre 0 e 1", 0, sum(1 for n in nos if not (0 <= n["x"] <= 1 and 0 <= n["y"] <= 1)), "rede_nos.json")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cfg = comum.carregar_config()
    antes = comum.foto_rag(cfg["rag_dir"])
    rag = rodar_rag(cfg)   # primeiro e sozinho: o DuckDB recusa duas configurações no mesmo arquivo
    con = comum.conectar_origem(cfg)
    con.execute(ITENS_SQL)
    con.register("_atrib_df", rag["atribuicao"][["household_key", "segmento"]].astype({"household_key": "int64"}))
    con.execute("CREATE TEMP TABLE _atrib AS SELECT * FROM _atrib_df")
    ctx = reconciliar_kpis(con)
    reconciliar_grupos(con, ctx)
    reconciliar_cubos(con, ctx)
    reconciliar_departamentos(con, ctx)
    reconciliar_cesta(con)
    reconciliar_segmentos(con, rag, ctx)
    reconciliar_lojas(con, ctx, cfg)
    reconciliar_produtos(con, ctx)
    comum.conferir_rag_intocado(antes, comum.foto_rag(cfg["rag_dir"]))
    for ok, nome, esperado, encontrado, arquivo in resultados:
        if not ok:
            print(f"DIVERGE  {nome}: esperado {esperado}, encontrado {encontrado} ({arquivo})")
    divergencias = sum(1 for r in resultados if not r[0])
    print(f"Reconciliação: {len(resultados) - divergencias}/{len(resultados)} OK, {divergencias} divergências. RAG intocado.")
    return 1 if divergencias else 0


if __name__ == "__main__":
    sys.exit(main())
