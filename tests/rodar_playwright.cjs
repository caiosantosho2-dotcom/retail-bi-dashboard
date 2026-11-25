// Executor local dos testes de tela (tests/v4_1_tela.js, tests/gestos.js, tests/v4_3_ajustes.js): roda o mesmo arquivo que o
// browser_run_code_unsafe do Playwright MCP, num Chromium sem janela, e devolve as respostas e o console (erros e avisos,
// erros de página, requisições que falharam e respostas 4xx/5xx). Sem captura de tela.
// Uso, com o servidor em http://localhost:8000 (python -m http.server 8000 --directory site):
//   $env:PW = "<pasta do pacote playwright>"; node tests/rodar_playwright.cjs tests/gestos.js 3 1440x900
// O número é quantas vezes rodar o arquivo na mesma página (cada execução faz um passo ou uma aba).
const { chromium } = require(process.env.PW);
const fs = require('fs');
(async () => {
  const [arquivo, vezes = '1', tam = '1440x900'] = process.argv.slice(2);
  const [w, h] = tam.split('x').map(Number);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => consoleMsgs.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) consoleMsgs.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const fn = arquivo === '-' ? null : eval(fs.readFileSync(arquivo, 'utf8'));
  const saidas = [];
  for (let i = 0; i < Number(vezes); i++) {
    try { saidas.push(fn ? await fn(page) : null); } catch (e) { saidas.push({ erro: String(e).slice(0, 500) }); }
  }
  console.log(JSON.stringify({ saidas, console: consoleMsgs }, null, 1));
  await browser.close();
})();
