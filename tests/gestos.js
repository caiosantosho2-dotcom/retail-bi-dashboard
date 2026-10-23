// Teste dos 4 gestos do modelo único de seleção (redesenho v3, 0.1) em cada gráfico e lista clicável, com clique real
// do mouse (Playwright MCP: browser_run_code_unsafe com filename = tests/gestos.js, painel aberto em localhost:8000).
// Para cada alvo, com dois itens A e B:
//   1. clique em A            -> só A selecionado
//   2. clique em A de novo    -> nada selecionado (volta ao total)
//   3. clique em A, Ctrl + B  -> A e B; Ctrl + B de novo -> só A
//   4. Esc                    -> nada (se o alvo abre um detalhe, o primeiro Esc fecha o detalhe e o segundo limpa)
//   5. clique em A, clique no fundo vazio do gráfico -> nada (só nos alvos com `fundo`)
// As posições são medidas de novo antes de cada clique: as etiquetas de filtro mudam a altura da linha de filtros.
async (page) => {
  // Alvos. item: { grafico: seletor do contêiner do ECharts, serie, indice } ou { dom: seletor, n } (n-ésimo elemento).
  const ALVOS = [
    { aba: 'aba-visao-geral', nome: 'Visão Geral: faturamento por departamento', dim: ['departamentos'],
      a: { grafico: '.vg-deptos .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.vg-deptos .painel__grafico', serie: 0, indice: 1 }, fundo: '.vg-deptos .painel__grafico' },
    { aba: 'aba-visao-geral', nome: 'Visão Geral: o que puxou a variação', dim: ['departamentos'],
      a: { grafico: '.vg-variacao .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.vg-variacao .painel__grafico', serie: 0, indice: 1 }, fundo: '.vg-variacao .painel__grafico' },
    { aba: 'aba-visao-geral', nome: 'Visão Geral: faturamento por segmento', dim: ['segmentos'],
      a: { grafico: '.vg-segmentos .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.vg-segmentos .painel__grafico', serie: 1, indice: 0 } },
    { aba: 'aba-categoria', nome: 'Categoria: lista de departamentos', dim: ['departamentos'],
      a: { dom: '.ct-lista .item-lista', n: 1 }, b: { dom: '.ct-lista .item-lista', n: 2 } },
    { aba: 'aba-categoria', nome: 'Categoria: quem compra', dim: ['segmentos'],
      a: { grafico: '.ct-quem-compra__grafico', serie: 0, indice: 0 }, b: { grafico: '.ct-quem-compra__grafico', serie: 1, indice: 0 }, fundo: '.ct-quem-compra__grafico' },
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: cards', dim: ['segmentos'], detalhe: true,
      a: { dom: '.sg-card', n: 0 }, b: { dom: '.sg-card', n: 1 } },
    // Na Roda o detalhe abre por cima dela (validação da R4): o teste fecha o detalhe com Esc depois de cada clique.
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: Roda', dim: ['segmentos'], fecharDetalhe: true,
      a: { grafico: '.cl-roda .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.cl-roda .painel__grafico', serie: 0, indice: 1 }, fundo: '.cl-roda .painel__grafico' },
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: matriz de migração', dim: ['segmentos'], antes: '.cl-roda .sg-modos button:nth-child(2)', depois: '.cl-roda .sg-modos button:nth-child(1)',
      a: { grafico: '.cl-roda .painel__grafico', serie: 0, indice: 1 }, b: { grafico: '.cl-roda .painel__grafico', serie: 0, indice: 2 }, fundo: '.cl-roda .painel__grafico' },
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: regiões (barras)', dim: ['regiao'],
      a: { grafico: '.cl-regioes .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.cl-regioes .painel__grafico', serie: 0, indice: 1 } },
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: regiões (uma bolha por região)', dim: ['regiao'], antes: '.cl-regioes .sg-modos button:nth-child(2)', depois: '.cl-regioes .sg-modos button:nth-child(1)',
      a: { grafico: '.cl-regioes .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.cl-regioes .painel__grafico', serie: 0, indice: 1 }, fundo: '.cl-regioes .painel__grafico' },
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: perfil das lojas', dim: ['perfil'],
      a: { grafico: '.cl-perfil .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.cl-perfil .painel__grafico', serie: 0, indice: 1 } },
    { aba: 'aba-clientes', nome: 'Clientes & Lojas: ranking (abre a ficha)', dim: ['loja'], unico: true,
      a: { grafico: '.cl-ranking .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.cl-ranking .painel__grafico', serie: 0, indice: 1 }, fundo: '.cl-ranking .painel__grafico' },
    { aba: 'aba-produtos', nome: 'Produtos: nó da rede', dim: ['departamentos'],
      a: { grafico: '.pd-rede .painel__grafico', serie: 2, indice: 0 }, b: { grafico: '.pd-rede .painel__grafico', serie: 2, indice: 1 }, fundo: '.pd-rede .painel__grafico' },
    { aba: 'aba-produtos', nome: 'Produtos: marca própria (linha)', dim: ['departamentos'],
      a: { dom: '.pd-tabela tbody tr', n: 0 }, b: { dom: '.pd-tabela tbody tr', n: 1 } },
  ];

  const espera = () => page.waitForTimeout(350);
  const ler = (dims) => page.evaluate(async (dims) => {
    const { estado } = await import('/js/app.js');
    const { selecionados } = await import('/js/selecao.js');
    return dims.map((d) => [...(d in estado.filtros ? estado.filtros[d] : selecionados(d))]);
  }, dims);
  const detalheAberto = () => page.evaluate(() => { const d = document.querySelector('.sg-detalhe'); return Boolean(d && !d.hidden); });
  const posicao = (item) => page.evaluate((item) => {
    if (item.dom) {
      const r = document.querySelectorAll(item.dom)[item.n].getBoundingClientRect();
      return [r.x + Math.min(40, r.width / 2), r.y + r.height / 2];
    }
    const dom = document.querySelector(item.grafico);
    const c = echarts.getInstanceByDom(dom);
    const r = dom.getBoundingClientRect();
    const serie = c.getModel().getSeriesByIndex(item.serie);
    const dados = serie.getData();
    let p;
    if (serie.type === 'series.graph') p = c.convertToPixel({ seriesIndex: item.serie }, dados.getItemLayout(item.indice));
    else if (serie.type === 'series.custom' || serie.type === 'series.heatmap') {
      const v = serie.getRawValue(item.indice);
      p = c.convertToPixel({ seriesIndex: item.serie }, [v[0], v[1]]);
    } else {
      const l = dados.getItemLayout(item.indice);
      p = Array.isArray(l) ? l : [l.x + l.width / 2, l.y + l.height / 2];
    }
    return [r.x + p[0], r.y + p[1]];
  }, item);
  const clicar = async (item, ctrl = false) => {
    const [x, y] = await posicao(item);
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.click(x, y);
    if (ctrl) await page.keyboard.up('Control');
    await espera();
    if (fecharDetalhe && await detalheAberto()) { await page.keyboard.press('Escape'); await espera(); }
  };
  const fundo = async (sel) => {
    // Um ponto vazio: canto inferior direito do gráfico, dentro dele.
    const [x, y] = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width - 6, r.y + r.height - 4]; }, sel);
    await page.mouse.click(x, y);
    await espera();
  };
  const tamanho = async (dims) => (await ler(dims))[0].length;

  const resultado = [];
  let fecharDetalhe = false;
  for (const alvo of ALVOS) {
    fecharDetalhe = Boolean(alvo.fecharDetalhe);
    await page.click(`#${alvo.aba}`);
    await page.waitForTimeout(700);
    if (alvo.antes) { await page.click(alvo.antes); await page.waitForTimeout(500); }
    const passos = [];
    const anotar = async (passo, esperado) => { const n = await tamanho(alvo.dim); passos.push({ passo, esperado, obtido: n, ok: n === esperado, valores: await ler(alvo.dim) }); };
    await clicar(alvo.a); await anotar('clique em A', 1);
    await clicar(alvo.a); await anotar('clique em A de novo', 0);
    await clicar(alvo.a); await clicar(alvo.b, true); await anotar('Ctrl + B', alvo.unico ? 1 : 2);
    if (!alvo.unico) { await clicar(alvo.b, true); await anotar('Ctrl + B de novo', 1); }
    await page.keyboard.press('Escape'); await espera();
    if (alvo.detalhe && await tamanho(alvo.dim) > 0) {
      passos.push({ passo: 'Esc fecha o detalhe', ok: !(await detalheAberto()) });
      await page.keyboard.press('Escape'); await espera();
    }
    await anotar('Esc', 0);
    if (alvo.fundo) { await clicar(alvo.a); await fundo(alvo.fundo); await anotar('clique no fundo', 0); }
    await page.keyboard.press('Escape'); await espera();
    if (alvo.depois) { await page.click(alvo.depois); await page.waitForTimeout(400); }
    resultado.push({ alvo: alvo.nome, ok: passos.every((p) => p.ok), passos: passos.filter((p) => !p.ok) });
  }
  return { ok: resultado.filter((r) => r.ok).length, total: resultado.length, falhas: resultado.filter((r) => !r.ok), alvos: resultado.map((r) => `${r.ok ? 'OK' : 'FALHA'} ${r.alvo}`) };
}
