import { definirAltoContraste } from './charts/tema.js';
import { carregar, linhas } from './dados.js';
import { iniciarFiltros } from './filtros.js';
import { fmt } from './formatar.js';

// Estado global: as abas reagem a ele, nunca umas às outras. Os filtros (estado.filtros) são criados por filtros.js.
export const estado = { periodo: '26s', manifest: null, filtros: { segmentos: new Set(), departamentos: new Set() } };

// Cada aba é um módulo com iniciar(container, estado) e, se depender do período, atualizar(estado).
const MODULOS = {
  'painel-visao-geral': () => import('./tabs/visao_geral.js'),
  'painel-segmentos': () => import('./tabs/segmentos.js'),
  'painel-categoria': () => import('./tabs/categoria.js'),
};
// Abas cujos dados são da janela de 26 semanas do RFM: o filtro de período não se aplica a elas (spec 5.0).
const SEM_PERIODO = new Set(['painel-segmentos', 'painel-categoria']);
const NOTAS = {
  'painel-categoria': 'Esta aba usa a janela de 26 semanas da segmentação: o período não se aplica.',
  'painel-segmentos': 'Esta aba usa a janela de 26 semanas da segmentação: o período não se aplica.',
};
const iniciados = new Map();

const abas = [...document.querySelectorAll('[role="tab"]')];
const abasAtivas = abas.filter((a) => a.getAttribute('aria-disabled') !== 'true');
const filtrosPeriodo = [...document.querySelectorAll('.filtro[data-periodo]')];
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
  const semPeriodo = SEM_PERIODO.has(idPainel);
  filtrosPeriodo.forEach((f) => f.setAttribute('aria-disabled', String(semPeriodo)));
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
  const periodo = document.getElementById('periodo-base');
  const rodape = document.getElementById('sobre-os-dados');
  try {
    const m = await carregar('manifest.json');
    estado.manifest = m;
    periodo.textContent = `Período da base: ${fmt.data(m.periodo_base.inicio)} a ${fmt.data(m.periodo_base.fim)}`;
    rodape.textContent = '';
    const partes = [
      ['Fonte', 'Dunnhumby, The Complete Journey (via DuckDB do projeto de RAG)'],
      ['Período', `${fmt.data(m.periodo_base.inicio)} a ${fmt.data(m.periodo_base.fim)}`],
      ['Gerado em', new Date(m.gerado_em).toLocaleDateString('pt-BR')],
      ['Base', m.base_hash],
    ];
    partes.forEach(([rotulo, valor], i) => {
      if (i) rodape.append(' · ');
      const forte = document.createElement('strong');
      forte.textContent = `${rotulo}: `;
      rodape.append(forte, valor);
    });
  } catch (erro) {
    console.error(erro);
    periodo.textContent = 'Período da base: indisponível';
    rodape.textContent = 'Sobre os dados: não foi possível ler data/manifest.json.';
  }
}

await carregarManifest();
try {
  iniciarFiltros(estado, await linhas('departamentos.json'));
} catch (erro) {
  console.error(erro);
}
selecionarAba('painel-visao-geral');
