// Aba Ficha da Categoria (spec 5.2). Em construção: a tela entra na sub-fase R3 do redesenho v2; os dados
// (departamentos_ficha, departamentos_segmento, subcategorias, cesta_*) já estão exportados e reconciliados.
import { el } from '../componentes.js';

export async function iniciar(container) {
  container.replaceChildren(el('section', { class: 'painel', 'aria-labelledby': 'categoria-titulo' },
    el('h2', { class: 'painel__titulo', id: 'categoria-titulo' }, 'Ficha da Categoria (em construção)'),
    el('p', { class: 'painel__subtitulo' },
      'Esta aba substitui a Ficha do Cliente: cada departamento com radar de 6 atributos, faturamento semanal por segmento, '
      + 'quem compra, top 10 subcategorias, o que vai junto na cesta e o dinheiro em risco. Chega na próxima etapa do redesenho.')));
}
