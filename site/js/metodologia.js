// Página "Metodologia e validação" (redesenho v3): o antigo Laboratório, fora das abas do painel e aberto pelo link do
// rodapé. É o mesmo módulo (tabs/laboratorio.js), sem filtros: período, segmento e departamento não se aplicam aqui.
import { sobreOsDados } from './componentes.js';
import { carregar } from './dados.js';
import { iniciar, atualizar } from './tabs/laboratorio.js';

const estado = { periodo: '26s', filtros: { segmentos: new Set(), departamentos: new Set() } };

try {
  sobreOsDados(await carregar('manifest.json'), { link: { href: 'index.html', texto: 'Voltar ao painel' } });
} catch (erro) {
  sobreOsDados(null, { erro });
}
await iniciar(document.getElementById('painel-laboratorio'), estado);
atualizar(estado);
// Os gráficos medem o espaço depois do primeiro desenho (o mesmo aviso que o painel dá ao trocar de aba).
window.dispatchEvent(new CustomEvent('aba-visivel', { detail: 'painel-laboratorio' }));
