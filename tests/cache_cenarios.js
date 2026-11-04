// Uma página aberta antes de publicar não pode misturar arquivos antigos e novos. Contra tests/servidor_cache.py, que imita
// os cabeçalhos do GitHub Pages e troca a publicação sem reiniciar. Playwright MCP: browser_run_code_unsafe com
// filename = tests/cache_cenarios.js, navegador em qualquer página. Cada execução faz UM cenário: rode 5 vezes.
// O cenário 1 é o controle: sem versão, reproduz o erro real (fmt.gap). Se ele não falhar, o teste não prova nada.
async (page) => {
  const BASE = 'http://localhost:8001';
  const n = Number(await page.evaluate(() => { try { const i = Number(localStorage.getItem('cache_cenario') ?? 0); return i; } catch { return 0; } }));
  const controle = async (pasta, semCache = '') => page.context().request.get(`${BASE}/__controle?pasta=${pasta}&sem_cache=${encodeURIComponent(semCache)}`);
  const versoes = await (await page.context().request.get(`${BASE}/__versoes`)).json();

  const erros = [];
  const aoErro = (e) => erros.push(e.message);
  page.on('pageerror', aoErro);
  const limpar = async () => {
    const c = await page.context().newCDPSession(page);
    await c.send('Network.clearBrowserCache');
    await c.detach();
    await page.goto(`${BASE}/__versoes`);
    await page.evaluate(() => sessionStorage.clear());
    erros.length = 0;
  };
  const esperarPainel = () => page.waitForSelector('.vg-quadrante__item', { state: 'attached', timeout: 10000 }).catch(() => {});
  const abrir = async () => { await page.goto(`${BASE}/`); await esperarPainel(); await page.waitForTimeout(500); };
  // Quais pastas de versão a página viva carregou, e se ela está de pé.
  const retrato = () => page.evaluate(() => {
    const locais = performance.getEntriesByType('resource').map((r) => new URL(r.name)).filter((u) => u.origin === location.origin && /\.(js|css)$/.test(u.pathname));
    return { pastas: [...new Set(locais.map((u) => u.pathname.match(/^\/v\/([^/]+)\//)?.[1] ?? 'sem versão'))], destaques: document.querySelectorAll('.vg-quadrante__item').length };
  });
  const so = (r, versao) => r.pastas.length === 1 && r.pastas[0] === versao;

  const cenarios = [
    { nome: '1. controle sem versão: formatar.js antigo em cache + resto novo = erro', rodar: async () => {
      await limpar(); await controle('plano_a', '^(?!.*formatar)'); await abrir();
      await limpar0(); await controle('plano_b', '^(?!.*formatar)'); erros.length = 0; await abrir();
      return { reproduziu: erros.some((e) => e.includes('fmt.gap')), erros: erros.slice(0, 2), retrato: await retrato(), esperado: 'reproduziu = true' };
    } },
    { nome: '2. mesma situação com pasta versionada: nada de antigo', rodar: async () => {
      await limpar(); await controle('a_sem_gap', '^(?!.*formatar)'); await abrir();
      await controle('b', '^(?!.*formatar)'); erros.length = 0; await abrir();
      const r = await retrato();
      return { ok: so(r, versoes.b) && r.destaques === 3 && !erros.length, erros, retrato: r, versoes };
    } },
    { nome: '3. página aberta antes de publicar, aba ainda não carregada: recarrega inteira na nova', rodar: async () => {
      await limpar(); await controle('a', '/v/'); await abrir();
      const antes = await retrato();
      await controle('b', '/v/'); erros.length = 0;
      await page.click('#aba-categoria'); await page.waitForTimeout(1500); await esperarPainel(); await page.waitForTimeout(500);
      const r = await retrato();
      return { ok: so(antes, versoes.a) && so(r, versoes.b) && r.destaques === 3 && !erros.length, antes, depois: r, erros, versoes };
    } },
    { nome: '4. HTML antigo em cache, arquivos da versão já fora: recarrega na nova', rodar: async () => {
      await limpar(); await controle('a', '/v/'); await abrir();
      await controle('b', '/v/'); erros.length = 0; await abrir();
      const r = await retrato();
      return { ok: so(r, versoes.b) && r.destaques === 3 && !erros.length, retrato: r, erros, versoes };
    } },
    { nome: '5. tudo em cache: fica inteira na antiga até o cache vencer, sem misturar', rodar: async () => {
      await limpar(); await controle('a'); await abrir();
      await controle('b'); erros.length = 0; await abrir();
      const r = await retrato();
      await limpar(); await abrir();
      const novo = await retrato();
      return { ok: so(r, versoes.a) && r.destaques === 3 && so(novo, versoes.b) && novo.destaques === 3 && !erros.length, emCache: r, cacheVencido: novo, erros, versoes };
    } },
  ];
  // O controle troca a publicação mantendo o formatar.js antigo: só o sessionStorage é limpo, nunca o cache.
  async function limpar0() { await page.evaluate(() => sessionStorage.clear()); }

  const i = n % cenarios.length;
  const resultado = await cenarios[i].rodar();
  page.off('pageerror', aoErro);
  await page.evaluate((prox) => { localStorage.setItem('cache_cenario', String(prox)); }, i + 1);
  return { cenario: cenarios[i].nome, faltam: cenarios.length - 1 - i, resultado };
}
