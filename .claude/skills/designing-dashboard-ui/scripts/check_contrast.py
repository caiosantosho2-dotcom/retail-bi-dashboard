"""Confere o contraste WCAG 2.x entre pares de cores do tokens.css.

Uso:
    python .claude/skills/designing-dashboard-ui/scripts/check_contrast.py site/css/tokens.css

Lê as variáveis CSS (--nome: #hex;) do arquivo e testa os pares definidos em PARES.
Sai com código 1 se algum par ficar abaixo do mínimo.
"""
import re
import sys
from pathlib import Path

# (texto/marca, fundo, mínimo). 4.5 = texto normal (WCAG AA); 3.0 = texto grande,
# ícones e marcas gráficas (WCAG 1.4.11 contraste não textual).
_FUNDOS_TEXTO = ["--surface-panel", "--surface-page", "--surface-raised", "--surface-soft"]
_QUADRANTES = ["--quad-investir", "--quad-manter", "--quad-defender", "--quad-rever"]

# Tema claro (v4.2). Todo texto, inclusive notas, eixos, legendas e tooltips, a 4,5:1 em toda superfície onde aparece.
PARES = (
    [(t, f, 4.5) for t in ("--text-primary", "--text-secondary", "--text-muted") for f in _FUNDOS_TEXTO]
    # Variação (▲/▼) e aviso (⚠) são texto pequeno: 4,5:1, não 3:1.
    + [(t, f, 4.5) for t in ("--status-good", "--status-critical", "--status-warning") for f in _FUNDOS_TEXTO[:3]]
    + [("--accent-text", "--accent", 4.5), ("--link", "--surface-panel", 4.5), ("--link", "--surface-page", 4.5)]
    # Nome do quadrante (text-secondary) e o ponto (primária) sobre a área de cada quadrante.
    + [(t, q, m) for q in _QUADRANTES for t, m in (("--text-secondary", 4.5), ("--text-muted", 4.5), ("--data-primaria", 3.0))]
    # Marcas gráficas: 3:1 no painel (WCAG 1.4.11).
    + [(c, "--surface-panel", 3.0) for c in ("--data-primaria", "--data-secundaria", "--data-anterior",
                                           "--seg-fieis", "--seg-regulares", "--seg-esporadicos", "--seg-em-pausa", "--seg-outros",
                                           "--axis")]
)


def _lum(hex_cor: str) -> float:
    h = hex_cor.lstrip("#")
    canais = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in canais]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contraste(a: str, b: str) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def ler_tokens(caminho: Path) -> dict:
    texto = caminho.read_text(encoding="utf-8")
    return dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b", texto))


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    tokens = ler_tokens(Path(sys.argv[1]))
    falhas = 0
    for frente, fundo, minimo in PARES:
        if frente not in tokens or fundo not in tokens:
            print(f"[FALTA] {frente} ou {fundo} não está no arquivo")
            falhas += 1
            continue
        r = contraste(tokens[frente], tokens[fundo])
        ok = r >= minimo
        falhas += not ok
        print(f"[{'OK ' if ok else 'FALHA'}] {frente} sobre {fundo}: {r:.2f}:1 (mínimo {minimo})")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
