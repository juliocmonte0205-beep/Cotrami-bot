'use strict';

// ---------------------------------------------------------------------------
// Configuração das seções do painel.
// Para adicionar uma seção nova (ex.: escalas semanais), basta criar uma
// entrada aqui com o mesmo nome da rota da API (/api/<nome>).
// ---------------------------------------------------------------------------
const RECURSOS = {
  linhas: {
    aba: 'Linhas',
    singular: 'linha',
    ajuda: 'Cadastre as linhas atendidas pela cooperativa.',
    campos: [
      { nome: 'nome', label: 'Nome da linha' },
      { nome: 'origem', label: 'Origem' },
      { nome: 'destino', label: 'Destino' },
    ],
    colunas: [['nome', 'Nome'], ['origem', 'Origem'], ['destino', 'Destino']],
    ordenar: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }),
  },
  veiculos: {
    aba: 'Veículos',
    singular: 'veículo',
    ajuda: 'Cadastre os carros da frota. O número do carro não pode se repetir.',
    campos: [
      { nome: 'numero', label: 'Número do carro' },
      { nome: 'descricao', label: 'Descrição / identificação' },
    ],
    colunas: [['numero', 'Número'], ['descricao', 'Descrição']],
    ordenar: (a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }),
  },
  viagens: {
    aba: 'Escala de viagens',
    singular: 'viagem',
    ajuda: 'Cada viagem tem data, horário, linha e carro. Ao escolher a linha, origem e destino são preenchidos automaticamente. Um carro não pode ter duas viagens no mesmo horário.',
    campos: [
      { nome: 'data', label: 'Data', tipo: 'date' },
      { nome: 'hora', label: 'Saída', tipo: 'time' },
      { nome: 'linhaId', label: 'Linha', opcoes: 'linhas' },
      { nome: 'origem', label: 'Origem' },
      { nome: 'destino', label: 'Destino' },
      { nome: 'veiculoId', label: 'Carro', opcoes: 'veiculos' },
    ],
    colunas: [['data', 'Data'], ['hora', 'Saída'], ['linhaId', 'Linha'], ['origem', 'Origem'], ['destino', 'Destino'], ['veiculoId', 'Carro']],
    ordenar: (a, b) => (a.data + a.hora).localeCompare(b.data + b.hora),
    filtroData: true,
  },
  usuarios: {
    aba: 'Cooperados',
    singular: 'cooperado',
    ajuda: 'Somente administradores veem esta seção. A senha precisa ter pelo menos 10 caracteres.',
    soAdmin: true,
    somenteCadastro: true, // a API ainda não tem edição nem exclusão de usuários
    campos: [
      { nome: 'nome', label: 'Nome' },
      { nome: 'login', label: 'Login' },
      { nome: 'senha', label: 'Senha', tipo: 'password' },
      { nome: 'perfil', label: 'Perfil', fixas: [['cooperado', 'Cooperado'], ['admin', 'Administrador']] },
    ],
    colunas: [['nome', 'Nome'], ['login', 'Login'], ['perfil', 'Perfil']],
    ordenar: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  },
};

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const CHAVE_TOKEN = 'cotrami.token';
const estado = {
  token: lerToken(),
  perfil: '',
  nome: '',
  aba: 'linhas',
  dados: { linhas: [], veiculos: [], viagens: [], usuarios: [] },
  editandoId: null,
  filtros: {}, // por aba: { busca, data }
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lerToken() { try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch { return ''; } }
function salvarToken(t) { try { t ? localStorage.setItem(CHAVE_TOKEN, t) : localStorage.removeItem(CHAVE_TOKEN); } catch { /* sem armazenamento */ } }

// ---------------------------------------------------------------------------
// Comunicação com a API
// ---------------------------------------------------------------------------
async function api(url, opcoes = {}) {
  const resposta = await fetch('/api' + url, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + estado.token, ...opcoes.headers },
  });
  let corpo = {};
  try { corpo = await resposta.json(); } catch { /* resposta sem JSON */ }
  if (resposta.status === 401 && url !== '/login') {
    sessaoEncerrada(corpo.erro || 'Sua sessão expirou. Faça login novamente.');
    throw new Error(corpo.erro || 'Sessão expirada.');
  }
  if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível concluir a operação.');
  return corpo;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
function avisar(msg) { $('aviso').textContent = msg; $('aviso').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function limparAviso() { $('aviso').classList.add('hidden'); }
let timerToast;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ---------------------------------------------------------------------------
// Login e sessão
// ---------------------------------------------------------------------------
$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button');
  botao.disabled = true;
  try {
    const d = Object.fromEntries(new FormData(e.target));
    const r = await api('/login', { method: 'POST', body: JSON.stringify(d) });
    estado.token = r.token; salvarToken(r.token);
    e.target.reset();
    await entrar({ nome: r.nome, perfil: r.perfil });
  } catch (err) {
    avisar(err.message);
  } finally {
    botao.disabled = false;
  }
});

$('sair').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch { /* já saiu */ }
  sessaoEncerrada();
});

function sessaoEncerrada(msg) {
  estado.token = ''; salvarToken('');
  estado.editandoId = null;
  $('telaPainel').classList.add('hidden');
  $('usuarioBox').classList.add('hidden');
  $('telaLogin').classList.remove('hidden');
  if (msg) avisar(msg); else limparAviso();
}

async function entrar(usuario) {
  estado.nome = usuario.nome;
  estado.perfil = usuario.perfil;
  if (RECURSOS[estado.aba].soAdmin && estado.perfil !== 'admin') estado.aba = 'linhas';
  $('boasVindas').textContent = `Olá, ${usuario.nome}${usuario.perfil === 'admin' ? ' (administrador)' : ''}`;
  $('telaLogin').classList.add('hidden');
  $('telaPainel').classList.remove('hidden');
  $('usuarioBox').classList.remove('hidden');
  limparAviso();
  await carregar();
  trocarAba(estado.aba);
}

// Ao abrir a página, tenta reaproveitar o login salvo.
(async function iniciar() {
  if (!estado.token) return;
  try { await entrar(await api('/me')); } catch { /* sessaoEncerrada já tratou */ }
})();

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
const abasVisiveis = () => Object.keys(RECURSOS).filter((k) => !RECURSOS[k].soAdmin || estado.perfil === 'admin');

async function carregar() {
  try {
    const nomes = abasVisiveis();
    const listas = await Promise.all(nomes.map((n) => api('/' + n)));
    nomes.forEach((n, i) => { estado.dados[n] = listas[i]; });
  } catch (err) {
    if (estado.token) avisar(err.message);
  }
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------
function renderAbas() {
  $('abas').innerHTML = abasVisiveis().map((k) =>
    `<button type="button" class="btn${k === estado.aba ? ' ativa' : ''}" data-aba="${k}">${esc(RECURSOS[k].aba)}<span class="contador">${estado.dados[k].length}</span></button>`
  ).join('');
}

$('abas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (b) trocarAba(b.dataset.aba);
});

function trocarAba(aba) {
  estado.aba = aba;
  estado.editandoId = null;
  estado.filtros[aba] ??= { busca: '', data: '' };
  limparAviso();
  renderAbas();
  renderForm();
  renderFiltros();
  renderLista();
}

// ---------------------------------------------------------------------------
// Formulário (cadastro e edição)
// ---------------------------------------------------------------------------
function campoHtml(c, valor) {
  const v = esc(valor);
  if (c.opcoes) {
    const itens = estado.dados[c.opcoes];
    const rotulo = (x) => x.nome || x.numero;
    return `<label>${esc(c.label)}<select name="${c.nome}" required>
      <option value="">${itens.length ? 'Selecione' : 'Nenhum cadastrado'}</option>
      ${itens.slice().sort(RECURSOS[c.opcoes].ordenar).map((x) => `<option value="${esc(x.id)}"${x.id === valor ? ' selected' : ''}>${esc(rotulo(x))}</option>`).join('')}
    </select></label>`;
  }
  if (c.fixas) {
    return `<label>${esc(c.label)}<select name="${c.nome}">
      ${c.fixas.map(([val, txt]) => `<option value="${val}"${val === valor ? ' selected' : ''}>${txt}</option>`).join('')}
    </select></label>`;
  }
  const tipo = c.tipo || 'text';
  const extra = tipo === 'password' ? ' minlength="10" autocomplete="new-password"' : '';
  return `<label>${esc(c.label)}<input name="${c.nome}" type="${tipo}" value="${v}" required${extra}></label>`;
}

function renderForm() {
  const r = RECURSOS[estado.aba];
  const registro = estado.editandoId ? estado.dados[estado.aba].find((x) => x.id === estado.editandoId) : null;
  if (estado.editandoId && !registro) estado.editandoId = null;

  $('tituloForm').textContent = registro ? `Editar ${r.singular}` : `Cadastrar ${r.singular}`;
  $('cancelarEdicao').classList.toggle('hidden', !registro);

  let ajuda = r.ajuda;
  const faltando = r.campos.filter((c) => c.opcoes && !estado.dados[c.opcoes].length).map((c) => RECURSOS[c.opcoes].aba.toLowerCase());
  if (faltando.length) ajuda += ` Antes, cadastre ${faltando.join(' e ')}.`;
  $('ajudaForm').textContent = ajuda;

  $('formRegistro').innerHTML = r.campos.map((c) => campoHtml(c, registro?.[c.nome] ?? '')).join('')
    + `<button type="submit" class="btn">${registro ? 'Salvar alterações' : 'Cadastrar'}</button>`;
}

// Na escala, escolher a linha preenche origem e destino.
$('formRegistro').addEventListener('change', (e) => {
  if (estado.aba !== 'viagens' || e.target.name !== 'linhaId') return;
  const linha = estado.dados.linhas.find((l) => l.id === e.target.value);
  if (!linha) return;
  const f = $('formRegistro');
  f.elements.origem.value = linha.origem;
  f.elements.destino.value = linha.destino;
});

$('formRegistro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = RECURSOS[estado.aba];
  const botao = e.target.querySelector('button[type="submit"]');
  const registro = Object.fromEntries(new FormData(e.target));
  const editando = estado.editandoId;
  botao.disabled = true;
  try {
    if (editando) await api(`/${estado.aba}/${encodeURIComponent(editando)}`, { method: 'PUT', body: JSON.stringify(registro) });
    else await api('/' + estado.aba, { method: 'POST', body: JSON.stringify(registro) });
    limparAviso();
    toast(editando ? `Alterações salvas.` : `${primeiraMaiuscula(r.singular)} cadastrad${r.singular === 'veículo' || r.singular === 'cooperado' ? 'o' : 'a'}.`);
    estado.editandoId = null;
    await carregar();
    renderAbas(); renderForm(); renderLista();
  } catch (err) {
    avisar(err.message);
  } finally {
    botao.disabled = false;
  }
});

$('cancelarEdicao').addEventListener('click', () => { estado.editandoId = null; limparAviso(); renderForm(); renderLista(); });

const primeiraMaiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Filtros e lista
// ---------------------------------------------------------------------------
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderFiltros() {
  const r = RECURSOS[estado.aba], f = estado.filtros[estado.aba];
  let html = `<input type="search" id="filtroBusca" placeholder="Buscar…" value="${esc(f.busca)}" aria-label="Buscar">`;
  if (r.filtroData) {
    html += `<input type="date" id="filtroData" value="${esc(f.data)}" aria-label="Filtrar por data">
      <button type="button" class="btn btn-claro btn-pequeno" data-filtro="hoje">Hoje</button>
      <button type="button" class="btn btn-claro btn-pequeno" data-filtro="todas">Todas as datas</button>`;
  }
  $('filtros').innerHTML = html;
}

$('filtros').addEventListener('input', (e) => {
  const f = estado.filtros[estado.aba];
  if (e.target.id === 'filtroBusca') f.busca = e.target.value;
  if (e.target.id === 'filtroData') f.data = e.target.value;
  renderLista();
});

$('filtros').addEventListener('click', (e) => {
  const acao = e.target.dataset.filtro;
  if (!acao) return;
  const f = estado.filtros[estado.aba];
  f.data = acao === 'hoje' ? hojeISO() : '';
  $('filtroData').value = f.data;
  renderLista();
});

const nomeLinha = (id) => estado.dados.linhas.find((l) => l.id === id)?.nome;
const numeroCarro = (id) => estado.dados.veiculos.find((v) => v.id === id)?.numero;
const dataBR = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;

function textoCelula(coluna, x) {
  switch (coluna) {
    case 'data': return esc(dataBR(x.data));
    case 'linhaId': { const n = nomeLinha(x.linhaId); return n ? esc(n) : '<span class="etiqueta falta">Linha removida</span>'; }
    case 'veiculoId': { const n = numeroCarro(x.veiculoId); return n ? esc(n) : '<span class="etiqueta falta">Carro removido</span>'; }
    case 'perfil': return `<span class="etiqueta${x.perfil === 'admin' ? ' admin' : ''}">${x.perfil === 'admin' ? 'Administrador' : 'Cooperado'}</span>`;
    default: return esc(x[coluna]);
  }
}

function filtrar(lista) {
  const f = estado.filtros[estado.aba];
  const termo = f.busca.trim().toLowerCase();
  return lista.filter((x) => {
    if (f.data && x.data !== f.data) return false;
    if (!termo) return true;
    const textos = [...Object.values(x), nomeLinha(x.linhaId), numeroCarro(x.veiculoId), dataBR(x.data)];
    return textos.some((t) => typeof t === 'string' && t.toLowerCase().includes(termo));
  });
}

function renderLista() {
  const r = RECURSOS[estado.aba];
  const todos = estado.dados[estado.aba];
  const lista = filtrar(todos).sort(r.ordenar);
  const comAcoes = !r.somenteCadastro;

  $('tituloLista').textContent = `${r.aba} (${lista.length}${lista.length !== todos.length ? ' de ' + todos.length : ''})`;
  $('cabecalho').innerHTML = '<tr>' + r.colunas.map(([, t]) => `<th>${esc(t)}</th>`).join('') + (comAcoes ? '<th>Ações</th>' : '') + '</tr>';
  $('linhasTabela').innerHTML = lista.map((x) =>
    `<tr${x.id === estado.editandoId ? ' class="editando"' : ''}>`
    + r.colunas.map(([c]) => `<td>${textoCelula(c, x)}</td>`).join('')
    + (comAcoes ? `<td class="acoes">
        <button type="button" class="btn btn-claro btn-pequeno" data-editar="${esc(x.id)}">Editar</button>
        <button type="button" class="btn btn-perigo btn-pequeno" data-excluir="${esc(x.id)}">Excluir</button>
      </td>` : '')
    + '</tr>'
  ).join('');

  const vazio = $('vazio');
  vazio.classList.toggle('hidden', lista.length > 0);
  vazio.textContent = todos.length ? 'Nenhum resultado para esse filtro.' : `Nenhum(a) ${r.singular} cadastrado(a) ainda. Use o formulário acima para começar.`;
}

$('linhasTabela').addEventListener('click', async (e) => {
  const editar = e.target.dataset.editar, excluir = e.target.dataset.excluir;
  if (editar) {
    estado.editandoId = editar;
    limparAviso();
    renderForm(); renderLista();
    $('formRegistro').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('formRegistro').querySelector('input, select')?.focus();
  }
  if (excluir) {
    const r = RECURSOS[estado.aba];
    if (!confirm(`Excluir este(a) ${r.singular}? Essa ação não pode ser desfeita.`)) return;
    try {
      await api(`/${estado.aba}/${encodeURIComponent(excluir)}`, { method: 'DELETE' });
      if (estado.editandoId === excluir) estado.editandoId = null;
      limparAviso();
      toast('Excluído.');
      await carregar();
      renderAbas(); renderForm(); renderLista();
    } catch (err) {
      avisar(err.message);
    }
  }
});
