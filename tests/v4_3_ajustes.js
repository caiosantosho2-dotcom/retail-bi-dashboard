// Itens 1 a 26 da v4.3 (correções e remoção dos "maneirismos de IA"), conferidos no navegador, sem captura de tela.
// Playwright: browser_run_code_unsafe com filename = tests/v4_3_ajustes.js (ou o executor local), painel aberto em
// localhost:8000 e sem filtros. Cada execução faz UMA aba e a próxima passa para a seguinte: rode 3 vezes, em 1440×900 e em
// 390×844. Os números são comparados com o JSON pelo mesmo formatador do site (formatar.js).
async (page) => {
  const naLateral = async (acao) => {
    const botao = page.locator('#abrir-filtros');
    const celular = await botao.isVisible();
    if (celular) { await botao.click(); await page.waitForTimeout(250); }
    await acao();
    if (celular) { await page.click('#fechar-filtros'); await page.waitForTimeout(250); }
  };
  const periodo = async (p) => { await naLateral(() => page.click(`.filtro[data-periodo="${p}"]`)); await page.waitForTimeout(700); };
  const chip = async (s) => { await naLateral(() => page.click(`.chip[data-segmento="${s}"]`)); await page.waitForTimeout(600); };
  const PERIODOS = ['4s', '13s', '26s', 'base'];

  // Conferências comuns, rodadas na aba visível: texto visível (fora do ⓘ e do sr-only), contraste de todo texto, caixa-alta,
  // pílulas, reticências, "·", "×" de texto, jargão e as etiquetas que repetiam filtro.
  const comuns = () => page.evaluate(() => {
    const painel = document.querySelector('.painel-aba:not([hidden])');
    const visivel = (n) => {
      for (let e = n.parentElement; e; e = e.parentElement) {
        if (e.hidden || e.classList.contains('sr-only') || e.classList.contains('info__texto') || getComputedStyle(e).display === 'none') return false;
      }
      return true;
    };
    const nos = [];
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (andar.nextNode()) if (andar.currentNode.textContent.trim() && visivel(andar.currentNode)) nos.push(andar.currentNode);
    const texto = nos.map((n) => n.textContent).join(' ');
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const fundo = (e) => {
      for (; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0) return c.slice(0, 3); }
      return [255, 255, 255];
    };
    const opacidade = (e) => { let o = 1; for (; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const baixos = [];
    for (const n of nos) {
      const e = n.parentElement;
      const f = fundo(e);
      const cor = rgb(getComputedStyle(e).color).slice(0, 3);
      const o = opacidade(e);
      const real = cor.map((c, i) => c * o + f[i] * (1 - o));
      const r = contraste(real, f);
      if (r < 4.5) baixos.push(`${n.textContent.trim().slice(0, 30)} (${r.toFixed(2)})`);
    }
    const elementos = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent || e === document.body);
    const caixaAlta = elementos.filter((e) => getComputedStyle(e).textTransform === 'uppercase' && e.textContent.trim()).map((e) => e.className);
    // Pílula só nos filtros: a barra lateral e o botão "Filtros" que a abre no celular.
    const pilulas = elementos.filter((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius) >= 100 && !e.closest('.filtros') && e.id !== 'abrir-filtros' && e.textContent.trim()).map((e) => e.className || e.tagName);
    const reticencias = elementos.filter((e) => getComputedStyle(e).textOverflow === 'ellipsis').map((e) => e.className || e.id);
    const etiquetas = [...painel.querySelectorAll('.painel__etiquetas')].map((e) => e.textContent).join(' | ');
    return {
      ponto: (texto.match(/·/g) ?? []).length,
      vezesTexto: (texto.match(/[^\d\s]\s*×|×\s*[^\d\s]/g) ?? []).filter((x) => !/\d×/.test(x)),
      jargao: ['foto da semana', '26 s ', 'recorte', 'lift', 'Lift', 'Fornec. p/', 'null', 'undefined', 'NaN', '⇄'].filter((j) => texto.includes(j)),
      textoBaixo: baixos,
      caixaAlta: [...new Set(caixaAlta)],
      pilulas: [...new Set(pilulas)],
      reticencias: [...new Set(reticencias)],
      etiquetasRepetidas: /todos os clientes|todas as lojas/.test(etiquetas),
    };
  });
  const comunsOk = (c) => c.ponto === 0 && !c.vezesTexto.length && !c.jargao.length && !c.textoBaixo.length
    && c.caixaAlta.every((k) => k.includes('kpi__rotulo')) && !c.pilulas.length && !c.reticencias.length && !c.etiquetasRepetidas;

  // Textos dos gráficos (ECharts): contraste contra o branco do painel, ou contra a marca quando o rótulo fica dentro da barra.
  const textosGraficos = () => page.evaluate(() => {
    const lum = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
    const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const hex = (c) => { if (!c || typeof c !== 'string') return null; if (c.startsWith('#')) return c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c.slice(0, 7); const v = c.match(/[\d.]+/g); return v ? `#${v.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : null; };
    const baixos = [];
    for (const dom of document.querySelectorAll('.painel-aba:not([hidden]) [_echarts_instance_]')) {
      if (!dom.offsetParent) continue;
      const c = echarts.getInstanceByDom(dom);
      for (const e of c.getZr().storage.getDisplayList(true)) {
        // Os rótulos do ECharts 6 são 'tspan' na lista de desenho; vale todo elemento com texto.
        if (!e.style?.text || e.ignore || e.invisible) continue;
        const cor = hex(e.style.fill);
        if (!cor) continue;
        // Rótulo dentro de uma barra: o fundo é a barra (com a opacidade dela) misturada ao branco.
        const dono = e.parent?.__hostTarget ?? e.__hostTarget;
        let fundo = '#ffffff';
        const caixa = e.getBoundingRect().clone(); if (e.transform) caixa.applyTransform(e.transform);
        const barra = dono?.getBoundingRect?.().clone(); if (barra && dono.transform) barra.applyTransform(dono.transform);
        const dentro = barra && caixa.x + caixa.width / 2 > barra.x && caixa.x + caixa.width / 2 < barra.x + barra.width
          && caixa.y + caixa.height / 2 > barra.y && caixa.y + caixa.height / 2 < barra.y + barra.height;
        if (dentro && dono.style?.fill) {
          const b = hex(dono.style.fill); const o = dono.style.opacity ?? 1;
          if (b) fundo = `#${[0, 2, 4].map((i) => Math.round(parseInt(b.slice(1 + i, 3 + i), 16) * o + 255 * (1 - o)).toString(16).padStart(2, '0')).join('')}`;
        }
        const o = (e.style.opacity ?? 1) * (e.parent?.style?.opacity ?? 1);
        const r = contraste(cor, fundo);
        if (r < 4.5 || o < 1) baixos.push(`${String(e.style.text).slice(0, 24)} ${r.toFixed(2)} op ${o}`);
      }
    }
    return baixos;
  });

  const abas = {
    'aba-visao-geral': async () => {
      const r = {};
      await periodo('26s');
      const kf = await page.evaluate(async () => {
        const { linhas } = await import('/js/dados.js');
        return (await linhas('kpis_filtrados.json')).filter((l) => l.subconjunto === 'todos' && l.departamento === 'todos').map((l) => [l.periodo, l.lojas_comparaveis]);
      });
      r.item13 = await page.evaluate((kf) => {
        const lojas = Object.fromEntries(kf)['26s'];
        const linha = document.querySelector('.kpis__lojas').textContent;
        // O texto visível do card (sem o ⓘ, que explica as lojas comparáveis na regra da variação).
        const cards = [...document.querySelectorAll('.kpi')].map((k) => { const c = k.cloneNode(true); c.querySelectorAll('.info__texto').forEach((x) => x.remove()); return c.textContent; });
        return { ok: linha.includes(`${lojas} lojas comparáveis`) && cards.every((t) => !t.includes('lojas comparáveis'))
          && cards[5].includes('sem filtro de loja') && cards.filter((t) => t.includes('sem filtro de loja')).length === 1, linha };
      }, kf);
      // 2: o rótulo do último ponto cabe na área do gráfico, nos 4 períodos.
      r.item2 = {};
      for (const p of PERIODOS) {
        await periodo(p);
        r.item2[p] = await page.evaluate(() => {
          const dom = document.querySelector('.vg-semanal .painel__grafico');
          const c = echarts.getInstanceByDom(dom);
          // O rótulo do fim da linha (endLabel): o texto "US$ …" mais à direita.
          const fim = c.getZr().storage.getDisplayList(true).filter((e) => /^US\$/.test(e.style?.text ?? '') && !e.ignore && !e.invisible).map((e) => { const b = e.getBoundingRect().clone(); if (e.transform) b.applyTransform(e.transform); return b.x + b.width; });
          return fim.length ? Math.max(...fim) <= dom.clientWidth : false;
        });
      }
      await periodo('26s');
      // 7 e 14: frase do CRM nas 12 combinações; mix sem zero; "Todos os N são".
      r.crm = await page.evaluate(async () => {
        const saida = [];
        const grupos = document.querySelectorAll('.vg-crm__opcoes');
        const botoes = (i) => [...grupos[i].querySelectorAll('button')];
        for (const o of botoes(1).map((b) => b.textContent)) {
          botoes(1).find((b) => b.textContent === o).click();
          for (const n of botoes(0).map((b) => b.textContent)) {
            botoes(0).find((b) => b.textContent === n).click();
            await new Promise((ok) => setTimeout(ok, 60));
            const frase = document.querySelector('.vg-crm__frase');
            const legenda = [...document.querySelectorAll('.vg-crm__legenda-item')].map((l) => l.textContent);
            saida.push({ o, n, vencedor: frase.dataset.vencedor, frase: frase.textContent, legenda });
          }
        }
        botoes(1)[0].click(); botoes(0).find((b) => b.textContent === '100').click();
        return saida;
      });
      r.item7 = r.crm.every((x) => !x.frase.includes('O modelo ganha') && (x.vencedor === 'regra') === x.frase.includes('A regra simples ganha.'));
      r.item14 = r.crm.every((x) => x.legenda.every((l) => !/\s0$/.test(l)) && (x.legenda.length !== 1 || /^Todos os \d+ são /.test(x.legenda[0])));
      r.item14exemplo = r.crm.find((x) => x.o === 'Priorizar risco de pausa' && x.n === '100')?.legenda;
      r.crm = undefined;
      r.item11 = await page.evaluate(() => !document.querySelector('.vg-crm .painel__subtitulo').textContent
        && document.querySelector('.vg-crm .painel__titulo-linha .info__texto').textContent.includes('não quantas pausas o contato evitaria'));
      r.item12 = await page.evaluate(() => document.querySelector('.vg-crm .painel__etiquetas').textContent === 'última semana da base'
        && document.querySelector('.vg-crm__numeros').textContent.includes('Faturamento de 26 semanas em jogo'));
      // 14: a % do segmento aparece uma vez (na barra ou, se a parte for estreita, na lista).
      r.item14segmento = await page.evaluate(() => {
        const c = echarts.getInstanceByDom(document.querySelector('.vg-segmentos .painel__grafico'));
        const naBarra = new Set(c.getOption().series.filter((s) => s.label.show).map((s) => s.name));
        return [...document.querySelectorAll('.vg-segmentos__item')].every((li) => {
          const nome = li.querySelector('.etiqueta').textContent;
          return naBarra.has(nome) === !li.querySelector('.vg-segmentos__pct').textContent;
        });
      });
      // 5: nenhuma cor de segmento verde (matiz entre 75° e 165°).
      r.item5 = await page.evaluate(async () => {
        const { SEG_CORES } = await import('/js/charts/tema.js');
        const matiz = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; if (!d) return null; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
        return { ok: Object.values(SEG_CORES).every((c) => { const m = matiz(c); return m === null || m < 75 || m > 165; }), cores: SEG_CORES };
      });
      // 17: lista "Defender primeiro" no formato curto, igual ao JSON pelo formatador; o exato no title.
      r.item17 = await page.evaluate(async () => {
        const { fmt } = await import('/js/formatar.js');
        const { linhas } = await import('/js/dados.js');
        const L = (await linhas('departamentos_quadrante_26s.json')).filter((l) => l.subconjunto === 'todos' && l.destaque).sort((a, b) => a.destaque - b.destaque);
        const tela = [...document.querySelectorAll('.vg-quadrante__gap')];
        return tela.length === L.length && tela.every((t, i) => t.textContent === fmt.gapCurto(L[i].valor_gap) && t.title === fmt.gap(L[i].valor_gap));
      });
      // 18, 19, 20, 21
      r.item18 = await page.evaluate(() => document.querySelectorAll('.vg-crm .segmentado').length === 2 && document.querySelector('#limpar-filtros').classList.contains('link-botao'));
      r.item19 = await page.evaluate(() => { const b = document.getElementById('alto-contraste'); return !b.closest('.abas') && b.closest('.topbar') && !!b.querySelector('svg') && b.getAttribute('aria-label').startsWith('Alto contraste') && b.getAttribute('aria-pressed') === 'false' && !b.textContent.trim(); });
      r.item20 = await page.evaluate(() => [...document.querySelectorAll('.painel-aba:not([hidden]) .botao-tabela')].map((b) => b.closest('.painel').classList.contains('vg-quadrante') || b.closest('.painel').classList.contains('vg-deptos')).join() === 'true,true'
        && ['.vg-semanal', '.vg-segmentos'].every((s) => document.querySelector(`${s} .painel__tabela.sr-only table`)));
      r.item21 = await page.evaluate(() => [...document.querySelectorAll('.painel-aba:not([hidden]) [_echarts_instance_]')].every((d) => (echarts.getInstanceByDom(d).getOption().legend ?? []).every((l) => l.icon === 'circle' || l.show === false)));
      // 26: rodapé com fonte e link; o resto em "Sobre os dados".
      r.item26 = await page.evaluate(() => {
        const f = document.getElementById('sobre-os-dados');
        const d = f.querySelector('details');
        const fora = [...f.childNodes].filter((n) => n !== d).map((n) => n.textContent).join(' ');
        return fora.includes('Fonte: Dunnhumby, The Complete Journey') && fora.includes('Metodologia e validação') && !/Base|Commit|Gerado/.test(fora)
          && d.querySelector('summary').textContent === 'Sobre os dados' && /Base/.test(d.textContent) && /Commit do lakehouse/.test(d.textContent) && /Gerado em/.test(d.textContent);
      });
      r.item8 = await page.evaluate(() => ['.vg-crm__secao', '.controle__rotulo', '.filtros__rotulo'].every((s) => [...document.querySelectorAll(s)].every((e) => getComputedStyle(e).textTransform === 'none' && getComputedStyle(e).fontWeight === '600'))
        && getComputedStyle(document.querySelector('.kpi__rotulo')).textTransform === 'uppercase');
      // 4: "Limpar tudo" desabilitado continua legível (sem filtro ele fica desabilitado).
      r.item4limpar = await page.evaluate(() => { const b = document.getElementById('limpar-filtros'); return b.disabled && getComputedStyle(b).opacity === '1'; });
      r.item4graficos = [];
      for (const s of [null, 'Fiéis']) {
        if (s) await chip(s);
        r.item4graficos.push(...await textosGraficos());
        if (s) await chip(s);
      }
      return r;
    },
    'aba-categoria': async () => {
      const r = {};
      // 1: o dinheiro em risco nunca mostra "null", em todo período e com "Em pausa" sozinho (onde o null aparecia).
      r.item1 = {};
      for (const p of PERIODOS) { await periodo(p); r.item1[p] = await page.evaluate(() => !/null|undefined/.test(document.querySelector('.ct-risco').textContent)); }
      await periodo('26s');
      await chip('Em pausa');
      r.item1.soEmPausa = await page.evaluate(() => !/null|undefined/.test(document.querySelector('.ct-risco').textContent));
      await chip('Em pausa');
      r.item1numero = await page.evaluate(async () => {
        const { fmt } = await import('/js/formatar.js');
        const { linhas } = await import('/js/dados.js');
        const l = (await linhas('departamentos_risco.json')).find((x) => x.subconjunto === 'todos' && x.departamento === 'todos');
        const v = document.querySelector('.ct-risco__valor');
        return v.title === fmt.usd(l.dinheiro_em_risco) && v.textContent === fmt.usdGrande(l.dinheiro_em_risco)
          && document.querySelector('.ct-risco__pct').textContent.startsWith(fmt.part(l.dinheiro_em_risco_pct));
      });
      // 2 e 23: rótulo final cabe; mesma altura da linha do tempo da Visão Geral (300 px).
      r.item2 = {};
      for (const p of PERIODOS) {
        await periodo(p);
        r.item2[p] = await page.evaluate(() => {
          const dom = document.querySelector('.ct-semanal .painel__grafico');
          const c = echarts.getInstanceByDom(dom);
          const fim = c.getZr().storage.getDisplayList(true).filter((e) => /^US\$/.test(e.style?.text ?? '') && !e.ignore && !e.invisible).map((e) => { const b = e.getBoundingRect().clone(); if (e.transform) b.applyTransform(e.transform); return b.x + b.width; });
          return fim.length ? Math.max(...fim) <= dom.clientWidth : false;
        });
      }
      await periodo('26s');
      r.item23 = await page.evaluate(() => {
        const ct = document.querySelector('.ct-semanal').getBoundingClientRect().height;
        return { ok: Math.abs(ct - 300) <= 1 || innerWidth < 768, ct, horizontal: document.documentElement.scrollWidth > innerWidth };
      });
      // 6: pares em tabela com as colunas pedidas; departamento como coluna só em "Todos".
      r.item6 = await page.evaluate(() => {
        const t = document.querySelector('.ct-cesta .tabela-pares');
        const cab = t ? [...t.querySelectorAll('thead th')].map((x) => x.textContent) : [];
        return JSON.stringify(cab) === JSON.stringify(['Se compra', 'Também leva', 'Departamento', '% das vezes', 'Vezes mais que o normal', 'Cestas']);
      });
      // 15: sem ⇄; o ⓘ da lista diz quem tem pares.
      r.item15 = await page.evaluate(() => !document.querySelector('.ct-lista').textContent.includes('⇄')
        && document.querySelector('.ct-lista .info__texto').textContent.includes('Têm pares de cesta confiáveis'));
      // 18: "Ordenar" é controle segmentado.
      r.item18 = await page.evaluate(() => !!document.querySelector('.ct-ordem .segmentado [data-ordem]'));
      // 20: sem botão "Tabela" nesta aba; as tabelas ficam para o leitor de tela.
      r.item20 = await page.evaluate(() => !document.querySelector('.painel-aba:not([hidden]) .botao-tabela') && !!document.querySelector('.ct-semanal .painel__tabela.sr-only table'));
      // 22: nome inteiro no eixo das subcategorias (quebra, sem cortar).
      r.item22 = await page.evaluate(() => echarts.getInstanceByDom(document.querySelector('.ct-subcategorias .painel__grafico')).getOption().yAxis[0].axisLabel.overflow === 'break');
      // 24: "Selec." e "Índice" só com segmento ligado.
      const cabPerfil = () => page.evaluate(() => [...document.querySelectorAll('.ct-comparacao__tabela thead th')].map((x) => x.textContent));
      const sem = await cabPerfil();
      await chip('Fiéis');
      const com = await cabPerfil();
      r.item4graficos = await textosGraficos();
      await chip('Fiéis');
      r.item24 = !sem.includes('Selec.') && !sem.includes('Índice') && com.includes('Selec.') && com.includes('Índice');
      // Departamento escolhido: o ⓘ e os pares sem a coluna de departamento.
      await page.click('.ct-lista .item-lista >> nth=1');
      await page.waitForTimeout(700);
      r.item6dep = await page.evaluate(() => { const t = document.querySelector('.ct-cesta .tabela-pares'); return !t || ![...t.querySelectorAll('thead th')].some((x) => x.textContent === 'Departamento'); });
      r.item24dep = JSON.stringify(await cabPerfil());
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      r.item4graficos.push(...await textosGraficos());
      return r;
    },
    'aba-produtos': async () => {
      const r = {};
      r.item25ordem = await page.evaluate(() => { const filhos = [...document.querySelector('.pd').children]; return filhos.at(-1).classList.contains('pd-rede'); });
      r.item16 = await page.evaluate(() => document.querySelector('.pd-rede .painel__titulo').textContent === 'O que vai junto na cesta');
      // 25: rótulos só nos grupos e nos 5 maiores nós (na tela estreita, só os grupos), nenhum sobreposto, nome inteiro.
      r.item25 = {};
      for (const p of PERIODOS) {
        await periodo(p);
        await page.waitForTimeout(600);
        r.item25[p] = await page.evaluate(async () => {
          const { linhas } = await import('/js/dados.js');
          const nos = await linhas('rede_nos.json');
          const maiores = [...nos].sort((a, b) => b.faturamento - a.faturamento).slice(0, 5).map((n) => n.subcategoria);
          const deps = [...new Set(nos.map((n) => n.departamento))];
          const dom = document.querySelector('.pd-rede .painel__grafico');
          const c = echarts.getInstanceByDom(dom);
          const textos = c.getZr().storage.getDisplayList(true).filter((e) => e.style?.text && !e.ignore && !e.invisible).map((e) => {
            const b = e.getBoundingRect().clone(); if (e.transform) b.applyTransform(e.transform); return { t: e.style.text, x: b.x, y: b.y, w: b.width, h: b.height };
          });
          const nosRot = textos.filter((t) => !deps.includes(t.t)).map((t) => t.t).sort();
          const estreito = c.getWidth() < 600;
          const encostam = textos.flatMap((a, i) => textos.slice(i + 1).filter((b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1).map((b) => `${a.t} × ${b.t}`));
          return { ok: JSON.stringify(nosRot) === JSON.stringify(estreito ? [] : [...maiores].sort()) && textos.filter((t) => deps.includes(t.t)).length === deps.length && !encostam.length,
                   nosRot, encostam };
        });
      }
      await periodo('26s');
      // 6: pares em tabela; 12: cabeçalhos da tabela de marcas sem abreviação.
      r.item6 = await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.pd-pares .tabela-pares thead th')].map((x) => x.textContent))
        === JSON.stringify(['Se compra', 'Também leva', '% das vezes', 'Vezes mais que o normal', 'Cestas']));
      r.item12 = await page.evaluate(() => { const c = [...document.querySelectorAll('.pd-tabela thead th')].map((x) => x.textContent); return c.includes('Fornecedores para 80% do faturamento') && c.includes('Maior fornecedor') && c.includes('Própria vs. nacional'); });
      // 3: em cada linha da tabela de marcas, o texto de todas as colunas na mesma altura do nome do departamento (±1 px),
      // medido pela caixa da linha de texto (Range), não pela do elemento.
      r.item3 = await page.evaluate(() => [...document.querySelectorAll('.pd-tabela tbody tr')].every((tr) => {
        const meios = [...tr.children].filter((c) => getComputedStyle(c).display !== 'none').map((c) => {
          const andar = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
          while (andar.nextNode() && !andar.currentNode.textContent.trim());
          const intervalo = document.createRange(); intervalo.selectNodeContents(andar.currentNode);
          const b = intervalo.getBoundingClientRect(); return b.top + b.height / 2; });
        return Math.max(...meios) - Math.min(...meios) <= 1;
      }));
      r.item20 = await page.evaluate(() => !document.querySelector('.painel-aba:not([hidden]) .botao-tabela') && !!document.querySelector('.pd-rede .painel__tabela.sr-only table'));
      // 21: legenda de cor da rede em bolinhas (com segmento ligado).
      await chip('Fiéis');
      r.item21 = await page.evaluate(() => { const itens = [...document.querySelectorAll('.pd-rede__legenda li')]; return itens.length === 3 && itens.every((li) => getComputedStyle(li.querySelector('.etiqueta__ponto')).borderRadius === '50%'); });
      r.item6seg = await page.evaluate(() => [...document.querySelectorAll('.pd-pares .tabela-pares thead th')].some((x) => x.textContent === 'Vs. todos os clientes'));
      r.item4graficos = await textosGraficos();
      await chip('Fiéis');
      r.item4graficos.push(...await textosGraficos());
      return r;
    },
  };

  const ordem = Object.keys(abas);
  const n = await page.evaluate((total) => { const i = Number(sessionStorage.getItem('v4_3_passo') ?? 0) % total; sessionStorage.setItem('v4_3_passo', i + 1); return i; }, ordem.length);
  await page.click(`#${ordem[n]}`);
  await page.waitForSelector({ 'aba-visao-geral': '.vg .vg-crm__frase', 'aba-categoria': '.ct .ct-risco__valor', 'aba-produtos': '.pd .pd-tabela' }[ordem[n]]);
  await page.waitForTimeout(1200);
  const r = await abas[ordem[n]]();
  const c = {};
  for (const p of PERIODOS) { await periodo(p); c[p] = await comuns(); }
  await periodo('26s');
  const falhas = Object.entries(r).filter(([k, v]) => k !== 'item4graficos' && !k.endsWith('exemplo') && !k.endsWith('dep')
    && (v === false || (v && typeof v === 'object' && (v.ok === false || (!('ok' in v) && !Array.isArray(v) && Object.values(v).some((x) => x === false || x?.ok === false))))));
  const comunsFalhas = Object.entries(c).filter(([, v]) => !comunsOk(v));
  return { aba: ordem[n], faltam: ordem.length - 1 - n, ok: !falhas.length && !comunsFalhas.length && !r.item4graficos.length,
           falhas: Object.fromEntries(falhas), comuns: Object.fromEntries(comunsFalhas), textosGraficosBaixos: r.item4graficos, detalhes: r };
}
