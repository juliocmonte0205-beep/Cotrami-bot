'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Armazenamento separado do cotrami.json para não modificar os dados atuais.
class EscalasImportadas {
  constructor() {
    this.arquivo = path.join(__dirname, '../../data/escalas-importadas.json');
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
  }
  listar() {
    if (!fs.existsSync(this.arquivo)) return [];
    const dados = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    if (!Array.isArray(dados)) throw new Error('Arquivo de escalas importadas inválido.');
    return dados;
  }
  salvar(todos) {
    const temporario = `${this.arquivo}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporario, JSON.stringify(todos, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporario, this.arquivo);
    } finally {
      if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
    }
  }
  inserir(rascunho) {
    const todos = this.listar();
    const registro = { id: crypto.randomUUID(), status: 'rascunho', criadoEm: new Date().toISOString(), ...rascunho };
    todos.push(registro);
    this.salvar(todos);
    return registro;
  }
  registrarJustificativa(id, login, motivo, detalhes, carrosAfetados) {
    const todos = this.listar();
    const item = todos.find(x => x.id === id);
    if (!item) return { erro: 'Escala não encontrada.', status: 404 };
    if (item.status !== 'rascunho') return { erro: 'Somente rascunhos podem receber justificativa.', status: 409 };
    const esperados = item.dia === 'DOMINGO' ? 6 : item.dia === 'SABADO' ? 12 : 13;
    const diferenca = esperados - item.registros.length;
    if (diferenca <= 0) return { erro: 'Esta escala não possui redução de frota a justificar.', status: 422 };
    const motivos = ['defeito_mecanico', 'manutencao', 'indisponibilidade', 'operacao_reduzida', 'outro'];
    if (!motivos.includes(motivo)) return { erro: 'Selecione um motivo válido.', status: 422 };
    if (typeof detalhes !== 'string' || detalhes.trim().length < 10 || detalhes.trim().length > 500) {
      return { erro: 'Descreva a redução da frota com 10 a 500 caracteres.', status: 422 };
    }
    if (typeof carrosAfetados !== 'string' || carrosAfetados.length > 160) {
      return { erro: 'A identificação dos carros deve ter até 160 caracteres.', status: 422 };
    }
    item.justificativaFrota = {
      esperado: esperados, escalado: item.registros.length, diferenca,
      motivo, detalhes: detalhes.trim(), carrosAfetados: carrosAfetados.trim() || null,
      registradoPor: login, registradoEm: new Date().toISOString()
    };
    this.salvar(todos);
    return { registro: item };
  }
  publicar(id, login) {
    const todos = this.listar();
    const item = todos.find(x => x.id === id);
    if (!item) return { erro: 'Rascunho não encontrado.', status: 404 };
    if (item.status !== 'rascunho') return { erro: 'Somente rascunhos podem ser publicados.', status: 409 };
    if (todos.some(x => x.id !== id && x.status === 'publicada' && x.data === item.data && x.linha === item.linha)) {
      return { erro: 'Já existe uma escala publicada para esta data e linha. Não foi alterada.', status: 409 };
    }
    if (!item.registros.length || item.registros.some(r => !r.carro || !r.viagens.length)) {
      return { erro: 'A escala tem registros sem carro ou sem viagem. Corrija antes de publicar.', status: 422 };
    }
    const esperados = item.dia === 'DOMINGO' ? 6 : item.dia === 'SABADO' ? 12 : 13;
    if (item.registros.length < esperados) {
      const justificativa = item.justificativaFrota;
      if (!justificativa || justificativa.esperado !== esperados ||
          justificativa.escalado !== item.registros.length ||
          !justificativa.motivo || !justificativa.detalhes ||
          !justificativa.registradoPor) {
        return { erro: 'Escala com frota reduzida: registre uma justificativa antes de publicar.', status: 422 };
      }
    }
    if (item.registros.length > esperados) {
      return { erro: 'A escala tem mais carros que o padrão. Revise o bloco antes de publicar.', status: 422 };
    }
    item.status = 'publicada';
    item.publicadoEm = new Date().toISOString();
    item.publicadoPor = login;
    this.salvar(todos);
    return { registro: item };
  }
}
module.exports = EscalasImportadas;
