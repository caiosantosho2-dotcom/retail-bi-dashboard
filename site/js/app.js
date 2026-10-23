import { definirAltoContraste } from './charts/tema.js';
import { carregar, linhas } from './dados.js';
import { iniciarFiltros } from './filtros.js';
import { sobreOsDados } from './componentes.js';

// Estado global: as abas reagem a ele, nunca umas às outras. Os filtros (estado.filtros) são criados por filtros.js.
export const estado = { periodo: '26s', manifest: null, abaVisivel: null, filtros: { segmentos: new Set(), departamentos: new Set() } };

// Cada aba é um módulo com iniciar(container, estado) e, se depender do período, atualizar(estado).
const MODULOS = {
  'painel-visao-geral': () => import('./tabs/visao_geral.js'),
  'painel-clientes': () => import('./tabs/clientes.js'),
  'painel-categoria': () => import('./tabs/categoria.js'),
  'painel-produtos': () => import('./tabs/produtos.js'),
};
// O período vale em todas as abas (redesenho v3, 0.2); o que não muda com ele leva uma nota no próprio bloco.
// Abas em que os filtros de segmento ou de departamento não se aplicam (spec 5.0 e 5.3): ficam desabilitados, com nota.
const SEM_SEGMENTO = new Set();
const SEM_DEPARTAMENTO = new Set(['painel-clientes']);
// Enquanto uma aba não tiver dados por período (cada uma ganha os seus na etapa dela), a nota diz que ela ainda usa
// só as 26 semanas.
const NOTAS = {
  'painel-clientes': 'O segmento do cliente, o risco de pausa, a matriz de migração e o perfil das lojas são fixos (26 semanas). O departamento não se aplica a esta aba: ela olha a loja inteira.',
  'painel-produtos': 'Esta aba ainda usa só as 26 semanas: por enquanto o período não muda os números dela. O segmento vale para a rede de cestas; o departamento destaca os itens dele.',
};
const iniciados = new Map();

const abas = [...document.querySelectorAll('[role="tab"]')];
const abasAtivas = abas.filter((a) => a.getAttribute('aria-disabled') !== 'true');
const notaFiltro = document.getElementById('nota-filtro');

async function mostrarModulo(idPainel) {
  if (!iniciados.has(idPainel)) {
    const container = document.getElementById(idPainel);
    iniciados.set(idPainel, MODULOS[idPainel]().then(async (m) => {
      await m.iniciar(container, estado);
      return m;
    }));
  }
  const modulo = await iniciados.get(idPainel);
  modulo.atualizar?.(estado);
}

export function selecionarAba(idPainel, { focar = false } = {}) {
  const aba = abasAtivas.find((a) => a.getAttribute('aria-controls') === idPainel);
  for (const a of abasAtivas) {
    const ativa = a === aba;
    a.setAttribute('aria-selected', String(ativa));
    a.tabIndex = ativa ? 0 : -1;
    document.getElementById(a.getAttribute('aria-controls')).hidden = !ativa;
  }
  if (focar) aba.focus();
  estado.abaVisivel = idPainel;
  document.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-disabled', String(SEM_SEGMENTO.has(idPainel))));
  document.getElementById('botao-departamentos').setAttribute('aria-disabled', String(SEM_DEPARTAMENTO.has(idPainel)));
  notaFiltro.textContent = NOTAS[idPainel] ?? '';
  notaFiltro.hidden = !NOTAS[idPainel];
  mostrarModulo(idPainel).then(() => window.dispatchEvent(new CustomEvent('aba-visivel', { detail: idPainel })));
}

for (const aba of abasAtivas) aba.addEventListener('click', () => selecionarAba(aba.getAttribute('aria-controls')));

document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
  const i = abasAtivas.indexOf(document.activeElement);
  if (i < 0) return;
  const destino = {
    ArrowRight: abasAtivas[(i + 1) % abasAtivas.length],
    ArrowLeft: abasAtivas[(i - 1 + abasAtivas.length) % abasAtivas.length],
    Home: abasAtivas[0],
    End: abasAtivas[abasAtivas.length - 1],
  }[e.key];
  if (!destino) return;
  e.preventDefault();
  selecionarAba(destino.getAttribute('aria-controls'), { focar: true });
});

// Links internos (ex.: "ver análise" dos cards de insight) trocam de aba.
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-ir-para]');
  if (!link) return;
  e.preventDefault();
  selecionarAba(link.dataset.irPara, { focar: true });
});

// Filtro mudou (botão, chip, lista, etiqueta ou clique num gráfico): só a aba visível redesenha agora; as outras
// redesenham quando forem mostradas (mostrarModulo chama atualizar).
window.addEventListener('filtros-mudaram', () => {
  for (const [idPainel, promessa] of iniciados) {
    if (!document.getElementById(idPainel).hidden) promessa.then((m) => m.atualizar?.(estado));
  }
});

const contraste = document.getElementById('alto-contraste');
contraste.addEventListener('click', () => {
  const ativo = contraste.getAttribute('aria-pressed') !== 'true';
  contraste.setAttribute('aria-pressed', String(ativo));
  definirAltoContraste(ativo);
});

async function carregarManifest() {
  try {
    estado.manifest = await carregar('manifest.json');
    sobreOsDados(estado.manifest, { link: { href: 'metodologia.html', texto: 'Metodologia e validação' } });
  } catch (erro) {
    sobreOsDados(null, { erro });
  }
}

await carregarManifest();
try {
  iniciarFiltros(estado, await linhas('departamentos.json'));
} catch (erro) {
  console.error(erro);
}
selecionarAba('painel-visao-geral');
