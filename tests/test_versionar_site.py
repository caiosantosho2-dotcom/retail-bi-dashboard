"""Testes da pasta publicada: python -m unittest tests.test_versionar_site"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import versionar_site as vs  # noqa: E402

PAGINA = """<!doctype html><head>
<link rel="stylesheet" href="css/app.css">
<script src="https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js"></script>
<script type="module" src="js/app.js"></script>
</head><body><a href="metodologia.html">m</a></body>"""


class VersionarSite(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.raiz = Path(tmp.name)
        self.origem = self.raiz / "site"
        for caminho, texto in {"index.html": PAGINA, "js/app.js": "import './tabs/a.js';", "js/tabs/a.js": "export {};",
                               "css/app.css": "a{}", "data/x.json": "{}"}.items():
            alvo = self.origem / caminho
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(texto, encoding="utf-8")
        self.saida = self.raiz / "_site"

    def test_js_e_css_vao_para_a_pasta_da_versao(self):
        v = vs.construir(self.origem, self.saida)
        self.assertTrue((self.saida / "v" / v / "js" / "tabs" / "a.js").is_file())
        self.assertTrue((self.saida / "v" / v / "css" / "app.css").is_file())
        self.assertFalse((self.saida / "js").exists())
        self.assertFalse((self.saida / "css").exists())

    def test_dados_e_html_ficam_na_raiz(self):
        vs.construir(self.origem, self.saida)
        self.assertTrue((self.saida / "data" / "x.json").is_file())
        self.assertTrue((self.saida / "index.html").is_file())

    def test_html_aponta_para_a_versao_e_liga_a_recarga(self):
        v = vs.construir(self.origem, self.saida)
        html = (self.saida / "index.html").read_text(encoding="utf-8")
        self.assertIn(f'href="v/{v}/css/app.css"', html)
        self.assertIn(f'<script type="module" onerror="window.recarregarVersaoNova()" src="v/{v}/js/app.js">', html)
        self.assertLess(html.index("window.recarregarVersaoNova = "), html.index('<script type="module"'))
        self.assertIn('src="https://cdn.jsdelivr.net', html, "o CDN não muda")
        self.assertIn('href="metodologia.html"', html, "links entre páginas não mudam")

    def test_origem_nao_muda(self):
        vs.construir(self.origem, self.saida)
        self.assertEqual((self.origem / "index.html").read_text(encoding="utf-8"), PAGINA)

    def test_versao_muda_com_um_byte_em_js_ou_css(self):
        v1 = vs.versao_de(self.origem)
        (self.origem / "js" / "tabs" / "a.js").write_text("export { };", encoding="utf-8")
        v2 = vs.versao_de(self.origem)
        (self.origem / "css" / "app.css").write_text("b{}", encoding="utf-8")
        self.assertEqual(len({v1, v2, vs.versao_de(self.origem)}), 3)

    def test_mesmo_conteudo_mesma_versao(self):
        self.assertEqual(vs.versao_de(self.origem), vs.versao_de(self.origem))

    def test_dados_nao_mudam_a_versao(self):
        v1 = vs.versao_de(self.origem)
        (self.origem / "data" / "x.json").write_text("[]", encoding="utf-8")
        self.assertEqual(vs.versao_de(self.origem), v1)

    def test_nova_construcao_nao_deixa_a_versao_antiga(self):
        v1 = vs.construir(self.origem, self.saida)
        (self.origem / "js" / "app.js").write_text("export {};", encoding="utf-8")
        v2 = vs.construir(self.origem, self.saida)
        self.assertNotEqual(v1, v2)
        self.assertEqual([p.name for p in (self.saida / "v").iterdir()], [v2])

    def test_saida_dentro_da_origem_recusada(self):
        with self.assertRaises(ValueError):
            vs.construir(self.origem, self.origem / "_site")

    def test_pagina_sem_modulo_recusada(self):
        with self.assertRaises(ValueError):
            vs.versionar_html('<link href="css/a.css"><script src="js/a.js"></script>', "abc")

    def test_paginas_reais_do_painel(self):
        site = Path(__file__).resolve().parents[1] / "site"
        for nome in ("index.html", "metodologia.html"):
            html = vs.versionar_html((site / nome).read_text(encoding="utf-8"), "abc")
            self.assertIn('src="v/abc/js/', html)
            self.assertNotRegex(html, r'(href|src)="(js|css)/')


if __name__ == "__main__":
    unittest.main()
