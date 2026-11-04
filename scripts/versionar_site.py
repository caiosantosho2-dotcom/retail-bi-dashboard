"""Monta a pasta publicada: copia site/ e põe js/ e css/ dentro de v/<hash>/ (hash do conteúdo dos dois).

Por que pasta, e não ?v= no endereço: o servidor ignora a query, então uma página aberta antes da publicação pediria uma aba
pelo endereço antigo e receberia o código novo, misturando as versões. Com a pasta, o endereço antigo some (404) e a página
recarrega uma vez, inteira na versão nova. Os imports relativos continuam valendo, porque a árvore se move junta.

Uso: python scripts/versionar_site.py [--origem site] [--saida _site]. Só a publicação usa: em site/ o painel roda como está.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import sys
from pathlib import Path

PASTAS = ("js", "css")
REF = re.compile(r'\b(href|src)="(js|css)/')
MODULO = '<script type="module"'

# Inline de propósito: precisa funcionar justamente quando os arquivos da versão não existem mais. O reload revalida o HTML,
# que está em cache por até 10 minutos, e a marca com hora impede um laço se a falha for outra (rede fora, por exemplo).
RECARGA = """<script>
    window.recarregarVersaoNova = () => {
      const chave = 'recarga_versao_nova';
      let ultima = 0;
      try { ultima = Number(sessionStorage.getItem(chave)); sessionStorage.setItem(chave, String(Date.now())); } catch { return false; }
      if (Date.now() - ultima < 30000) {
        document.body?.prepend('Não foi possível carregar o painel. Tente recarregar a página.');
        return false;
      }
      location.reload();
      return true;
    };
  </script>
  """


def versao_de(origem: Path) -> str:
    """12 primeiros caracteres do sha256 dos caminhos e bytes de js/ e css/. Mesmo conteúdo, mesma versão."""
    resumo = hashlib.sha256()
    for pasta in PASTAS:
        for arquivo in sorted(p for p in (origem / pasta).rglob("*") if p.is_file()):
            resumo.update(arquivo.relative_to(origem).as_posix().encode())
            resumo.update(b"\0")
            resumo.update(arquivo.read_bytes())
            resumo.update(b"\0")
    return resumo.hexdigest()[:12]


def versionar_html(texto: str, versao: str) -> str:
    """Aponta js/ e css/ para a pasta da versão e liga a recarga no módulo de entrada. Falha se a página mudou de forma."""
    if texto.count(MODULO) != 1:
        raise ValueError(f"esperava 1 {MODULO}, achei {texto.count(MODULO)}")
    novo, trocas = REF.subn(rf'\1="v/{versao}/\2/', texto)
    if trocas < 2:
        raise ValueError(f"esperava ao menos 1 CSS e 1 JS locais, achei {trocas}")
    return novo.replace(MODULO, f'{RECARGA}{MODULO} onerror="window.recarregarVersaoNova()"')


def construir(origem: Path, saida: Path) -> str:
    """Monta saida/ a partir de origem/ e devolve a versão. A origem nunca muda."""
    origem, saida = origem.resolve(), saida.resolve()
    if saida == origem or saida in origem.parents or origem in saida.parents:
        raise ValueError("a saída não pode ser a origem, nem estar dentro dela, nem contê-la")
    versao = versao_de(origem)
    paginas = sorted(origem.glob("*.html"))
    if not paginas:
        raise ValueError(f"nenhuma página .html em {origem}")
    novas = {p.name: versionar_html(p.read_bytes().decode("utf-8"), versao) for p in paginas}

    if saida.exists():
        shutil.rmtree(saida)
    shutil.copytree(origem, saida, ignore=shutil.ignore_patterns(*PASTAS))
    for pasta in PASTAS:
        shutil.copytree(origem / pasta, saida / "v" / versao / pasta)
    for nome, texto in novas.items():
        (saida / nome).write_bytes(texto.encode("utf-8"))
    return versao


def main() -> int:
    argumentos = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    argumentos.add_argument("--origem", type=Path, default=Path("site"))
    argumentos.add_argument("--saida", type=Path, default=Path("_site"))
    a = argumentos.parse_args()
    try:
        versao = construir(a.origem, a.saida)
    except (OSError, ValueError) as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    print(f"Versão {versao} em {a.saida}/v/{versao}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
