class ChatbotService {
  constructor(menuService, sessionManager, db) {
    this.menuService = menuService; this.sessionManager = sessionManager; this.db = db;
    this.saudacoes = new Set(['oi','olá','ola','menu','bom dia','boa tarde','boa noite','iniciar']);
  }
  processarMensagem(usuario, texto) {
    const mensagem = String(texto || '').trim().toLowerCase();
    if (this.saudacoes.has(mensagem) || mensagem === '0') {
      this.sessionManager.definir(usuario, 'menu'); return this.menuService.obterMenuPrincipal();
    }
    if (mensagem === '1') {
      this.sessionManager.definir(usuario, '1');
      const linhas = this.db.listar('linhas');
      return linhas.length ? '🚌 *LINHAS COTRAMI*\n\n'+linhas.map(l=>`• ${l.nome}: ${l.origem} → ${l.destino}`).join('\n')+'\n\nDigite *0* para voltar.' : this.menuService.obterResposta('1');
    }
    if (mensagem === '2') {
      this.sessionManager.definir(usuario, 'aguardando_data');
      return '🕒 *CONSULTAR HORÁRIOS*\n\nDigite a data desejada no formato *DD/MM/AAAA*.\n\nDigite *0* para voltar.';
    }
    if (this.sessionManager.obter(usuario) === 'aguardando_data') {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mensagem);
      if (!m) return '❌ Informe a data no formato *DD/MM/AAAA* ou digite *0*.';
      const data = `${m[3]}-${m[2]}-${m[1]}`;
      if (Number.isNaN(Date.parse(data+'T12:00:00Z'))) return '❌ Data inválida. Tente novamente.';
      const viagens = this.db.listar('viagens').filter(v=>v.data===data).sort((a,b)=>a.hora.localeCompare(b.hora));
      if (!viagens.length) return '🕒 Não há escala cadastrada para essa data. Isso não significa que não haverá viagens.\n\nDigite outra data ou *0*.';
      const veiculos=this.db.listar('veiculos');
      return `🚌 *ESCALA DE ${mensagem}*\n\n`+viagens.map(v=>`${v.hora} — ${v.origem} → ${v.destino} | Carro ${veiculos.find(c=>c.id===v.veiculoId)?.numero||'a confirmar'}`).join('\n')+'\n\n*Horários previstos, sujeitos a alterações.*\nDigite outra data ou *0*.';
    }
    if (this.menuService.possuiOpcao(mensagem)) {
      this.sessionManager.definir(usuario, mensagem); return this.menuService.obterResposta(mensagem);
    }
    if (!this.sessionManager.existe(usuario)) {
      this.sessionManager.definir(usuario, 'menu'); return this.menuService.obterMenuPrincipal();
    }
    return this.menuService.obterMensagemInvalida();
  }
}
module.exports = ChatbotService;
