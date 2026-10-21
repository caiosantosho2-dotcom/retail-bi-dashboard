"""Reconciliação: cada número dos JSONs contra a origem, sem reaproveitar as consultas da exportação.

- Números do banco: SQL próprio e simples, direto nas views do RAG (vw_metricas_cesta, vw_yoy_resumo,
  vw_contexto_periodo, vw_metricas_cliente, vw_cliente_semana) ou na tabela fato, nunca nas views do painel.
- Segmento, CLV e risco: as funções do próprio RAG (rfm, clv, churn), e não a réplica de scripts/rag_modelos.py.
- Por último, os números que o app de RAG mostra (spec, "Origem dos dados por cliente").

Tolerâncias (skill validating-dashboard): contagens exatas; dinheiro ±0,01; frações ±0,0001. Somas de parcelas
arredondadas a 2 casas: ±0,005 por parcela, que é só o arredondamento de cada parcela no JSON.
Saída: uma linha por verificação; código de saída 1 se houver qualquer divergência.
"""

import json
import random
import sys

sys.dont_write_bytecode = True

import comum  # noqa: E402

TOL_DINHEIRO, TOL_FRACAO = 0.01, 0.0001

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
    return ler(nome)["linhas"]


def um(con, sql: str, params=None):
    return con.execute(sql, params or []).fetchone()


# --------------------------------------------------------------------------- KPIs

def _metricas(fat, cestas, itens, desconto, bruto) -> dict:
    return {"faturamento": fat, "cestas": cestas, "ticket_medio": fat / cestas, "itens_por_cesta": itens / cestas,
            "desconto_pct": desconto / bruto}


TOL_METRICA = {"faturamento": TOL_DINHEIRO, "cestas": 0, "ticket_medio": TOL_DINHEIRO, "itens_por_cesta": TOL_FRACAO,
               "desconto_pct": TOL_FRACAO}


def _janela_cesta(con, semana_ini: int, semana_fim: int) -> dict:
    """4, 13 e 26 semanas direto de vw_metricas_cesta (semana_alinhada alinha a base com a semana atual)."""
    sql = """
        WITH c AS (SELECT * FROM origem.vw_metricas_cesta WHERE semana_alinhada BETWEEN ? AND ?),
        lfl AS (SELECT STORE_ID FROM c GROUP BY STORE_ID
                HAVING COUNT(*) FILTER (WHERE periodo = 'atual') > 0 AND COUNT(*) FILTER (WHERE periodo = 'base') > 0)
        SELECT recorte, SUM(faturamento)::DOUBLE, COUNT(*), SUM(itens)::DOUBLE, SUM(desconto_total)::DOUBLE,
               SUM(valor_bruto)::DOUBLE, (SELECT COUNT(*) FROM lfl)
        FROM (SELECT 'todas' AS recorte, * FROM c WHERE periodo = 'atual'
              UNION ALL SELECT 'comparavel', * FROM c WHERE periodo = 'atual' AND STORE_ID IN (SELECT STORE_ID FROM lfl)
              UNION ALL SELECT 'ano_anterior', * FROM c WHERE periodo = 'base' AND STORE_ID IN (SELECT STORE_ID FROM lfl))
        GROUP BY recorte"""
    saida = {}
    for recorte, fat, ces, it, dt, vb, lojas in con.execute(sql, [semana_ini, semana_fim]).fetchall():
        saida[recorte] = _metricas(fat, ces, it, dt, vb)
        saida["lojas"] = lojas
    return saida


def _base_inteira(con, semana_fim: int) -> dict:
    """Base inteira direto da tabela fato (sem as views do RAG nem as do painel)."""
    fat, ces, it, dt, vb = um(con, """
        SELECT SUM(f.SALES_VALUE)::DOUBLE, COUNT(DISTINCT f.BASKET_ID), SUM(f.QUANTITY)::DOUBLE,
               -SUM(f.RETAIL_DISC + f.COUPON_DISC + f.COUPON_MATCH_DISC)::DOUBLE,
               SUM(f.SALES_VALUE - (f.RETAIL_DISC + f.COUPON_DISC + f.COUPON_MATCH_DISC))::DOUBLE
        FROM origem.fato_transacoes f JOIN origem.dim_data d ON d.data_id = f.data_id WHERE d.WEEK_NO <= ?""", [semana_fim])
    return {"todas": _metricas(fat, ces, it, dt, vb)}


def reconciliar_kpis(con) -> dict:
    j = dict(zip(["ini_mes", "ini_tri", "ini", "fim"], um(con, """
        SELECT semana_ini_ultimo_mes, semana_ini_ultimo_trimestre, semana_ini_atual, semana_fim_atual FROM origem.vw_janela""")))
    esperado = {"4s": _janela_cesta(con, j["ini_mes"], j["fim"]), "13s": _janela_cesta(con, j["ini_tri"], j["fim"]),
                "26s": _janela_cesta(con, j["ini"], j["fim"]), "base": _base_inteira(con, j["fim"])}
    ativos = dict(con.execute("SELECT periodo, COUNT(*) FILTER (WHERE cliente_ativo) FROM origem.vw_metricas_cliente "
                              "GROUP BY periodo").fetchall())
    kpis = {(l["periodo"], l["metrica"]): l for l in linhas("kpis.json")}
    for periodo, e in esperado.items():
        for metrica, tol in TOL_METRICA.items():
            l = kpis[(periodo, metrica)]
            conferir(f"kpi {periodo} {metrica} valor", e["todas"][metrica], l["valor"], "kpis.json", tol)
            if periodo == "base":
                conferir(f"kpi base {metrica} sem ano anterior", None, l["valor_ano_anterior"], "kpis.json")
                continue
            conferir(f"kpi {periodo} {metrica} comparável", e["comparavel"][metrica], l["valor_comparavel"], "kpis.json", tol)
            conferir(f"kpi {periodo} {metrica} ano anterior", e["ano_anterior"][metrica], l["valor_ano_anterior"], "kpis.json", tol)
            conferir(f"kpi {periodo} {metrica} variação", e["comparavel"][metrica] / e["ano_anterior"][metrica] - 1,
                     l["variacao_pct"], "kpis.json", TOL_FRACAO)
            conferir(f"kpi {periodo} {metrica} lojas comparáveis", e["lojas"], l["lojas_comparaveis"], "kpis.json")
        a = kpis[(periodo, "clientes_ativos")]
        conferir(f"kpi {periodo} clientes_ativos valor", ativos["atual"], a["valor"], "kpis.json")
        conferir(f"kpi {periodo} clientes_ativos ano anterior", None if periodo == "base" else ativos["base"],
                 a["valor_ano_anterior"], "kpis.json")

    # 26 semanas também contra as views agregadas do RAG que o chat usa (vw_yoy_resumo, vw_contexto_periodo).
    fat_a, fat_b, var, lojas, ces_a, ces_b, tic_a, tic_b = um(con, """
        SELECT faturamento_atual::DOUBLE, faturamento_base::DOUBLE, var_faturamento_pct, lojas_like_for_like,
               cestas_atual, cestas_base, ticket_atual, ticket_base FROM origem.vw_yoy_resumo""")
    k = lambda m: kpis[("26s", m)]
    conferir("vw_yoy_resumo faturamento atual", fat_a, k("faturamento")["valor_comparavel"], "kpis.json", TOL_DINHEIRO)
    conferir("vw_yoy_resumo faturamento base", fat_b, k("faturamento")["valor_ano_anterior"], "kpis.json", TOL_DINHEIRO)
    conferir("vw_yoy_resumo variação", var / 100, k("faturamento")["variacao_pct"], "kpis.json", TOL_FRACAO)
    conferir("vw_yoy_resumo lojas like-for-like", lojas, k("faturamento")["lojas_comparaveis"], "kpis.json")
    conferir("vw_yoy_resumo cestas atual", ces_a, k("cestas")["valor_comparavel"], "kpis.json")
    conferir("vw_yoy_resumo cestas base", ces_b, k("cestas")["valor_ano_anterior"], "kpis.json")
    conferir("vw_yoy_resumo ticket atual", tic_a, k("ticket_medio")["valor_comparavel"], "kpis.json", TOL_DINHEIRO)
    conferir("vw_yoy_resumo ticket base", tic_b, k("ticket_medio")["valor_ano_anterior"], "kpis.json", TOL_DINHEIRO)
    desconto = um(con, "SELECT pct_desconto FROM origem.vw_contexto_periodo WHERE periodo = 'atual'")[0]
    conferir("vw_contexto_periodo % desconto atual", desconto / 100, k("desconto_pct")["valor"], "kpis.json", TOL_FRACAO)
    return {"janela": j, "kpis": kpis}


# --------------------------------------------------------------------------- Visão Geral: somas e alinhamento

def reconciliar_visao_geral(con, ctx: dict) -> None:
    kpis, j = ctx["kpis"], ctx["janela"]
    deps = linhas("departamentos.json")
    for periodo in comum.PERIODOS:
        partes = [d["faturamento"] for d in deps if d["periodo"] == periodo]
        conferir(f"soma dos departamentos {periodo} = faturamento do KPI", kpis[(periodo, "faturamento")]["valor"],
                 sum(partes), "departamentos.json", 0.005 * len(partes))
        conferir(f"participação dos departamentos {periodo} soma 1", 1.0,
                 sum(d["participacao_pct"] for d in deps if d["periodo"] == periodo), "departamentos.json",
                 0.00005 * len(partes))

    semanas = linhas("vendas_semanais.json")
    n_semanas = um(con, "SELECT COUNT(DISTINCT WEEK_NO) FROM origem.dim_data WHERE WEEK_NO <= ?", [j["fim"]])[0]
    conferir("vendas_semanais: uma linha por semana 1..101", n_semanas, len(semanas), "vendas_semanais.json")
    janela = semanas[j["ini"] - 1: j["fim"]]   # semana N na posição N-1 (a lista começa na semana 1)
    fat_a, fat_b = um(con, "SELECT faturamento_atual::DOUBLE, faturamento_base::DOUBLE FROM origem.vw_yoy_resumo")
    conferir("semanal 26s (lojas do chat) = vw_yoy_resumo atual", fat_a, sum(s["faturamento"] for s in janela),
             "vendas_semanais.json", 0.005 * len(janela))
    conferir("semanal 26s ano anterior = vw_yoy_resumo base", fat_b, sum(s["faturamento_ano_anterior"] for s in janela),
             "vendas_semanais.json", 0.005 * len(janela))
    conferir("semanal: sem ano anterior nas semanas 1-52", 52,
             sum(1 for s in semanas if s["faturamento_ano_anterior"] is None), "vendas_semanais.json")
    primeiro = um(con, "SELECT strftime(MIN(data), '%Y-%m-%d') FROM origem.dim_data WHERE WEEK_NO = 1")[0]
    conferir("semanal: primeira semana começa no início da base", primeiro, semanas[0]["semana_inicio"], "vendas_semanais.json")

    calor = linhas("calor_dia_hora.json")
    conferir("calor: soma = faturamento da base inteira", kpis[("base", "faturamento")]["valor"],
             sum(c["faturamento"] for c in calor), "calor_dia_hora.json", 0.005 * len(calor))
    conferir("calor: soma das cestas = cestas da base inteira", kpis[("base", "cestas")]["valor"],
             sum(c["cestas"] for c in calor), "calor_dia_hora.json")


# --------------------------------------------------------------------------- Segmentos, Ficha e app

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


def reconciliar_clientes(con, rag: dict) -> None:
    CFG, seg, atribuicao, clv_r, churn_r = rag["CFG"], rag["seg"], rag["atribuicao"], rag["clv"], rag["churn"]
    segmento_de = dict(zip(atribuicao["household_key"].astype(int), atribuicao["segmento"]))
    clv_de = {s["nome"]: s for s in clv_r["segmentos"]}
    risco_de = {s["nome"]: s for s in churn_r["risco_por_segmento"]}

    segs = {s["segmento"]: s for s in linhas("segmentos.json")}
    indice = linhas("clientes_indice.json")
    conferir("segmentos: soma dos clientes = clientes segmentados", len(segmento_de), sum(s["clientes"] for s in segs.values()),
             "segmentos.json")
    conferir("clientes_indice: um por cliente segmentado", len(segmento_de), len(indice), "clientes_indice.json")
    conferir("segmentos: soma de clientes_pct = 1", 1.0, sum(s["clientes_pct"] for s in segs.values()), "segmentos.json", TOL_FRACAO * 4)
    conferir("segmentos: soma de faturamento_pct = 1", 1.0, sum(s["faturamento_pct"] for s in segs.values()), "segmentos.json",
             TOL_FRACAO * 4)

    # Valor por segmento recalculado no SQL a partir da atribuição do RAG.
    con.register("_atrib", atribuicao[["household_key", "segmento"]])
    valor_sql = dict(con.execute("""SELECT a.segmento, SUM(c.valor)::DOUBLE FROM _atrib a
        JOIN origem.vw_metricas_cliente c ON c.household_key = a.household_key AND c.periodo = 'atual' GROUP BY 1""").fetchall())
    for nome, s in segs.items():
        conferir(f"segmento {nome}: clientes", int((atribuicao["segmento"] == nome).sum()), s["clientes"], "segmentos.json")
        conferir(f"segmento {nome}: faturamento (SQL)", valor_sql[nome], s["faturamento"], "segmentos.json", TOL_DINHEIRO)
        conferir(f"segmento {nome}: CLV médio", clv_de[nome]["clv_medio"], s["clv_medio"], "segmentos.json", TOL_DINHEIRO)

    # Ficha: todos os clientes para segmento, risco e CLV; e 20 sorteados contra o SQL.
    por_id = {}
    for nome, slug in comum.SLUG.items():
        for c in linhas(f"clientes/{slug}.json"):
            por_id[c["id"]] = c
    conferir("ficha: segmento de cada cliente = RFM do RAG", 0,
             sum(1 for i, c in por_id.items() if segmento_de.get(i) != c["segmento"]), "clientes/*.json")
    n_semanas = len(linhas("vendas_semanais.json"))
    conferir("ficha: histórico alinhado com vendas_semanais", 0,
             sum(1 for c in por_id.values() if len(c["historico_semanal"]) != n_semanas), "clientes/*.json")
    limiar = churn_r["limiar"]
    for nome in comum.SEGMENTOS:
        clientes = [c for c in por_id.values() if c["segmento"] == nome]
        com_risco = [c for c in clientes if c["risco"]["score"] is not None]
        r = risco_de.get(nome)
        conferir(f"risco {nome}: clientes na população do modelo", r["households"] if r else 0, len(com_risco), "clientes/*.json")
        conferir(f"risco {nome}: alertas (faixa alta) = alertas do RAG", r["alertas"] if r else 0,
                 sum(1 for c in com_risco if c["risco"]["faixa"] == "alto"), "clientes/*.json")
        if com_risco:
            conferir(f"risco {nome}: risco médio = o do RAG", r["risco_medio_pct"] / 100,
                     sum(c["risco"]["score"] for c in com_risco) / len(com_risco), "clientes/*.json", TOL_FRACAO)
        conferir(f"CLV {nome}: média dos clientes = CLV médio do RAG", clv_de[nome]["clv_medio"],
                 sum(c["atributos"]["clv"]["valor"] for c in clientes) / len(clientes), "clientes/*.json", TOL_DINHEIRO)
    faixa_errada = 0
    for c in por_id.values():
        s, f = c["risco"]["score"], c["risco"]["faixa"]
        if s is not None and f != ("alto" if s >= limiar else "medio" if s >= limiar / 2 else "baixo"):
            faixa_errada += 1
    conferir("ficha: faixa coerente com o score e os cortes", 0, faixa_errada, "clientes/*.json")

    random.seed(42)
    amostra = random.sample(sorted(por_id), 20)
    for i in amostra:
        c = por_id[i]
        rec, freq, valor = um(con, """SELECT recencia_dias, frequencia, valor::DOUBLE FROM origem.vw_metricas_cliente
                                      WHERE household_key = ? AND periodo = 'atual'""", [i])
        ultima, primeira = um(con, "SELECT MAX(WEEK_NO), MIN(WEEK_NO) FROM origem.vw_cliente_semana WHERE household_key = ?", [i])
        fim = um(con, "SELECT semana_fim_atual FROM origem.vw_janela")[0]
        na_populacao = ultima >= fim - CFG["metricas"]["cliente_ativo_semanas"] + 1 and \
            fim - primeira >= CFG["analises"]["churn"]["historico_minimo_semanas"] - 1
        k = clv_de[c["segmento"]]
        conferir(f"ficha {i}: segmento", segmento_de[i], c["segmento"], "clientes/*.json")
        conferir(f"ficha {i}: recência", rec, c["atributos"]["recencia"]["valor"], "clientes/*.json")
        conferir(f"ficha {i}: frequência", freq, c["atributos"]["frequencia"]["valor"], "clientes/*.json")
        conferir(f"ficha {i}: valor", valor, c["atributos"]["valor"]["valor"], "clientes/*.json", TOL_DINHEIRO)
        conferir(f"ficha {i}: CLV", k["clv_medio"] * valor / k["valor_medio_janela_usd"], c["atributos"]["clv"]["valor"],
                 "clientes/*.json", TOL_DINHEIRO)
        conferir(f"ficha {i}: tem risco ⇔ está na população do modelo", na_populacao, c["risco"]["score"] is not None,
                 "clientes/*.json")

    # Insights e manifest contra o RAG; depois, contra o que o app mostra.
    ins = {l["id"]: l for l in linhas("insights.json")}
    total = sum(s["valor_total_usd"] for s in seg["segmentos"])
    fieis = next(s for s in seg["segmentos"] if s["nome"] == "Fiéis")
    conferir("insight Fiéis: frase = a do RAG", seg["e_dai"]["conclusao"], ins["fieis_faturamento"]["conclusao"], "insights.json")
    conferir("insight Fiéis: número", fieis["valor_total_usd"] / total, ins["fieis_faturamento"]["numero"], "insights.json", TOL_FRACAO)
    conferir("insight risco: número = valor em risco do RAG", churn_r["valor_em_risco_usd"], ins["risco_pausa"]["numero"],
             "insights.json", TOL_DINHEIRO)
    manifest = ler("manifest.json")["modelo"]
    conferir("manifest: limiar = o do RAG", limiar, manifest["limiar_alerta"], "manifest.json")
    conferir("manifest: AUC do modelo = a do RAG", churn_r["auc_modelo"], manifest["auc_modelo"], "manifest.json")

    conferir("app: Fiéis = 35% dos clientes", APP["fieis_clientes_pct"], round(100 * segs["Fiéis"]["clientes_pct"]), "segmentos.json")
    conferir("app: Fiéis = 71% do faturamento", APP["fieis_faturamento_pct"], round(100 * segs["Fiéis"]["faturamento_pct"]),
             "segmentos.json")
    conferir("app: AUC do modelo 0,85", APP["auc_modelo"], round(manifest["auc_modelo"], 2), "manifest.json")
    conferir("app: AUC da regra simples 0,74", APP["auc_regra_simples"], round(manifest["auc_regra_simples"], 2), "manifest.json")
    conferir("app: 136 clientes em risco (pausas esperadas)", APP["pausas_esperadas"],
             round(sum(c["risco"]["score"] for c in por_id.values() if c["risco"]["score"] is not None)), "clientes/*.json")
    conferir("app: 243 alertas", APP["alertas"],
             sum(1 for c in por_id.values() if c["risco"]["faixa"] == "alto"), "clientes/*.json")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cfg = comum.carregar_config()
    antes = comum.foto_rag(cfg["rag_dir"])
    rag = rodar_rag(cfg)   # primeiro e sozinho: o DuckDB recusa duas configurações no mesmo arquivo
    con = comum.conectar_origem(cfg)
    reconciliar_clientes(con, rag)
    ctx = reconciliar_kpis(con)
    reconciliar_visao_geral(con, ctx)
    comum.conferir_rag_intocado(antes, comum.foto_rag(cfg["rag_dir"]))
    for ok, nome, esperado, encontrado, arquivo in resultados:
        if not ok:
            print(f"DIVERGE  {nome}: esperado {esperado}, encontrado {encontrado} ({arquivo})")
    divergencias = sum(1 for r in resultados if not r[0])
    print(f"Reconciliação: {len(resultados) - divergencias}/{len(resultados)} OK, {divergencias} divergências. RAG intocado.")
    return 1 if divergencias else 0


if __name__ == "__main__":
    sys.exit(main())
