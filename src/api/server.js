const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const Database = require('../data/Database');
const db = new Database();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../../public')));
const sessoes = new Map();
function senhaHash(senha, sal = crypto.randomBytes(16).toString('hex')) {
  return `${sal}:${crypto.scryptSync(senha, sal, 64).toString('hex')}`;
}
function verificarSenha(senha, armazenado) {
  if (typeof armazenado !== 'string' || !armazenado.includes(':')) return false;
  const [sal, hashSalvo] = armazenado.split(':');
  const esperado = Buffer.from(hashSalvo, 'hex');
  const recebido = crypto.scryptSync(senha, sal, 64);
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}
function autenticar(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const sessao = sessoes.get(token);
  if (!sessao || sessao.expira < Date.now()) return res.status(401).json({ erro: 'Faça login novamente.' });
  const usuario = db.listar('usuarios').find(u => u.id === sessao.id && u.ativo);
  if (!usuario) return res.status(401).json({ erro: 'Acesso revogado.' });
  req.usuario = usuario; req.token = token; next();
}
function admin(req, res, next) {
  if (req.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Apenas administradores.' });
  next();
}
const texto = (v, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const horaValida = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const dataValida = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));
const erro = (res, msg) => res.status(400).json({ erro: msg });
app.post('/api/login', (req, res) => {
  const usuario = db.listar('usuarios').find(u => u.login === texto(req.body?.login, 80).toLowerCase() && u.ativo);
  if (!usuario || !verificarSenha(String(req.body?.senha || ''), usuario.senhaHash)) return res.status(401).json({ erro: 'Login ou senha inválidos.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessoes.set(token, { id: usuario.id, expira: Date.now() + 8 * 3600_000 });
  res.json({ token, perfil: usuario.perfil, nome: usuario.nome });
});
app.post('/api/logout', autenticar, (req, res) => { sessoes.delete(req.token); res.json({ ok: true }); });
app.get('/api/me', autenticar, (req, res) => res.json({ nome: req.usuario.nome, perfil: req.usuario.perfil }));
app.get('/api/usuarios', autenticar, admin, (req, res) => res.json(db.listar('usuarios').map(({ senhaHash, ...u }) => u)));
app.post('/api/usuarios', autenticar, admin, (req, res) => {
  const nome = texto(req.body?.nome), login = texto(req.body?.login, 80).toLowerCase(), senha = String(req.body?.senha || '');
  const perfil = req.body?.perfil === 'admin' ? 'admin' : 'cooperado';
  if (!nome || !/^[a-z0-9._-]{3,80}$/.test(login) || senha.length < 10) return erro(res, 'Informe nome, login válido e senha com pelo menos 10 caracteres.');
  if (db.listar('usuarios').some(u => u.login === login)) return erro(res, 'Login já cadastrado.');
  const u = db.inserir('usuarios', { nome, login, senhaHash: senhaHash(senha), perfil, ativo: true });
  res.status(201).json({ id: u.id, nome, login, perfil });
});
const config = {
  linhas: ['nome', 'origem', 'destino'],
  veiculos: ['numero', 'descricao'],
  viagens: ['data', 'hora', 'origem', 'destino', 'linhaId', 'veiculoId']
};
function validar(tipo, body, id) {
  const registro = {};
  for (const campo of config[tipo]) registro[campo] = texto(body?.[campo], 120);
  if (Object.values(registro).some(v => !v)) return { erro: 'Preencha todos os campos.' };
  if (tipo === 'viagens') {
    if (!dataValida(registro.data) || !horaValida(registro.hora)) return { erro: 'Data ou horário inválido.' };
    if (!db.listar('linhas').some(x => x.id === registro.linhaId) || !db.listar('veiculos').some(x => x.id === registro.veiculoId)) return { erro: 'Linha ou veículo não cadastrado.' };
    if (db.listar('viagens').some(x => x.id !== id && x.data === registro.data && x.hora === registro.hora && x.veiculoId === registro.veiculoId)) return { erro: 'Este carro já tem uma viagem nesse horário.' };
  }
  if (tipo === 'veiculos' && db.listar('veiculos').some(x => x.id !== id && x.numero.toLowerCase() === registro.numero.toLowerCase())) return { erro: 'Número de carro já cadastrado.' };
  return { registro };
}
for (const tipo of Object.keys(config)) {
  app.get(`/api/${tipo}`, autenticar, (req, res) => res.json(db.listar(tipo)));
  app.post(`/api/${tipo}`, autenticar, (req, res) => {
    const v = validar(tipo, req.body); if (v.erro) return erro(res, v.erro);
    const novo = db.inserir(tipo, { ...v.registro, criadoPor: req.usuario.login, atualizadoEm: new Date().toISOString() });
    res.status(201).json(novo);
  });
  app.put(`/api/${tipo}/:id`, autenticar, (req, res) => {
    const v = validar(tipo, req.body, req.params.id); if (v.erro) return erro(res, v.erro);
    const atualizado = db.atualizar(tipo, req.params.id, { ...v.registro, atualizadoPor: req.usuario.login, atualizadoEm: new Date().toISOString() });
    if (!atualizado) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json(atualizado);
  });
  app.delete(`/api/${tipo}/:id`, autenticar, (req, res) => {
    if (tipo === 'linhas' && db.listar('viagens').some(x => x.linhaId === req.params.id)) return erro(res, 'Linha vinculada a viagens.');
    if (tipo === 'veiculos' && db.listar('viagens').some(x => x.veiculoId === req.params.id)) return erro(res, 'Veículo vinculado a viagens.');
    if (!db.remover(tipo, req.params.id)) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json({ ok: true });
  });
}
// Consulta sem login: somente informações operacionais, sem dados dos cooperados.
app.get('/api/publico/viagens', (req, res) => {
  const data = texto(req.query.data, 10);
  if (!dataValida(data)) return erro(res, 'Informe data no formato AAAA-MM-DD.');
  const linhas = db.listar('linhas'), veiculos = db.listar('veiculos');
  const viagens = db.listar('viagens').filter(x => x.data === data).sort((a,b) => a.hora.localeCompare(b.hora)).map(x => ({
    data: x.data, hora: x.hora, origem: x.origem, destino: x.destino,
    linha: linhas.find(l => l.id === x.linhaId)?.nome || 'Não informada',
    carro: veiculos.find(v => v.id === x.veiculoId)?.numero || 'Não informado'
  }));
  res.json(viagens);
});
app.get('/api/publico/linhas', (req, res) => res.json(db.listar('linhas').map(({nome,origem,destino})=>({nome,origem,destino}))));
function iniciarApi() {
  const porta = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  app.listen(porta, host, () => console.log(`🖥️ Painel COTRAMI: http://${host}:${porta}`));
}
module.exports = { iniciarApi, senhaHash };
