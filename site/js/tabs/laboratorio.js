// Aba Laboratório (spec 5.6): o rigor por trás dos números. Curva ROC do modelo de risco de pausa contra a regra simples,
// matriz de confusão nos pontos de operação, CLV por segmento com o backtest e o teste de desconto entre segmentos.
// Todos os números são os das funções do RAG (a curva ROC é reproduzida e conferida contra ele na exportação).
// Período e departamento não se aplicam; o filtro de segmento só destaca o grupo no CLV e no teste de desconto.
import { COR, SEG_CORES, base, criarGrafico } from '../charts/tema.js';
import { el, erroDeCarga, painelGrafico, preencherTabela } from '../componentes.js';
import { carregar, linhas } from '../dados.js';
import { fmt } from '../formatar.js';

const OPACIDADE_FORA = 0.3;
const NOMES = { modelo: 'Modelo de risco', regra_simples: 'Regra simples' };

let estado;
let dados;
let ui;

export async function iniciar(container, estadoGlobal) {
  estado = estadoGlobal;
  const roc = painelGrafico({ titulo: 'Curva ROC: modelo de risco de pausa × regra simples', subtitulo: '', classe: 'lb-roc' });
  const matriz = el('section', { class: 'painel lb-matriz', 'aria-labelledby': 'lb-matriz-titulo' },
    el('h2', { class: 'painel__titulo', id: 'lb-matriz-titulo' }, 'Matriz de confusão no ponto de operação'),
    el('p', { class: 'painel__subtitulo' }, ''),
    el('div', { class: 'lb-matrizes' }),
    el('p', { class: 'lb-conclusao' }));
  const clv = painelGrafico({ titulo: 'CLV por segmento', subtitulo: '', classe: 'lb-clv' });
  clv.painel.append(el('div', { class: 'lb-backtest' }));
  const desconto = painelGrafico({ titulo: 'Teste de desconto entre segmentos', subtitulo: '', classe: 'lb-desconto' });
  desconto.grafico.before(el('dl', { class: 'lb-estatisticas' }));
  container.classList.add('lb');
  container.replaceChildren(roc.painel, matriz, clv.painel, desconto.painel);
  ui = { roc, matriz, clv, desconto,
         graficos: { roc: criarGrafico(roc.grafico), clv: criarGrafico(clv.grafico), desconto: criarGrafico(desconto.grafico) } };
  for (const nome of ['roc', 'clv', 'desconto']) ui[nome].aoAlternar((tabela) => { if (!tabela) ui.graficos[nome].resize(); });

  try {
    const [roc_, modelo, clv_, pares, segmentos, manifest] = await Promise.all([
      linhas('lab_roc.json'), linhas('lab_modelo.json'), linhas('lab_clv.json'), linhas('lab_desconto.json'),
      linhas('lab_desconto_segmentos.json'), carregar('manifest.json')]);
    dados = { roc: roc_, modelo: new Map(modelo.map((m) => [m.classificador, m])), clv: clv_, pares,
              segmento: new Map(segmentos.map((s) => [s.segmento, s])), lab: manifest.parametros_laboratorio };
  } catch (erro) {
    erroDeCarga(container, erro);
    return;
  }
}

export function atualizar() {
  if (!dados) return;
  Object.values(ui.graficos).forEach((g) => g.resize());
  desenharRoc();
  desenharMatriz();
  desenharClv();
  desenharDesconto();
}

const segs = () => estado.filtros.segmentos;
const apagado = (...nomes) => segs().size > 0 && !nomes.some((n) => segs().has(n));
const subtitulo = (painel) => painel.querySelector('.painel__subtitulo')
  ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
const corte = (m) => (m.classificador === 'modelo' ? `risco ≥ ${fmt.decimal(m.corte, 2)}` : `${fmt.contagem(m.corte)}+ semanas sem compra`);
const sinal = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt.pct(Math.abs(v))}`;

/** Bigode horizontal (intervalo de confiança) numa categoria do eixo Y: data = [inferior, superior, índice]. */
function bigodes(nome, itens, opacidade) {
  return {
    name: nome, type: 'custom', silent: true, z: 2,
    data: itens,
    renderItem: (params, api) => {
      const [x1, y] = api.coord([api.value(0), api.value(2)]);
      const [x2] = api.coord([api.value(1), api.value(2)]);
      const estilo = { stroke: COR.textoSecundario, lineWidth: 1.5, opacity: opacidade(params.dataIndex) };
      return { type: 'group', children: [
        { type: 'line', shape: { x1, y1: y, x2, y2: y }, style: estilo },
        { type: 'line', shape: { x1, y1: y - 5, x2: x1, y2: y + 5 }, style: estilo },
        { type: 'line', shape: { x1: x2, y1: y - 5, x2, y2: y + 5 }, style: estilo },
      ] };
    },
  };
}

// --------------------------------------------------------------------------- curva ROC

function desenharRoc() {
  const r = dados.lab.risco;
  const mod = dados.modelo.get('modelo');
  const reg = dados.modelo.get('regra_simples');
  subtitulo(ui.roc.painel).textContent = `Teste do RAG: ${fmt.contagem(r.linhas_teste)} clientes ativos em 2 fotos (semanas 85 e 93); `
    + `${fmt.pct(r.prevalencia_teste_pct)} ficaram ${r.horizonte_semanas} semanas sem comprar. Quanto mais a curva sobe à esquerda, melhor. `
    + `AUC ${fmt.decimal(mod.auc, 2)} × ${fmt.decimal(reg.auc, 2)}: o modelo ganha por ${fmt.decimal(r.diferenca_auc, 2)} `
    + `(IC 95%: ${fmt.decimal(r.diferenca_auc_ic[0], 2)} a ${fmt.decimal(r.diferenca_auc_ic[1], 2)}).`;
  const curva = (c) => dados.roc.filter((p) => p.classificador === c).map((p) => ({ value: [p.fpr, p.tpr], corte: p.corte }));
  const nome = (m) => `${NOMES[m.classificador]} · AUC ${fmt.decimal(m.auc, 2)}`;
  const cor = { modelo: COR.serie, regra_simples: COR.outros };
  const dicaPonto = (m, p) => {
    const c = p.corte === null ? 'ninguém em alerta'
      : m.classificador === 'modelo' ? `alerta com risco ≥ ${fmt.decimal(p.corte, 3)}` : `alerta com ${fmt.contagem(p.corte)}+ semanas sem compra`;
    return `<b>${NOMES[m.classificador]}</b>: ${c}<br>${fmt.pct(p.value[1])} das pausas encontradas · ${fmt.pct(p.value[0])} de alarme falso`;
  };
  const titulo = 'Curva ROC do modelo de risco de pausa contra a regra simples';
  ui.graficos.roc.setOption({
    ...base(titulo, `${titulo}. ${nome(mod)} (IC 95%: ${fmt.decimal(mod.auc_ic_inf, 2)} a ${fmt.decimal(mod.auc_ic_sup, 2)}); `
      + `${nome(reg)}. No ponto de operação, o modelo encontra ${mod.tp} das ${mod.pausas} pausas com ${fmt.pct(mod.taxa_falso_alarme)} de alarme falso; `
      + `a regra, ${reg.tp} com ${fmt.pct(reg.taxa_falso_alarme)}.`),
    legend: { top: 0, left: 0, data: [nome(mod), nome(reg), 'Ao acaso'] },
    // Em tela estreita a legenda ocupa duas linhas: o gráfico desce para não ficar embaixo dela.
    grid: { left: 28, right: 24, top: ui.graficos.roc.getWidth() < 600 ? 52 : 30, bottom: 26, containLabel: true },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v) => fmt.pct(v, 0) },
             name: 'alarme falso (entre quem não pausou)', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: COR.textoMudo, fontSize: 11 } },
    yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v) => fmt.pct(v, 0) },
             name: 'pausas encontradas', nameLocation: 'middle', nameGap: 40, nameTextStyle: { color: COR.textoMudo, fontSize: 11 } },
    series: [
      { name: 'Ao acaso', type: 'line', data: [[0, 0], [1, 1]], symbol: 'none', silent: true, tooltip: { show: false },
        lineStyle: { color: COR.eixo, type: 'dashed', width: 1 }, itemStyle: { color: COR.eixo } },
      ...[reg, mod].map((m) => ({
        name: nome(m), type: 'line', data: curva(m.classificador), z: m.classificador === 'modelo' ? 3 : 2,
        showSymbol: m.classificador === 'regra_simples', symbol: 'circle', symbolSize: 5,
        lineStyle: { color: cor[m.classificador], width: 2 }, itemStyle: { color: cor[m.classificador] },
        tooltip: { formatter: (p) => dicaPonto(m, p.data) } })),
      { name: 'Ponto de operação', type: 'scatter', z: 4, symbolSize: 12,
        data: [mod, reg].map((m) => ({
          value: [m.taxa_falso_alarme, m.recall], m,
          itemStyle: { color: cor[m.classificador], borderColor: COR.superficie, borderWidth: 2 },
          label: { show: true, position: 'right', distance: 8, color: COR.textoPrimario, fontSize: 11,
                   formatter: `${corte(m)}: ${m.tp} de ${m.pausas}` } })),
        tooltip: { formatter: (p) => `<b>${NOMES[p.data.m.classificador]}</b>, ponto de operação (${corte(p.data.m)})<br>`
          + `${p.data.m.tp} das ${p.data.m.pausas} pausas (${fmt.pct(p.data.m.recall)}) · ${fmt.pct(p.data.m.taxa_falso_alarme)} de alarme falso` } },
    ],
  }, { notMerge: true });
  preencherTabela(ui.roc.tabela, [
    { titulo: 'Classificador', valor: (m) => NOMES[m.classificador] },
    { titulo: 'AUC', valor: (m) => fmt.decimal(m.auc, 4), numero: true },
    { titulo: 'IC 95%', valor: (m) => `${fmt.decimal(m.auc_ic_inf, 3)} a ${fmt.decimal(m.auc_ic_sup, 3)}`, numero: true },
    { titulo: 'AUC-PR', valor: (m) => fmt.decimal(m.auc_pr, 4), numero: true },
    { titulo: 'Ponto de operação', valor: (m) => corte(m) },
    { titulo: 'Pausas encontradas', valor: (m) => fmt.pct(m.recall), numero: true },
    { titulo: 'Alarme falso', valor: (m) => fmt.pct(m.taxa_falso_alarme), numero: true },
  ], [mod, reg], titulo);
}

// --------------------------------------------------------------------------- matriz de confusão

function desenharMatriz() {
  const mod = dados.modelo.get('modelo');
  const reg = dados.modelo.get('regra_simples');
  subtitulo(ui.matriz).textContent = `Das ${fmt.contagem(mod.pausas)} pausas do teste, quantas cada um avisou antes, e quantos `
    + 'alertas foram para quem não pausou. O limiar do modelo é o de maior F1 na validação; o k da regra, o de maior F1 no treino.';
  const bloco = (m) => el('div', { class: 'lb-mat' },
    el('h3', { class: 'lb-mat__titulo' }, NOMES[m.classificador], el('span', { class: 'lb-mat__corte' }, ` (${corte(m)})`)),
    el('table', { class: 'tabela lb-mat__tabela' },
      el('caption', { class: 'sr-only' }, `Matriz de confusão: ${NOMES[m.classificador]}`),
      el('thead', {}, el('tr', {}, el('td', {}), el('th', { scope: 'col', class: 'num' }, 'Alertou'), el('th', { scope: 'col', class: 'num' }, 'Não alertou'))),
      el('tbody', {},
        el('tr', {}, el('th', { scope: 'row' }, 'Pausou'),
          el('td', { class: 'num lb-cel lb-cel--acerto', title: 'Verdadeiros positivos' }, fmt.contagem(m.tp)),
          el('td', { class: 'num lb-cel', title: 'Falsos negativos: pausas sem aviso' }, fmt.contagem(m.fn))),
        el('tr', {}, el('th', { scope: 'row' }, 'Não pausou'),
          el('td', { class: 'num lb-cel', title: 'Falsos positivos: alarmes falsos' }, fmt.contagem(m.fp)),
          el('td', { class: 'num lb-cel lb-cel--acerto', title: 'Verdadeiros negativos' }, fmt.contagem(m.tn))))),
    el('dl', { class: 'lb-mat__metricas' },
      ...[['Encontra', fmt.pct(m.recall), 'recall: alertas certos ÷ pausas'], ['Acerta', fmt.pct(m.precisao), 'precisão: alertas certos ÷ alertas'],
          ['Alarme falso', fmt.pct(m.taxa_falso_alarme), 'alarmes falsos ÷ quem não pausou']]
        .map(([rotulo, valor, dica]) => el('div', { title: dica }, el('dt', {}, rotulo), el('dd', {}, valor)))));
  ui.matriz.querySelector('.lb-matrizes').replaceChildren(bloco(mod), bloco(reg));
  ui.matriz.querySelector('.lb-conclusao').textContent = `Com alarme falso parecido (${fmt.pct(mod.taxa_falso_alarme)} × `
    + `${fmt.pct(reg.taxa_falso_alarme)}), o modelo avisa ${mod.tp} das ${mod.pausas} pausas e a regra simples, ${reg.tp}. `
    + `${dados.lab.risco.conclusao}`;
}

// --------------------------------------------------------------------------- CLV

function desenharClv() {
  const c = dados.lab.clv;
  const lista = dados.clv;
  subtitulo(ui.clv.painel).textContent = `Margem esperada por household nas próximas ${c.horizonte_semanas} semanas, com o IC de 95% do RAG. `
    + `A margem de ${fmt.pct(c.margem, 0)} é premissa (a base não tem custo): o CLV escala com ela. `
    + `Total: US$ ${fmt.contagem(c.clv_total)} (IC US$ ${fmt.contagem(c.clv_total_ic[0])} a US$ ${fmt.contagem(c.clv_total_ic[1])}) `
    + `em ${fmt.contagem(c.households)} households.`;
  const cor = (s) => SEG_CORES[s] ?? COR.outros;
  const opacidade = (i) => (apagado(lista[i].segmento) ? OPACIDADE_FORA : 1);
  const titulo = 'CLV médio por segmento';
  const dica = (x) => `<b>${x.segmento}</b> · ${fmt.contagem(x.households)} households<br>CLV médio ${fmt.usd(x.clv_medio)} `
    + `(IC 95%: ${fmt.usd(x.clv_ic_inf)} a ${fmt.usd(x.clv_ic_sup)})<br>Total do segmento: ${fmt.usdGrande(x.clv_total)} de margem`
    + `<br>Receita esperada por household: ${fmt.usd(x.receita_esperada)}`;
  ui.graficos.clv.setOption({
    ...base(titulo, `${titulo}: ${lista.map((x) => `${x.segmento} ${fmt.usd(x.clv_medio)}`).join('; ')}.`),
    grid: { left: 8, right: 56, top: 8, bottom: 22, containLabel: true },
    tooltip: { trigger: 'item' },
    yAxis: { type: 'category', inverse: true, data: lista.map((x) => x.segmento), axisLabel: { color: COR.textoSecundario, fontSize: 11, interval: 0 } },
    xAxis: { type: 'value', min: 0, axisLabel: { hideOverlap: true, formatter: (v) => `US$ ${fmt.contagem(v)}` } },
    series: [
      bigodes('IC 95%', lista.map((x, i) => [x.clv_ic_inf, x.clv_ic_sup, i]), opacidade),
      { name: 'CLV médio', type: 'scatter', z: 3, symbolSize: 12,
        data: lista.map((x, i) => ({ value: [x.clv_medio, i], x,
          itemStyle: { color: cor(x.segmento), borderColor: COR.superficie, borderWidth: 2, opacity: opacidade(i) } })),
        tooltip: { formatter: (p) => dica(p.data.x) } },
      // Rótulo do valor logo depois do fim do intervalo (série sem símbolo, só para posicionar o texto).
      { name: 'Rótulos', type: 'scatter', silent: true, symbolSize: 0, tooltip: { show: false },
        data: lista.map((x, i) => ({ value: [x.clv_ic_sup, i],
          label: { show: true, position: 'right', distance: 8, color: COR.textoPrimario, fontSize: 11, opacity: opacidade(i),
                   formatter: () => `US$ ${fmt.contagem(x.clv_medio)}` } })) },
    ],
  }, { notMerge: true });
  preencherTabela(ui.clv.tabela, [
    { titulo: 'Segmento', valor: (x) => x.segmento },
    { titulo: 'Households', valor: (x) => fmt.contagem(x.households), numero: true },
    { titulo: 'CLV médio', valor: (x) => fmt.usd(x.clv_medio), numero: true },
    { titulo: 'IC 95%', valor: (x) => `${fmt.usd(x.clv_ic_inf)} a ${fmt.usd(x.clv_ic_sup)}`, numero: true },
    { titulo: 'Total', valor: (x) => fmt.usdGrande(x.clv_total), numero: true },
  ], lista, titulo);

  // Backtest do RAG: a mesma regra aplicada um ano antes, contra o que de fato aconteceu nas 26 semanas seguintes.
  const melhor = (x) => Math.abs(x.backtest_erro_metodo_pct) <= Math.abs(x.backtest_erro_ingenuo_pct);
  ui.clv.painel.querySelector('.lb-backtest').replaceChildren(
    el('p', { class: 'lb-backtest__titulo' }, `Backtest de ${c.backtest_horizonte_semanas} semanas: o método errou `
      + `${fmt.pct(Math.abs(c.backtest_erro_metodo_pct))} no total, contra ${fmt.pct(Math.abs(c.backtest_erro_ingenuo_pct))} da regra ingênua `
      + `(gasto futuro = gasto passado), e ganhou em ${c.backtest_grupos_em_que_ganha} de ${c.backtest_grupos} grupos.`),
    el('table', { class: 'tabela lb-backtest__tabela' },
      el('caption', { class: 'sr-only' }, 'Backtest do CLV por segmento'),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Segmento'), el('th', { scope: 'col', class: 'num' }, 'Gasto real'),
        el('th', { scope: 'col', class: 'num' }, 'Erro do método'), el('th', { scope: 'col', class: 'num' }, 'Erro ingênuo'))),
      el('tbody', {}, lista.map((x) => el('tr', { class: apagado(x.segmento) ? 'lb-linha--fora' : null },
        el('th', { scope: 'row' }, x.segmento),
        el('td', { class: 'num' }, fmt.usdGrande(x.backtest_real)),
        el('td', { class: `num${melhor(x) ? ' lb-melhor' : ''}` }, sinal(x.backtest_erro_metodo_pct)),
        el('td', { class: `num${melhor(x) ? '' : ' lb-melhor'}` }, sinal(x.backtest_erro_ingenuo_pct)))))));
}

// --------------------------------------------------------------------------- teste de desconto

function desenharDesconto() {
  const d = dados.lab.desconto;
  const pares = dados.pares;
  const maior = pares.reduce((a, p) => (Math.abs(p.diferenca_pp) > Math.abs(a.diferenca_pp) ? p : a));
  subtitulo(ui.desconto.painel).textContent = `${d.conclusao} % de desconto de cada household nas 26 semanas (${fmt.contagem(d.households)} households). `
    + 'Ponto: diferença das medianas; barra: IC de 95%; ponto cheio = par significativo no teste par a par (Mann-Whitney com ajuste).';
  ui.desconto.painel.querySelector('.lb-estatisticas').replaceChildren(
    ...[['Existe diferença?', `Sim, p = ${fmt.decimal(d.p_valor, 4)}`, `Kruskal-Wallis, H = ${fmt.decimal(d.kruskal_h, 2)}; significativo abaixo de ${fmt.decimal(d.alfa, 2)}`],
        ['Ela importa?', `Não, η² = ${fmt.decimal(d.eta_quadrado, 4)}`, `tamanho do efeito; relevante a partir de ${fmt.decimal(d.eta_quadrado_relevante, 2)}`],
        ['Maior diferença', fmt.pp(Math.abs(maior.diferenca_pp)), `${maior.segmento_a} × ${maior.segmento_b}; relevante a partir de ${fmt.pp(d.diferenca_relevante_pp)}`]]
      .map(([rotulo, valor, dica]) => el('div', { title: dica }, el('dt', {}, rotulo), el('dd', {}, valor), el('span', { class: 'lb-estatisticas__nota' }, dica))));
  const limite = Math.ceil(100 * Math.max(0.02, ...pares.map((p) => Math.max(Math.abs(p.ic_inf), Math.abs(p.ic_sup))))) / 100;
  const opacidade = (i) => (apagado(pares[i].segmento_a, pares[i].segmento_b) ? OPACIDADE_FORA : 1);
  const rotulo = (p) => `${p.segmento_a} − ${p.segmento_b}`;
  const titulo = 'Diferença de mediana do % de desconto entre segmentos';
  const seg = (s) => dados.segmento.get(s);
  const dica = (p) => `<b>${rotulo(p)}</b><br>Medianas: ${p.segmento_a} ${fmt.pct(seg(p.segmento_a).mediana_pct)} · ${p.segmento_b} ${fmt.pct(seg(p.segmento_b).mediana_pct)}`
    + `<br>Diferença ${fmt.pp(p.diferenca_pp)} (IC 95%: ${fmt.pp(p.ic_inf)} a ${fmt.pp(p.ic_sup)})`
    + `<br>p ajustado ${fmt.decimal(p.p_ajustado, 3)}: ${p.significativo ? 'significativo' : 'não significativo'}`;
  ui.graficos.desconto.setOption({
    ...base(titulo, `${titulo}. ${d.conclusao} ${pares.map((p) => `${rotulo(p)}: ${fmt.pp(p.diferenca_pp)}`).join('; ')}.`),
    grid: { left: 8, right: 24, top: 24, bottom: 22, containLabel: true },
    tooltip: { trigger: 'item' },
    yAxis: { type: 'category', inverse: true, data: pares.map(rotulo), axisLabel: { color: COR.textoSecundario, fontSize: 11 } },
    xAxis: { type: 'value', min: -limite, max: limite, interval: 0.01, axisLabel: { hideOverlap: true, formatter: (v) => fmt.pp(v) } },
    series: [
      bigodes('IC 95%', pares.map((p, i) => [p.ic_inf, p.ic_sup, i]), opacidade),
      { name: 'Diferença de mediana', type: 'scatter', z: 3, symbolSize: 10,
        data: pares.map((p, i) => ({ value: [p.diferenca_pp, i], p,
          itemStyle: { color: p.significativo ? COR.textoPrimario : COR.superficie, borderColor: COR.textoPrimario, borderWidth: 2, opacity: opacidade(i) } })),
        tooltip: { formatter: (q) => dica(q.data.p) },
        markArea: { silent: true, itemStyle: { color: COR.sombreado, opacity: 0.8 },
                    label: { position: 'insideTop', color: COR.textoMudo, fontSize: 11, distance: -16 },
                    data: [[{ xAxis: -d.diferenca_relevante_pp, name: `menos de ${fmt.decimal(d.diferenca_relevante_pp * 100, 0)} p.p.: sem relevância prática` },
                            { xAxis: d.diferenca_relevante_pp }]] },
        markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: COR.eixo, type: 'solid' }, data: [{ xAxis: 0 }] } },
    ],
  }, { notMerge: true });
  preencherTabela(ui.desconto.tabela, [
    { titulo: 'Par', valor: rotulo },
    { titulo: 'Diferença', valor: (p) => fmt.pp(p.diferenca_pp), numero: true },
    { titulo: 'IC 95%', valor: (p) => `${fmt.pp(p.ic_inf)} a ${fmt.pp(p.ic_sup)}`, numero: true },
    { titulo: 'p ajustado', valor: (p) => fmt.decimal(p.p_ajustado, 3), numero: true },
    { titulo: 'Significativo', valor: (p) => (p.significativo ? 'sim' : 'não') },
  ], pares, titulo);
}
