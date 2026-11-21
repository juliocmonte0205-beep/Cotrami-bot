'use strict';
const EscalasImportadas = require('../data/EscalasImportadas');
const AchadosPerdidos = require('../data/AchadosPerdidos');

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function dataBRparaISO(entrada) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(entrada);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const data = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === iso ? iso : null;
}

class ChatbotService {
  // 4º argumento opcional: permite testes sem tocar no armazenamento real.
  constructor(menuService, sessionManager, db, escalas = new EscalasImportadas(), achados = new AchadosPerdidos(), iaService = null) {
    this.menuService = menuService;
    this.sessionManager = sessionManager;
    this.db = db;
    this.escalas = escalas;
    this.achados = achados;
    this.iaService = iaService;
    this.ocorrencias = new Map();
    this.protocolosEmConsulta = new Map();
    this.paginasProtocolos = new Map();
    this.mensagensExtras = new Map();
    this.saudacoes = new Set(['oi', 'olá', 'ola', 'menu', 'bom dia', 'boa tarde', 'boa noite', 'iniciar']);
    this.consultas = new Map(); // guarda apenas data/direção por usuário; não guarda escalas
  }

  buscarEscalaPublicada(iso) {
    const lista = this.escalas.listar();
    // Nunca consultar rascunhos e nunca usar datas ou dias aproximados.
    return lista.find(e => e.status === 'publicada' && e.data === iso && e.linha === 'Itaitinga–Fortaleza') || null;
  }

  obterSaidas(escala, origem) {
    const saidas = [];
    for (const registro of escala.registros || []) {
      for (const viagem of registro.viagens || []) {
        const hora = viagem[origem];
        if (typeof hora === 'string' && HORA.test(hora)) {
          saidas.push({ hora, carro: String(registro.carro || 'a confirmar'), viagem: viagem.ordemViagem });
        }
      }
    }
    return saidas.sort((a, b) => a.hora.localeCompare(b.hora) || a.carro.localeCompare(b.carro));
  }

  processarMensagem(usuario, texto) {
    const mensagem = String(texto || '').trim().toLowerCase();
    if (this.saudacoes.has(mensagem) || mensagem === '0') {
      this.sessionManager.definir(usuario, 'menu');
      this.consultas.delete(usuario);
      this.ocorrencias.delete(usuario);
      this.protocolosEmConsulta.delete(usuario);
      this.paginasProtocolos.delete(usuario);
      this.mensagensExtras.delete(usuario);
      return this.menuService.obterMenuPrincipal();
    }

    const estado = this.sessionManager.obter(usuario);
    if (estado === 'achados_consulta' && mensagem === '7') return this.iniciarConsultaAchados(usuario);
    if (estado && estado.startsWith('achados_')) return this.processarAchados(usuario, mensagem, estado);
    if (mensagem === '6') return this.iniciarAchados(usuario);
    if (mensagem === '7') return this.iniciarConsultaAchados(usuario);
    // Ao aguardar direção, 1/2 são respostas à pergunta e não opções do menu.
    if (estado === 'aguardando_origem') {
      if (!['1', '2'].includes(mensagem)) return '❌ Escolha *1* (Itaitinga) ou *2* (Fortaleza).\nDigite *0* para voltar.';
      const consulta = this.consultas.get(usuario);
      if (!consulta) {
        this.sessionManager.definir(usuario, 'aguardando_data');
        return 'A consulta expirou. Informe a data em *DD/MM/AAAA*.';
      }
      consulta.origem = mensagem === '1' ? 'itaitinga' : 'fortaleza';
      this.sessionManager.definir(usuario, 'aguardando_hora');
      return this.responderSaidas(consulta, null);
    }

    if (estado === 'aguardando_hora') {
      const consulta = this.consultas.get(usuario);
      if (!consulta) return this.iniciarConsulta(usuario);
      if (mensagem === 'data') {
        return this.iniciarConsulta(usuario);
      }
      const m = /^(?:às?\s*)?(\d{1,2}):(\d{2})$/.exec(mensagem);
      if (!m || !HORA.test(`${m[1].padStart(2, '0')}:${m[2]}`)) {
        return '❌ Digite um horário como *06:00*, *data* para outra data ou *0* para o menu.';
      }
      return this.responderSaidas(consulta, `${m[1].padStart(2, '0')}:${m[2]}`);
    }

    if (mensagem === '1' && estado !== 'aguardando_data') {
      this.sessionManager.definir(usuario, '1');
      const linhas = this.db.listar('linhas');
      return linhas.length
        ? '🚌 *LINHAS COTRAMI*\n\n' + linhas.map(l => `• ${l.nome}: ${l.origem} → ${l.destino}`).join('\n') + '\n\nDigite *0* para voltar.'
        : this.menuService.obterResposta('1');
    }

    if (mensagem === '2' && estado !== 'aguardando_data') return this.iniciarConsulta(usuario);

    if (estado === 'aguardando_data') {
      const iso = dataBRparaISO(mensagem);
      if (!iso) return '❌ Data inválida. Informe *DD/MM/AAAA* (ex.: 20/11/2026) ou digite *0*.';
      let escala;
      try { escala = this.buscarEscalaPublicada(iso); }
      catch (e) {
        console.error('Falha ao consultar escalas importadas:', e.message);
        return '⚠️ Não foi possível consultar a escala neste momento. Tente novamente mais tarde.';
      }
      if (!escala) return '🕒 Não há escala *publicada* para essa data na linha Itaitinga–Fortaleza. Isso não significa que não haverá viagens.\n\nDigite outra data ou *0*.';
      const consulta = { iso, dataBR: mensagem, origem: null };
      this.consultas.set(usuario, consulta);
      this.sessionManager.definir(usuario, 'aguardando_origem');
      return `🚌 *ESCALA PUBLICADA — ${mensagem}*\nLinha: Itaitinga–Fortaleza\n\nDe onde você quer sair?\n*1* — Itaitinga\n*2* — Fortaleza\n\nDigite *0* para voltar.`;
    }

    if (this.menuService.possuiOpcao(mensagem)) {
      this.sessionManager.definir(usuario, mensagem);
      return this.menuService.obterResposta(mensagem);
    }
    if (!this.sessionManager.existe(usuario)) {
      this.sessionManager.definir(usuario, 'menu');
      return this.menuService.obterMenuPrincipal();
    }
    return this.menuService.obterMensagemInvalida();
  }

  // Camada opcional: a IA apenas classifica intenção; não cria horários, carros ou protocolos.
  // Mantém processarMensagem síncrono para compatibilidade com testes e fluxos antigos.
  async processarMensagemComIA(usuario, texto) {
    const mensagem = String(texto || '').trim();
    const normalizada = mensagem.toLowerCase();
    const estado = this.sessionManager.obter(usuario);

    // Nunca interceptar respostas de formulários, datas, horários nem comandos do menu.
    if (!this.iaService || !this.iaService.ativo ||
        (estado && (estado.startsWith('achados_') || estado.startsWith('aguardando_'))) ||
        this.saudacoes.has(normalizada) || /^(?:[0-7]|mais|anterior|data)$/.test(normalizada) ||
        /^AP-[A-F0-9]{12}$/i.test(mensagem)) {
      return this.processarMensagem(usuario, texto);
    }

    let intencao = 'outro';
    try {
      intencao = await this.iaService.classificar(mensagem);
    } catch (erro) {
      console.warn('⚠️ Ollama indisponível; mantendo atendimento por menu:', erro.message);
    }

    switch (intencao) {
      case 'achados_perdido':
      case 'achados_encontrado': {
        // Não pressupõe dados omitidos e não registra ocorrência sem confirmação.
        const tipo = intencao === 'achados_perdido' ? 'perdido' : 'encontrado';
        this.ocorrencias.set(usuario, { tipo });
        this.sessionManager.definir(usuario, 'achados_descricao');
        return `🧳 Entendi que você ${tipo === 'perdido' ? 'perdeu' : 'encontrou'} um objeto. Vou ajudar com o registro.\n\n📝 Descreva o objeto com detalhes (por exemplo, cor e características).\n\nDigite *0* para cancelar.`;
      }
      case 'consultar_protocolo':
        return this.iniciarConsultaAchados(usuario);
      case 'consultar_horarios':
        return this.iniciarConsulta(usuario);
      case 'consultar_linhas':
        return this.processarMensagem(usuario, '1');
      case 'menu':
        return this.processarMensagem(usuario, '0');
      default:
        return this.processarMensagem(usuario, texto);
    }
  }

  // Permite que o WhatsApp envie o código em uma mensagem própria.
  // Não altera o contrato antigo de processarMensagem: ele continua retornando texto.
  enfileirarProtocolo(usuario, protocolo) {
    this.mensagensExtras.set(usuario, [String(protocolo)]);
  }

  consumirMensagensExtras(usuario) {
    const mensagens = this.mensagensExtras.get(usuario) || [];
    this.mensagensExtras.delete(usuario);
    return mensagens;
  }

  iniciarConsultaAchados(usuario, pagina = 0) {
    this.sessionManager.definir(usuario, 'achados_consulta');
    try {
      // Somente ocorrências do mesmo identificador WhatsApp; paginação limita mensagens extensas.
      const meus = this.achados.listar()
        .filter(x => x.usuario === usuario)
        .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)) || String(b.protocolo).localeCompare(String(a.protocolo)));
      if (!meus.length) {
        this.protocolosEmConsulta.delete(usuario);
        this.paginasProtocolos.delete(usuario);
        return '🔎 *MEUS PROTOCOLOS*\n\nNenhuma ocorrência encontrada para este WhatsApp.\n\nSe tiver um código, digite *AP-...* para consultar.\nDigite *0* para voltar.';
      }
      const paginaMaxima = Math.ceil(meus.length / 5) - 1;
      const atual = Math.min(Math.max(0, pagina), paginaMaxima);
      const exibidos = meus.slice(atual * 5, atual * 5 + 5);
      this.protocolosEmConsulta.set(usuario, exibidos.map(x => x.protocolo));
      this.paginasProtocolos.set(usuario, atual);
      const situacoes = { aberto:'Aberto', em_analise:'Em análise', encontrado:'Objeto localizado', resolvido:'Resolvido', encerrado:'Encerrado' };
      const opcoes = exibidos.map((x, i) => `*${i + 1}* — ${x.tipo === 'perdido' ? 'Objeto perdido' : 'Objeto encontrado'} | ${situacoes[x.status] || 'Em atendimento'}\n${String(x.descricao || '').slice(0, 55)}\n📋 Protocolo: \`${x.protocolo}\``).join('\n\n');
      const navegacao = [atual > 0 ? '*anterior* — página anterior' : '', atual < paginaMaxima ? '*mais* — próximos protocolos' : ''].filter(Boolean).join('\n');
      return `🔎 *MEUS PROTOCOLOS* — Página ${atual + 1}/${paginaMaxima + 1}\n\n${opcoes}\n\n${navegacao ? navegacao + '\n' : ''}\nDigite *1 a ${exibidos.length}* para detalhes e receber o código em mensagem separada.\nOu digite um código AP-... ou *0* para voltar.`;
    } catch (e) {
      console.error('Falha ao listar protocolos:', e.message);
      return '⚠️ Não foi possível listar seus protocolos agora. Tente novamente mais tarde.';
    }
  }

  iniciarAchados(usuario) {
    this.ocorrencias.set(usuario, {});
    this.sessionManager.definir(usuario, 'achados_tipo');
    return '🧳 *ACHADOS E PERDIDOS*\n\n*1* — Perdi um objeto\n*2* — Encontrei um objeto\n\nDigite *0* para cancelar.';
  }

  processarAchados(usuario, mensagem, estado) {
    if (estado === 'achados_consulta') {
      if (mensagem === 'mais') return this.iniciarConsultaAchados(usuario, (this.paginasProtocolos.get(usuario) || 0) + 1);
      if (mensagem === 'anterior') return this.iniciarConsultaAchados(usuario, (this.paginasProtocolos.get(usuario) || 0) - 1);
      const lista = this.protocolosEmConsulta.get(usuario) || [];
      const protocolo = /^[1-5]$/.test(mensagem) ? lista[Number(mensagem) - 1] : (/^AP-[A-F0-9]{12}$/i.test(mensagem) ? mensagem.toUpperCase() : null);
      if (!protocolo) return '❌ Opção inválida. Digite o *número da ocorrência* da lista, um código AP-... ou *0* para voltar.';
      try {
        const registro = this.achados.porUsuario(protocolo, usuario);
        if (!registro) return '🔎 Ocorrência não encontrada para este WhatsApp. Digite *7* para atualizar a lista ou *0*.';
        this.enfileirarProtocolo(usuario, registro.protocolo);
        const nomes = { aberto:'Aberto', em_analise:'Em análise', encontrado:'Objeto localizado', resolvido:'Resolvido', encerrado:'Encerrado' };
        return `🧳 *ACOMPANHAMENTO DA OCORRÊNCIA*\n\nProtocolo: ${registro.protocolo}\nSituação: *${nomes[registro.status] || registro.status}*\nÚltima atualização: ${registro.atualizadoEm.slice(0,10).split('-').reverse().join('/')}\n\nDigite *7* para atualizar a lista ou *0* para voltar.`;
      } catch(e) { console.error('Falha ao consultar protocolo:',e.message); return '⚠️ Não foi possível consultar agora. Tente novamente.'; }
    }
    const caso = this.ocorrencias.get(usuario);
    if (!caso) return this.iniciarAchados(usuario);
    if (estado === 'achados_tipo') {
      if (!['1','2'].includes(mensagem)) return '❌ Escolha *1* para perdido ou *2* para encontrado.';
      caso.tipo = mensagem === '1' ? 'perdido' : 'encontrado';
      this.sessionManager.definir(usuario,'achados_descricao');
      return '📝 Descreva o objeto (ex.: mochila preta com dois bolsos). Evite enviar documentos ou informações pessoais desnecessárias.';
    }
    if (estado === 'achados_descricao') {
      if (mensagem.length < 5 || mensagem.length > 500) return '❌ Descreva o objeto com 5 a 500 caracteres.';
      caso.descricao = mensagem;
      this.sessionManager.definir(usuario,'achados_quando');
      return '📅 Quando e aproximadamente a que horas isso aconteceu?\nEx.: 18/11/2026 às 08:30.';
    }
    if (estado === 'achados_quando') {
      if (mensagem.length < 4 || mensagem.length > 120) return '❌ Informe dia e horário aproximado (até 120 caracteres).';
      caso.quando = mensagem;
      this.sessionManager.definir(usuario,'achados_carro');
      return '🚌 Sabe o número do carro? Digite o número ou *não sei*.';
    }
    if (estado === 'achados_carro') {
      if (mensagem.length > 60) return '❌ Informe o carro com até 60 caracteres.';
      caso.carro = mensagem === 'não sei' || mensagem === 'nao sei' ? '' : mensagem;
      this.sessionManager.definir(usuario,'achados_confirmar');
      return `🧳 *CONFIRA A OCORRÊNCIA*\nTipo: ${caso.tipo}\nObjeto: ${caso.descricao}\nQuando: ${caso.quando}\nCarro: ${caso.carro || 'não informado'}\n\n*1* — Confirmar e gerar protocolo\n*2* — Cancelar\n*0* — Menu`;
    }
    if (estado === 'achados_confirmar') {
      if (mensagem === '2') { this.ocorrencias.delete(usuario); this.sessionManager.definir(usuario,'menu'); return 'Ocorrência cancelada. Digite *0* para o menu.'; }
      if (mensagem !== '1') return 'Digite *1* para confirmar ou *2* para cancelar.';
      try {
        const registro = this.achados.criar({ ...caso, usuario });
        this.enfileirarProtocolo(usuario, registro.protocolo);
        this.ocorrencias.delete(usuario);
        this.sessionManager.definir(usuario,'menu');
        return `✅ *OCORRÊNCIA REGISTRADA*\n\n📋 Seu protocolo: ${registro.protocolo}\nSituação: *Aberto*\n\n📲 Vou enviar o código também em uma *mensagem separada*, para facilitar a cópia no celular.\nPara acompanhar, digite *7* e escolha a ocorrência na lista.\n\nA equipe da cooperativa precisará verificar a informação; este registro não confirma que o objeto foi localizado.\n\nDigite *7* para acompanhar ou *0* para voltar.`;
      } catch(e) { console.error('Falha ao registrar ocorrência:',e.message); return '⚠️ Não foi possível registrar. Tente novamente ou digite *0* para cancelar.'; }
    }
    return this.iniciarAchados(usuario);
  }

  iniciarConsulta(usuario) {
    this.consultas.delete(usuario);
    this.sessionManager.definir(usuario, 'aguardando_data');
    return '🕒 *CONSULTAR HORÁRIOS — ITAITINGA / FORTALEZA*\n\nDigite a data desejada no formato *DD/MM/AAAA*.\n\nSomente escalas publicadas são consultadas.\nDigite *0* para voltar ao menu.';
  }

  responderSaidas(consulta, horaExata) {
    let escala;
    try { escala = this.buscarEscalaPublicada(consulta.iso); }
    catch (e) {
      console.error('Falha ao consultar escalas importadas:', e.message);
      return '⚠️ Não foi possível consultar a escala neste momento. Tente novamente mais tarde.';
    }
    if (!escala) return '⚠️ Esta escala não está mais publicada. Digite *data* para consultar outra data ou *0* para o menu.';
    const origemLabel = consulta.origem === 'itaitinga' ? 'Itaitinga' : 'Fortaleza';
    const saidas = this.obterSaidas(escala, consulta.origem);
    const filtradas = horaExata ? saidas.filter(s => s.hora === horaExata) : saidas;
    if (!filtradas.length) {
      return `🕒 Não foi encontrada saída ${horaExata ? `às *${horaExata}*` : ''} de *${origemLabel}* em ${consulta.dataBR}.\n\nDigite outro horário (*HH:MM*), *data* ou *0*.`;
    }
    const lista = filtradas.map(s => `• ${s.hora} — Carro ${s.carro}`).join('\n');
    return `🚌 *SAÍDAS DE ${origemLabel.toUpperCase()}*\n📅 ${consulta.dataBR}\n\n${lista}\n\n*Horários previstos, sujeitos a alterações.*\nDigite um horário (ex.: *06:00*) para consultar um carro específico, *data* para outra data ou *0* para o menu.`;
  }
}

module.exports = ChatbotService;
