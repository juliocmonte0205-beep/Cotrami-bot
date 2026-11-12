class SessionManager {
  constructor() {
    this.sessoes = new Map();
  }

  existe(usuario) {
    return this.sessoes.has(usuario);
  }

  definir(usuario, estado) {
    this.sessoes.set(usuario, estado);
  }

  obter(usuario) {
    return this.sessoes.get(usuario);
  }
}

module.exports = SessionManager;
