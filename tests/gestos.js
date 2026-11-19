// Teste dos 4 gestos do modelo único de seleção em cada gráfico e lista clicável, com clique real do mouse
// (Playwright MCP: browser_run_code_unsafe com filename = tests/gestos.js, painel aberto em localhost:8000).
// Cada execução testa UMA aba e a próxima execução passa para a seguinte: rode 3 vezes (passos pequenos, notebook com pouca
// memória). A resposta diz qual aba rodou e quantas faltam.
// Para cada alvo, com dois itens A e B:
//   1. clique em A            -> só A selecionado
//   2. clique em A de novo    -> nada selecionado (volta ao total)
//   3. clique em A, Ctrl + B  -> A e B; Ctrl + B de novo -> só A
//   4. Esc                    -> nada
//   5. clique em A, clique no fundo vazio do gráfico -> nada (só nos alvos com `fundo`)
// Os alvos com `naoFiltra` (o gráfico de tempo) não têm seleção: o ponto só mostra o tooltip, como no gráfico que ele
// substituiu. Neles o teste prova que o clique no ponto não seleciona nem limpa nada e que o filtro de segmento muda a linha.
// As posições são medidas de novo antes de cada clique: as etiquetas de filtro mudam a altura da linha de filtros.
async (page) => {
  // v4.2: no celular os filtros ficam no painel aberto pelo botão "Filtros"; o teste abre e fecha como a pessoa faria.
  const naLateral = async (acao) => {
    const botao = page.locator('#abrir-filtros');
    const celular = await botao.isVisible();
    if (celular) { await botao.click(); await page.waitForTimeout(250); }
    await acao();
    if (celular) { await page.click('#fechar-filtros'); await page.waitForTimeout(250); }
  };
  // Alvos. item: { grafico: seletor do contêiner do ECharts, serie, indice } ou { dom: seletor, n } (n-ésimo elemento).
  const ALVOS = [
    { aba: 'aba-visao-geral', nome: 'Visão Geral: faturamento ao longo do tempo', naoFiltra: true, serie: 1, grafico: '.vg-semanal .painel__grafico' },
    { aba: 'aba-visao-geral', nome: 'Visão Geral: faturamento por departamento', dim: ['departamentos'],
      a: { grafico: '.vg-deptos .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.vg-deptos .painel__grafico', serie: 0, indice: 1 }, fundo: '.vg-deptos .painel__grafico' },
    { aba: 'aba-visao-geral', nome: 'Visão Geral: faturamento por segmento', dim: ['segmentos'],
      a: { grafico: '.vg-segmentos .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.vg-segmentos .painel__grafico', serie: 1, indice: 0 } },
    // Os pontos vêm do maior para o menor: os dois primeiros são os mais isolados do gráfico.
    { aba: 'aba-visao-geral', nome: 'Visão Geral: onde agir no mix', dim: ['departamentos'],
      a: { grafico: '.vg-quadrante .painel__grafico', serie: 0, indice: 0 }, b: { grafico: '.vg-quadrante .painel__grafico', serie: 0, indice: 1 }, fundo: '.vg-quadrante .painel__grafico' },
    { aba: 'aba-categoria', nome: 'Categoria: faturamento ao longo do tempo', naoFiltra: true, serie: 1, grafico: '.ct-semanal .painel__grafico' },
    { aba: 'aba-categoria', nome: 'Categoria: lista de departamentos', dim: ['departamentos'],
      a: { dom: '.ct-lista .item-lista', n: 1 }, b: { dom: '.ct-lista .item-lista', n: 2 } },
    { aba: 'aba-categoria', nome: 'Categoria: quem compra', dim: ['segmentos'],
      a: { grafico: '.ct-quem-compra__grafico', serie: 0, indice: 0 }, b: { grafico: '.ct-quem-compra__grafico', serie: 1, indice: 0 }, fundo: '.ct-quem-compra__grafico' },
    // A rede é um grafo nas coordenadas do gráfico (cartesian2d): a posição do nó já vem em pixels (pixel: true).
    { aba: 'aba-produtos', nome: 'Cestas & Marcas: nó da rede (filtro de subcategoria)', dim: ['subcategoria'], unico: true,
      // Nós isolados (BEEF e CIGARETTES): no meio de GROCERY os nós se sobrepõem e o clique acerta o de cima.
      a: { grafico: '.pd-rede .painel__grafico', serie: 1, indice: 1, pixel: true }, b: { grafico: '.pd-rede .painel__grafico', serie: 1, indice: 12, pixel: true }, fundo: '.pd-rede .painel__grafico' },
    { aba: 'aba-produtos', nome: 'Cestas & Marcas: nome do departamento na rede', dim: ['departamentos'],
      // O nome fica acima da âncora (verticalAlign bottom): o clique é 8 px acima.
      a: { grafico: '.pd-rede .painel__grafico', serie: 2, indice: 0, dy: -8 }, b: { grafico: '.pd-rede .painel__grafico', serie: 2, indice: 1, dy: -8 } },
    { aba: 'aba-produtos', nome: 'Cestas & Marcas: marca própria (linha)', dim: ['departamentos'],
      a: { dom: '.pd-tabela tbody tr', n: 0 }, b: { dom: '.pd-tabela tbody tr', n: 1 } },
  ];

  const espera = () => page.waitForTimeout(350);
  const ler = (dims) => page.evaluate(async (dims) => {
    const { estado } = await import('/js/app.js');
    const { selecionados } = await import('/js/selecao.js');
    return dims.map((d) => [...(d in estado.filtros ? estado.filtros[d] : selecionados(d))]);
  }, dims);
  const posicao = (item) => page.evaluate((item) => {
    if (item.dom) {
      // Como nos gráficos: traz o item para a tela antes de medir (no celular a linha ficava fora da janela e o clique errava).
      const alvo = document.querySelectorAll(item.dom)[item.n];
      alvo.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = alvo.getBoundingClientRect();
      return [r.x + Math.min(40, r.width / 2), r.y + r.height / 2];
    }
    const dom = document.querySelector(item.grafico);
    // A Visão Geral rola desde a v4.1: o clique do mouse usa a posição na janela, então o gráfico precisa estar nela.
    dom.scrollIntoView({ block: 'center', behavior: 'instant' });
    const c = echarts.getInstanceByDom(dom);
    const r = dom.getBoundingClientRect();
    const serie = c.getModel().getSeriesByIndex(item.serie);
    const dados = serie.getData();
    let p;
    if (serie.type === 'series.graph') p = item.pixel ? dados.getItemLayout(item.indice) : c.convertToPixel({ seriesIndex: item.serie }, dados.getItemLayout(item.indice));
    // A linha sem marcadores não guarda a posição do ponto: ela sai do valor, pelo eixo.
    else if (serie.type === 'series.line') p = c.convertToPixel({ seriesIndex: item.serie }, [item.indice, serie.getRawValue(item.indice)]);
    else if (serie.type === 'series.custom') {
      const v = serie.getRawValue(item.indice);
      p = c.convertToPixel({ seriesIndex: item.serie }, [v[0], v[1]]);
    } else {
      const l = dados.getItemLayout(item.indice);
      p = Array.isArray(l) ? l : [l.x + l.width / 2, l.y + l.height / 2];
    }
    return [r.x + p[0], r.y + p[1] + (item.dy ?? 0)];
  }, item);
  const clicar = async (item, ctrl = false) => {
    const [x, y] = await posicao(item);
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.click(x, y);
    if (ctrl) await page.keyboard.up('Control');
    await espera();
  };
  const fundo = async (sel) => {
    // Um ponto vazio: canto inferior direito do gráfico, dentro dele.
    const [x, y] = await page.evaluate((s) => { const d = document.querySelector(s); d.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = d.getBoundingClientRect(); return [r.x + r.width - 6, r.y + r.height - 4]; }, sel);
    await page.mouse.click(x, y);
    await espera();
  };
  const tamanho = async (dims) => (await ler(dims))[0].length;
  const somaLinha = (alvo) => page.evaluate(({ grafico, serie }) => echarts.getInstanceByDom(document.querySelector(grafico)).getOption().series[serie].data.reduce((a, v) => a + (v ?? 0), 0), alvo);

  const testarSemSelecao = async (alvo) => {
    const passos = [];
    const anotar = (passo, ok, valores) => passos.push({ passo, ok, valores });
    const ponto = { grafico: alvo.grafico, serie: alvo.serie, indice: 5 };
    const dims = ['segmentos', 'departamentos'];
    await clicar(ponto);
    anotar('clique no ponto não seleciona', (await ler(dims)).every((v) => v.length === 0));
    const antes = await somaLinha(alvo);
    await naLateral(() => page.click('.chip[data-segmento="Regulares"]'));
    await page.waitForTimeout(600);
    const depois = await somaLinha(alvo);
    anotar('o filtro de segmento muda a linha', depois > 0 && depois < antes, [antes, depois]);
    await clicar(ponto);
    await fundo(alvo.grafico);
    anotar('clique no ponto e no fundo não limpam o filtro', (await ler(['segmentos']))[0].length === 1);
    await naLateral(() => page.click('.chip[data-segmento="Regulares"]'));
    await page.waitForTimeout(600);
    anotar('tirar o filtro devolve a linha', Math.abs(await somaLinha(alvo) - antes) < 0.01);
    return passos;
  };

  const testarGestos = async (alvo) => {
    const passos = [];
    const anotar = async (passo, esperado) => { const n = await tamanho(alvo.dim); passos.push({ passo, esperado, obtido: n, ok: n === esperado, valores: await ler(alvo.dim) }); };
    await clicar(alvo.a); await anotar('clique em A', 1);
    await clicar(alvo.a); await anotar('clique em A de novo', 0);
    await clicar(alvo.a); await clicar(alvo.b, true); await anotar('Ctrl + B', alvo.unico ? 1 : 2);
    if (!alvo.unico) { await clicar(alvo.b, true); await anotar('Ctrl + B de novo', 1); }
    await page.keyboard.press('Escape'); await espera();
    await anotar('Esc', 0);
    if (alvo.fundo) { await clicar(alvo.a); await fundo(alvo.fundo); await anotar('clique no fundo', 0); }
    await page.keyboard.press('Escape'); await espera();
    return passos;
  };

  const abas = [...new Set(ALVOS.map((a) => a.aba))];
  const n = await page.evaluate((total) => { const i = Number(sessionStorage.getItem('gestos_aba') ?? 0) % total; sessionStorage.setItem('gestos_aba', i + 1); return i; }, abas.length);
  await page.click(`#${abas[n]}`);
  // As abas carregam os arquivos do período ao abrir: espera o redesenho antes do primeiro clique.
  await page.waitForTimeout(1500);
  const resultado = [];
  for (const alvo of ALVOS.filter((a) => a.aba === abas[n])) {
    const passos = alvo.naoFiltra ? await testarSemSelecao(alvo) : await testarGestos(alvo);
    resultado.push({ alvo: alvo.nome, ok: passos.every((p) => p.ok), passos: passos.filter((p) => !p.ok) });
  }
  return { aba: abas[n], faltam: abas.length - 1 - n, ok: resultado.filter((r) => r.ok).length, total: resultado.length, falhas: resultado.filter((r) => !r.ok), alvos: resultado.map((r) => `${r.ok ? 'OK' : 'FALHA'} ${r.alvo}`) };
}
