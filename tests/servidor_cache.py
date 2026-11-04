"""Servidor de teste do cache: imita os cabeçalhos do GitHub Pages (max-age=600) e troca a publicação sem reiniciar.

Monta em --raiz as publicações usadas por tests/cache_cenarios.js e fica no ar. Só para teste local, na porta dada:
    python tests/servidor_cache.py --raiz <pasta temporária> --porta 8001
Controle: GET /__controle?pasta=<nome>&sem_cache=<regex do caminho que vai com no-store>. GET /__versoes lista as versões.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

RAIZ_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ_REPO / "scripts"))
import versionar_site as vs  # noqa: E402

estado = {"pasta": "", "sem_cache": ""}


def _editar(pasta: Path, trocar=None, marca: str | None = None) -> None:
    """Muda só formatar.js: o arquivo do erro real (fmt.gap) e o suficiente para o hash da versão mudar."""
    arquivo = pasta / "js" / "formatar.js"
    texto = arquivo.read_text(encoding="utf-8")
    if trocar:
        assert trocar[0] in texto, trocar[0]
        texto = texto.replace(*trocar)
    arquivo.write_text(texto + (f"\n// {marca}\n" if marca else ""), encoding="utf-8")


def preparar(raiz: Path) -> dict[str, str]:
    """plano_*: sem versão, como o site de hoje. a_sem_gap: a versão antiga do erro. a e b: duas publicações saudáveis."""
    fontes = raiz / "_fontes"
    if fontes.exists():
        shutil.rmtree(fontes)
    sem_gap = ("gap:", "gapAntigo:")
    versoes = {}
    for nome, trocar, marca in [("a_sem_gap", sem_gap, None), ("a", None, "versão A"), ("b", None, "versão B")]:
        fonte = fontes / nome
        shutil.copytree(RAIZ_REPO / "site", fonte)
        _editar(fonte, trocar, marca)
        versoes[nome] = vs.construir(fonte, raiz / nome)
    for nome, trocar in [("plano_a", sem_gap), ("plano_b", None)]:
        if (raiz / nome).exists():
            shutil.rmtree(raiz / nome)
        shutil.copytree(RAIZ_REPO / "site", raiz / nome)
        _editar(raiz / nome, trocar)
    shutil.rmtree(fontes)
    return versoes


class Servidor(SimpleHTTPRequestHandler):
    def __init__(self, *args, raiz: Path, versoes: dict, **kwargs):
        self.raiz, self.versoes = raiz, versoes
        super().__init__(*args, directory=str(raiz), **kwargs)

    def translate_path(self, path):
        relativo = unquote(urlparse(path).path).lstrip("/") or "index.html"
        return str(self.raiz / estado["pasta"] / relativo)

    def end_headers(self):
        caminho = urlparse(self.path).path
        semCache = caminho.startswith("/__") or (estado["sem_cache"] and re.search(estado["sem_cache"], caminho or "/"))
        self.send_header("Cache-Control", "no-store" if semCache else "max-age=600")
        if getattr(self, "etag", None):
            self.send_header("ETag", self.etag)
        super().end_headers()

    def _etag(self):
        """Como o GitHub Pages, revalida pelo conteúdo. Pela data, duas publicações montadas no mesmo segundo dariam 304."""
        arquivo = Path(self.translate_path(self.path))
        return f'"{hashlib.sha256(arquivo.read_bytes()).hexdigest()[:16]}"' if arquivo.is_file() else None

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/__controle":
            q = parse_qs(url.query)
            estado["pasta"] = q["pasta"][0]
            estado["sem_cache"] = q.get("sem_cache", [""])[0]
            return self._json(estado)
        if url.path == "/__versoes":
            return self._json(self.versoes)
        del self.headers["If-Modified-Since"]
        self.etag = self._etag()
        if self.etag and self.headers.get("If-None-Match") == self.etag:
            self.send_response(304)
            self.end_headers()
            return None
        return super().do_GET()

    def _json(self, dados):
        corpo = json.dumps(dados).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def log_message(self, *_):
        pass


def main() -> None:
    a = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    a.add_argument("--raiz", type=Path, required=True)
    a.add_argument("--porta", type=int, default=8001)
    args = a.parse_args()
    args.raiz.mkdir(parents=True, exist_ok=True)
    versoes = preparar(args.raiz)
    estado["pasta"] = "b"
    print(f"Pronto em http://localhost:{args.porta}: {versoes}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.porta), partial(Servidor, raiz=args.raiz, versoes=versoes)).serve_forever()


if __name__ == "__main__":
    main()
