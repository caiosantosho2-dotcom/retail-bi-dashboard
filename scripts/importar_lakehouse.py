"""Leva os JSONs exportados pelo lakehouse para site/data (spec do painel v4, seção 1; decisão G43 do lakehouse).

Nada é calculado aqui. O script valida tudo primeiro e só depois troca a pasta: se algo falhar, termina com código 1 e
site/data fica como estava.

Uso: python scripts/importar_lakehouse.py
"""

import argparse
import fnmatch
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

RAIZ = Path(__file__).resolve().parent.parent
VERSAO_CONTRATO = "5.1"
MANIFEST = "manifest.json"
# Arquivos que saíram do v4 (decisões G36 e G38 do lakehouse): somem de site/data na troca.
SAIRAM = ("segmentos.json", "lista_acao.json", "migracao*.json", "lojas*.json", "regioes*.json", "perfis.json",
          "cubo_faturamento.json")
# Não são dados: seguem na pasta depois da troca.
PRESERVAR = {".gitkeep"}


class FalhaNaImportacao(Exception):
    """Uma ou mais conferências falharam; a mensagem lista todas."""


def _sha256(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


def _contrato_de(nome: str) -> str:
    """faturamento_tempo_4s.json -> faturamento_tempo.schema.json: os 4 arquivos de um período dividem o contrato."""
    return re.sub(r"_(4s|13s|26s|base)$", "", Path(nome).stem) + ".schema.json"


def _erros_de_contrato(caminho: Path, contrato: Path) -> tuple[list[str], object]:
    nome = caminho.name
    if not contrato.is_file():
        return [f"{nome}: sem contrato ({contrato.name})"], None
    try:
        dado = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        return [f"{nome}: não é um JSON legível ({erro})"], None
    schema = json.loads(contrato.read_text(encoding="utf-8"))
    erros = [f"{nome}: {'/'.join(map(str, e.absolute_path)) or '(raiz)'}: {e.message[:200]}"
             for e in Draft202012Validator(schema).iter_errors(dado)]
    return erros, dado


def validar_origem(origem: Path, contratos: Path) -> dict:
    """Confere a pasta, a versão do manifest, a lista de arquivos e cada JSON contra o contrato. Devolve o manifest."""
    if not origem.is_dir():
        raise FalhaNaImportacao(f"pasta de exportação não existe: {origem}")
    if not (origem / MANIFEST).is_file():
        raise FalhaNaImportacao(f"pasta de exportação sem {MANIFEST}: {origem}")

    erros, manifest = _erros_de_contrato(origem / MANIFEST, contratos / "manifest.schema.json")
    if manifest is None:
        raise FalhaNaImportacao("\n".join(erros))
    versao = manifest.get("versao_contrato")
    if versao != VERSAO_CONTRATO:
        erros.append(f"{MANIFEST}: versao_contrato {versao!r}, esperado {VERSAO_CONTRATO!r}")
    if erros:
        raise FalhaNaImportacao("\n".join(erros))

    listados = {a["nome"]: a for a in manifest["arquivos"]}
    na_pasta = {p.name for p in origem.iterdir() if p.is_file()} - {MANIFEST}
    erros += [f"{n}: está no manifest e não na pasta" for n in sorted(set(listados) - na_pasta)]
    erros += [f"{n}: está na pasta e não no manifest" for n in sorted(na_pasta - set(listados))]
    for nome, arquivo in sorted(listados.items()):
        caminho = origem / nome
        if not caminho.is_file():
            continue
        erros += _erros_de_contrato(caminho, contratos / _contrato_de(nome))[0]
        if caminho.stat().st_size != arquivo["bytes"]:
            erros.append(f"{nome}: {caminho.stat().st_size} bytes, o manifest diz {arquivo['bytes']}")
        if _sha256(caminho) != arquivo["sha256"]:
            erros.append(f"{nome}: sha256 diferente do manifest")
    if erros:
        raise FalhaNaImportacao("\n".join(erros))
    return manifest


def _classificar_destino(destino: Path, novos: set[str]) -> list[str]:
    """Os arquivos de hoje que saem. Um arquivo fora do contrato e fora da lista G36/G38 interrompe: seria publicado."""
    saem, desconhecidos = [], []
    for item in sorted(destino.iterdir(), key=lambda p: p.name):
        if item.name in PRESERVAR or item.name in novos:
            continue
        if item.is_file() and any(fnmatch.fnmatch(item.name, padrao) for padrao in SAIRAM):
            saem.append(item.name)
        else:
            desconhecidos.append(item.name)
    if desconhecidos:
        raise FalhaNaImportacao(f"{destino} tem itens fora do contrato {VERSAO_CONTRATO} e da lista G36/G38: {', '.join(desconhecidos)}")
    return saem


def importar(origem: Path, destino: Path, contratos: Path, area: Path) -> dict:
    """Valida, monta a pasta nova em `area` (fora do site) e só então troca. Devolve o resumo."""
    manifest = validar_origem(origem, contratos)
    nomes = [a["nome"] for a in manifest["arquivos"]] + [MANIFEST]
    saem = _classificar_destino(destino, set(nomes))

    nova, antiga = area / "site_data_nova", area / "site_data_antiga"
    area.mkdir(parents=True, exist_ok=True)
    for pasta in (nova, antiga):
        if pasta.exists():
            shutil.rmtree(pasta)
    nova.mkdir()
    try:
        for nome in nomes:
            shutil.copyfile(origem / nome, nova / nome)
        for nome in PRESERVAR:
            if (destino / nome).is_file():
                shutil.copyfile(destino / nome, nova / nome)
        for arquivo in manifest["arquivos"]:
            if _sha256(nova / arquivo["nome"]) != arquivo["sha256"]:
                raise FalhaNaImportacao(f"{arquivo['nome']}: a cópia não bate com o manifest")

        destino.rename(antiga)
        try:
            nova.rename(destino)
        except OSError:
            antiga.rename(destino)   # devolve a pasta original antes de avisar
            raise
    finally:
        if nova.exists():
            shutil.rmtree(nova)
    shutil.rmtree(antiga)
    return {"copiados": len(nomes), "removidos": saem, "bytes_abertura": manifest["bytes_abertura"],
            "base_hash": manifest["base_hash"], "lakehouse_commit": manifest["lakehouse_commit"],
            "lakehouse_sujo": manifest["lakehouse_sujo"]}


def main(argumentos: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--origem", type=Path, help="pasta da exportação; o padrão é lakehouse_export do config.yaml")
    args = parser.parse_args(argumentos)
    try:
        origem = args.origem
        if origem is None:
            config = yaml.safe_load((RAIZ / "config.yaml").read_text(encoding="utf-8")) or {}
            if not config.get("lakehouse_export"):
                raise FalhaNaImportacao("config.yaml sem 'lakehouse_export'. Veja config.example.yaml.")
            origem = RAIZ / config["lakehouse_export"]   # caminho absoluto ignora a RAIZ; relativo parte dela
        resumo = importar(origem, RAIZ / "site" / "data", RAIZ / "contracts", RAIZ / "data" / "importacao")
    except (FalhaNaImportacao, OSError) as erro:
        print(f"ERRO: nada foi alterado em site/data.\n{erro}", file=sys.stderr)
        return 1

    print(f"Copiados: {resumo['copiados']} arquivos (manifest incluído)")
    print(f"Removidos: {len(resumo['removidos'])} {resumo['removidos'] if resumo['removidos'] else ''}".rstrip())
    print(f"Bytes da abertura: {resumo['bytes_abertura']:,}".replace(",", "."))
    sujo = " (com mudanças não commitadas)" if resumo["lakehouse_sujo"] else ""
    print(f"Base: {resumo['base_hash']} · lakehouse: {resumo['lakehouse_commit'][:7]}{sujo}")
    if sujo:
        print("Atenção: esta exportação não corresponde a um commit limpo do lakehouse.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
