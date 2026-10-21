// Provisório: a aba entra na sua fase (spec, seção 9).
export async function iniciar(container) {
  const p = document.createElement('p');
  p.className = 'painel painel__vazio';
  p.textContent = 'Em construção.';
  container.replaceChildren(p);
}
