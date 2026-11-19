const ExcelJS = require('exceljs');

const DIAS = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO'];

function normalizar(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function lerCelula(celula) {
  if (!celula) return null;
  const valor = celula.value;
  if (valor == null) return null;
  if (typeof valor === 'object') {
    if (Object.hasOwn(valor, 'result')) return valor.result ?? null;
    if (Array.isArray(valor.richText)) return valor.richText.map(p => p.text).join('');
    if (Object.hasOwn(valor, 'text')) return valor.text;
    if (valor instanceof Date) return valor;
  }
  return valor;
}

function formatarHora(valor) {
  if (valor instanceof Date) {
    const h = String(valor.getUTCHours()).padStart(2, '0');
    const m = String(valor.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor < 1) {
    const minutos = Math.round(valor * 24 * 60);
    if (minutos >= 24 * 60) return '00:00';
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
  }
  if (typeof valor === 'string') {
    const txt = valor.trim();
    const match = txt.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return null;
}

function identificarDia(aba, linhaCabecalho, colunaInicial, colunaFinal) {
  for (let r = linhaCabecalho - 1; r >= Math.max(1, linhaCabecalho - 5); r--) {
    for (let c = colunaInicial; c <= colunaFinal; c++) {
      const texto = normalizar(lerCelula(aba.getRow(r).getCell(c)));
      const dia = DIAS.find(d => new RegExp(`\\b${d}\\b`).test(texto));
      if (dia) return dia;
    }
  }
  return null;
}

function identificarReferencia(aba, linhaCabecalho, colunaInicial, colunaFinal) {
  const partes = [];
  for (let r = Math.max(1, linhaCabecalho - 3); r < linhaCabecalho; r++) {
    for (let c = colunaInicial; c <= colunaFinal; c++) {
      const val = lerCelula(aba.getRow(r).getCell(c));
      if (typeof val === 'string' && /SEMANA|\d{2}\/\d{2}\/\d{4}|JULHO|AGOSTO|NOVEMBRO|JUNHO|DEZEMBRO|MAIO/i.test(val)) {
        const txt = val.trim();
        if (!partes.includes(txt)) partes.push(txt);
      }
    }
  }
  return partes.join(' | ') || null;
}

function capturarBloco(aba, cabecalho, inicio, limite, indice) {
  const linha = aba.getRow(cabecalho);
  const pares = [];
  for (let col = inicio + 1; col < limite; col++) {
    const atual = normalizar(lerCelula(linha.getCell(col)));
    const proximo = normalizar(lerCelula(linha.getCell(col + 1)));
    if (atual === 'ITAITINGA' && proximo === 'FORTALEZA') {
      pares.push({numero: pares.length + 1, colunaItaitinga: col, colunaFortaleza: col + 1});
      col++;
    }
  }
  if (!pares.length) return null;
  const colunaPrevisto = inicio + 1;
  const colunaReal = pares[0].colunaItaitinga - 1;
  const registros = [];
  let vazias = 0;
  for (let r = cabecalho + 1; r <= Math.min(aba.rowCount, cabecalho + 60); r++) {
    const row = aba.getRow(r);
    const quantidade = lerCelula(row.getCell(inicio));
    const possiveis = pares.map(p => ({
      ordemViagem: p.numero,
      itaitinga: formatarHora(lerCelula(row.getCell(p.colunaItaitinga))),
      fortaleza: formatarHora(lerCelula(row.getCell(p.colunaFortaleza)))
    })).filter(p => p.itaitinga || p.fortaleza);
    if (!possiveis.length || quantidade === null || quantidade === '') {
      vazias++;
      if (vazias >= 2) break;
      continue;
    }
    vazias = 0;
    if (!/^\d+$/.test(String(quantidade).trim())) break;
    registros.push({
      ordem: Number(quantidade),
      carroPrevisto: String(lerCelula(row.getCell(colunaPrevisto)) ?? '').trim() || null,
      carroReal: colunaReal > colunaPrevisto ? String(lerCelula(row.getCell(colunaReal)) ?? '').trim() || null : null,
      viagens: possiveis,
      linhaExcel: r
    });
  }
  if (!registros.length) return null;
  return {
    id: `${aba.name}:${cabecalho}:${inicio}:${indice}`,
    aba: aba.name,
    cabecalhoLinha: cabecalho,
    diaSemana: identificarDia(aba, cabecalho, inicio, limite - 1),
    referenciaTexto: identificarReferencia(aba, cabecalho, inicio, limite - 1),
    quantidadeRegistros: registros.length,
    registros,
    avisos: [
      'Arquivo de referência: confirmar semana e ano antes de publicar.',
      ...(!identificarDia(aba, cabecalho, inicio, limite - 1) ? ['Dia da semana não identificado com segurança.'] : []),
      ...(registros.some(x => !x.carroReal && !x.carroPrevisto) ? ['Existem registros sem carro atribuído.'] : [])
    ]
  };
}

async function importarExcel(fonte, nomeArquivo = 'planilha.xlsx') {
  const livro = new ExcelJS.Workbook();
  if (Buffer.isBuffer(fonte)) {
    await livro.xlsx.load(fonte);
  } else if (typeof fonte === 'string') {
    await livro.xlsx.readFile(fonte);
    nomeArquivo = require('node:path').basename(fonte);
  } else {
    throw new TypeError('Informe o caminho do arquivo ou um Buffer Excel.');
  }
  const blocos = [];
  for (const aba of livro.worksheets) {
    let indice = 0;
    for (let r = 1; r <= aba.rowCount; r++) {
      const row = aba.getRow(r);
      const quantidadeCols = [];
      for (let c = 1; c <= row.cellCount; c++) {
        if (normalizar(lerCelula(row.getCell(c))) === 'QUANT') quantidadeCols.push(c);
      }
      for (let i = 0; i < quantidadeCols.length; i++) {
        const inicio = quantidadeCols[i];
        const limite = i + 1 < quantidadeCols.length ? quantidadeCols[i + 1] : row.cellCount + 1;
        const bloco = capturarBloco(aba, r, inicio, limite, ++indice);
        if (bloco) blocos.push(bloco);
      }
    }
  }
  return {arquivo: require('node:path').basename(nomeArquivo), totalBlocos: blocos.length, blocos, status: 'RASCUNHO_NAO_PUBLICADO'};
}

module.exports = { importarExcel, formatarHora };
