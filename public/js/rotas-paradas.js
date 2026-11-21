'use strict';
// Requer as funções api(), alertar(), esc() e o token do painel principal.
(() => {
  const $r = id => document.getElementById(id);
  const estado = { sentido: 'itaitinga-fortaleza', trajeto: [], paradas: [], modo: 'parada', mapa: null, camada: null, carregado: false, alterado: false };
  const dizer = (texto) => { $r('rotaFeedback').textContent = texto; };
  const clonar = x => JSON.parse(JSON.stringify(x));
  function desenhar() {
    if (!estado.mapa) return;
    if (estado.camada) estado.camada.remove();
    estado.camada = L.layerGroup().addTo(estado.mapa);
    const pontos = estado.trajeto.map(p => [p.lat,p.lng]);
    if (pontos.length > 1) L.polyline(pontos, {color:'#137f70',weight:5,dashArray:'8 6'}).addTo(estado.camada);
    estado.trajeto.forEach((p,i) => L.circleMarker([p.lat,p.lng], {radius:5,color:'#137f70',fillOpacity:.9}).bindTooltip(`Ponto do desenho ${i+1}`).addTo(estado.camada));
    estado.paradas.forEach((p,i) => L.marker([p.lat,p.lng]).bindPopup(`${i+1}. ${esc(p.nome)}`).addTo(estado.camada));
    const lista = $r('listaParadas');
    lista.innerHTML = estado.paradas.length ? estado.paradas.map((p,i) => `<div class="rota-stop"><div><strong>${i+1}. ${esc(p.nome)}</strong><small>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</small></div><div><button class="secondary" data-up="${i}" title="Subir">↑</button><button class="secondary" data-down="${i}" title="Descer">↓</button><button class="danger" data-del="${i}" title="Excluir">×</button></div></div>`).join('') : '<p class="muted">Nenhuma parada cadastrada neste sentido.</p>';
    $r('qtdPontos').textContent = `${estado.trajeto.length} pontos do desenho · ${estado.paradas.length} paradas`;
  }
  function mudar() { estado.alterado = true; dizer('Alterações não salvas.'); desenhar(); }
  async function carregar() {
    try {
      const x = await api('/rotas/'+encodeURIComponent(estado.sentido));
      estado.trajeto = clonar(x.trajeto || []);estado.paradas=clonar(x.paradas||[]);
      estado.alterado = false;
      $r('rotaStatus').textContent = `Rascunho · ${x.atualizadoEm ? new Date(x.atualizadoEm).toLocaleString('pt-BR') : 'ainda não salvo'}`;
      dizer('Edite o percurso e as paradas; salve apenas após conferir.');
      desenhar();
      if (estado.mapa) {
        const todos = [...estado.trajeto,...estado.paradas];
        if (todos.length) estado.mapa.fitBounds(L.latLngBounds(todos.map(p=>[p.lat,p.lng])).pad(.2), {maxZoom:15});
        else estado.mapa.setView([-3.84,-38.57],11); // enquadramento regional, NÃO rota
      }
    } catch(e) { alertar(e.message); }
  }
  function habilitarMapa() {
    if(estado.mapa || !window.L) { if(!window.L) dizer('Mapa indisponível. Confira a conexão com a internet e tente recarregar.'); return; }
    estado.mapa = L.map('mapaRotas',{scrollWheelZoom:false}).setView([-3.84,-38.57],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(estado.mapa);
    estado.mapa.on('click', e=> {
      const lat=Number(e.latlng.lat.toFixed(6)),lng=Number(e.latlng.lng.toFixed(6));
      if(estado.modo === 'parada') {
        const nome=prompt('Nome da parada neste local:');
        if(!nome || !nome.trim())return;
        estado.paradas.push({nome:nome.trim().slice(0,100),lat,lng});
      } else estado.trajeto.push({lat,lng});
      mudar();
    });
  }
  window.cotramiAbrirRotas = async () => {
    if (typeof perfil !== 'undefined' && perfil !== 'admin') return;
    habilitarMapa();
    if(estado.mapa)setTimeout(()=>estado.mapa.invalidateSize(),70);
    await carregar();
  };
  document.addEventListener('DOMContentLoaded', () => {
    $r('rotaSentido').addEventListener('change', async e=>{
      if(estado.alterado && !confirm('Existem alterações não salvas. Deseja descartá-las?')) { e.target.value=estado.sentido;return; }
      estado.sentido=e.target.value; await carregar();
    });
    $r('rotaModo').addEventListener('change',e=>{estado.modo=e.target.value;dizer(estado.modo==='parada'?'Clique no mapa para adicionar uma parada.':'Clique no mapa na ordem correta do trajeto. A linha pontilhada NÃO segue automaticamente as ruas.');});
    $r('listaParadas').addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      let i=Number(b.dataset.del??b.dataset.up??b.dataset.down);
      if(b.hasAttribute('data-del')) estado.paradas.splice(i,1);
      else {const j=b.hasAttribute('data-up')?i-1:i+1;if(j<0||j>=estado.paradas.length)return;[estado.paradas[i],estado.paradas[j]]=[estado.paradas[j],estado.paradas[i]];}
      mudar();
    });
    $r('rotaDesfazer').addEventListener('click',()=>{if(estado.trajeto.length){estado.trajeto.pop();mudar();}});
    $r('rotaLimparTrajeto').addEventListener('click',()=>{if(confirm('Apagar o desenho deste sentido? As paradas serão mantidas.')){estado.trajeto=[];mudar();}});
    $r('rotaSalvar').addEventListener('click', async e=>{
      e.target.disabled=true;
      try {
        const x=await api('/rotas/'+encodeURIComponent(estado.sentido), {method:'PUT',body:JSON.stringify({trajeto:estado.trajeto,paradas:estado.paradas})});
        estado.trajeto=x.trajeto;estado.paradas=x.paradas;estado.alterado=false;
        $r('rotaStatus').textContent='Rascunho salvo em '+new Date(x.atualizadoEm).toLocaleString('pt-BR');dizer('Rascunho salvo com sucesso. Ainda não é usado no WhatsApp.');desenhar();
      } catch(err){alertar(err.message);}finally{e.target.disabled=false;}
    });
  });
})();
