import './charts/tema.js';

const fmtData = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');

const abas = [...document.querySelectorAll('[role="tab"]')];
const abasAtivas = abas.filter((a) => a.getAttribute('aria-disabled') !== 'true');

function selecionarAba(aba) {
  for (const a of abasAtivas) {
    const ativa = a === aba;
    a.setAttribute('aria-selected', String(ativa));
    a.tabIndex = ativa ? 0 : -1;
    document.getElementById(a.getAttribute('aria-controls')).hidden = !ativa;
  }
  window.dispatchEvent(new CustomEvent('aba-visivel', { detail: aba.getAttribute('aria-controls') }));
}

for (const aba of abasAtivas) aba.addEventListener('click', () => selecionarAba(aba));

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
  destino.focus();
  selecionarAba(destino);
});

export const estado = { semanas: 26 };

for (const botao of document.querySelectorAll('.filtro')) {
  botao.addEventListener('click', () => {
    estado.semanas = Number(botao.dataset.semanas);
    for (const b of document.querySelectorAll('.filtro')) b.setAttribute('aria-pressed', String(b === botao));
    window.dispatchEvent(new CustomEvent('periodo-alterado', { detail: estado.semanas }));
  });
}

async function carregarManifest() {
  const periodo = document.getElementById('periodo-base');
  const rodape = document.getElementById('sobre-os-dados');
  try {
    const resposta = await fetch('data/manifest.json');
    if (!resposta.ok) throw new Error(resposta.status);
    const m = await resposta.json();
    periodo.textContent = `Período da base: ${fmtData(m.periodo_base.inicio)} a ${fmtData(m.periodo_base.fim)}`;
    const gerado = new Date(m.gerado_em).toLocaleDateString('pt-BR');
    rodape.textContent = '';
    const partes = [
      ['Fonte', 'Dunnhumby, The Complete Journey (via DuckDB do projeto de RAG)'],
      ['Período', `${fmtData(m.periodo_base.inicio)} a ${fmtData(m.periodo_base.fim)}`],
      ['Gerado em', gerado],
      ['Base', m.base_hash],
    ];
    partes.forEach(([rotulo, valor], i) => {
      if (i) rodape.append(' · ');
      const forte = document.createElement('strong');
      forte.textContent = `${rotulo}: `;
      rodape.append(forte, valor);
    });
    if (m.provisorio) {
      const aviso = document.createElement('span');
      aviso.className = 'rodape__aviso';
      aviso.textContent = ' · ⚠ manifest provisório (dados ainda não exportados)';
      rodape.append(aviso);
    }
  } catch (erro) {
    periodo.textContent = 'Período da base: indisponível';
    rodape.textContent = 'Sobre os dados: não foi possível ler data/manifest.json.';
  }
}

carregarManifest();
