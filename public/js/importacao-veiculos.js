/* Cotrami: validação de Excel e conciliação de frota. NÃO publica nem cadastra automaticamente. */
(() => {
  'use strict';
  const escLocal=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizar=v=>String(v??'').trim().replace(/^0+(?=\d)/,'');
  async function validarArquivo(file){
    if(!file)return 'Selecione uma planilha para continuar.';
    if(!/\.xlsx$/i.test(file.name))return 'Formato não aceito. Envie um arquivo Excel .xlsx. No Google Sheets, use Arquivo → Fazer download → Microsoft Excel (.xlsx). Não envie PDF, CSV, ODS nem um link.';
    if(file.size>8*1024*1024)return 'Arquivo maior que 8 MB.';
    if(file.size<8)return 'O arquivo parece vazio ou inválido.';
    const bytes=new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(bytes[0]!==0x50||bytes[1]!==0x4b||![0x03,0x05,0x07].includes(bytes[2]))return 'Este arquivo não é um Excel .xlsx válido. Exporte novamente como Microsoft Excel (.xlsx).';
    return '';
  }
  function carrosDoBloco(bloco){
    const resultado=new Map();
    for(const r of bloco.registros||[]){
      const atual=String(r.carroReal||r.carroPrevisto||'').trim();
      if(!atual || !/^\d{1,8}$/.test(atual))continue;
      resultado.set(normalizar(atual),atual);
    }
    return [...resultado.values()];
  }
  function faltantes(bloco,veiculos){
    const existentes=new Set(veiculos.map(v=>normalizar(v.numero)));
    return carrosDoBloco(bloco).filter(c=>!existentes.has(normalizar(c)));
  }
  function painelVeiculos(bloco,veiculos){
    const encontrados=carrosDoBloco(bloco),novos=faltantes(bloco,veiculos);
    const cabecalho='<div class="fleet-check"><h3>🚌 Conferência da frota</h3>';
    if(!encontrados.length)return cabecalho+'<p class="muted">Nenhum número de carro válido foi identificado neste bloco. Confira os registros antes de salvar.</p></div>';
    const faltando=novos.length?'<p><strong>Não cadastrados na frota:</strong> '+novos.map(escLocal).join(', ')+'</p>':'<p class="fleet-ok">Todos os carros identificados já constam no cadastro.</p>';
    const botao=novos.length?'<button type="button" id="cadastrarVeiculosImportados" class="secondary">Cadastrar carros faltantes após conferência</button>':'';
    return cabecalho+'<p>Carros identificados: <strong>'+encontrados.length+'</strong>. Já cadastrados: <strong>'+(encontrados.length-novos.length)+'</strong>.</p>'+faltando+'<p class="muted">Esta planilha pode ser histórica. A leitura nunca altera a frota, nem publica viagens. Antes de cadastrar, confirme que os números pertencem à frota atual.</p>'+botao+'</div>';
  }
  function atualizarVeiculos(blocos,veiculos){
    const encontrados=new Set(),novos=new Set(veiculos.map(v=>normalizar(v.numero)));
    blocos.forEach(b=>carrosDoBloco(b).forEach(c=>encontrados.add(normalizar(c))));
    return {identificados:encontrados.size,naoCadastrados:[...encontrados].filter(x=>!novos.has(x))};
  }
  document.addEventListener('click',async event=>{
    const btn=event.target.closest('#cadastrarVeiculosImportados');if(!btn)return;
    if(typeof blocosImportados==='undefined'||typeof indiceSelecionado==='undefined')return;
    const bloco=blocosImportados[indiceSelecionado];if(!bloco)return;
    const novos=faltantes(bloco,dados.veiculos);
    if(!novos.length)return;
    if(!confirm('CONFIRA A PLANILHA: deseja cadastrar '+novos.length+' número(s) de carro na frota atual?\n\n'+novos.join(', ')+'\n\nPlanilhas antigas podem conter carros que não estão mais em operação. Não será criada nenhuma viagem.'))return;
    btn.disabled=true;let feitos=0;
    try{
      for(const numero of novos){
        // Descrição explícita; administrador deve revisá-la posteriormente.
        await api('/veiculos',{method:'POST',body:JSON.stringify({numero,descricao:'Importado de planilha — conferir situação atual'})});
        feitos++;
      }
      await carregar();
      btn.closest('.fleet-check')?.replaceWith(document.createRange().createContextualFragment(painelVeiculos(bloco,dados.veiculos)));
      alertar(feitos+' carro(s) cadastrados. Revise o cadastro de veículos antes de usar a escala.');
    }catch(err){
      alertar('Foram cadastrados '+feitos+' de '+novos.length+' carros. '+err.message+' Confira a aba Veículos.');
    }finally{btn.disabled=false;}
  });
  window.CotramiImportacao={validarArquivo,painelVeiculos,atualizarVeiculos,carrosDoBloco,faltantes};
})();
