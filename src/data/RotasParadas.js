'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ARQUIVO = path.join(__dirname, '../../data/rotas-paradas.json');
const DIRECOES = ['itaitinga-fortaleza', 'fortaleza-itaitinga'];
function coordenada(p) {
  if (!p || typeof p !== 'object' || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) throw Error('Coordenada inválida.');
  const lat = Number(p.lat), lng = Number(p.lng);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw Error('Coordenada fora do intervalo permitido.');
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
function validar(sentido, corpo) {
  if (!DIRECOES.includes(sentido)) throw Error('Sentido inválido.');
  if (!corpo || !Array.isArray(corpo.trajeto) || corpo.trajeto.length > 500 || !Array.isArray(corpo.paradas) || corpo.paradas.length > 150) throw Error('Lista de trajeto ou paradas inválida.');
  const trajeto = corpo.trajeto.map(coordenada);
  const paradas = corpo.paradas.map((p,i) => {
    const nome = typeof p.nome === 'string' ? p.nome.trim() : '';
    if (!nome || nome.length > 100) throw Error(`Nome inválido na parada ${i+1}.`);
    return { id: /^[a-f0-9-]{36}$/i.test(p.id || '') ? p.id : crypto.randomUUID(), nome, ...coordenada(p) };
  });
  return { trajeto, paradas };
}
class RotasParadas {
  constructor(arquivo = ARQUIVO) { this.arquivo = arquivo; }
  ler() {
    try { const x = JSON.parse(fs.readFileSync(this.arquivo, 'utf8')); return x && typeof x === 'object' ? x : {}; }
    catch(e) { if (e.code === 'ENOENT') return {}; throw e; }
  }
  obter(sentido) {
    if (!DIRECOES.includes(sentido)) throw Error('Sentido inválido.');
    return this.ler()[sentido] || { sentido, trajeto: [], paradas: [], status: 'rascunho', atualizadoEm: null };
  }
  salvar(sentido, corpo, usuario) {
    const valores = validar(sentido, corpo);
    const todos = this.ler();
    const registro = { sentido, ...valores, status: 'rascunho', atualizadoEm: new Date().toISOString(), atualizadoPor: String(usuario || '').slice(0,80) };
    todos[sentido] = registro;
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const tmp = `${this.arquivo}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify(todos,null,2), { mode: 0o600 }); fs.renameSync(tmp,this.arquivo); }
    finally { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    return registro;
  }
}
module.exports = { RotasParadas, DIRECOES, validar };
