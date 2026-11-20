'use strict';
/* Integração Cotrami + melhorias do painel do Gabriel.
   Não altera rotas, fluxo do Excel, escalas publicadas nem achados e perdidos. */
(() => {
  const abasCadastro = new Set(['linhas', 'veiculos', 'viagens', 'usuarios']);
  const colunas = {
    linhas: [['nome','Linha'],['origem','Origem'],['destino','Destino']],
    veiculos: [['numero','Carro'],['descricao','Descrição']],
    viagens: [['hora','Saída'],['linhaId','Linha'],['origem','Origem'],['destino','Destino'],['veiculoId','Carro']],
    usuarios: [['nome','Nome'],['login','Login'],['perfil','Perfil']]
  };
  const estadoUI = { aba: '', editando: null, busca: '', data: '' };
  const $u = id => document.getElementById(id);
  const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const dataBr = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) ? v.split('-').reverse().join('/') : v;
  const fmt = v => esc(v ?? '');
  const nomeLinha = id => dados.linhas.find(x => x.id === id)?.nome || 'Linha removida';
  const numeroCarro = id => dados.veiculos.find(x => x.id === id)?.numero || 'Carro removido';

  // Barra de busca e filtro, criada sem alterar o HTML de importação.
  const cadastros = $u('cadastros');
  const cardLista = cadastros.querySelectorAll('.card')[1];
  const ferramentas = document.createElement('div');
  ferramentas.className = 'unif-ferramentas';
  ferramentas.innerHTML = '<label class="unif-busca">Pesquisar nos registros<input id="unifBusca" type="search" placeholder="Nome, carro, origem..."></label>' +
    '<label id="unifBoxData" class="unif-data">Data da viagem<input id="unifData" type="date"></label>' +
    '<button type="button" class="secondary" id="unifHoje">Hoje</button>' +
    '<button type="button" class="secondary" id="unifLimpar">Limpar filtros</button>' +
    '<span id="unifQuantidade" class="muted" aria-live="polite"></span>';
  cardLista.insertBefore(ferramentas, cardLista.firstChild);

  const buscaInput=$u('unifBusca'), dataInput=$u('unifData');
  buscaInput.addEventListener('input', () => {estadoUI.busca=buscaInput.value; atualizarLista();});
  dataInput.addEventListener('change', () => {estadoUI.data=dataInput.value; atualizarLista();});
  $u('unifHoje').addEventListener('click', () => {estadoUI.data=new Date().toLocaleDateString('sv-SE');dataInput.value=estadoUI.data;atualizarLista();});
  $u('unifLimpar').addEventListener('click', () => {estadoUI.busca='';estadoUI.data='';buscaInput.value='';dataInput.value='';atualizarLista();});

  // Edição independente do formulário de cadastro, em diálogo central acessível.
  const dialogo=$u('modalEdicao');
  const formEdicao=$u('modalEdicaoForm');
  const nomes={linhas:'linha',veiculos:'veículo',viagens:'viagem'};
  function abrirEdicao(id){
    const registro=dados[tab]?.find(x=>x.id===id);
    if(!registro||!nomes[tab])return;
    estadoUI.editando=id;
    $u('modalEdicaoTitulo').textContent=`Editar ${nomes[tab]}`;
    const origem=$u('registroForm');
    formEdicao.innerHTML='';
    // Reutiliza a definição dos campos, sem movimentar nem alterar o cadastro.
    origem.querySelectorAll('label').forEach(label=>{
      const copia=label.cloneNode(true);
      const campo=copia.querySelector('[name]');
      if(!campo)return;
      campo.value=registro[campo.name]??'';
      formEdicao.append(copia);
    });
    dialogo.showModal();
    atualizarLista();
    formEdicao.querySelector('input,select')?.focus();
  }
  function fecharEdicao(){
    if(dialogo.open)dialogo.close();
    estadoUI.editando=null;
    atualizarLista();
  }
  $u('modalFechar').onclick=fecharEdicao;
  $u('modalCancelar').onclick=fecharEdicao;
  dialogo.addEventListener('cancel',e=>{e.preventDefault();fecharEdicao();});
  dialogo.addEventListener('click',e=>{if(e.target===dialogo)fecharEdicao();});
  formEdicao.addEventListener('change',e=>{
    if(tab!=='viagens'||e.target.name!=='linhaId')return;
    const linha=dados.linhas.find(l=>l.id===e.target.value);
    if(linha){formEdicao.elements.origem.value=linha.origem;formEdicao.elements.destino.value=linha.destino;}
  });

  function atualizarLista() {
    if (!abasCadastro.has(tab)) return;
    const lista = dados[tab] || [];
    const termo = normalizar(estadoUI.busca).trim();
    const encontrados = lista.filter(x => {
      if (tab === 'viagens' && estadoUI.data && x.data !== estadoUI.data) return false;
      if (!termo) return true;
      const campos = tab === 'viagens'
        ? [x.data, dataBr(x.data), x.hora, x.origem, x.destino, nomeLinha(x.linhaId), numeroCarro(x.veiculoId)]
        : tab === 'veiculos' ? [x.numero,x.descricao]
        : tab === 'linhas' ? [x.nome,x.origem,x.destino]
        : [x.nome,x.login,x.perfil];
      return campos.some(v => normalizar(v).includes(termo));
    }).sort((a,b) => tab === 'viagens'
      ? String(a.data+a.hora).localeCompare(String(b.data+b.hora))
      : String(a.nome || a.numero || '').localeCompare(String(b.nome || b.numero || ''),'pt-BR',{numeric:true}));
    const editar = tab !== 'usuarios';
    const cs = colunas[tab];
    $u('head').innerHTML='<tr>'+cs.map(([,label])=>`<th>${fmt(label)}</th>`).join('') + (editar?'<th>Ações</th>':'')+'</tr>';
    function celula(x,k) {
      if(k==='linhaId')return fmt(nomeLinha(x[k]));
      if(k==='veiculoId')return fmt(numeroCarro(x[k]));
      if(k==='perfil')return fmt(x[k]==='admin'?'Administrador':'Cooperado');
      return fmt(x[k]);
    }
    const corpo=[];
    let diaAnterior='';
    for(const x of encontrados) {
      if(tab==='viagens' && x.data!==diaAnterior) {
        diaAnterior=x.data;
        const d=new Date(x.data+'T12:00:00');
        const rotulo=Number.isNaN(d.getTime())?'Data não identificada':d.toLocaleDateString('pt-BR',{weekday:'long'});
        corpo.push(`<tr class="unif-grupo"><td colspan="${cs.length+1}">${fmt(rotulo)} · ${fmt(dataBr(x.data))}</td></tr>`);
      }
      const acoes=editar?`<td><div class="unif-acoes"><button type="button" class="secondary" data-unif-editar="${fmt(x.id)}">Editar</button><button type="button" class="danger" data-unif-excluir="${fmt(x.id)}">Excluir</button></div></td>`:'';
      corpo.push(`<tr${x.id===estadoUI.editando?' class="unif-editando"':''}>`+cs.map(([k])=>`<td>${celula(x,k)}</td>`).join('')+acoes+'</tr>');
    }
    $u('rows').innerHTML=corpo.join('') || `<tr><td colspan="${cs.length+(editar?1:0)}" class="unif-vazio">${lista.length?'Nenhum resultado para esses filtros.':'Ainda não há registros cadastrados.'}</td></tr>`;
    $u('unifQuantidade').textContent=`${encontrados.length} de ${lista.length} registro(s)`;
  }

  const renderAnterior = render;
  render = function renderUnificado() {
    if(estadoUI.aba!==tab){estadoUI.aba=tab;estadoUI.editando=null;estadoUI.busca='';estadoUI.data='';buscaInput.value='';dataInput.value='';}
    renderAnterior(); // preserva as telas de importação e de achados e perdidos
    if(!abasCadastro.has(tab)) return;
    $u('unifBoxData').classList.toggle('hidden',tab!=='viagens');
    $u('unifHoje').classList.toggle('hidden',tab!=='viagens');
    atualizarLista();

  };

  // A seleção de linha preenche origem/destino automaticamente, mas permite correção manual.
  $u('registroForm').addEventListener('change', e => {
    if(tab!=='viagens'||e.target.name!=='linhaId')return;
    const linha=dados.linhas.find(l=>l.id===e.target.value);
    if(linha){const f=$u('registroForm');f.elements.origem.value=linha.origem;f.elements.destino.value=linha.destino;}
  });

  function validarFormulario(x, editandoId=null) {
    const erros=[];
    for(const [k,v] of Object.entries(x)) if(!String(v ?? '').trim()) erros.push(`Preencha: ${k}.`);
    if(tab==='veiculos' && dados.veiculos.some(v=>v.id!==editandoId && normalizar(v.numero)===normalizar(x.numero)))
      erros.push('Já existe um veículo com esse número.');
    if(tab==='viagens') {
      if(x.data && x.data < new Date().toLocaleDateString('sv-SE') && !confirm('Esta data já passou. Deseja salvar mesmo assim?')) erros.push('Operação cancelada.');
      if(dados.viagens.some(v=>v.id!==editandoId&&v.data===x.data&&v.hora===x.hora&&v.veiculoId===x.veiculoId))
        erros.push('Esse carro já está cadastrado para o mesmo dia e horário.');
    }
    if(tab==='usuarios') {
      if(x.senha?.length<10)erros.push('A senha deve ter pelo menos 10 caracteres.');
      if(dados.usuarios.some(u=>normalizar(u.login)===normalizar(x.login)))erros.push('Esse login já existe.');
    }
    return erros;
  }

  $u('registroForm').onsubmit = async e => {
    e.preventDefault();
    if (!abasCadastro.has(tab)) return;
    const f=e.target, x=Object.fromEntries(new FormData(f));
    const erros=validarFormulario(x);
    if(erros.length){alertar(erros.join(' '));return;}
    const botao=f.querySelector('button[type="submit"]');
    botao.disabled=true;
    try {
      await api('/'+tab,{method:'POST',body:JSON.stringify(x)});
      $u('alert').className='';
      await carregar();
      render();
    } catch(err){alertar(err.message);}finally{botao.disabled=false;}
  };

  formEdicao.onsubmit=async e=>{
    e.preventDefault();
    const id=estadoUI.editando;
    if(!id||!nomes[tab])return;
    const registro=Object.fromEntries(new FormData(formEdicao));
    const erros=validarFormulario(registro,id);
    if(erros.length){alertar(erros.join(' '));return;}
    const salvar=$u('modalSalvar');salvar.disabled=true;
    try {
      await api('/'+tab+'/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(registro)});
      fecharEdicao();$u('alert').className='';
      await carregar();render();
    }catch(err){alertar(err.message);}finally{salvar.disabled=false;}
  };

  $u('rows').onclick=async e=>{
    const edit=e.target.closest('button[data-unif-editar]');
    if(edit) {
      abrirEdicao(edit.dataset.unifEditar);
      return;
    }
    const excluir=e.target.closest('button[data-unif-excluir]');
    if(!excluir)return;
    const id=excluir.dataset.unifExcluir;
    const x=dados[tab].find(v=>v.id===id);if(!x)return;
    const vinculos=tab==='linhas'?dados.viagens.filter(v=>v.linhaId===id).length:tab==='veiculos'?dados.viagens.filter(v=>v.veiculoId===id).length:0;
    const detalhe=vinculos?` Atenção: há ${vinculos} viagem(ns) vinculadas. O servidor pode impedir a exclusão.`:'';
    if(!confirm(`Excluir este registro?${detalhe}`))return;
    try{await api('/'+tab+'/'+encodeURIComponent(id),{method:'DELETE'});estadoUI.editando=null;$u('alert').className='';await carregar();}catch(err){alertar(err.message);}
  };
})();
