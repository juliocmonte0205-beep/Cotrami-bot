'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');const os = require('node:os');const path = require('node:path');
const { RotasParadas } = require('../src/data/RotasParadas');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cotrami-rotas-'));
try {
  const repo = new RotasParadas(path.join(dir,'rotas.json'));
  assert.equal(repo.obter('itaitinga-fortaleza').status,'rascunho');
  const ida=repo.salvar('itaitinga-fortaleza',{trajeto:[{lat:-3.9,lng:-38.6},{lat:-3.8,lng:-38.5}],paradas:[{nome:'Parada teste',lat:-3.85,lng:-38.55}]},'teste');
  assert.equal(ida.status,'rascunho');assert.equal(ida.paradas.length,1);assert.equal(repo.obter('itaitinga-fortaleza').trajeto.length,2);
  assert.equal(repo.obter('fortaleza-itaitinga').paradas.length,0);
  repo.salvar('fortaleza-itaitinga',{trajeto:[],paradas:[{nome:'Outra parada',lat:-3.81,lng:-38.57}]},'teste');
  assert.equal(repo.obter('itaitinga-fortaleza').paradas[0].nome,'Parada teste');
  assert.throws(()=>repo.salvar('itaitinga-fortaleza',{trajeto:[],paradas:[{nome:'',lat:1,lng:1}]},'teste'));
  assert.throws(()=>repo.salvar('itaitinga-fortaleza',{trajeto:[{lat:111,lng:0}],paradas:[]},'teste'));
  assert.throws(()=>repo.obter('terceiro-sentido'));
  console.log('OK: rotas independentes, paradas, persistência, rascunho e validações.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
