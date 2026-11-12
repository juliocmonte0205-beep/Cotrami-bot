const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class Database {
  constructor() {
    this.arquivo = path.join(__dirname, '../../data/cotrami.json');
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    if (!fs.existsSync(this.arquivo)) this.salvar({ usuarios: [], linhas: [], veiculos: [], viagens: [] });
  }
  ler() { return JSON.parse(fs.readFileSync(this.arquivo, 'utf8')); }
  salvar(dados) {
    const temp = this.arquivo + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(dados, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.arquivo);
  }
  listar(tipo) { return this.ler()[tipo] || []; }
  inserir(tipo, registro) {
    const db = this.ler();
    const novo = { id: crypto.randomUUID(), ...registro };
    db[tipo].push(novo); this.salvar(db); return novo;
  }
  atualizar(tipo, id, registro) {
    const db = this.ler(); const i = db[tipo].findIndex(x => x.id === id);
    if (i < 0) return null;
    db[tipo][i] = { ...db[tipo][i], ...registro, id }; this.salvar(db); return db[tipo][i];
  }
  remover(tipo, id) {
    const db = this.ler(); const tamanho = db[tipo].length;
    db[tipo] = db[tipo].filter(x => x.id !== id);
    if (db[tipo].length === tamanho) return false;
    this.salvar(db); return true;
  }
}
module.exports = Database;
