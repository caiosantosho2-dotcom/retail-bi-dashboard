// Somas no navegador, só das métricas que somam (spec, seção 6: faturamento, desconto e valor bruto).
// As que não somam (cestas, ticket, itens por cesta, clientes ativos) vêm prontas de kpis_filtrados.json.

export const SEGMENTOS = ['Fiéis', 'Regulares', 'Esporádicos', 'Em pausa'];
export const SEM_SEGMENTO = 'Sem segmento';

/** Chave do subconjunto no contrato: 'todos' sem chip ligado; senão os nomes ligados, na ordem fixa, unidos por '+'. */
export function chaveSubconjunto(segmentos) {
  return segmentos.size ? SEGMENTOS.filter((s) => segmentos.has(s)).join('+') : 'todos';
}

/** Grupos de cliente incluídos pelo filtro: todos (com 'Sem segmento') quando nenhum chip está ligado. */
export function gruposDoFiltro(segmentos) {
  return new Set(segmentos.size ? segmentos : [...SEGMENTOS, SEM_SEGMENTO]);
}

/** A linha passa no filtro de segmento e de departamento (departamentos vazio = todos). */
export function passa(linha, { segmentos, departamentos }) {
  return gruposDoFiltro(segmentos).has(linha.grupo) && (!departamentos.size || departamentos.has(linha.departamento));
}

const CAMPOS_PERIODO = ['faturamento', 'desconto', 'valor_bruto'];
const RECORTES = ['', '_comparavel', '_ano_anterior'];

/** Somas de cubo_periodo para um período e um filtro. Comparável e ano anterior ficam null na base inteira. */
export function somarPeriodo(cubo, periodo, filtros) {
  const total = {};
  for (const r of RECORTES) for (const c of CAMPOS_PERIODO) total[c + r] = periodo === 'base' && r ? null : 0;
  for (const l of cubo) {
    if (l.periodo !== periodo || !passa(l, filtros)) continue;
    for (const r of RECORTES) for (const c of CAMPOS_PERIODO) if (l[c + r] !== null) total[c + r] += l[c + r];
  }
  return total;
}

/**
 * Faturamento por departamento no período, decrescente, com o das lojas comparáveis e o das mesmas lojas um ano antes
 * (null na base inteira). O filtro de departamento não se aplica: quem desenha destaca os selecionados.
 */
export function departamentosPeriodo(cubo, periodo, filtros) {
  const porDep = new Map();
  for (const l of cubo) {
    if (l.periodo !== periodo || !passa(l, { ...filtros, departamentos: new Set() })) continue;
    const d = porDep.get(l.departamento) ?? { departamento: l.departamento, faturamento: 0, faturamento_comparavel: null, faturamento_ano_anterior: null };
    d.faturamento += l.faturamento;
    if (l.faturamento_comparavel !== null) d.faturamento_comparavel = (d.faturamento_comparavel ?? 0) + l.faturamento_comparavel;
    if (l.faturamento_ano_anterior !== null) d.faturamento_ano_anterior = (d.faturamento_ano_anterior ?? 0) + l.faturamento_ano_anterior;
    porDep.set(l.departamento, d);
  }
  return [...porDep.values()]
    .filter((d) => d.faturamento > 0 || d.faturamento_ano_anterior > 0)
    .sort((a, b) => b.faturamento - a.faturamento || a.departamento.localeCompare(b.departamento));
}

/** Faturamento por grupo de cliente (os 4 segmentos e 'Sem segmento') no período, para o filtro de departamento. */
export function gruposPeriodo(cubo, periodo, filtros) {
  const total = new Map([...SEGMENTOS, SEM_SEGMENTO].map((g) => [g, 0]));
  for (const l of cubo) {
    if (l.periodo !== periodo || !passa(l, { ...filtros, segmentos: new Set() })) continue;
    total.set(l.grupo, total.get(l.grupo) + l.faturamento);
  }
  return [...total].map(([grupo, faturamento]) => ({ grupo, faturamento }));
}

/** Série semanal (52 semanas) de cubo_faturamento para um filtro. O ano anterior fica null onde a semana − 52 não existe. */
export function serieSemanal(cubo, filtros, { porGrupo = false } = {}) {
  const semanas = new Map();
  for (const l of cubo) {
    if (!semanas.has(l.semana_inicio)) semanas.set(l.semana_inicio, { semana_inicio: l.semana_inicio, faturamento: 0, faturamento_ano_anterior: 0, grupos: {} });
    const s = semanas.get(l.semana_inicio);
    if (l.faturamento_ano_anterior === null) s.faturamento_ano_anterior = null;
    if (!passa(l, filtros)) continue;
    s.faturamento += l.faturamento;
    if (s.faturamento_ano_anterior !== null) s.faturamento_ano_anterior += l.faturamento_ano_anterior;
    if (porGrupo) s.grupos[l.grupo] = (s.grupos[l.grupo] ?? 0) + l.faturamento;
  }
  return [...semanas.values()].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
}
