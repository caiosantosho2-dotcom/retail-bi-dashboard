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
PARES = [
    ("--text-primary", "--surface-panel", 4.5),
    ("--text-secondary", "--surface-panel", 4.5),
    ("--text-muted", "--surface-panel", 3.0),
    ("--text-primary", "--surface-page", 4.5),
    ("--accent-text", "--accent", 4.5),
    ("--seg-fieis", "--surface-panel", 3.0),
    ("--seg-regulares", "--surface-panel", 3.0),
    ("--seg-esporadicos", "--surface-panel", 3.0),
    ("--seg-em-pausa", "--surface-panel", 3.0),
    ("--status-good", "--surface-panel", 3.0),
    ("--status-warning", "--surface-panel", 3.0),
    ("--status-critical", "--surface-panel", 3.0),
]


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
