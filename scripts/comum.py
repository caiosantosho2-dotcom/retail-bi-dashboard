"""Peças comuns à exportação e à reconciliação: config, conexão somente leitura e a guarda do projeto de RAG."""

import os
import subprocess
from pathlib import Path

import duckdb
import yaml

RAIZ = Path(__file__).resolve().parent.parent
PASTA_SQL = RAIZ / "scripts" / "sql"
PASTA_DADOS = RAIZ / "site" / "data"
PASTA_CONTRATOS = RAIZ / "contracts"
# Resultados intermediários das etapas da exportação (parquet), fora do git (/data/ no .gitignore). Nada vai para o RAG.
PASTA_TMP = RAIZ / "data" / "tmp"

# Ordem fixa dos segmentos (contrato). "Sem segmento" = clientes sem compra na janela de 26 semanas, que o RFM do RAG
# não segmenta: entra em "todos", mas não é um chip do filtro (spec, seção 6).
SEGMENTOS = ["Fiéis", "Regulares", "Esporádicos", "Em pausa"]
SEM_SEGMENTO = "Sem segmento"
GRUPOS = SEGMENTOS + [SEM_SEGMENTO]
PERIODOS = ["4s", "13s", "26s", "base"]


def slug(nome: str) -> str:
    """Nome de arquivo sem acento nem espaço: 'DRUG GM' -> 'drug_gm', 'ELECT &PLUMBING' -> 'elect_plumbing'."""
    import re
    import unicodedata
    texto = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", texto).strip("_")


def carregar_config() -> dict:
    cfg = yaml.safe_load((RAIZ / "config.yaml").read_text(encoding="utf-8"))
    for chave in ("duckdb_origem", "rag_dir"):
        if not cfg.get(chave):
            raise SystemExit(f"config.yaml sem '{chave}'. Veja config.example.yaml.")
    return cfg


def config_rag(cfg: dict) -> dict:
    """Parâmetros do projeto de RAG, lidos do config.yaml dele (só leitura)."""
    return yaml.safe_load((Path(cfg["rag_dir"]) / "config.yaml").read_text(encoding="utf-8"))


def conectar_origem(cfg: dict) -> duckdb.DuckDBPyConnection:
    """Conexão em memória com o banco do RAG anexado em somente leitura. As views do painel vivem no schema `painel`.
    Limite de memória e threads do config.yaml (`memoria`); o que não couber vai para data/tmp/duck, no painel."""
    memoria = cfg.get("memoria", {})
    (PASTA_TMP / "duck").mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(config={
        "memory_limit": memoria.get("memory_limit", "1GB"),
        "threads": int(memoria.get("threads", 2)),
        "temp_directory": str(PASTA_TMP / "duck"),
    })
    caminho = str(cfg["duckdb_origem"]).replace("'", "''")
    con.execute(f"ATTACH '{caminho}' AS origem (READ_ONLY)")
    con.execute("CREATE SCHEMA painel")
    return con


def rag_commit(rag_dir: str) -> tuple[str, bool]:
    """Commit do RAG usado na exportação e se havia mudança não commitada (git só leitura)."""
    commit = subprocess.run(["git", "-C", rag_dir, "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    status = subprocess.run(["git", "-C", rag_dir, "status", "--porcelain"], capture_output=True, text=True, check=True).stdout
    return commit, bool(status.strip())


# Pastas do RAG que não entram na foto: o venv e o .git são grandes e não são tocados pelo import.
_FORA_DA_FOTO = {"venv", ".venv", ".git", "node_modules"}


def foto_rag(rag_dir: str) -> dict[str, tuple[int, int]]:
    """Tamanho e data de modificação de cada arquivo do RAG (inclusive os ignorados pelo git, como logs/ e __pycache__/).
    Comparar a foto de antes com a de depois prova que a exportação não criou nem alterou nada lá."""
    foto = {}
    for raiz, pastas, arquivos in os.walk(rag_dir):
        pastas[:] = [p for p in pastas if p not in _FORA_DA_FOTO]
        for nome in arquivos:
            caminho = os.path.join(raiz, nome)
            info = os.stat(caminho)
            foto[caminho] = (info.st_size, info.st_mtime_ns)
    return foto


def conferir_rag_intocado(antes: dict, depois: dict) -> None:
    novos = sorted(set(depois) - set(antes))
    sumidos = sorted(set(antes) - set(depois))
    mudados = sorted(c for c in set(antes) & set(depois) if antes[c] != depois[c])
    if novos or sumidos or mudados:
        linhas = [f"  novo: {c}" for c in novos] + [f"  apagado: {c}" for c in sumidos] + [f"  alterado: {c}" for c in mudados]
        raise SystemExit("ERRO: a execução mexeu no projeto de RAG, que é somente leitura:\n" + "\n".join(linhas[:20]))


def ler_sql(nome: str) -> str:
    return (PASTA_SQL / nome).read_text(encoding="utf-8")
