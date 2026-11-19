'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EscalasImportadas = require('../src/data/EscalasImportadas');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cotrami-escala-teste-'));
try {
  const banco = new EscalasImportadas();
  banco.arquivo = path.join(pasta, 'teste.json');
  const registros = Array.from({length:10}, (_, i) => ({ordem:i+1, carro:String(i+1), viagens:[{itaitinga:'06:00',fortaleza:'07:00'}]}));
  const escala = banco.inserir({data:'2026-11-16', dia:'SEGUNDA', linha:'Itaitinga–Fortaleza', registros});
  assert.match(banco.publicar(escala.id,'admin').erro, /justificativa/i);
  assert.match(banco.registrarJustificativa(escala.id,'admin','outro','curto','').erro,/10 a 500/);
  const j = banco.registrarJustificativa(escala.id,'admin','defeito_mecanico','Três veículos com problemas mecânicos.','12, 18 e 20');
  assert.equal(j.registro.justificativaFrota.diferenca,3);
  assert.equal(j.registro.justificativaFrota.registradoPor,'admin');
  assert.equal(banco.publicar(escala.id,'admin').registro.status,'publicada');
  assert.match(banco.registrarJustificativa(escala.id,'admin','outro','Nova descrição','').erro,/rascunhos/);
  const normal = banco.inserir({data:'2026-11-17',dia:'SEGUNDA',linha:'Itaitinga–Fortaleza',registros:[...registros,...registros.slice(0,3)]});
  assert.equal(banco.publicar(normal.id,'admin').registro.status,'publicada');
  console.log('OK: justificativa obrigatória, validações, publicação e histórico verificados.');
} finally { fs.rmSync(pasta,{recursive:true,force:true}); }
