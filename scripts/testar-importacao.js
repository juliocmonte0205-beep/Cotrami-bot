const { importarExcel } = require('../src/services/ExcelImporter');

async function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('Uso: node scripts/testar-importacao.js "caminho/arquivo.xlsx"');
    process.exitCode = 1;
    return;
  }
  const resultado = await importarExcel(caminho);
  console.log(`Arquivo: ${resultado.arquivo}`);
  console.log(`Blocos identificados: ${resultado.totalBlocos}`);
  console.log(`Status: ${resultado.status}`);
  for (const b of resultado.blocos) {
    console.log(`- ${b.aba} | ${b.diaSemana || 'dia indefinido'} | ${b.quantidadeRegistros} veículos | ${b.registros.reduce((n, r) => n + r.viagens.length, 0)} conjuntos de viagens`);
  }
  const primeiro = resultado.blocos[0];
  if (primeiro) console.log('\nExemplo de leitura:\n' + JSON.stringify({
    aba: primeiro.aba, dia: primeiro.diaSemana, referencia: primeiro.referenciaTexto,
    primeiraLinha: primeiro.registros[0], avisos: primeiro.avisos
  }, null, 2));
  console.log('\nNenhum dado foi salvo ou publicado.');
}
main().catch(err => { console.error('Falha na importação:', err.message); process.exitCode = 1; });
