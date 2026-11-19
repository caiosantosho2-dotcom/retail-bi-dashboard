// Aba Visão Geral (spec 5.1, painel v4): 6 KPIs, faturamento ao longo do tempo, faturamento por segmento e faturamento
// por departamento (com o marcador do ano anterior). Métricas que somam vêm dos cubos (somadas aqui); as que não somam,
// prontas de kpis_filtrados.json.
// Depois do tempo, os dois blocos de decisão (spec v4.1): quem o CRM aciona e onde agir no mix.
import { SEGMENTOS, SEM_SEGMENTO, chaveSubconjunto, departamentosPeriodo, gruposPeriodo, somarPeriodo } from '../agregados.js';
import { opcaoQuadrante, ordemDoGrafico } from '../charts/quadrante.js';
import { COR, FONTE, SEG_CORES, base, criarGrafico, textoSobre } from '../charts/tema.js';
import { TITULO_TEMPO, carregarTempo, desenharTempo } from '../charts/tempo.js';
import { el, erroDeCarga, etiquetaSegmento, painelGrafico, preencherTabela } from '../componentes.js';
import { linhas } from '../dados.js';
import { AVISO_COM_EM_PAUSA, CAPACIDADE_PADRAO, NOME_QUADRANTE, NOTA_FIXA_CRM, NOTA_SEM_CRESCIMENTO, NOTA_SO_EM_PAUSA, OBJETIVOS, OBJETIVO_PADRAO, capacidadesDe, destaquesDe,
         fraseHistorica, linhaCrm, notaCalibracao, notaRecorte, soEmPausa, subtituloCrm, temEmPausa } from '../decisao_textos.js';
import { fmt } from '../formatar.js';
import { OPACIDADE_FORA, clicar, ligarGrafico } from '../selecao.js';

const KPIS = [
  { metrica: 'faturamento', rotulo: 'Faturamento', formato: fmt.usdGrande, titulo: (v) => fmt.usd(v), soma: true },
  { metrica: 'cestas', rotulo: 'Cestas', formato: fmt.contagem },
  { metrica: 'ticket_medio', rotulo: 'Ticket médio', formato: fmt.usd },
  { metrica: 'itens_por_cesta', rotulo: 'Itens por cesta', formato: (v) => fmt.decimal(v, 1) },
  // Mais desconto não é bom nem ruim por si: a seta fica, a cor de status não.
  { metrica: 'desconto_pct', rotulo: '% de desconto', formato: (v) => fmt.pct(v), neutro: true, soma: true },
  { metrica: 'clientes_ativos', rotulo: 'Clientes ativos', formato: fmt.contagem,
    dica: 'Comprou nas últimas 8 semanas do período. 4, 13 e 26 semanas terminam na mesma semana, por isso o número se repete.' },
];

const NOMES_PERIODO = { '4s': 'últimas 4 semanas', '13s': '13 semanas', '26s': '26 semanas', base: 'base inteira' };
const SEM_FILTRO = { segmentos: new Set(), departamentos: new Set() };
const TOP_DEPTOS = 10;
const PERIODOS_QUADRANTE = ['4s', '13s', '26s'];   // a base inteira não tem arquivo (G2c): sem ano anterior, sem crescimento

let dados;
let blocos;
// Os seletores do bloco do CRM são locais: não são filtro global, e o "Limpar tudo" não mexe neles.
const crm = { capacidade: CAPACIDADE_PADRAO, objetivo: OBJETIVO_PADRAO };

export async function iniciar(container) {
  const kpis = el('div', { class: 'kpis', role: 'list', 'aria-label': 'Indicadores do período' });
  const semanal = painelGrafico({ titulo: TITULO_TEMPO, subtitulo: '', classe: 'vg-semanal' });
  const segmentos = painelGrafico({ titulo: 'Faturamento por segmento', subtitulo: '', classe: 'vg-segmentos' });
  segmentos.painel.append(el('ul', { class: 'vg-segmentos__lista', 'aria-label': 'Faturamento de cada segmento' }));
  const deptos = painelGrafico({ titulo: 'Faturamento por departamento', subtitulo: '', classe: 'vg-deptos' });
  container.classList.add('vg');
  const acionar = montarCrm();
  const quadrante = montarQuadrante();
  container.replaceChildren(kpis, semanal.painel, segmentos.painel, acionar.painel, quadrante.painel, deptos.painel);

  blocos = { kpis, semanal, segmentos, deptos, acionar, quadrante,
             graficos: { semanal: criarGrafico(semanal.grafico), segmentos: criarGrafico(segmentos.grafico),
                         deptos: criarGrafico(deptos.grafico), mix: criarGrafico(acionar.mix),
                         quadrante: criarGrafico(quadrante.grafico) } };
  for (const nome of ['semanal', 'segmentos', 'deptos', 'quadrante']) {
    blocos[nome].aoAlternar((tabela) => { if (!tabela) blocos.graficos[nome].resize(); });
  }
  // O ponto do quadrante filtra o departamento, como as barras de departamento; os rótulos e os cortes são silenciosos.
  blocos.graficos.quadrante.on('click', (p) => {
    if (p.componentType === 'series') clicar('departamentos', p.name, p.event?.event);
  });
  ligarGrafico(blocos.graficos.quadrante, 'departamentos');
  // Modelo único de seleção (selecao.js): a barra de departamento filtra o departamento, a fatia do segmento filtra o
  // segmento. "Outros" e "Sem segmento" não filtram.
  blocos.graficos.deptos.on('click', (p) => {
    if (p.seriesName !== 'Ano anterior' && p.name !== 'Outros') clicar('departamentos', p.name, p.event?.event);
  });
  ligarGrafico(blocos.graficos.deptos, 'departamentos');
  blocos.graficos.segmentos.on('click', (p) => {
    if (p.seriesName !== SEM_SEGMENTO) clicar('segmentos', p.seriesName, p.event?.event);
  });
  ligarGrafico(blocos.graficos.segmentos, 'segmentos');

  try {
    const [kf, cp, deps, tempo, acionamento, ...quadrantes] = await Promise.all([
      linhas('kpis_filtrados.json'), linhas('cubo_periodo.json'), linhas('departamentos.json'), carregarTempo(), linhas('acionamento_crm.json'),
      ...PERIODOS_QUADRANTE.map((p) => linhas(`departamentos_quadrante_${p}.json`))]);
    // Departamentos com menos de 0,1% do faturamento das 26 semanas (spec, seção 6): a variação deles leva ⚠.
    dados = { kpisFiltrados: kf, cuboPeriodo: cp, tempo, acionamento,
              quadrantes: Object.fromEntries(PERIODOS_QUADRANTE.map((p, i) => [p, quadrantes[i]])),
              pequenos: new Set(deps.filter((d) => d.amostra_pequena).map((d) => d.departamento)) };
  } catch (erro) {
    erroDeCarga(container, erro);
  }
}

export function atualizar(estado) {
  if (!dados) return;
  const filtros = estado.filtros ?? SEM_FILTRO;
  Object.values(blocos.graficos).forEach((g) => g.resize());
  desenharKpis(estado.periodo, filtros);
  desenharTempo(blocos.semanal, blocos.graficos.semanal, { linhas: dados.tempo[estado.periodo], periodo: estado.periodo, filtros, lojas: lojasComparaveis(estado.periodo) });
  desenharSegmentos(estado.periodo, filtros);
  desenharCrm(estado.manifest);
  desenharQuadrante(estado.periodo, filtros);
  desenharDeptos(estado.periodo, filtros);
}

// --------------------------------------------------------------------------- bloco 1: quem o CRM deve acionar

function montarCrm() {
  const titulo = el('h2', { class: 'painel__titulo', id: 'vg-crm-titulo' }, 'Quem o CRM deve acionar');
  const partes = {
    subtitulo: el('p', { class: 'painel__subtitulo' }),
    capacidades: el('div', { class: 'vg-crm__opcoes', role: 'group', 'aria-label': 'Capacidade de contato, em clientes' }),
    objetivos: el('div', { class: 'vg-crm__opcoes', role: 'group', 'aria-label': 'Objetivo da lista' }),
    numeros: el('dl', { class: 'vg-crm__numeros' }),
    mix: el('div', { class: 'vg-crm__mix' }),
    legenda: el('ul', { class: 'vg-crm__legenda', 'aria-label': 'Clientes acionados por segmento' }),
    calibracao: el('p', { class: 'vg-crm__nota' }),
    filtros: el('p', { class: 'vg-crm__nota' }),
    historico: el('ul', { class: 'vg-crm__historico', 'aria-label': 'Modelo contra a regra simples, por capacidade' }),
  };
  const painel = el('section', { class: 'painel vg-crm', 'aria-labelledby': 'vg-crm-titulo' },
    el('header', {}, titulo, partes.subtitulo),
    el('div', { class: 'vg-crm__controles' }, partes.capacidades, partes.objetivos),
    el('div', { class: 'vg-crm__corpo' },
      el('div', {},
        el('h3', { class: 'vg-crm__secao' }, 'Esta semana'),
        partes.numeros, partes.mix, partes.legenda, partes.calibracao,
        el('p', { class: 'vg-crm__nota vg-crm__nota--fixa' }, NOTA_FIXA_CRM),
        partes.filtros,
        el('p', { class: 'vg-crm__nota' }, el('a', { class: 'rodape__link', href: 'metodologia.html' }, 'Como o modelo foi avaliado'))),
      el('div', {},
        el('h3', { class: 'vg-crm__secao' }, 'No teste histórico'),
        el('p', { class: 'vg-crm__nota' }, 'Modelo contra a regra simples ("mais tempo sem comprar"), na média das fotos do teste.'),
        partes.historico)));
  return { painel, ...partes };
}

const botaoOpcao = (rotulo, ligado, aoClicar) => el('button', { class: 'filtro', type: 'button', 'aria-pressed': String(ligado), onclick: aoClicar }, rotulo);

function numeroCrm(rotulo, valor, exato, dica) {
  return el('div', { title: dica ?? null },
    el('dt', {}, rotulo, dica ? el('span', { class: 'kpi__dica', 'aria-label': dica }, ' ⓘ') : null),
    el('dd', { title: exato }, valor));
}

/** Desenha só com o que está no arquivo: troca junto com os dois seletores (números, mix, notas e comparação). */
function desenharCrm(manifest) {
  const a = blocos.acionar;
  const modelo = linhaCrm(dados.acionamento, crm.capacidade, crm.objetivo, 'modelo');
  const redesenhar = (mudanca) => () => { Object.assign(crm, mudanca); desenharCrm(manifest); };

  a.subtitulo.textContent = subtituloCrm(crm.capacidade, crm.objetivo);
  a.capacidades.replaceChildren(el('span', { class: 'filtros__rotulo' }, 'Capacidade'),
    ...capacidadesDe(dados.acionamento).map((n) => botaoOpcao(fmt.contagem(n), n === crm.capacidade, redesenhar({ capacidade: n }))));
  a.objetivos.replaceChildren(el('span', { class: 'filtros__rotulo' }, 'Objetivo'),
    ...Object.entries(OBJETIVOS).map(([chave, o]) => botaoOpcao(o.rotulo, chave === crm.objetivo, redesenhar({ objetivo: chave }))));

  a.numeros.replaceChildren(
    numeroCrm('Clientes acionados', fmt.contagem(modelo.capacidade), fmt.contagem(modelo.capacidade)),
    numeroCrm('Pausas esperadas', fmt.decimal(modelo.pausas_esperadas, 1), fmt.decimal(modelo.pausas_esperadas, 2)),
    numeroCrm('Faturamento de 26 s em jogo', fmt.usdGrande(modelo.faturamento_26s_em_jogo), fmt.usd(modelo.faturamento_26s_em_jogo),
      'Soma do faturamento de 26 semanas dos clientes da lista. Não é o dinheiro em risco.'));

  const mix = SEGMENTOS.map((s) => ({ segmento: s, clientes: modelo.mix_segmentos[s] }));
  const presentes = mix.filter((m) => m.clientes > 0);
  const tituloMix = `Clientes acionados por segmento, capacidade ${modelo.capacidade}`;
  blocos.graficos.mix.setOption({
    ...base(tituloMix, `${tituloMix}: ${mix.map((m) => `${m.segmento} ${m.clientes}`).join('; ')}.`),
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    tooltip: { trigger: 'item', formatter: (p) => `${p.seriesName}: ${fmt.contagem(p.value)} de ${fmt.contagem(modelo.capacidade)} clientes` },
    xAxis: { type: 'value', max: modelo.capacidade, show: false },
    yAxis: { type: 'category', data: ['Clientes'], show: false },
    // O segmento não se aplica a este bloco: a barra só informa, sem gesto de seleção.
    series: presentes.map((m, i) => ({
      name: m.segmento, type: 'bar', stack: 'mix', barWidth: 20, cursor: 'default', data: [m.clientes],
      itemStyle: { color: SEG_CORES[m.segmento], borderColor: COR.superficie, borderWidth: 1,
                   borderRadius: [i === 0 ? 4 : 0, i === presentes.length - 1 ? 4 : 0, i === presentes.length - 1 ? 4 : 0, i === 0 ? 4 : 0] },
    })),
  }, { notMerge: true });
  a.legenda.replaceChildren(...mix.map((m) => el('li', { class: 'vg-crm__legenda-item' },
    etiquetaSegmento(m.segmento, SEG_CORES[m.segmento]), el('span', { class: 'vg-crm__contagem' }, fmt.contagem(m.clientes)))));

  a.calibracao.textContent = notaCalibracao(modelo);
  const foto = manifest?.janelas?.['26s']?.semana_fim;
  a.filtros.textContent = `Foto fixa${foto ? ` da semana ${foto}` : ''}: não muda com o período nem com o segmento. O departamento não se aplica.`;

  a.historico.replaceChildren(...capacidadesDe(dados.acionamento).map((n) => {
    const f = fraseHistorica(crm.objetivo, linhaCrm(dados.acionamento, n, crm.objetivo, 'modelo'), linhaCrm(dados.acionamento, n, crm.objetivo, 'regra_simples'));
    return el('li', { class: 'vg-crm__frase', title: f.detalhe, 'aria-current': n === crm.capacidade ? 'true' : null, dataset: { capacidade: n, vencedor: f.vencedor } },
      `${f.texto} `, el('strong', {}, f.conclusao));
  }));
}

// --------------------------------------------------------------------------- bloco 2: onde agir no mix

function montarQuadrante() {
  const p = painelGrafico({ titulo: 'Onde agir no mix de departamentos', subtitulo: '', classe: 'vg-quadrante' });
  const lista = el('ol', { class: 'vg-quadrante__lista', 'aria-label': 'Departamentos para defender primeiro' });
  const nota = el('p', { class: 'vg-quadrante__nota', role: 'status' });
  const titulo = el('h3', { class: 'vg-crm__secao' }, 'Defender primeiro');
  const lado = el('div', { class: 'vg-quadrante__lado' }, titulo, lista);
  p.painel.append(lado, nota);
  return { ...p, lado, lista, nota, botao: p.painel.querySelector('.botao-tabela') };
}

/** Sem gráfico (base inteira ou recorte vazio) só a nota fica; ao voltar, o gráfico ou a tabela reaparecem como estavam. */
function mostrarGraficoQuadrante(mostrar) {
  const q = blocos.quadrante;
  const tabela = q.botao.getAttribute('aria-pressed') === 'true';
  q.grafico.hidden = !mostrar || tabela;
  q.tabela.hidden = !mostrar || !tabela;
  q.botao.hidden = !mostrar;
  q.lado.hidden = !mostrar;
  q.painel.dataset.vazio = String(!mostrar);
  if (mostrar) blocos.graficos.quadrante.resize();
}

function desenharQuadrante(periodo, filtros) {
  const q = blocos.quadrante;
  const subconjunto = chaveSubconjunto(filtros.segmentos);
  const recorte = dados.quadrantes[periodo]?.filter((l) => l.subconjunto === subconjunto) ?? [];
  const segmentos = filtros.segmentos.size ? [...filtros.segmentos].join(', ') : 'todos os segmentos';
  const semPeriodo = periodo === 'base';

  if (semPeriodo || !recorte.length || soEmPausa(subconjunto)) {
    subtitulo(q.painel, `${NOMES_PERIODO[periodo]}, ${segmentos}.`);
    q.nota.textContent = semPeriodo ? NOTA_SEM_CRESCIMENTO : soEmPausa(subconjunto) ? NOTA_SO_EM_PAUSA : notaRecorte(recorte);
    mostrarGraficoQuadrante(false);
    return;
  }

  mostrarGraficoQuadrante(true);
  const { corte_participacao: corteP, corte_crescimento: corteC } = recorte[0];
  subtitulo(q.painel, `${NOMES_PERIODO[periodo]}, ${segmentos}, lojas comparáveis. Cortes: participação ${fmt.pct(corteP)} (mediana) e crescimento ${fmt.pct(corteC)} (total do recorte). `
    + 'Departamentos com amostra pequena ficam de fora. Clique para filtrar.');
  const titulo = `Onde agir no mix de departamentos, ${NOMES_PERIODO[periodo]}`;
  blocos.graficos.quadrante.setOption(opcaoQuadrante(recorte, filtros.departamentos, titulo), { notMerge: true });

  const destaques = destaquesDe(recorte);
  q.lista.replaceChildren(...destaques.map((l) => el('li', { class: 'vg-quadrante__item', dataset: { departamento: l.departamento } },
    el('span', {}, l.departamento), el('span', { class: 'vg-quadrante__gap' }, fmt.gap(l.valor_gap)))));
  q.lado.querySelector('.vg-crm__secao').hidden = !destaques.length;
  // O departamento filtrado pode estar fora do recorte (amostra pequena): sem a nota, todos os pontos ficariam apagados sem motivo aparente.
  const ausentes = [...filtros.departamentos].filter((d) => !recorte.some((l) => l.departamento === d));
  q.nota.textContent = [temEmPausa(subconjunto) ? AVISO_COM_EM_PAUSA : '', notaRecorte(recorte), ausentes.length ? `Fora do gráfico por amostra pequena: ${ausentes.join(', ')}.` : ''].filter(Boolean).join(' ');

  preencherTabela(q.tabela, [
    { titulo: 'Departamento', valor: (l) => l.departamento },
    { titulo: 'Participação', valor: (l) => fmt.pct(l.participacao), numero: true },
    { titulo: 'Crescimento', valor: (l) => fmt.pct(l.crescimento), numero: true },
    { titulo: 'Quadrante', valor: (l) => NOME_QUADRANTE[l.quadrante] },
    { titulo: 'Contra o recorte', valor: (l) => fmt.gap(l.valor_gap), numero: true },
    { titulo: 'Destaque', valor: (l) => l.destaque ?? '', numero: true },
  ], ordemDoGrafico(recorte), titulo);
}

// --------------------------------------------------------------------------- KPIs

/** Os 6 KPIs do período e do filtro, no formato do card: valor, comparável, ano anterior, variação, lojas, amostra. */
function kpisDoFiltro(periodo, filtros) {
  const deps = [...filtros.departamentos];
  const departamento = deps.length === 0 ? 'todos' : deps.length === 1 ? deps[0] : null;
  const subconjunto = chaveSubconjunto(filtros.segmentos);
  const k = departamento && dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === subconjunto && l.departamento === departamento);
  const s = somarPeriodo(dados.cuboPeriodo, periodo, filtros);
  const razao = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
  const variacao = (a, b) => (a === null || b === null || b === 0 ? null : a / b - 1);
  const lojas = dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
  const saida = {
    faturamento: { valor: s.faturamento, valor_comparavel: s.faturamento_comparavel, valor_ano_anterior: s.faturamento_ano_anterior,
                   variacao_pct: variacao(s.faturamento_comparavel, s.faturamento_ano_anterior), lojas_comparaveis: lojas },
    desconto_pct: { valor: razao(s.desconto, s.valor_bruto), valor_comparavel: razao(s.desconto_comparavel, s.valor_bruto_comparavel),
                    valor_ano_anterior: razao(s.desconto_ano_anterior, s.valor_bruto_ano_anterior), lojas_comparaveis: lojas },
  };
  saida.desconto_pct.variacao_pct = variacao(saida.desconto_pct.valor_comparavel, saida.desconto_pct.valor_ano_anterior);
  for (const m of ['cestas', 'ticket_medio', 'itens_por_cesta', 'clientes_ativos']) {
    if (!departamento) { saida[m] = { indisponivel: true }; continue; }
    saida[m] = k
      ? { valor: k[m], valor_comparavel: k[`${m}_comparavel`], valor_ano_anterior: k[`${m}_ano_anterior`], variacao_pct: k[`${m}_variacao_pct`],
          lojas_comparaveis: m === 'clientes_ativos' ? null : k.lojas_comparaveis, amostra_pequena: k.amostra_pequena }
      : { valor: null, valor_comparavel: null, valor_ano_anterior: null, variacao_pct: null, lojas_comparaveis: null, semDados: true };
  }
  return saida;
}

function desenharKpis(periodo, filtros) {
  const valores = kpisDoFiltro(periodo, filtros);
  const cards = KPIS.map((cfg) => {
    const k = valores[cfg.metrica];
    if (k.semDados) {
      return el('article', { class: 'kpi', role: 'listitem' },
        el('h3', { class: 'kpi__rotulo' }, cfg.rotulo),
        el('p', { class: 'kpi__valor' }, '—'),
        el('p', { class: 'kpi__nota' }, 'sem compras neste recorte'));
    }
    if (k.indisponivel) {
      return el('article', { class: 'kpi', role: 'listitem' },
        el('h3', { class: 'kpi__rotulo' }, cfg.rotulo),
        el('p', { class: 'kpi__valor' }, '—'),
        el('p', { class: 'kpi__nota' }, 'selecione um departamento para ver este indicador'));
    }
    let variacao;
    if (k.variacao_pct === null || k.variacao_pct === undefined) {
      variacao = el('p', { class: 'kpi__nota' }, periodo === 'base' ? 'sem ano anterior na base' : 'sem comparação');
    } else {
      const tom = cfg.neutro ? 'neutro' : k.variacao_pct >= 0 ? 'bom' : 'critico';
      const lojas = k.lojas_comparaveis === null ? 'sem filtro de loja' : `${fmt.contagem(k.lojas_comparaveis)} lojas comparáveis`;
      variacao = el('p', { class: 'kpi__variacao' },
        el('span', { class: `variacao variacao--${tom}` }, fmt.variacao(k.variacao_pct)),
        ' vs ano anterior',
        el('span', { class: 'kpi__nota' }, lojas));
    }
    return el('article', { class: 'kpi', role: 'listitem', title: cfg.dica || null },
      el('h3', { class: 'kpi__rotulo' }, cfg.rotulo, cfg.dica ? el('span', { class: 'kpi__dica', 'aria-label': cfg.dica }, ' ⓘ') : null),
      el('p', { class: 'kpi__valor', title: cfg.titulo && k.valor !== null ? cfg.titulo(k.valor) : null }, cfg.formato(k.valor)),
      variacao,
      k.amostra_pequena ? el('p', { class: 'aviso-amostra' }, '⚠ amostra pequena') : null);
  });
  blocos.kpis.replaceChildren(...cards);
}

// --------------------------------------------------------------------------- comuns

/** Subtítulo de um painel de gráfico, trocado a cada desenho. */
function subtitulo(painel, texto) {
  const p = painel.querySelector('.painel__subtitulo') ?? painel.querySelector('.painel__titulo').insertAdjacentElement('afterend', el('p', { class: 'painel__subtitulo' }));
  p.textContent = texto;
}

const lojasComparaveis = (periodo) => dados.kpisFiltrados.find((l) => l.periodo === periodo && l.subconjunto === 'todos' && l.departamento === 'todos').lojas_comparaveis;
const variacaoDe = (atual, anterior) => (atual === null || !anterior ? null : atual / anterior - 1);
/** Variação com o aviso de amostra pequena nos departamentos com menos de 0,1% do faturamento. */
const variacaoDep = (d) => (dados.pequenos.has(d.departamento) ? `⚠ ${fmt.variacao(d.variacao)}` : fmt.variacao(d.variacao));
const avisoDep = (d) => (dados.pequenos.has(d.departamento) ? '<br>⚠ amostra pequena: menos de 0,1% do faturamento' : '');

// --------------------------------------------------------------------------- faturamento por segmento

function desenharSegmentos(periodo, filtros) {
  // O gráfico que filtra não se filtra: mostra todos os grupos e destaca os segmentos selecionados.
  const grupos = gruposPeriodo(dados.cuboPeriodo, periodo, filtros).filter((g) => g.faturamento > 0);
  const total = grupos.reduce((a, g) => a + g.faturamento, 0);
  grupos.forEach((g) => { g.pct = total ? g.faturamento / total : 0; });
  const selecionados = filtros.segmentos;
  const fora = (g) => selecionados.size > 0 && !selecionados.has(g);
  const cor = (g) => (g === SEM_SEGMENTO ? COR.outros : SEG_CORES[g]);
  const deps = [...filtros.departamentos];
  subtitulo(blocos.segmentos.painel, `${NOMES_PERIODO[periodo]}, ${deps.length ? deps.join(', ') : 'todos os departamentos'}, todas as lojas. `
    + 'O segmento é fixo (atributo do cliente, calculado nas 26 semanas). Clique para filtrar.');
  const titulo = `Faturamento por segmento, ${NOMES_PERIODO[periodo]}`;
  blocos.graficos.segmentos.setOption({
    ...base(titulo, `${titulo}: ` + grupos.map((g) => `${g.grupo} ${fmt.pct(g.pct)} (${fmt.usdGrande(g.faturamento)})`).join('; ') + '.'),
    grid: { left: 0, right: 0, top: 4, height: 22 },
    tooltip: { trigger: 'item', formatter: (p) => {
      const g = grupos[p.seriesIndex];
      const acao = g.grupo === SEM_SEGMENTO ? '<br>Clientes sem compra nas 26 semanas: não têm segmento'
        : selecionados.has(g.grupo) ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar; Ctrl + clique soma';
      return `${g.grupo}: ${fmt.usd(g.faturamento)} · ${fmt.pct(g.pct)}${acao}`;
    } },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: { type: 'category', data: ['Faturamento'], show: false },
    series: grupos.map((g, i) => ({
      name: g.grupo, type: 'bar', stack: 'total', barWidth: 22, cursor: g.grupo === SEM_SEGMENTO ? 'default' : 'pointer',
      data: [g.pct],
      itemStyle: { color: cor(g.grupo), opacity: fora(g.grupo) ? OPACIDADE_FORA : 1, borderColor: COR.superficie, borderWidth: 1,
                   borderRadius: i === 0 ? [4, 0, 0, 4] : i === grupos.length - 1 ? [0, 4, 4, 0] : 0 },
      label: { show: g.pct >= 0.08, position: 'inside', color: textoSobre(cor(g.grupo)), fontSize: FONTE.rotulo, formatter: () => fmt.pct(g.pct, 0) },
    })),
  }, { notMerge: true });
  // Rótulo direto de cada segmento (nome, % e valor), na ordem da barra: a cor nunca fica sozinha.
  blocos.segmentos.painel.querySelector('.vg-segmentos__lista').replaceChildren(...grupos.map((g) => el('li', {
    class: 'vg-segmentos__item', 'data-fora': String(fora(g.grupo)) },
  etiquetaSegmento(g.grupo, cor(g.grupo)),
  el('span', { class: 'vg-segmentos__pct' }, fmt.pct(g.pct)),
  el('span', { class: 'vg-segmentos__valor' }, fmt.usdGrande(g.faturamento)))));
  preencherTabela(blocos.segmentos.tabela, [
    { titulo: 'Segmento', valor: (g) => g.grupo },
    { titulo: 'Faturamento', valor: (g) => fmt.usd(g.faturamento), numero: true },
    { titulo: '% do total', valor: (g) => fmt.pct(g.pct), numero: true },
  ], grupos, titulo);
}

// --------------------------------------------------------------------------- departamentos (com o ano anterior)

function desenharDeptos(periodo, filtros) {
  // O gráfico que filtra não se filtra: mostra todos os departamentos e destaca os selecionados (cross-filter).
  // Com ano anterior, as barras são das lojas comparáveis do período, para o traço do ano anterior ser das mesmas lojas.
  const selecionados = filtros.departamentos;
  const comAnterior = periodo !== 'base';
  const lista = departamentosPeriodo(dados.cuboPeriodo, periodo, filtros)
    .map((d) => ({ departamento: d.departamento, valor: (comAnterior ? d.faturamento_comparavel : d.faturamento) ?? 0,
                   anterior: comAnterior ? d.faturamento_ano_anterior ?? 0 : null }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.departamento.localeCompare(b.departamento));
  const total = lista.reduce((a, d) => a + d.valor, 0);
  const linhasDeps = lista.filter((d, i) => i < TOP_DEPTOS || selecionados.has(d.departamento));
  const resto = lista.filter((d) => !linhasDeps.includes(d));
  if (resto.length) {
    linhasDeps.push({ departamento: 'Outros', valor: resto.reduce((a, d) => a + d.valor, 0),
                      anterior: comAnterior ? resto.reduce((a, d) => a + d.anterior, 0) : null });
  }
  linhasDeps.forEach((d) => { d.pct = d.valor / total; d.variacao = comAnterior ? variacaoDe(d.valor, d.anterior) : null; });
  const fora = (d) => selecionados.size > 0 && !selecionados.has(d.departamento);
  subtitulo(blocos.deptos.painel, comAnterior
    ? `Nas ${fmt.contagem(lojasComparaveis(periodo))} lojas comparáveis; o traço branco é o mesmo período um ano antes, nas mesmas lojas. Clique para filtrar.`
    : 'Todas as lojas: a base inteira não tem ano anterior. Clique para filtrar.');
  const titulo = `Faturamento por departamento, ${NOMES_PERIODO[periodo]}`;
  const nomes = linhasDeps.map((d) => d.departamento);
  blocos.graficos.deptos.setOption({
    ...base(titulo, `${titulo}. Barras horizontais em ordem decrescente: `
      + linhasDeps.map((d) => `${d.departamento} ${fmt.usdGrande(d.valor)}${comAnterior ? `, ${fmt.variacao(d.variacao)} contra ${fmt.usdGrande(d.anterior)} um ano antes` : ''}`).join('; ') + '.'),
    grid: { left: 8, right: 104, top: comAnterior ? 22 : 4, bottom: 4, containLabel: true },
    legend: comAnterior ? { top: 0, right: 0, data: ['Faturamento', 'Ano anterior'], selectedMode: false } : undefined,
    tooltip: { trigger: 'item', formatter: (p) => {
      const d = linhasDeps[p.dataIndex];
      const acao = d.departamento === 'Outros' ? '' : selecionados.has(d.departamento)
        ? '<br>Clique de novo para desfazer' : '<br>Clique para filtrar; Ctrl + clique soma';
      const anterior = comAnterior ? `<br>Um ano antes: ${fmt.usd(d.anterior)} · ${fmt.variacao(d.variacao)}` : '';
      return `${d.departamento}<br>${fmt.usd(d.valor)} · ${fmt.pct(d.pct)} do período${anterior}${avisoDep(d)}${acao}`;
    } },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', inverse: true, data: nomes, axisLabel: { color: COR.textoSecundario, fontSize: FONTE.rotulo }, axisLine: { show: false } },
    series: [
      { name: 'Faturamento', type: 'bar', barMaxWidth: 16, barCategoryGap: '30%', cursor: 'pointer',
        data: linhasDeps.map((d) => ({ value: d.valor,
          itemStyle: { color: d.departamento === 'Outros' ? COR.outros : COR.serie, borderRadius: [0, 4, 4, 0], opacity: fora(d) ? OPACIDADE_FORA : 1 } })),
        itemStyle: { color: COR.serie } },
      ...(comAnterior ? [{
        // O traço do ano anterior: uma marca fina sobre a barra, na mesma escala (sem segundo eixo).
        name: 'Ano anterior', type: 'scatter', symbol: 'rect', symbolSize: [3, 20], cursor: 'pointer', z: 3,
        data: linhasDeps.map((d) => ({ value: [d.anterior, d.departamento], itemStyle: { opacity: fora(d) ? OPACIDADE_FORA : 1 } })),
        itemStyle: { color: COR.textoPrimario },
      }] : []),
      // Rótulo depois da barra e do traço (o que for mais longe), para o traço nunca cobrir o número.
      { name: 'rótulo', type: 'scatter', symbolSize: 0, silent: true, tooltip: { show: false },
        data: linhasDeps.map((d) => ({ value: [Math.max(d.valor, d.anterior ?? 0), d.departamento], label: { color: fora(d) ? COR.textoMudo : COR.textoSecundario } })),
        label: { show: true, position: 'right', distance: 6, color: COR.textoSecundario, fontSize: FONTE.rotulo,
                 formatter: (p) => { const d = linhasDeps[p.dataIndex]; return `${fmt.usdGrande(d.valor)} · ${comAnterior ? variacaoDep(d) : fmt.pct(d.pct, 0)}`; } } },
    ],
  }, { notMerge: true });
  preencherTabela(blocos.deptos.tabela, [
    { titulo: 'Departamento', valor: (d) => d.departamento },
    { titulo: comAnterior ? 'Faturamento (comparáveis)' : 'Faturamento', valor: (d) => fmt.usd(d.valor), numero: true },
    { titulo: '% do período', valor: (d) => fmt.pct(d.pct), numero: true },
    ...(comAnterior ? [{ titulo: 'Um ano antes', valor: (d) => fmt.usd(d.anterior), numero: true },
                       { titulo: 'Variação', valor: (d) => fmt.variacao(d.variacao), numero: true }] : []),
    { titulo: 'No filtro', valor: (d) => (selecionados.has(d.departamento) ? 'sim' : '') },
  ], linhasDeps, titulo);
}
