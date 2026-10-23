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
    elif tol and isinstance(esperado, (list, tuple)):   # listas: elemento a elemento, com a mesma tolerância
        ok = len(esperado) == len(encontrado) and all(abs(float(e) - float(o)) <= tol + 1e-9 for e, o in zip(esperado, encontrado))
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


# --------------------------------------------------------------------------- cubo semanal e lista de departamentos

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

    deps = linhas("departamentos.json")
    n_deps = um(con, "SELECT COUNT(DISTINCT dep) FROM it")[0]
    conferir("departamentos: um por departamento com venda na base", n_deps, len(deps), "departamentos.json")
    conferir("departamentos: soma das 26 semanas = faturamento do período", ctx["total"]["26s"]["faturamento"],
             sum(d["faturamento_26s"] for d in deps), "departamentos.json", 0.005 * len(deps))
    conferir("departamentos: soma da base inteira = faturamento da base", ctx["total"]["base"]["faturamento"],
             sum(d["faturamento_base"] for d in deps), "departamentos.json", 0.005 * len(deps))
    conferir("departamentos: participação soma 1", 1.0, sum(d["participacao_26s_pct"] for d in deps), "departamentos.json",
             0.00005 * len(deps))


# --------------------------------------------------------------------------- departamento (Visão Geral filtrada e Ficha)

def _janelas(j: dict) -> dict:
    """Semanas de cada período (início, fim) e, nos que têm ano anterior, as mesmas semanas − 52."""
    w = {"4s": j["ini_mes"], "13s": j["ini_tri"], "26s": j["ini"], "base": 1}
    return {p: (i, j["fim"], None if p == "base" else (i - j["off"], j["fim"] - j["off"])) for p, i in w.items()}


def reconciliar_departamentos(con, ctx: dict) -> None:
    """Categorias por período (redesenho v3): a ficha, a comparação por segmento e o top 10 de subcategorias de cada
    período contra SQL próprio na tabela fato; nas 26 semanas, o crescimento também contra vw_yoy_categoria."""
    j = ctx["janela"]
    kf = {(l["periodo"], l["subconjunto"], l["departamento"]): l for l in linhas("kpis_filtrados.json")}
    cubo = linhas("cubo_periodo.json")
    risco_alto = [l["id"] for l in linhas("lista_acao.json") if l["faixa"] == "alto"]
    con.execute("CREATE OR REPLACE TEMP TABLE _alto AS SELECT UNNEST(?::BIGINT[]) AS household_key", [risco_alto])
    cat = {d: (a, b) for d, a, b in con.execute("""SELECT DEPARTMENT, SUM(faturamento_atual)::DOUBLE, SUM(faturamento_base)::DOUBLE
        FROM origem.vw_yoy_categoria WHERE marca = 'TODAS' GROUP BY DEPARTMENT""").fetchall()}
    sorteados = None
    for periodo, (ini, fim, ant) in _janelas(j).items():
        arq_f, arq_s, arq_sub = (f"departamentos_ficha_{periodo}.json", f"departamentos_segmento_{periodo}.json",
                                 f"subcategorias_{periodo}.json")
        ficha = {d["departamento"]: d for d in linhas(arq_f)}
        segs = linhas(arq_s)
        subs = linhas(arq_sub)
        n_deps = um(con, "SELECT COUNT(DISTINCT dep) FROM it WHERE WEEK_NO BETWEEN ? AND ?", [ini, fim])[0]
        conferir(f"ficha {periodo}: um departamento por departamento com venda no período", n_deps, len(ficha), arq_f)
        fora = sum(1 for d in ficha.values() for a in d["atributos"].values()
                   if a["percentil"] is not None and not 0 <= a["percentil"] <= 100)
        conferir(f"ficha {periodo}: percentis entre 0 e 100", 0, fora, arq_f)
        total = ctx["total"][periodo]["faturamento"]
        # Lojas comparáveis do período (a regra de vw_lojas_like_for_like aplicada à janela) e os clientes delas.
        con.execute("CREATE OR REPLACE TEMP TABLE _lfl AS SELECT STORE_ID FROM it GROUP BY STORE_ID HAVING "
                    + ("FALSE" if ant is None else
                       f"COUNT(*) FILTER (WHERE WEEK_NO BETWEEN {ini} AND {fim}) > 0 AND COUNT(*) FILTER (WHERE WEEK_NO BETWEEN {ant[0]} AND {ant[1]}) > 0"))
        clientes_lfl = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE WEEK_NO BETWEEN ? AND ? "
                               "AND STORE_ID IN (SELECT * FROM _lfl)", [ini, fim])[0]
        if sorteados is None:
            random.seed(42)
            # O maior (GROCERY, mais da metade do faturamento) sempre, e 3 sorteados entre os outros.
            maior = max(ficha.values(), key=lambda f: f["faturamento"])["departamento"]
            sorteados = [maior] + random.sample(sorted(d for d, f in ficha.items() if not f["amostra_pequena"] and d != maior), 3)
        for dep in sorteados:
            f = ficha[dep]
            a = f["atributos"]
            fat, desc, bruto, priv, cestas, compradores = um(con, """
                SELECT SUM(fat), SUM(descontos), SUM(bruto), SUM(fat) FILTER (WHERE marca = 'Private'),
                       COUNT(DISTINCT BASKET_ID), COUNT(DISTINCT household_key)
                FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?""", [dep, ini, fim])
            nome = f"ficha {periodo} {dep}"
            conferir(f"{nome}: faturamento", fat, f["faturamento"], arq_f, TOL_DINHEIRO)
            conferir(f"{nome}: participação", fat / total, a["participacao"]["valor"], arq_f, TOL_FRACAO)
            conferir(f"{nome}: frequência", cestas / compradores, a["frequencia"]["valor"], arq_f, TOL_FRACAO)
            conferir(f"{nome}: % de desconto", desc / bruto, a["desconto"]["valor"], arq_f, TOL_FRACAO)
            conferir(f"{nome}: % marca própria", (priv or 0) / fat, a["marca_propria"]["valor"], arq_f, TOL_FRACAO)
            if ant is None:
                conferir(f"{nome}: sem crescimento nem penetração na base inteira", (None, None),
                         (a["crescimento"]["valor"], a["penetracao"]["valor"]), arq_f)
            else:
                f_c, f_a = um(con, """SELECT SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?), SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?)
                                      FROM it WHERE dep = ? AND STORE_ID IN (SELECT * FROM _lfl)""", [ini, fim, ant[0], ant[1], dep])
                conferir(f"{nome}: crescimento (lojas comparáveis do período, SQL)", f_c / f_a - 1, a["crescimento"]["valor"], arq_f, TOL_FRACAO)
                if periodo == "26s":
                    conferir(f"{nome}: crescimento = vw_yoy_categoria", cat[dep][0] / cat[dep][1] - 1, a["crescimento"]["valor"],
                             arq_f, TOL_FRACAO)
                compradores_lfl = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ? "
                                          "AND STORE_ID IN (SELECT * FROM _lfl)", [dep, ini, fim])[0]
                conferir(f"{nome}: penetração (definição do RAG)", compradores_lfl / clientes_lfl, a["penetracao"]["valor"], arq_f, TOL_FRACAO)
            # Fiéis contra todos, para a comparação da direita.
            fat_f, total_f = um(con, f"""SELECT SUM(fat) FILTER (WHERE dep = ?), SUM(fat) FROM it
                                         WHERE WEEK_NO BETWEEN ? AND ? AND {hh_filtro('Fiéis')}""", [dep, ini, fim])
            seg = next(x for x in segs if x["subconjunto"] == "Fiéis" and x["departamento"] == dep)
            conferir(f"departamentos_segmento {periodo} Fiéis {dep}: participação", fat_f / total_f,
                     seg["atributos"]["participacao"]["valor"], arq_s, TOL_FRACAO)
            conferir(f"departamentos_segmento {periodo} Fiéis {dep}: índice da participação",
                     100 * (fat_f / total_f) / (fat / total), seg["atributos"]["participacao"]["indice"], arq_s, TOL_INDICE)
            top = um(con, """SELECT com, SUM(fat) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?
                             GROUP BY com ORDER BY 2 DESC, 1 LIMIT 1""", [dep, ini, fim])
            sub = next(x for x in subs if x["departamento"] == dep and x["posicao"] == 1)
            conferir(f"subcategorias {periodo} {dep}: a maior", top[0], sub["subcategoria"], arq_sub)
            conferir(f"subcategorias {periodo} {dep}: faturamento da maior", top[1], sub["faturamento"], arq_sub, TOL_DINHEIRO)
            if periodo == "26s":
                # Visão Geral filtrada por esse departamento: kpis_filtrados e cubo_periodo.
                k = kf[("26s", "todos", dep)]
                conferir(f"kpis_filtrados 26s {dep}: cestas com o departamento", cestas, k["cestas"], "kpis_filtrados.json")
                conferir(f"kpis_filtrados 26s {dep}: ticket", fat / cestas, k["ticket_medio"], "kpis_filtrados.json", TOL_DINHEIRO)
                itens = um(con, "SELECT SUM(qtd) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?", [dep, ini, fim])[0]
                conferir(f"kpis_filtrados 26s {dep}: itens por cesta", itens / cestas, k["itens_por_cesta"], "kpis_filtrados.json", TOL_FRACAO)
                ces_c, ces_a = um(con, """SELECT COUNT(DISTINCT BASKET_ID) FILTER (WHERE WEEK_NO BETWEEN ? AND ?),
                                                 COUNT(DISTINCT BASKET_ID) FILTER (WHERE WEEK_NO BETWEEN ? AND ?)
                                          FROM it WHERE dep = ? AND STORE_ID IN (SELECT * FROM lfl)""",
                                  [ini, fim, ant[0], ant[1], dep])
                conferir(f"kpis_filtrados 26s {dep}: cestas comparáveis", ces_c, k["cestas_comparavel"], "kpis_filtrados.json")
                conferir(f"kpis_filtrados 26s {dep}: cestas um ano antes", ces_a, k["cestas_ano_anterior"], "kpis_filtrados.json")
                ativos = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?",
                            [dep, fim - 7, fim])[0]
                conferir(f"kpis_filtrados 26s {dep}: clientes ativos que compraram nas últimas 8 semanas", ativos,
                         k["clientes_ativos"], "kpis_filtrados.json")
                partes = [c for c in cubo if c["periodo"] == "26s" and c["departamento"] == dep]
                conferir(f"cubo_periodo 26s {dep}: faturamento", fat, sum(c["faturamento"] for c in partes), "cubo_periodo.json",
                         0.005 * len(partes))
        # "Todos os departamentos": o total do período, a variação dos KPIs e a maior subcategoria de todas.
        t = next(x for x in segs if x["subconjunto"] == "todos" and x["departamento"] == "todos")
        conferir(f"departamentos_segmento {periodo} todos × todos: faturamento = total do período", total, t["faturamento"], arq_s, TOL_DINHEIRO)
        compradores_tot = um(con, "SELECT COUNT(DISTINCT household_key) FROM it WHERE WEEK_NO BETWEEN ? AND ?", [ini, fim])[0]
        conferir(f"departamentos_segmento {periodo} todos × todos: compradores (SQL)", compradores_tot, t["compradores"], arq_s)
        top = um(con, "SELECT com, dep, SUM(fat) FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY com, dep ORDER BY 3 DESC LIMIT 1", [ini, fim])
        sub = next(x for x in subs if x["departamento"] == "todos" and x["posicao"] == 1)
        conferir(f"subcategorias {periodo} todos: a maior (SQL)", (top[0], top[1]), (sub["subcategoria"], sub["departamento_origem"]), arq_sub)
        todos = {x["departamento"]: x for x in segs if x["subconjunto"] == "todos" and x["departamento"] != "todos"}
        diferentes = sum(1 for d, f in ficha.items()
                         for a in f["atributos"] if todos[d]["atributos"][a]["valor"] != f["atributos"][a]["valor"])
        conferir(f"departamentos_segmento {periodo} 'todos' = departamentos_ficha", 0, diferentes, arq_s)
        fora = sum(1 for x in segs if x["subconjunto"] == "todos" for a in x["atributos"].values() if a["indice"] not in (None, 100.0))
        conferir(f"departamentos_segmento {periodo} 'todos': índice 100", 0, fora, arq_s)
    # Dinheiro em risco (fixo, 26 semanas): os 3 sorteados e o total.
    risco = {(x["subconjunto"], x["departamento"]): x for x in linhas("departamentos_risco.json")}
    for dep in sorteados + [None]:
        valor = um(con, f"""SELECT SUM(fat) FROM it WHERE WEEK_NO BETWEEN ? AND ? AND {'dep = ? AND' if dep else ''}
                            household_key IN (SELECT household_key FROM _alto)""", [j["ini"], j["fim"]] + ([dep] if dep else []))[0]
        conferir(f"dinheiro em risco {dep or 'todos'} (SQL)", valor, risco[("todos", dep or "todos")]["dinheiro_em_risco"],
                 "departamentos_risco.json", TOL_DINHEIRO)


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


def _top_dep(con, pares: list[dict], periodo: str, arquivo: str, dep: str, ini: int, fim: int, minimo: int) -> None:
    """Um departamento inteiro recontado: os 10 primeiros por lift entre todos os pares com 200+ cestas, e o lift deles."""
    top = con.execute("""
        WITH c AS (SELECT DISTINCT BASKET_ID, com FROM it WHERE dep = ? AND WEEK_NO BETWEEN ? AND ?),
        n AS (SELECT COUNT(DISTINCT BASKET_ID) AS n FROM it WHERE WEEK_NO BETWEEN ? AND ?),
        na AS (SELECT com, COUNT(*) AS n FROM c GROUP BY com),
        p AS (SELECT a.com AS a, b.com AS b, COUNT(*) AS n FROM c a JOIN c b ON a.BASKET_ID = b.BASKET_ID AND a.com < b.com GROUP BY ALL)
        SELECT p.a, p.b, p.n::DOUBLE * n.n / (x.n::DOUBLE * y.n) AS lift
        FROM p CROSS JOIN n JOIN na x ON x.com = p.a JOIN na y ON y.com = p.b
        WHERE p.n >= ? ORDER BY lift DESC, p.a, p.b LIMIT 10""", [dep, ini, fim, ini, fim, minimo]).fetchall()
    meus = [p for p in pares if p["subconjunto"] == "todos" and p["departamento"] == dep]
    conferir(f"cesta {periodo} todos {dep}: os 10 pares de maior lift (SQL)", [(a, b) for a, b, _ in top],
             [(p["subcategoria_a"], p["subcategoria_b"]) for p in meus], arquivo)
    conferir(f"cesta {periodo} todos {dep}: o lift dos 10 (SQL)", [l for _, _, l in top], [p["lift"] for p in meus], arquivo, TOL_FRACAO)


def reconciliar_cesta(con, ctx: dict) -> None:
    """Pares de subcategorias por período (redesenho v3: todos os departamentos, os 10 de maior lift com 200+ cestas)."""
    m = ler("manifest.json")
    pc = m["parametros_cesta"]
    conferir("manifest: janela da cesta = 26 semanas da segmentação", (76, 101), (pc["semana_ini"], pc["semana_fim"]), "manifest.json")
    random.seed(42)
    for periodo, (ini, fim, _) in _janelas(ctx["janela"]).items():
        arquivo = f"cesta_subcategorias_{periodo}.json"
        pares = linhas(arquivo)
        conferir(f"cesta {periodo}: nenhum par com menos de {pc['minimo_cestas_par']} cestas", 0,
                 sum(1 for p in pares if p["cestas_par"] < pc["minimo_cestas_par"]), arquivo)
        grupos = defaultdict(int)
        for p in pares:
            grupos[(p["subconjunto"], p["departamento"])] += 1
        conferir(f"cesta {periodo}: no máximo 10 pares por subconjunto × departamento", 0, sum(1 for n in grupos.values() if n > 10), arquivo)
        # O maior departamento do período (o primeiro do arquivo) e MEAT (PRODUCE em 4 semanas, quando MEAT não tem par
        # com 200 cestas), inteiros.
        for dep in (pares[0]["departamento"], "MEAT" if periodo != "4s" else "PRODUCE"):
            _top_dep(con, pares, periodo, arquivo, dep, ini, fim, pc["minimo_cestas_par"])
        for p in random.sample(pares, 3):
            e = _par(con, p["subconjunto"], ini, fim, "com", p["subcategoria_a"], p["subcategoria_b"], p["departamento"])
            nome = f"par {periodo} {p['subconjunto']} {p['subcategoria_a']} × {p['subcategoria_b']}"
            for campo in ("cestas_total", "cestas_a", "cestas_b", "cestas_par"):
                conferir(f"{nome}: {campo}", e[campo], p[campo], arquivo)
            conferir(f"{nome}: suporte", e["suporte"], p["suporte"], arquivo, 0.000001)
            for campo in ("confianca_a_b", "confianca_b_a", "lift"):
                conferir(f"{nome}: {campo}", e[campo], p[campo], arquivo, TOL_FRACAO)


# --------------------------------------------------------------------------- Visão Geral (redesenho v3)

def reconciliar_visao_geral(con, ctx: dict) -> None:
    """O que puxou a variação (diferença por departamento nas lojas comparáveis), o marcador do ano anterior e o
    faturamento por segmento, contra SQL próprio na tabela fato. O navegador soma cubo_periodo; aqui se confere que a
    soma dá o mesmo que a fonte, departamento a departamento e grupo a grupo."""
    j = ctx["janela"]
    cubo = linhas("cubo_periodo.json")
    inicios = {"4s": j["ini_mes"], "13s": j["ini_tri"], "26s": j["ini"]}
    for periodo, ini in inicios.items():
        ant_ini, ant_fim = ini - j["off"], j["fim"] - j["off"]
        sql = dict((d, (a, b)) for d, a, b in con.execute("""
            WITH l AS (SELECT STORE_ID FROM it GROUP BY STORE_ID
                       HAVING COUNT(*) FILTER (WHERE WEEK_NO BETWEEN ? AND ?) > 0 AND COUNT(*) FILTER (WHERE WEEK_NO BETWEEN ? AND ?) > 0)
            SELECT dep, COALESCE(SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?), 0), COALESCE(SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?), 0)
            FROM it WHERE STORE_ID IN (SELECT STORE_ID FROM l) GROUP BY dep""",
            [ini, j["fim"], ant_ini, ant_fim, ini, j["fim"], ant_ini, ant_fim]).fetchall())
        partes = [c for c in cubo if c["periodo"] == periodo]
        por_dep = defaultdict(lambda: [0.0, 0.0])
        for c in partes:
            por_dep[c["departamento"]][0] += c["faturamento_comparavel"]
            por_dep[c["departamento"]][1] += c["faturamento_ano_anterior"]
        errados = [d for d in set(sql) | set(por_dep)
                   if abs(sql.get(d, (0, 0))[0] - por_dep[d][0]) > 0.01 * 5 or abs(sql.get(d, (0, 0))[1] - por_dep[d][1]) > 0.01 * 5]
        conferir(f"variação {periodo}: diferença de cada departamento (lojas comparáveis, SQL)", [], sorted(errados), "cubo_periodo.json")
        total_sql = sum(a - b for a, b in sql.values())
        conferir(f"variação {periodo}: soma das contribuições = variação total do faturamento", total_sql,
                 sum(a - b for a, b in por_dep.values()), "cubo_periodo.json", 0.01 * len(partes))
    # Faturamento por segmento: cada grupo em cada período, e os grupos somam o total.
    for periodo, ini in {**inicios, "base": 1}.items():
        sql = dict(con.execute("""SELECT COALESCE(a.segmento, 'Sem segmento'), SUM(i.fat) FROM it i
                                  LEFT JOIN _atrib a ON a.household_key = i.household_key
                                  WHERE i.WEEK_NO BETWEEN ? AND ? GROUP BY 1""", [ini, j["fim"]]).fetchall())
        partes = [c for c in cubo if c["periodo"] == periodo]
        for grupo in comum.GRUPOS:
            conferir(f"faturamento por segmento {periodo}: {grupo} (SQL)", sql.get(grupo, 0.0),
                     sum(c["faturamento"] for c in partes if c["grupo"] == grupo), "cubo_periodo.json", 0.005 * len(partes))
        conferir(f"faturamento por segmento {periodo}: os grupos somam o total", ctx["total"][periodo]["faturamento"],
                 sum(c["faturamento"] for c in partes), "cubo_periodo.json", 0.005 * len(partes))


# --------------------------------------------------------------------------- Segmentos, lista de ação e app

def rodar_rag(cfg: dict) -> dict:
    """As funções do próprio RAG (não a réplica da exportação). A conexão do RAG precisa estar sozinha no arquivo."""
    import rag_modelos

    CFG, banco, churn, clv, rfm, teste_desconto = rag_modelos._importar(cfg["rag_dir"])
    cur = banco.cursor(cfg["duckdb_origem"])
    try:
        seg, atribuicao = rfm._resultado(cur, None)
        # Semestre anterior, direto com as funções do RAG (não pela ponte de rag_modelos): as 26 semanas antes da janela.
        ini_atual, semanas = cur.execute("SELECT semana_ini_atual, semanas FROM vw_janela").fetchone()
        df_ant, _ = rfm.base_rfm(cur, ini_atual - semanas, ini_atual - 1)
        anterior = df_ant[["household_key"]].assign(
            segmento=clv._segmentar(df_ant, seg["k_usado"], {s["nome"] for s in seg["segmentos"]}, "anterior"))
        return {"CFG": CFG, "seg": seg, "atribuicao": atribuicao, "clv": clv._calcular(cur), "churn": churn._calcular(cur),
                "desc": teste_desconto._calcular(cur), "anterior": anterior, "janela_anterior": (ini_atual - semanas, ini_atual - 1)}
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

    # Manifest contra o RAG; depois, contra o que o app mostra (o card de insights saiu no redesenho v3).
    manifest = ler("manifest.json")["modelo"]
    conferir("manifest: limiar = o do RAG", limiar, manifest["limiar_alerta"], "manifest.json")
    conferir("manifest: AUC do modelo = a do RAG", churn_r["auc_modelo"], manifest["auc_modelo"], "manifest.json")

    conferir("app: Fiéis = 35% dos clientes", APP["fieis_clientes_pct"], round(100 * segs["Fiéis"]["clientes_pct"]), "segmentos.json")
    conferir("app: Fiéis = 71% do faturamento", APP["fieis_faturamento_pct"], round(100 * segs["Fiéis"]["faturamento_pct"]),
             "segmentos.json")
    conferir("app: AUC do modelo 0,85", APP["auc_modelo"], round(manifest["auc_modelo"], 2), "manifest.json")
    conferir("app: AUC da regra simples 0,74", APP["auc_regra_simples"], round(manifest["auc_regra_simples"], 2), "manifest.json")
    conferir("manifest: pausas esperadas = soma do RAG", sum(s["pausas_esperadas"] for s in churn_r["risco_por_segmento"]),
             manifest["pausas_esperadas"], "manifest.json", TOL_FRACAO)
    conferir("app: 136 clientes em risco (pausas esperadas)", APP["pausas_esperadas"], round(manifest["pausas_esperadas"]),
             "manifest.json")
    conferir("app: 243 alertas (faixa alta da lista de ação)", APP["alertas"],
             sum(1 for l in lista if l["faixa"] == "alto"), "lista_acao.json")


# --------------------------------------------------------------------------- Lojas e regiões pela clientela

def reconciliar_lojas(con, ctx: dict, cfg: dict) -> None:
    """Clientes & Lojas (redesenho v3): loja principal, valor em risco, perfil, ranking e ficha por período, regiões."""
    j = ctx["janela"]
    janelas = _janelas(j)
    minimo_cestas, minimo_clientes = 100, ler("manifest.json")["minimo_clientes"]
    lojas = {l["id"]: l for l in linhas("lojas.json")}
    yoy = {r[0]: r for r in con.execute("""
        SELECT STORE_ID, faturamento_atual::DOUBLE, faturamento_base::DOUBLE, var_faturamento_pct, var_cestas_pct,
               var_clientes_pct, var_ticket_pct, amostra_pequena, cestas_atual, clientes_atual, cestas_base, clientes_base,
               ticket_atual, ticket_base
        FROM origem.vw_yoy_loja""").fetchall()}

    # Loja principal, com SQL próprio: a de maior gasto do cliente nas 26 semanas (empate: mais cestas, menor loja).
    con.execute("""CREATE OR REPLACE TEMP TABLE _principal AS
        SELECT household_key, STORE_ID FROM (
            SELECT household_key, STORE_ID, SUM(fat) AS f, COUNT(DISTINCT BASKET_ID) AS c FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY ALL)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY household_key ORDER BY f DESC, c DESC, STORE_ID) = 1""", [j["ini"], j["fim"]])
    lista = linhas("lista_acao.json")
    principal = dict(con.execute("SELECT household_key, STORE_ID FROM _principal").fetchall())
    conferir("lista de ação: loja principal de cada cliente (SQL)", 0, sum(1 for l in lista if principal.get(l["id"]) != l["loja_principal"]),
             "lista_acao.json")

    # Valor em risco: faturamento de 26 semanas dos clientes na faixa alta, na loja principal deles.
    risco = linhas("lojas_risco.json")
    sql = {(s_, g): (n, v) for s_, g, n, v in con.execute("""
        SELECT p.STORE_ID, a.segmento, COUNT(*), SUM(m.valor)::DOUBLE FROM _alto x
        JOIN _principal p USING (household_key) JOIN _atrib a USING (household_key)
        JOIN origem.vw_metricas_cliente m ON m.household_key = x.household_key AND m.periodo = 'atual' GROUP BY ALL""").fetchall()}
    total = um(con, """SELECT SUM(valor)::DOUBLE FROM origem.vw_metricas_cliente WHERE periodo = 'atual'
                       AND household_key IN (SELECT household_key FROM _alto)""")[0]
    conferir("valor em risco: soma das lojas = total em risco (SQL)", total, sum(r["valor_em_risco"] for r in risco), "lojas_risco.json",
             0.005 * len(risco))
    errados = [f"{r['loja']} {r['segmento']}" for r in risco
               if (r["loja"], r["segmento"]) not in sql or sql[(r["loja"], r["segmento"])][0] != r["clientes"]
               or abs(sql[(r["loja"], r["segmento"])][1] - r["valor_em_risco"]) > TOL_DINHEIRO]
    conferir("valor em risco: cada loja × segmento (SQL, loja principal própria)", [], errados, "lojas_risco.json")
    conferir("valor em risco: nenhuma loja × segmento a mais ou a menos", len(sql), len(risco), "lojas_risco.json")
    conferir("valor em risco: cada cliente de risco alto numa loja só", len(set(l["id"] for l in lista if l["faixa"] == "alto")),
             sum(r["clientes"] for r in risco), "lojas_risco.json")

    # Perfil: 10 lojas sorteadas, índices recontados (loja principal própria + atribuição do RAG); e o resumo por perfil.
    rede = dict(con.execute("""SELECT a.segmento, COUNT(*)::DOUBLE / SUM(COUNT(*)) OVER () FROM _principal p JOIN _atrib a USING (household_key)
                               GROUP BY 1""").fetchall())
    random.seed(42)
    for sid in random.sample(sorted(s_ for s_, l in lojas.items() if l["clientes_principais"] > 0), 10):
        l = lojas[sid]
        conta = dict(con.execute("""SELECT a.segmento, COUNT(*) FROM _principal p JOIN _atrib a USING (household_key)
                                    WHERE p.STORE_ID = ? GROUP BY 1""", [sid]).fetchall())
        n = sum(conta.values())
        indices = {x["segmento"]: x for x in l["indices"]}
        esperado = {g: 100 * (conta.get(g, 0) / n) / rede[g] for g in comum.SEGMENTOS}
        conferir(f"perfil loja {sid}: clientes de loja principal (SQL)", n, l["clientes_principais"], "lojas.json")
        conferir(f"perfil loja {sid}: índices dos 4 segmentos (SQL)", [esperado[g] for g in comum.SEGMENTOS],
                 [indices[g]["indice"] for g in comum.SEGMENTOS], "lojas.json", TOL_INDICE)
        perfil = None if n < minimo_clientes else max(comum.SEGMENTOS, key=lambda g: (esperado[g], -comum.SEGMENTOS.index(g)))
        conferir(f"perfil loja {sid}: perfil (maior índice; amostra pequena abaixo de {minimo_clientes})", perfil, l["perfil"], "lojas.json")
    fat26 = dict(con.execute("SELECT STORE_ID, SUM(fat) FROM it WHERE WEEK_NO BETWEEN ? AND ? GROUP BY 1", [j["ini"], j["fim"]]).fetchall())
    for p_ in linhas("perfis.json"):
        nome = None if p_["perfil"] == "Amostra pequena" else p_["perfil"]
        membros = [s_ for s_, l in lojas.items() if l["clientes_principais"] > 0 and l["perfil"] == nome]
        conferir(f"perfis {p_['perfil']}: lojas", len(membros), p_["lojas"], "perfis.json")
        conferir(f"perfis {p_['perfil']}: faturamento das 26 semanas (SQL)", sum(fat26.get(s_, 0) for s_ in membros), p_["faturamento"],
                 "perfis.json", TOL_DINHEIRO)

    # Ranking e ficha, em cada período.
    for periodo, (ini, fim, ant) in janelas.items():
        arq_r, arq_f = f"lojas_ranking_{periodo}.json", f"lojas_ficha_{periodo}.json"
        ranking = linhas(arq_r)
        todos = {r["loja"]: r for r in ranking if r["subconjunto"] == "todos"}
        conferir(f"ranking {periodo}: soma das lojas = faturamento do período", ctx["total"][periodo]["faturamento"],
                 sum(r["faturamento"] for r in todos.values()), arq_r, 0.005 * len(todos))
        por_sub = defaultdict(dict)
        for r in ranking:
            por_sub[r["subconjunto"]][r["loja"]] = r
        incoerentes = 0
        for sub, linhas_sub in por_sub.items():
            if sub == "todos" or "+" not in sub:
                continue
            for sid, r in linhas_sub.items():
                partes = [por_sub.get(g, {}).get(sid) for g in sub.split("+")]
                fat = sum(x["faturamento"] for x in partes if x)
                ces = sum(x["cestas"] for x in partes if x)
                if abs(fat - r["faturamento"]) > 0.005 * 4 + TOL_DINHEIRO or ces != r["cestas"]:
                    incoerentes += 1
        conferir(f"ranking {periodo}: cada subconjunto = soma dos seus segmentos (faturamento e cestas)", 0, incoerentes, arq_r)
        fichas = {f["id"]: f for f in linhas(arq_f)}
        conferir(f"ficha {periodo}: uma por loja com cesta no período", len(todos), len(fichas), arq_f)
        fora = sum(1 for f in fichas.values() if f["arvore"] and abs(
            f["arvore"]["clientes"]["atual"] * f["arvore"]["idas_por_cliente"]["atual"] * f["arvore"]["ticket_medio"]["atual"]
            - f["arvore"]["faturamento"]["atual"]) > 0.001 * f["arvore"]["faturamento"]["atual"] + 0.05)
        conferir(f"ficha {periodo}: árvore de vendas fecha (clientes × idas × ticket = faturamento)", 0, fora, arq_f)
        conferir(f"ficha {periodo}: mix de segmentos soma 1 em cada loja", 0,
                 sum(1 for f in fichas.values() if f["segmentos"] and abs(sum(x["pct"] for x in f["segmentos"]) - 1) > 0.0005), arq_f)
        if periodo == "26s":
            # Nas 26 semanas, a regra é a própria vw_yoy_loja do RAG: todas as lojas comparáveis.
            erros = 0
            for sid, y in yoy.items():
                r, f = todos[sid], fichas[sid]
                a = f["arvore"]
                if (abs(r["faturamento_variacao_pct"] - y[3] / 100) > TOL_FRACAO or r["amostra_pequena"] != y[7]
                        or abs(f["cestas_variacao_pct"] - y[4] / 100) > TOL_FRACAO or abs(f["clientes_variacao_pct"] - y[5] / 100) > TOL_FRACAO
                        or abs(f["ticket_medio_variacao_pct"] - y[6] / 100) > TOL_FRACAO
                        or (a["clientes"]["atual"], a["clientes"]["base"]) != (y[9], y[11]) or abs(a["ticket_medio"]["atual"] - y[12]) > TOL_DINHEIRO
                        or abs(a["faturamento"]["base"] - y[2]) > TOL_DINHEIRO or abs(a["idas_por_cliente"]["atual"] - y[8] / y[9]) > TOL_FRACAO):
                    erros += 1
            conferir("ranking e ficha 26s: as lojas comparáveis = vw_yoy_loja (variações, amostra pequena, árvore)", 0, erros, arq_f)
            conferir("ranking 26s: lojas comparáveis = vw_yoy_loja", len(yoy), sum(1 for r in todos.values() if r["comparavel"]), arq_r)
        # 3 lojas sorteadas e um subconjunto, com SQL próprio (lojas comparáveis do período).
        con.execute("CREATE OR REPLACE TEMP TABLE _lfl AS SELECT STORE_ID FROM it GROUP BY STORE_ID HAVING "
                    + ("FALSE" if ant is None else
                       f"COUNT(*) FILTER (WHERE WEEK_NO BETWEEN {ini} AND {fim}) > 0 AND COUNT(*) FILTER (WHERE WEEK_NO BETWEEN {ant[0]} AND {ant[1]}) > 0"))
        lfl = {s_ for (s_,) in con.execute("SELECT STORE_ID FROM _lfl").fetchall()}
        conferir(f"ranking {periodo}: lojas comparáveis (SQL)", sorted(lfl), sorted(s_ for s_, r in todos.items() if r["comparavel"]), arq_r)
        for sid in random.sample(sorted(s_ for s_, r in todos.items() if r["cestas"] >= minimo_cestas), 3):
            for sub in ("todos", "Fiéis+Regulares"):
                r = por_sub[sub].get(sid)
                fat, ces, fat_a, ces_a = um(con, f"""
                    SELECT SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?), COUNT(DISTINCT BASKET_ID) FILTER (WHERE WEEK_NO BETWEEN ? AND ?),
                           SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?), COUNT(DISTINCT BASKET_ID) FILTER (WHERE WEEK_NO BETWEEN ? AND ?)
                    FROM it WHERE STORE_ID = ? AND {hh_filtro(sub)}""",
                    [ini, fim, ini, fim, *(ant or (0, -1)), *(ant or (0, -1)), sid])
                nome = f"ranking {periodo} loja {sid} {sub}"
                conferir(f"{nome}: faturamento (SQL)", fat, r["faturamento"], arq_r, TOL_DINHEIRO)
                conferir(f"{nome}: ticket (SQL)", fat / ces, r["ticket_medio"], arq_r, TOL_DINHEIRO)
                esperado = fat / fat_a - 1 if sid in lfl and fat_a else None
                conferir(f"{nome}: crescimento nas lojas comparáveis (SQL)", esperado, r["faturamento_variacao_pct"], arq_r, TOL_FRACAO)
                pequena = (ces < minimo_cestas or ces_a < minimo_cestas) if sid in lfl else ces < minimo_cestas
                conferir(f"{nome}: amostra pequena (regra do RAG)", pequena, r["amostra_pequena"], arq_r)
            f = fichas[sid]
            cli, itens, desc, bruto = um(con, """SELECT COUNT(DISTINCT household_key), SUM(qtd), SUM(descontos), SUM(bruto)
                                                 FROM it WHERE STORE_ID = ? AND WEEK_NO BETWEEN ? AND ?""", [sid, ini, fim])
            conferir(f"ficha {periodo} loja {sid}: clientes, itens por cesta e % de desconto (SQL)",
                     [cli, itens / f["cestas"], desc / bruto], [f["clientes"], f["itens_por_cesta"], f["desconto_pct"]], arq_f, TOL_FRACAO)
            dep, pct = um(con, """SELECT dep, SUM(fat) / (SELECT SUM(fat) FROM it WHERE STORE_ID = ? AND WEEK_NO BETWEEN ? AND ?)
                                  FROM it WHERE STORE_ID = ? AND WEEK_NO BETWEEN ? AND ? GROUP BY dep ORDER BY 2 DESC, 1 LIMIT 1""",
                          [sid, ini, fim, sid, ini, fim])
            conferir(f"ficha {periodo} loja {sid}: maior departamento (SQL)", (dep, round(pct, 4)),
                     (f["departamentos"][0]["departamento"], f["departamentos"][0]["pct"]), arq_f)

    # Regiões: o universo (100+ cestas na base inteira), uma região por loja, as somas e a reprodução do modelo.
    universo = {s_ for (s_,) in con.execute("SELECT STORE_ID FROM it GROUP BY STORE_ID HAVING COUNT(DISTINCT BASKET_ID) >= 100").fetchall()}
    conferir("regiões: universo = lojas com 100+ cestas na base inteira (SQL)", sorted(universo),
             sorted(s_ for s_, l in lojas.items() if l["regiao"] != "Lojas pequenas"), "lojas.json")
    conferir("lojas: uma linha por loja com cesta na base (SQL)", um(con, "SELECT COUNT(DISTINCT STORE_ID) FROM it")[0], len(lojas), "lojas.json")
    regioes = {r["regiao"]: r for r in linhas("regioes.json")}
    for nome, r in regioes.items():
        partes = [fat26.get(s_, 0) for s_, l in lojas.items() if l["regiao"] == nome]
        conferir(f"{nome}: faturamento das 26 semanas = soma das lojas (SQL)", sum(partes), r["faturamento"], "regioes.json", TOL_DINHEIRO)
    regiao_de = {s_: l["regiao"] for s_, l in lojas.items()}
    con.register("_regiao_df", __import__("pandas").DataFrame({"STORE_ID": list(regiao_de), "regiao": list(regiao_de.values())}))
    rs = linhas("regioes_segmento.json")
    for periodo, (ini, fim, _) in janelas.items():
        partes = [x for x in rs if x["periodo"] == periodo]
        conferir(f"regioes_segmento {periodo}: soma = faturamento do período", ctx["total"][periodo]["faturamento"],
                 sum(x["faturamento"] for x in partes), "regioes_segmento.json", 0.005 * len(partes))
        sql = {(rg, g): f for rg, g, f in con.execute("""
            SELECT r.regiao, COALESCE(a.segmento, 'Sem segmento'), SUM(i.fat) FROM it i JOIN _regiao_df r USING (STORE_ID)
            LEFT JOIN _atrib a ON a.household_key = i.household_key WHERE i.WEEK_NO BETWEEN ? AND ? GROUP BY 1, 2""", [ini, fim]).fetchall()}
        conferir(f"regioes_segmento {periodo}: cada região × grupo (SQL)", 0,
                 sum(1 for x in partes if abs(sql.get((x["regiao"], x["grupo"]), 0) - x["faturamento"]) > TOL_DINHEIRO), "regioes_segmento.json")
    params = ler("manifest.json")["parametros_regioes"]
    conferir("regiões: clientela em comum mais concentrada que ao acaso", True,
             params["concentracao_dentro"] > params["concentracao_ao_acaso"], "manifest.json")
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


def _no_segmento(curva: list[dict], fpr: float, tpr: float) -> bool:
    """O ponto (fpr, tpr) está num vértice ou num trecho reto da curva? (roc_curve tira os pontos colineares.)"""
    for a, b in zip(curva, curva[1:]):
        if a["fpr"] - 1e-6 <= fpr <= b["fpr"] + 1e-6 and a["tpr"] - 1e-6 <= tpr <= b["tpr"] + 1e-6:
            if abs((b["fpr"] - a["fpr"]) * (tpr - a["tpr"]) - (b["tpr"] - a["tpr"]) * (fpr - a["fpr"])) < 1e-6:
                return True
    return False


def reconciliar_laboratorio(con, rag: dict) -> None:
    """Aba Laboratório: cada número contra as funções do RAG; a curva ROC contra a AUC e a matriz de confusão; o CLV
    contra as próprias somas; o desconto por household recontado em SQL na tabela fato."""
    import numpy as np
    import pandas as pd

    ch, cl, de = rag["churn"], rag["clv"], rag["desc"]
    lab = ler("manifest.json")["parametros_laboratorio"]
    janela = ler("manifest.json")["janelas"]["26s"]

    # Modelo e regra simples: os campos do RAG e a coerência da matriz.
    modelos = {m["classificador"]: m for m in linhas("lab_modelo.json")}
    for nome, rag_m, corte, ic in (("modelo", ch["modelo"], ch["limiar"], ch["auc_modelo_ic"]),
                                   ("regra_simples", ch["baseline"], ch["k_baseline"], ch["auc_baseline_ic"])):
        m = modelos[nome]
        for c in ("auc", "auc_pr", "precisao", "recall", "f1", "alertas", "tn", "fp", "fn", "tp"):
            conferir(f"lab_modelo {nome}: {c} = RAG", rag_m[c], m[c], "lab_modelo.json")
        conferir(f"lab_modelo {nome}: corte = RAG", corte, m["corte"], "lab_modelo.json")
        conferir(f"lab_modelo {nome}: IC da AUC = RAG", list(ic), [m["auc_ic_inf"], m["auc_ic_sup"]], "lab_modelo.json")
        total = m["tn"] + m["fp"] + m["fn"] + m["tp"]
        conferir(f"lab_modelo {nome}: matriz soma o teste", ch["linhas"]["teste"], total, "lab_modelo.json")
        conferir(f"lab_modelo {nome}: alertas = VP + FP", m["tp"] + m["fp"], m["alertas"], "lab_modelo.json")
        conferir(f"lab_modelo {nome}: precisão = VP / alertas", m["tp"] / (m["tp"] + m["fp"]), m["precisao"], "lab_modelo.json", 1e-4)
        conferir(f"lab_modelo {nome}: recall = VP / pausas", m["tp"] / (m["tp"] + m["fn"]), m["recall"], "lab_modelo.json", 1e-4)
        conferir(f"lab_modelo {nome}: prevalência do teste", (m["tp"] + m["fn"]) / total, lab["risco"]["prevalencia_teste_pct"],
                 "manifest.json", 1e-5)
        # Curva: de (0,0) a (1,1), sem voltar; a área dá a AUC do RAG; o ponto de operação está na curva.
        curva = sorted((p for p in linhas("lab_roc.json") if p["classificador"] == nome), key=lambda p: p["ponto"])
        fpr = np.array([p["fpr"] for p in curva]); tpr = np.array([p["tpr"] for p in curva])
        conferir(f"lab_roc {nome}: começa em (0,0) e termina em (1,1)", [0, 0, 1, 1], [fpr[0], tpr[0], fpr[-1], tpr[-1]], "lab_roc.json")
        conferir(f"lab_roc {nome}: curva sem voltar", True, bool((np.diff(fpr) >= 0).all() and (np.diff(tpr) >= 0).all()), "lab_roc.json")
        area = float(np.sum(np.diff(fpr) * (tpr[1:] + tpr[:-1]) / 2))
        conferir(f"lab_roc {nome}: área da curva = AUC do RAG", rag_m["auc"], round(area, 4), "lab_roc.json")
        conferir(f"lab_modelo {nome}: pausas = VP + FN", m["tp"] + m["fn"], m["pausas"], "lab_modelo.json")
        conferir(f"lab_modelo {nome}: falso alarme = FP / (FP + VN)", m["fp"] / (m["fp"] + m["tn"]), m["taxa_falso_alarme"],
                 "lab_modelo.json", 1e-6)
        operacao = (m["taxa_falso_alarme"], m["tp"] / m["pausas"])
        conferir(f"lab_roc {nome}: ponto de operação na curva", True, _no_segmento(curva, *operacao), "lab_roc.json")
    vertice = [p for p in linhas("lab_roc.json") if p["classificador"] == "regra_simples" and p["corte"] == ch["k_baseline"]]
    conferir("lab_roc regra simples: vértice no k do RAG", 1, len(vertice), "lab_roc.json")
    conferir("manifest: diferença de AUC = RAG", [ch["diferenca_auc"], *ch["diferenca_auc_ic"]],
             [lab["risco"]["diferenca_auc"], *lab["risco"]["diferenca_auc_ic"]], "manifest.json")

    # CLV: campos do RAG, somas e erro do backtest.
    clv = {c["segmento"]: c for c in linhas("lab_clv.json")}
    bt = {b["nome"]: b for b in cl["backtest"]["segmentos"]}
    conferir("lab_clv: segmentos = RAG", [s["nome"] for s in cl["segmentos"]], list(clv), "lab_clv.json")
    for s_ in cl["segmentos"]:
        c, b = clv[s_["nome"]], bt[s_["nome"]]
        conferir(f"lab_clv {s_['nome']}: valores = RAG",
                 [s_["n"], s_["clv_medio"], *s_["ic_95"], s_["clv_total_usd"], s_["receita_esperada_usd"], b["households"], b["real_usd"],
                  b["previsto_metodo_usd"], b["previsto_ingenuo_usd"]],
                 [c["households"], c["clv_medio"], c["clv_ic_inf"], c["clv_ic_sup"], c["clv_total"], c["receita_esperada"],
                  c["backtest_households"], c["backtest_real"], c["backtest_metodo"], c["backtest_ingenuo"]], "lab_clv.json")
        conferir(f"lab_clv {s_['nome']}: total = médio × households", c["clv_medio"] * c["households"], c["clv_total"], "lab_clv.json",
                 0.001 * c["households"])
        conferir(f"lab_clv {s_['nome']}: erro do método = (previsto − real) / real",
                 (c["backtest_metodo"] - c["backtest_real"]) / c["backtest_real"], c["backtest_erro_metodo_pct"], "lab_clv.json", 1e-4)
        conferir(f"lab_clv {s_['nome']}: erro da regra ingênua = (previsto − real) / real",
                 (c["backtest_ingenuo"] - c["backtest_real"]) / c["backtest_real"], c["backtest_erro_ingenuo_pct"], "lab_clv.json", 1e-4)
    conferir("lab_clv: soma dos segmentos = CLV total do RAG", cl["total"]["clv_total_usd"], soma(clv.values(), "clv_total"),
             "lab_clv.json", 0.05)
    conferir("lab_clv: households somam o total do RAG", cl["total"]["households"], soma(clv.values(), "households"), "lab_clv.json")
    conferir("manifest: CLV total e IC = RAG", [cl["total"]["clv_total_usd"], *cl["total"]["ic_95"]],
             [lab["clv"]["clv_total"], *lab["clv"]["clv_total_ic"]], "manifest.json")

    # Desconto: os campos do RAG, a regra do veredito e o % por household recontado na tabela fato.
    grupos = {g["segmento"]: g for g in linhas("lab_desconto_segmentos.json")}
    for g in de["grupos"]:
        e = grupos[g["segmento"]]
        conferir(f"lab_desconto_segmentos {g['segmento']}: valores = RAG",
                 [g["households"], g["mediana_pct"], g["q25_pct"], g["q75_pct"], g["bigode_inf_pct"], g["bigode_sup_pct"],
                  g["taxa_ponderada_pct"], g["desconto_total_usd"], g["valor_bruto_usd"]],
                 [e["households"], e["mediana_pct"] * 100, e["q25_pct"] * 100, e["q75_pct"] * 100, e["bigode_inf_pct"] * 100,
                  e["bigode_sup_pct"] * 100, e["taxa_ponderada_pct"] * 100, e["desconto_total"], e["valor_bruto"]],
                 "lab_desconto_segmentos.json", 1e-9)
    hh = con.execute("""
        SELECT a.segmento, i.household_key, 100 * SUM(i.descontos) / SUM(i.bruto) AS pct, SUM(i.descontos) AS desconto, SUM(i.bruto) AS bruto
        FROM it i JOIN _atrib a USING (household_key)
        WHERE i.WEEK_NO BETWEEN ? AND ? GROUP BY ALL""", [janela["semana_ini"], janela["semana_fim"]]).df()
    for seg, t in hh.groupby("segmento"):
        if seg not in grupos:
            continue
        e = grupos[seg]
        q1, med, q3 = t["pct"].quantile([0.25, 0.5, 0.75])
        conferir(f"desconto {seg}: SQL na tabela fato (households, quartis, taxa ponderada)",
                 [len(t), q1, med, q3, 100 * t["desconto"].sum() / t["bruto"].sum(), t["desconto"].sum()],
                 [e["households"], e["q25_pct"] * 100, e["mediana_pct"] * 100, e["q75_pct"] * 100, e["taxa_ponderada_pct"] * 100,
                  e["desconto_total"]], "lab_desconto_segmentos.json", 1e-6 * max(1.0, t["desconto"].sum()))
    pares = linhas("lab_desconto.json")
    rag_pares = {(d["grupo_1"], d["grupo_2"]): d for d in de["ic_diferencas"]}
    ph = {frozenset((d["grupo_1"], d["grupo_2"])): d for d in de["post_hoc"]}
    conferir("lab_desconto: pares = RAG", list(rag_pares), [(d["segmento_a"], d["segmento_b"]) for d in pares], "lab_desconto.json")
    for d in pares:
        r = rag_pares[(d["segmento_a"], d["segmento_b"])]
        nome = f"{d['segmento_a']} × {d['segmento_b']}"
        conferir(f"lab_desconto {nome}: diferença e IC = RAG", [r["diferenca_mediana_pp"], r["ic_inferior"], r["ic_superior"]],
                 [d["diferenca_pp"] * 100, d["ic_inf"] * 100, d["ic_sup"] * 100], "lab_desconto.json", 1e-9)
        conferir(f"lab_desconto {nome}: diferença = mediana a − mediana b",
                 grupos[d["segmento_a"]]["mediana_pct"] - grupos[d["segmento_b"]]["mediana_pct"], d["diferenca_pp"], "lab_desconto.json", 1e-6)
        conferir(f"lab_desconto {nome}: p ajustado = RAG", ph[frozenset((d["segmento_a"], d["segmento_b"]))]["p_valor_ajustado"],
                 d["p_ajustado"], "lab_desconto.json")
        conferir(f"lab_desconto {nome}: IC exclui zero", d["ic_inf"] > 0 or d["ic_sup"] < 0, d["exclui_zero"], "lab_desconto.json")
    dsc = lab["desconto"]
    kw = de["kruskal_wallis"]
    conferir("manifest: Kruskal-Wallis = RAG", [kw["estatistica_H"], kw["p_valor"], kw["eta_quadrado_aprox"], de["veredito"]],
             [dsc["kruskal_h"], dsc["p_valor"], dsc["eta_quadrado"], dsc["veredito"]], "manifest.json")
    relevantes = [d for d in pares if d["exclui_zero"] and abs(d["diferenca_pp"]) >= dsc["diferenca_relevante_pp"]]
    regra = ("sem_diferenca_detectavel" if dsc["p_valor"] >= dsc["alfa"] else
             "diferenca_relevante" if dsc["eta_quadrado"] >= dsc["eta_quadrado_relevante"] or relevantes else "diferenca_desprezivel")
    conferir("lab_desconto: veredito pela regra do RAG nos números publicados", dsc["veredito"], regra, "manifest.json")


def reconciliar_migracao(con, rag: dict) -> None:
    """Matriz de migração: a tabela cruzada recontada das funções do RAG; o faturamento de cada célula por SQL na tabela
    fato; tamanhos e faturamento dos dois lados contra o CLV do RAG (backtest) e segmentos.json."""
    import pandas as pd

    sem = "Sem compra na janela"
    ini, fim = rag["janela_anterior"]
    m = ler("manifest.json")
    atual = m["janelas"]["26s"]
    conferir("migração: janela anterior = 26 semanas antes da janela", [ini, fim],
             [m["parametros_migracao"]["janela_anterior"]["semana_ini"], m["parametros_migracao"]["janela_anterior"]["semana_fim"]], "manifest.json")
    hh = con.execute("SELECT household_key FROM origem.dim_household").df()["household_key"].astype(int)
    antes = rag["anterior"].set_index("household_key")["segmento"]
    depois = rag["atribuicao"].set_index("household_key")["segmento"]
    tabela = pd.DataFrame({"a": antes.reindex(hh).fillna(sem).to_numpy(), "b": depois.reindex(hh).fillna(sem).to_numpy()}, index=hh)
    gasto = con.execute("""
        SELECT household_key, SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?) AS ant, SUM(fat) FILTER (WHERE WEEK_NO BETWEEN ? AND ?) AS atu
        FROM it GROUP BY household_key""", [ini, fim, atual["semana_ini"], atual["semana_fim"]]).df().set_index("household_key")
    tabela = tabela.join(gasto).fillna({"ant": 0.0, "atu": 0.0})
    celulas = {(c["segmento_anterior"], c["segmento_atual"]): c for c in linhas("migracao.json")}
    conferir("migração: 25 células", 25, len(celulas), "migracao.json")
    conferir("migração: clientes somam dim_household", len(hh), soma(celulas.values(), "clientes"), "migracao.json")
    erros = 0
    for (a, b), c in celulas.items():
        t = tabela[(tabela["a"] == a) & (tabela["b"] == b)]
        linha_a = (tabela["a"] == a).sum()
        esperado = [len(t), round(t["ant"].sum(), 2), round(t["atu"].sum(), 2), len(t) / linha_a if linha_a else None]
        obtido = [c["clientes"], c["faturamento_anterior"], c["faturamento_atual"], c["clientes_pct_linha"]]
        if esperado[0] != obtido[0] or abs(esperado[1] - obtido[1]) > 0.02 or abs(esperado[2] - obtido[2]) > 0.02 \
                or (esperado[3] is not None and abs(esperado[3] - obtido[3]) > 5e-5):
            erros += 1
            print(f"  migração {a} -> {b}: esperado {esperado}, encontrado {obtido}")
        if c["amostra_pequena"] != (c["clientes"] < m["parametros_migracao"]["minimo_clientes_celula"]):
            erros += 1
    conferir("migração: as 25 células recontadas (clientes, faturamento dos dois lados, % da linha, amostra pequena)", 0, erros, "migracao.json")
    for a in {k[0] for k in celulas}:
        conferir(f"migração: a linha {a} soma 100%", 1.0, sum(c["clientes_pct_linha"] or 0 for k, c in celulas.items() if k[0] == a),
                 "migracao.json", 5e-4)
    grupos = {g["segmento"]: g for g in linhas("migracao_segmentos.json")}
    bt = {s["nome"]: s for s in rag["clv"]["backtest"]["segmentos"]}
    segs = {s["segmento"]: s for s in linhas("segmentos.json")}
    for nome, g in grupos.items():
        linha_ = [c for k, c in celulas.items() if k[0] == nome]
        coluna = [c for k, c in celulas.items() if k[1] == nome]
        diag = celulas[(nome, nome)]["clientes"]
        conferir(f"migracao_segmentos {nome}: = linhas e colunas da matriz",
                 [soma(linha_, "clientes"), soma(coluna, "clientes"), diag, soma(coluna, "clientes") - diag, soma(linha_, "clientes") - diag],
                 [g["clientes_anterior"], g["clientes_atual"], g["ficaram"], g["entraram"], g["sairam"]], "migracao_segmentos.json")
        conferir(f"migracao_segmentos {nome}: faturamento = matriz", [soma(linha_, "faturamento_anterior"), soma(coluna, "faturamento_atual")],
                 [g["faturamento_anterior"], g["faturamento_atual"]], "migracao_segmentos.json", 0.05)
        if nome in bt:   # o semestre anterior é a janela de teste do backtest do CLV do RAG
            conferir(f"migração {nome}: semestre anterior = backtest do CLV do RAG (households e gasto)",
                     [bt[nome]["households"], bt[nome]["previsto_ingenuo_usd"]], [g["clientes_anterior"], g["faturamento_anterior"]],
                     "migracao_segmentos.json", 0.01)
        if nome in segs:
            conferir(f"migração {nome}: semestre atual = segmentos.json", [segs[nome]["clientes"], segs[nome]["faturamento"]],
                     [g["clientes_atual"], g["faturamento_atual"]], "migracao_segmentos.json", 0.01)
    sem_clv = next(s for s in rag["clv"]["segmentos"] if s["nome"] == sem)
    conferir("migração: 'Sem compra na janela' atual = grupo do CLV do RAG", sem_clv["n"], grupos[sem]["clientes_atual"], "migracao_segmentos.json")
    ativos = tabela[tabela["a"] != sem]
    conferir("manifest: ficaram no mesmo segmento", round((ativos["a"] == ativos["b"]).mean(), 4), m["parametros_migracao"]["ficaram_pct"],
             "manifest.json")


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
    reconciliar_visao_geral(con, ctx)
    reconciliar_departamentos(con, ctx)
    reconciliar_cesta(con, ctx)
    reconciliar_segmentos(con, rag, ctx)
    reconciliar_lojas(con, ctx, cfg)
    reconciliar_produtos(con, ctx)
    reconciliar_laboratorio(con, rag)
    reconciliar_migracao(con, rag)
    comum.conferir_rag_intocado(antes, comum.foto_rag(cfg["rag_dir"]))
    for ok, nome, esperado, encontrado, arquivo in resultados:
        if not ok:
            print(f"DIVERGE  {nome}: esperado {esperado}, encontrado {encontrado} ({arquivo})")
    divergencias = sum(1 for r in resultados if not r[0])
    print(f"Reconciliação: {len(resultados) - divergencias}/{len(resultados)} OK, {divergencias} divergências. RAG intocado.")
    return 1 if divergencias else 0


if __name__ == "__main__":
    sys.exit(main())
