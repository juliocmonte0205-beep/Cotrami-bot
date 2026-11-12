const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const Database = require('../src/data/Database');
const { senhaHash } = require('../src/api/server');
(async () => {
  const db = new Database();
  if (db.listar('usuarios').some(u => u.perfil === 'admin')) { console.log('Já existe um administrador.'); return; }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const nome = (await rl.question('Nome do administrador: ')).trim();
    const login = (await rl.question('Login (mínimo 3 caracteres, sem espaços): ')).trim().toLowerCase();
    const senha = await rl.question('Senha (mínimo 10 caracteres; ficará visível ao digitar): ');
    if (!nome || !/^[a-z0-9._-]{3,80}$/.test(login) || senha.length < 10) throw Error('Dados inválidos.');
    db.inserir('usuarios', { nome, login, senhaHash: senhaHash(senha), perfil: 'admin', ativo: true });
    console.log('✅ Administrador criado.');
  } finally { rl.close(); }
})().catch(e => { console.error('❌', e.message); process.exitCode = 1; });
