"""Testes do importador. Rodar: python -m unittest tests.test_importar_lakehouse

Provam a promessa do script: com qualquer falha, site/data fica como estava.
"""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import importar_lakehouse as il  # noqa: E402


class TesteImportar(unittest.TestCase):
    def setUp(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        raiz = Path(pasta.name)
        self.origem, self.destino, self.contratos, self.area = raiz / "origem", raiz / "destino", raiz / "contratos", raiz / "area"
        for p in (self.origem, self.destino, self.contratos):
            p.mkdir()
        # Contratos mínimos: o real é testado na execução contra a exportação de verdade.
        self._json(self.contratos / "manifest.schema.json", {"type": "object", "required": ["versao_contrato", "arquivos"]})
        self._json(self.contratos / "serie.schema.json", {"type": "object", "required": ["linhas"]})
        self._json(self.origem / "serie_4s.json", {"linhas": [1]})
        self._manifest()
        (self.destino / ".gitkeep").write_text("")
        (self.destino / "serie_4s.json").write_text('{"linhas": []}')
        (self.destino / "lojas_ficha_4s.json").write_text("{}")

    @staticmethod
    def _json(caminho, dado):
        caminho.write_text(json.dumps(dado), encoding="utf-8")

    def _manifest(self, versao="5.0"):
        dados = (self.origem / "serie_4s.json").read_bytes()
        self._json(self.origem / "manifest.json", {
            "versao_contrato": versao, "base_hash": "abc", "bytes_abertura": 10, "lakehouse_commit": "c" * 40, "lakehouse_sujo": False,
            "arquivos": [{"nome": "serie_4s.json", "bytes": len(dados), "sha256": hashlib.sha256(dados).hexdigest()}]})

    def _foto(self):
        return {p.name: p.read_bytes() for p in self.destino.iterdir()}

    def _rodar(self):
        return il.importar(self.origem, self.destino, self.contratos, self.area)

    def _falha_sem_mexer(self):
        antes = self._foto()
        with self.assertRaises((il.FalhaNaImportacao, OSError)):
            self._rodar()
        self.assertEqual(self._foto(), antes)

    def test_sucesso_troca_e_remove_o_que_saiu(self):
        resumo = self._rodar()
        self.assertEqual(set(self._foto()), {".gitkeep", "manifest.json", "serie_4s.json"})
        self.assertEqual(resumo["removidos"], ["lojas_ficha_4s.json"])
        self.assertEqual(resumo["copiados"], 2)

    def test_json_fora_do_contrato(self):
        self._json(self.origem / "serie_4s.json", {"sem_linhas": True})
        self._manifest()
        self._falha_sem_mexer()

    def test_json_quebrado(self):
        (self.origem / "serie_4s.json").write_text("{quebrado")
        self._manifest()
        self._falha_sem_mexer()

    def test_versao_errada(self):
        self._manifest(versao="4.0")
        self._falha_sem_mexer()

    def test_arquivo_editado_depois_do_manifest(self):
        self._json(self.origem / "serie_4s.json", {"linhas": [2]})
        self._falha_sem_mexer()

    def test_arquivo_fora_do_manifest(self):
        self._json(self.origem / "serie_13s.json", {"linhas": []})
        self._falha_sem_mexer()

    def test_pasta_inexistente(self):
        self.origem = self.origem / "nao_existe"
        self._falha_sem_mexer()

    def test_item_desconhecido_no_destino(self):
        (self.destino / "outro.json").write_text("{}")
        self._falha_sem_mexer()

    def test_nome_parecido_nao_entra_na_lista_do_que_saiu(self):
        (self.destino / "departamentos_segmento_4s.json").write_text("{}")   # 'segmentos.json' não pode pegar este
        self._falha_sem_mexer()

    def test_falha_na_troca_devolve_a_pasta(self):
        renomear = Path.rename

        def falha_na_nova(caminho, alvo):
            if caminho.name == "site_data_nova":
                raise OSError("pasta em uso")
            return renomear(caminho, alvo)

        with mock.patch.object(Path, "rename", falha_na_nova):
            self._falha_sem_mexer()


if __name__ == "__main__":
    unittest.main()
