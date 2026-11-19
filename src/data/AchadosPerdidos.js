"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class AchadosPerdidos {
  constructor(arquivo = path.join(__dirname, '../../data/achados-perdidos.json')) {
    this.arquivo = arquivo;
    this.statusPermitidos = new Set(['aberto', 'em_analise', 'encontrado', 'resolvido', 'encerrado']);
  }
  listar() {
    if (!fs.existsSync(this.arquivo)) return [];
    const conteudo = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    if (!Array.isArray(conteudo)) throw new Error('Arquivo de ocorrências inválido');
    return conteudo;
  }
  salvar(lista) {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true, mode: 0o700 });
    const temp = this.arquivo + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(lista, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.arquivo);
  }
  criar({ usuario, tipo, descricao, quando, carro }) {
    const limpar = (v, n) => String(v || '').trim().slice(0, n);
    usuario = limpar(usuario, 180); tipo = limpar(tipo, 16);
    descricao = limpar(descricao, 500); quando = limpar(quando, 120); carro = limpar(carro, 60);
    if (!usuario || !['perdido','encontrado'].includes(tipo) || descricao.length < 5 || !quando) throw new Error('Preencha os dados obrigatórios da ocorrência.');
    const lista = this.listar();
    const protocolo = 'AP-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const criadoEm = new Date().toISOString();
    const registro = { protocolo, tipo, descricao, quando, carro, usuario, status:'aberto', criadoEm, atualizadoEm:criadoEm, historico:[{status:'aberto',em:criadoEm,por:'sistema'}], observacaoInterna:'' };
    lista.push(registro); this.salvar(lista);
    return { protocolo, tipo, status:registro.status, criadoEm };
  }
  porUsuario(protocolo, usuario) {
    return this.listar().find(x => x.protocolo === String(protocolo || '').trim().toUpperCase() && x.usuario === usuario) || null;
  }
  atualizar(protocolo, status, observacaoInterna, responsavel) {
    if (!this.statusPermitidos.has(status)) throw new Error('Situação inválida.');
    const lista = this.listar();
    const registro = lista.find(x => x.protocolo === protocolo);
    if (!registro) return null;
    const agora = new Date().toISOString();
    registro.status = status;
    registro.observacaoInterna = String(observacaoInterna || '').trim().slice(0, 500);
    registro.atualizadoEm = agora;
    registro.historico.push({status,em:agora,por:String(responsavel||'administrador').slice(0,80)});
    this.salvar(lista);
    return registro;
  }
}
module.exports = AchadosPerdidos;
