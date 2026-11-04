// Textos dos blocos de decisão contra os JSONs de verdade, sem navegador: node --test tests/decisao_textos.test.mjs
// Nenhum número esperado sai de conta nova: ou vem do arquivo, ou é o gabarito do relatório da gold (v4_1_gold.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OBJETIVOS, capacidadesDe, destaquesDe, fraseHistorica, linhaCrm, notaCalibracao, notaRecorte, soEmPausa, subtituloCrm, temEmPausa } from '../site/js/decisao_textos.js';
import { fmt } from '../site/js/formatar.js';

const ler = (nome) => JSON.parse(readFileSync(new URL(`../site/data/${nome}`, import.meta.url), 'utf8')).linhas;
const crm = ler('acionamento_crm.json');
const recorte = (p, s) => ler(`departamentos_quadrante_${p}.json`).filter((l) => l.subconjunto === s);
const frase = (n, o) => fraseHistorica(o, linhaCrm(crm, n, o, 'modelo'), linhaCrm(crm, n, o, 'regra_simples'));

test('capacidades da spec, em ordem', () => assert.deepEqual(capacidadesDe(crm), [25, 50, 100, 150, 200, 300]));

test('o subtítulo troca com o objetivo', () => {
  assert.equal(subtituloCrm(100, 'pausas'), 'Com capacidade para 100 clientes, priorizando quem tem mais chance de pausar');
  assert.equal(subtituloCrm(50, 'valor'), 'Com capacidade para 50 clientes, priorizando quem tem mais chance de pausar e mais valor');
});

test('a nota de calibração sai da linha escolhida, em todas as 12 combinações', () => {
  assert.equal(notaCalibracao(linhaCrm(crm, 100, 'pausas', 'modelo')), 'No teste, 40,8 pausas esperadas viraram 32,0 reais nos 100 primeiros (média das fotos do teste).');
  assert.equal(notaCalibracao(linhaCrm(crm, 300, 'valor', 'modelo')), 'No teste, 41,1 pausas esperadas viraram 41,5 reais nos 300 primeiros (média das fotos do teste).');
  for (const l of crm.filter((x) => x.metodo === 'modelo')) {
    const nota = notaCalibracao(l);
    assert.ok(nota.includes(fmt.decimal(l.pausas_esperadas_historicas, 1)) && nota.includes(fmt.decimal(l.pausas_reais_historicas, 1)) && nota.includes(`${l.capacidade} primeiros`), nota);
  }
});

test('regra simples não tem nota de calibração (colunas nulas)', () => assert.equal(notaCalibracao(linhaCrm(crm, 100, 'pausas', 'regra_simples')), ''));

test('quem ganha: 6 de 6 em pausas e 5 de 6 em valor, com a regra simples em N = 100 (gabarito da gold)', () => {
  const vencedores = (o) => capacidadesDe(crm).map((n) => frase(n, o).vencedor);
  assert.deepEqual(vencedores('pausas'), Array(6).fill('modelo'));
  assert.deepEqual(vencedores('valor'), ['modelo', 'modelo', 'regra', 'modelo', 'modelo', 'modelo']);
});

test('as frases da spec, com os números do gabarito', () => {
  assert.equal(frase(100, 'pausas').texto, 'Dos 100 primeiros, 32,0% pausaram de fato, contra 28,0% pela regra simples.');
  assert.equal(frase(100, 'pausas').conclusao, 'O modelo ganha.');
  assert.equal(frase(100, 'valor').texto, 'Os 100 primeiros concentravam US$ 5.987,85 do valor das pausas reais, contra US$ 6.600,08 pela regra simples.');
  assert.equal(frase(100, 'valor').conclusao, 'A regra simples ganha.');
});

test('empate é dito como empate', () => {
  const linha = { capacidade: 10, precisao_historica: 0.5, pausas_capturadas_historica: 0.1 };
  assert.equal(fraseHistorica('pausas', linha, linha).vencedor, 'empate');
});

test('mix de cada combinação soma a capacidade (o tamanho da barra confere)', () => {
  for (const l of crm.filter((x) => x.metodo === 'modelo')) assert.equal(Object.values(l.mix_segmentos).reduce((a, b) => a + b, 0), l.capacidade);
});

test('destaques em ordem: gabarito da gold, 26 s, todos', () => {
  assert.deepEqual(destaquesDe(recorte('26s', 'todos')).map((l) => [l.departamento, fmt.gap(l.valor_gap)]),
    [['MEAT', '−US$ 9.201,43'], ['MEAT-PCKGD', '−US$ 2.600,03'], ['PASTRY', '−US$ 691,33']]);
});

test('notas dos recortes pequenos (G47)', () => {
  assert.equal(notaRecorte(recorte('26s', 'todos')), '');
  assert.equal(notaRecorte(recorte('4s', 'Em pausa')), 'Nenhum departamento com amostra suficiente neste recorte.');
  assert.equal(notaRecorte(recorte('13s', 'Em pausa')), 'Nenhum departamento em Defender neste recorte (1 com amostra suficiente).');
  assert.equal(notaRecorte(recorte('13s', 'Esporádicos')), 'Só 2 departamentos em Defender neste recorte (9 com amostra suficiente).');
  assert.equal(notaRecorte(recorte('26s', 'Fiéis')), 'Só 2 departamentos em Defender neste recorte (14 com amostra suficiente).');
});

test('os rótulos do objetivo não prometem pausa evitada', () => assert.deepEqual([OBJETIVOS.pausas.rotulo, OBJETIVOS.valor.rotulo], ['Priorizar risco de pausa', 'Priorizar valor em risco']));

test('"Em pausa": sozinho, sem gráfico; junto de outros, aviso; sem chip ligado, nenhum dos dois', () => {
  assert.deepEqual(['Em pausa', 'Esporádicos+Em pausa', 'Fiéis+Regulares+Esporádicos+Em pausa', 'Fiéis', 'todos'].map((s) => [soEmPausa(s), temEmPausa(s)]),
    [[true, true], [false, true], [false, true], [false, false], [false, false]]);
});

test('gap com sinal', () => assert.equal(fmt.gap(718.22), '+US$ 718,22'));
