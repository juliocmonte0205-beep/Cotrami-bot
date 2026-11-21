const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const Database = require('../data/Database');
const { importarExcel } = require('../services/ExcelImporter');
const EscalasImportadas = require('../data/EscalasImportadas');
const escalas = new EscalasImportadas();
const previas = new Map(); // temporárias, no processo, vinculadas à sessão
const db = new Database();
const app = express();
const AchadosPerdidos = require('../data/AchadosPerdidos');
const achadosPerdidos = new AchadosPerdidos(); // ETAPA6_ACHADOS
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

// ETAPA6_ACHADOS — Acesso restrito aos administradores.
app.get('/api/achados', autenticar, admin, (req,res) => {
  try { res.set('Cache-Control','no-store'); res.json(achadosPerdidos.listar().map(({usuario, ...item}) => ({...item, usuario: usuario.replace(/.(?=.{4})/g,'*')})).reverse()); }
  catch (e) { console.error(e); res.status(500).json({erro:'Não foi possível listar os protocolos.'}); }
});
app.put('/api/achados/:protocolo', autenticar, admin, (req,res) => {
  try {
    const status = String(req.body?.status || '');
    const observacao = String(req.body?.observacaoInterna || '');
    const registro = achadosPerdidos.atualizar(req.params.protocolo, status, observacao, req.usuario.login);
    if (!registro) return res.status(404).json({erro:'Protocolo não encontrado.'});
    res.set('Cache-Control','no-store'); res.json({protocolo:registro.protocolo, status:registro.status});
  } catch(e) { res.status(400).json({erro:e.message}); }
});

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
// Pré-visualização de Excel: nunca grava no banco ou publica viagens.
// Aceita somente o corpo binário de um .xlsx, limitado a 8 MB.
const receberExcel = express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '8mb' });
app.post('/api/importacao/preview', autenticar, admin, receberExcel, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 4) {
    return res.status(400).json({ erro: 'Selecione um arquivo .xlsx válido.' });
  }
  // XLSX é um contêiner ZIP e começa normalmente com PK.
  if (req.body[0] !== 0x50 || req.body[1] !== 0x4b) {
    return res.status(400).json({ erro: 'O arquivo enviado não parece ser um Excel .xlsx.' });
  }
  try {
    const resultado = await importarExcel(req.body);
    if (!resultado.totalBlocos) {
      return res.status(422).json({ erro: 'Nenhum bloco compatível com o padrão Itaitinga/Fortaleza foi encontrado.' });
    }
    // A confirmação usa dados armazenados no servidor, nunca dados adulteráveis do navegador.
    const previewId = crypto.randomUUID();
    for (const [chave, previa] of previas) if (previa.expira < Date.now()) previas.delete(chave);
    previas.set(previewId, { token: req.token, idUsuario: req.usuario.id, expira: Date.now() + 30 * 60_000, blocos: resultado.blocos, arquivo: resultado.arquivo });
    res.set('Cache-Control', 'no-store');
    res.json({ ...resultado, previewId });
  } catch (e) {
    console.error('Erro ao interpretar arquivo Excel:', e.message);
    res.status(422).json({ erro: 'Não foi possível ler a planilha. Verifique se é um .xlsx válido.' });
  }
});
// Evita devolver HTML genérico para uploads com tipo não suportado.
app.post('/api/importacao/preview', autenticar, admin, (req, res) => {
  res.status(415).json({ erro: 'Formato não suportado. Envie um Excel .xlsx.' });
});


// Rascunhos separados dos cadastros atuais. Escala de teste NÃO substitui horários fixos.
const diaNumero = { DOMINGO: 0, SEGUNDA: 1, TERCA: 2, QUARTA: 3, QUINTA: 4, SEXTA: 5, SABADO: 6 };
function isoDia(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const d = new Date(data + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data ? d : null;
}
function dataDoDia(segunda, dia) {
  const d = isoDia(segunda);
  if (!d || d.getUTCDay() !== 1) return null;
  d.setUTCDate(d.getUTCDate() + (diaNumero[dia] + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function resumoEscala(e) {
  const { registros, ...resumo } = e;
  return { ...resumo, quantidadeVeiculos: registros.length, quantidadeViagens: registros.reduce((n, r) => n + r.viagens.length, 0) };
}
app.post('/api/importacao/rascunhos', autenticar, admin, (req, res) => {
  const previa = previas.get(req.body?.previewId);
  if (!previa || previa.expira < Date.now() || previa.token !== req.token || previa.idUsuario !== req.usuario.id) {
    return res.status(410).json({ erro: 'Prévia expirada. Envie o Excel novamente.' });
  }
  const indice = req.body?.indice;
  if (!Number.isInteger(indice) || indice < 0 || indice >= previa.blocos.length) return erro(res, 'Selecione um bloco válido.');
  const bloco = previa.blocos[indice];
  const dia = texto(req.body?.dia, 15).toUpperCase();
  if (!Object.hasOwn(diaNumero, dia)) return erro(res, 'Escolha o dia da semana do bloco.');
  if (bloco.diaSemana && bloco.diaSemana !== dia) return erro(res, `O Excel identifica ${bloco.diaSemana}; confirme o dia correto na planilha.`);
  const semanaInicio = texto(req.body?.semanaInicio, 10);
  const data = dataDoDia(semanaInicio, dia);
  if (!data) return erro(res, 'Informe a segunda-feira da semana escolhida.');
  const registros = bloco.registros.map(r => ({
    ordem: r.ordem,
    carroPrevisto: r.carroPrevisto,
    carroReal: r.carroReal,
    carro: r.carroReal || r.carroPrevisto || null,
    viagens: r.viagens.map(v => ({ ordemViagem: v.ordemViagem, itaitinga: v.itaitinga, fortaleza: v.fortaleza }))
  }));
  if (!registros.length || registros.some(r => !r.carro || !r.viagens.length)) {
    return res.status(422).json({ erro: 'Existem registros sem veículo ou sem viagens. Confira a planilha.' });
  }
  const avisos = [...(bloco.avisos || [])];
  const esperados = dia === 'DOMINGO' ? 6 : dia === 'SABADO' ? 12 : 13;
  if (registros.length !== esperados) avisos.push(`Este bloco tem ${registros.length} veículos; a operação atual informada utiliza ${esperados} neste tipo de dia.`);
  const criado = escalas.inserir({
    linha: 'Itaitinga–Fortaleza', arquivo: previa.arquivo, aba: bloco.aba,
    referenciaOriginal: bloco.referenciaTexto, semanaInicio, dia, data, registros,
    avisos, criadoPor: req.usuario.login
  });
  res.set('Cache-Control', 'no-store');
  res.status(201).json(resumoEscala(criado));
});
app.get('/api/importacao/rascunhos', autenticar, admin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(escalas.listar().map(resumoEscala).reverse());
});
app.get('/api/importacao/rascunhos/:id', autenticar, admin, (req, res) => {
  const registro = escalas.listar().find(x => x.id === req.params.id);
  if (!registro) return res.status(404).json({ erro: 'Escala não encontrada.' });
  res.set('Cache-Control', 'no-store');
  res.json(registro);
});
app.put('/api/importacao/rascunhos/:id/justificativa', autenticar, admin, (req, res) => {
  const { motivo, detalhes, carrosAfetados } = req.body || {};
  const resultado = escalas.registrarJustificativa(req.params.id, req.usuario.login, motivo, detalhes, carrosAfetados ?? '');
  if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
  res.set('Cache-Control', 'no-store');
  res.json(resumoEscala(resultado.registro));
});
app.post('/api/importacao/rascunhos/:id/publicar', autenticar, admin, (req, res) => {
  const resultado = escalas.publicar(req.params.id, req.usuario.login);
  if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
  res.set('Cache-Control', 'no-store');
  res.json(resumoEscala(resultado.registro));
});
// Consulta pública SOMENTE de escalas explicitamente publicadas, por data exata.
// Não altera /api/publico/viagens nem ativa o chatbot automaticamente.
app.get('/api/publico/escalas', (req, res) => {
  const data = texto(req.query.data, 10);
  if (!isoDia(data)) return erro(res, 'Informe uma data válida AAAA-MM-DD.');
  const resultado = escalas.listar().filter(x => x.status === 'publicada' && x.data === data)
    .map(x => ({ linha: x.linha, data: x.data, dia: x.dia, publicadoEm: x.publicadoEm,
      registros: x.registros.map(r => ({ carro: r.carro, viagens: r.viagens })) }));
  res.set('Cache-Control', 'no-store');
  res.json(resultado);
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
// COTRAMI ETAPA 9A ROTAS
const criarRotasRouter = require('../routes/rotasRouter');
app.use('/api/rotas', autenticar, admin, criarRotasRouter());
function iniciarApi() {
  const porta = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  app.listen(porta, host, () => console.log(`🖥️ Painel COTRAMI: http://${host}:${porta}`));
}
module.exports = { iniciarApi, senhaHash };
