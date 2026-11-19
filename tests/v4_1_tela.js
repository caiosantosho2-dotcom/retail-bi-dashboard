// Tela dos blocos de decisão (spec v4.1, B4) contra os JSONs, no navegador de verdade.
// Playwright MCP: browser_run_code_unsafe com filename = tests/v4_1_tela.js, painel aberto em localhost:8000 e sem filtros.
// Cada execução faz UM passo e a resposta diz quantos faltam: rode 7 vezes, em passos pequenos, e de novo depois de cada
// browser_resize (1440×900 e 390×844). Os gestos do bloco 2 ficam em tests/gestos.js.
async (page) => {
  const ler = (nome) => page.evaluate(async (n) => (await (await fetch(`data/${n}`)).json()).linhas, nome);
  const brl = (v, n) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: 'always' }).format(v);
  const opcao = (rotulo) => page.locator('.vg-crm__opcoes button', { hasText: new RegExp(`^${rotulo}$`) }).click();
  // v4.2: no celular os filtros ficam no painel aberto pelo botão "Filtros"; o teste abre e fecha como a pessoa faria.
  const naLateral = async (acao) => {
    const botao = page.locator('#abrir-filtros');
    const celular = await botao.isVisible();
    if (celular) { await botao.click(); await page.waitForTimeout(250); }
    await acao();
    if (celular) { await page.click('#fechar-filtros'); await page.waitForTimeout(250); }
  };
  const periodo = async (p) => { await naLateral(() => page.click(`.filtro[data-periodo="${p}"]`)); await page.waitForTimeout(500); };

  const layout = () => page.evaluate(() => {
    const caixa = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null; };
    return { janela: [innerWidth, innerHeight], rolagemHorizontal: document.documentElement.scrollWidth > innerWidth, alturaPagina: document.documentElement.scrollHeight,
             crm: caixa('.vg-crm'), mix: caixa('.vg-crm__mix'), quadrante: caixa('.vg-quadrante'), grafico: caixa('.vg-quadrante .painel__grafico'),
             ladoALado: document.querySelector('.vg-crm').getBoundingClientRect().top === document.querySelector('.vg-quadrante').getBoundingClientRect().top };
  });

  const crmNaTela = (crm, objetivo, rotulo) => async () => {
    await opcao('100'); await opcao(rotulo);
    const l = crm.find((x) => x.capacidade === 100 && x.objetivo === objetivo && x.metodo === 'modelo');
    const r = crm.find((x) => x.capacidade === 100 && x.objetivo === objetivo && x.metodo === 'regra_simples');
    const tela = await page.evaluate(() => ({
      numeros: [...document.querySelectorAll('.vg-crm__numeros dd')].map((d) => d.title),
      // v4.2: a calibração mudou para o ⓘ do título do bloco; "No teste histórico" mostra só a capacidade escolhida.
      calibracao: document.querySelector('.vg-crm .painel__titulo-linha .info__texto').textContent,
      frase: document.querySelector('.vg-crm__frase').textContent,
    }));
    const esperadoFrase = objetivo === 'pausas' ? `${brl(l.precisao_historica * 100, 1)}%` : `US$ ${brl(l.valor_capturado_historico, 2)}`;
    const esperadoRegra = objetivo === 'pausas' ? `${brl(r.precisao_historica * 100, 1)}%` : `US$ ${brl(r.valor_capturado_historico, 2)}`;
    return { ok: tela.numeros[1] === brl(l.pausas_esperadas, 2) && tela.numeros[2] === `US$ ${brl(l.faturamento_26s_em_jogo, 2)}`
      && tela.calibracao.includes(`${brl(l.pausas_esperadas_historicas, 1)} pausas esperadas viraram ${brl(l.pausas_reais_historicas, 1)} reais`)
      && tela.frase.includes(esperadoFrase) && tela.frase.includes(esperadoRegra), tela };
  };

  const passos = [
    { nome: 'layout', rodar: layout },
    { nome: 'capacidade 100, pausas', rodar: async () => crmNaTela(await ler('acionamento_crm.json'), 'pausas', 'Priorizar risco de pausa')() },
    { nome: 'capacidade 100, valor', rodar: async () => { const r = await crmNaTela(await ler('acionamento_crm.json'), 'valor', 'Priorizar valor em risco')(); await opcao('Priorizar risco de pausa'); return r; } },
    { nome: 'quadrante nos 3 períodos + base', rodar: async () => {
      const saida = {};
      for (const p of ['4s', '13s', '26s']) {
        await periodo(p);
        const L = (await ler(`departamentos_quadrante_${p}.json`)).filter((l) => l.subconjunto === 'todos');
        const tela = await page.evaluate(() => ({
          pontos: echarts.getInstanceByDom(document.querySelector('.vg-quadrante .painel__grafico')).getOption().series[0].data.length,
          destaques: [...document.querySelectorAll('.vg-quadrante__item')].map((i) => i.textContent),
        }));
        const esperado = L.filter((l) => l.destaque).sort((a, b) => a.destaque - b.destaque).map((l) => `${l.departamento}−US$ ${brl(-l.valor_gap, 2)}`);
        saida[p] = tela.pontos === L.length && JSON.stringify(tela.destaques) === JSON.stringify(esperado);
      }
      await periodo('base');
      saida.base = await page.evaluate(() => document.querySelector('.vg-quadrante__nota').textContent === 'Sem ano anterior, não há crescimento para comparar.' && document.querySelector('.vg-quadrante .painel__grafico').hidden);
      await periodo('26s');
      return saida;
    } },
    { nome: 'rótulos dos destaques legíveis nos 3 períodos', rodar: async () => {
      const saida = {};
      for (const p of ['4s', '13s', '26s']) {
        await periodo(p);
        await page.waitForTimeout(1500); // A troca de período anima os rótulos: medir antes do fim dá sobreposição falsa.
        saida[p] = await page.evaluate(() => {
          const c = echarts.getInstanceByDom(document.querySelector('.vg-quadrante .painel__grafico'));
          // Só os rótulos numerados (v4.2: só o número, 1 a 3), com a posição final na tela depois do labelLayout.
          const rotulos = c.getZr().storage.getDisplayList(true).filter((e) => /^\d$/.test(e.style?.text ?? '')).map((e) => {
            const r = e.getBoundingRect().clone(); if (e.transform) r.applyTransform(e.transform);
            return { texto: e.style.text, x: r.x, y: r.y, w: r.width, h: r.height, visivel: !e.ignore && !e.invisible };
          });
          const encostam = rotulos.flatMap((a, i) => rotulos.slice(i + 1).filter((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).map((b) => `${a.texto} × ${b.texto}`));
          // Rótulo sobre o ponto de outro destaque: informativo, sem reprovar. O contorno do texto mantém o nome legível; confira na captura.
          const serie = c.getOption().series[0].data;
          const pontos = serie.filter((d) => /^\d$/.test(d.label.formatter)).map((d) => ({ texto: d.label.formatter, p: c.convertToPixel({ seriesIndex: 0 }, d.value) }));
          const cobrem = rotulos.flatMap((r) => pontos.filter((q) => q.texto !== r.texto && q.p[0] + 8 > r.x && q.p[0] - 8 < r.x + r.w && q.p[1] + 8 > r.y && q.p[1] - 8 < r.y + r.h).map((q) => `${r.texto} sobre o ponto ${q.texto}`));
          return { rotulos: rotulos.length, destaques: document.querySelectorAll('.vg-quadrante__item').length, todosVisiveis: rotulos.every((r) => r.visivel), encostam, cobrem };
        });
      }
      await periodo('26s');
      return { ok: Object.values(saida).every((s) => s.rotulos === s.destaques && s.todosVisiveis && !s.encostam.length), saida };
    } },
    { nome: 'rótulo só nos destaques e no selecionado', rodar: async () => {
      const nomes = () => page.evaluate(() => {
        const c = echarts.getInstanceByDom(document.querySelector('.vg-quadrante .painel__grafico'));
        const departamentos = c.getOption().series[0].data.map((d) => d.name);
        return c.getZr().storage.getDisplayList(true).filter((e) => !e.ignore && !e.invisible).map((e) => e.style?.text ?? '')
          .filter((t) => departamentos.includes(t) || /^\d$/.test(t)).sort();
      });
      const L = (await ler('departamentos_quadrante_26s.json')).filter((l) => l.subconjunto === 'todos');
      const esperado = L.filter((l) => l.destaque).map((l) => String(l.destaque)).sort();
      await page.waitForTimeout(800);
      const sem = await nomes();
      const alvo = L.find((l) => !l.destaque && l.departamento === 'GROCERY');
      const [x, y] = await page.evaluate((v) => { const d = document.querySelector('.vg-quadrante .painel__grafico'); d.scrollIntoView({ block: 'center', behavior: 'instant' }); const p = echarts.getInstanceByDom(d).convertToPixel({ seriesIndex: 0 }, v); const r = d.getBoundingClientRect(); return [r.x + p[0], r.y + p[1]]; }, [alvo.participacao, alvo.crescimento]);
      await page.mouse.click(x, y); await page.waitForTimeout(800);
      const com = await nomes();
      await page.keyboard.press('Escape'); await page.waitForTimeout(800);
      const depois = await nomes();
      return { ok: JSON.stringify(sem) === JSON.stringify(esperado) && JSON.stringify(com) === JSON.stringify([...esperado, 'GROCERY'].sort()) && JSON.stringify(depois) === JSON.stringify(esperado), sem, com, depois };
    } },
    { nome: 'Em pausa: sozinho sem gráfico, junto com aviso', rodar: async () => {
      const chip = async (s) => { await naLateral(() => page.click(`.chip[data-segmento="${s}"]`)); await page.waitForTimeout(500); };
      // v4.2: o aviso de "Em pausa" junto de outros segmentos virou etiqueta ao lado do título.
      const lerBloco = () => page.evaluate(() => ({ nota: document.querySelector('.vg-quadrante__nota').textContent, aviso: document.querySelector('.vg-quadrante .painel__etiquetas').textContent, semGrafico: document.querySelector('.vg-quadrante .painel__grafico').hidden,
        semLista: document.querySelector('.vg-quadrante__lado').hidden, eixoX: echarts.getInstanceByDom(document.querySelector('.vg-quadrante .painel__grafico')).getOption().xAxis[0].name }));
      const inicial = await lerBloco();
      await chip('Em pausa');
      const so = await lerBloco();
      await chip('Fiéis');
      const junto = await lerBloco();
      await chip('Fiéis'); await chip('Em pausa');
      return { ok: so.semGrafico && so.semLista && so.nota.includes('por construção') && !junto.semGrafico && junto.aviso.includes('⚠') && junto.aviso.includes('por construção') && !inicial.aviso.includes('construção') && !inicial.nota.includes('construção') && inicial.eixoX.includes('escala logarítmica'), inicial, so, junto };
    } },
  ];

  const n = await page.evaluate((total) => { const i = Number(sessionStorage.getItem('v4_1_passo') ?? 0) % total; sessionStorage.setItem('v4_1_passo', i + 1); return i; }, passos.length);
  await page.click('#aba-visao-geral');
  await page.waitForTimeout(500);
  return { passo: passos[n].nome, faltam: passos.length - 1 - n, resultado: await passos[n].rodar() };
}
