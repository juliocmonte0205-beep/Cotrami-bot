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
    descrever: (x) => `${x.nome} (${x.origem} → ${x.destino})`,
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
    descrever: (x) => `Carro ${x.numero} (${x.descricao})`,
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
    colunas: [['hora', 'Saída'], ['linhaId', 'Linha'], ['origem', 'Origem'], ['destino', 'Destino'], ['veiculoId', 'Carro']],
    ordenar: (a, b) => (a.data + a.hora).localeCompare(b.data + b.hora),
    descrever: (x) => `${dataBR(x.data)} às ${x.hora} · ${nomeLinha(x.linhaId) || 'linha removida'} · Carro ${numeroCarro(x.veiculoId) || '?'}`,
    filtroData: true,
    agruparPorDia: true,
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
const ABA_INICIO = 'inicio';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const CHAVE_TOKEN = 'cotrami.token';
const estado = {
  token: lerToken(),
  perfil: '',
  nome: '',
  aba: ABA_INICIO,
  dados: { linhas: [], veiculos: [], viagens: [], usuarios: [] },
  editandoId: null,
  filtros: {},          // por aba: { busca, data }
  confirmarPassado: '', // assinatura da viagem com data passada já avisada
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lerToken() { try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch { return ''; } }
function salvarToken(t) { try { t ? localStorage.setItem(CHAVE_TOKEN, t) : localStorage.removeItem(CHAVE_TOKEN); } catch { /* sem armazenamento */ } }

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeISO = () => iso(new Date());
const agoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dataBR = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s;
const deISO = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const diaSemana = (s) => deISO(s).toLocaleDateString('pt-BR', { weekday: 'long' });
function somarDias(s, n) { const d = deISO(s); d.setDate(d.getDate() + n); return iso(d); }

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
  if (RECURSOS[estado.aba]?.soAdmin && estado.perfil !== 'admin') estado.aba = ABA_INICIO;
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
const recursosVisiveis = () => Object.keys(RECURSOS).filter((k) => !RECURSOS[k].soAdmin || estado.perfil === 'admin');
const nomeLinha = (id) => estado.dados.linhas.find((l) => l.id === id)?.nome;
const numeroCarro = (id) => estado.dados.veiculos.find((v) => v.id === id)?.numero;

async function carregar() {
  try {
    const nomes = recursosVisiveis();
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
  const botao = (k, texto, contador) =>
    `<button type="button" class="btn${k === estado.aba ? ' ativa' : ''}" data-aba="${k}">${esc(texto)}${contador == null ? '' : `<span class="contador">${contador}</span>`}</button>`;
  $('abas').innerHTML = botao(ABA_INICIO, 'Visão geral')
    + recursosVisiveis().map((k) => botao(k, RECURSOS[k].aba, estado.dados[k].length)).join('');
}

$('abas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (b) trocarAba(b.dataset.aba);
});

function trocarAba(aba, filtro) {
  estado.aba = aba;
  estado.editandoId = null;
  estado.confirmarPassado = '';
  limparAviso();
  renderAbas();
  const inicio = aba === ABA_INICIO;
  $('telaInicio').classList.toggle('hidden', !inicio);
  $('cardForm').classList.toggle('hidden', inicio);
  $('cardLista').classList.toggle('hidden', inicio);
  if (inicio) { renderInicio(); return; }
  estado.filtros[aba] ??= { busca: '', data: '' };
  if (filtro) Object.assign(estado.filtros[aba], filtro);
  renderForm();
  renderFiltros();
  renderLista();
}

function atualizarTudo() {
  renderAbas();
  if (estado.aba === ABA_INICIO) renderInicio();
  else { renderForm(); renderLista(); }
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------
function renderInicio() {
  const { linhas, veiculos, viagens } = estado.dados;
  const hoje = hojeISO(), agora = agoraHHMM();
  const fimSemana = somarDias(hoje, 6);
  const deHoje = viagens.filter((v) => v.data === hoje).sort(RECURSOS.viagens.ordenar);
  const naSemana = viagens.filter((v) => v.data >= hoje && v.data <= fimSemana);

  // Números do topo (cada um leva para a seção correspondente)
  const numero = (valor, rotulo, aba, filtro) =>
    `<button type="button" class="numero" data-ir="${aba}"${filtro ? ` data-dia="${filtro}"` : ''}><span class="valor">${valor}</span><span class="rotulo">${rotulo}</span></button>`;
  $('resumo').innerHTML =
    numero(linhas.length, 'Linhas cadastradas', 'linhas')
    + numero(veiculos.length, 'Carros na frota', 'veiculos')
    + numero(deHoje.length, 'Viagens hoje', 'viagens', hoje)
    + numero(naSemana.length, 'Viagens nos próximos 7 dias', 'viagens');

  // Viagens de hoje, com a próxima saída destacada
  $('tituloHoje').textContent = `Viagens de hoje · ${dataBR(hoje)}`;
  const proxima = deHoje.find((v) => v.hora >= agora);
  $('listaHoje').innerHTML = deHoje.length
    ? deHoje.map((v) => {
        const passou = v.hora < agora;
        const eProxima = v === proxima;
        return `<div class="viagem-hoje${passou ? ' passou' : ''}">
          <span class="hora">${esc(v.hora)}</span>
          <span>${esc(nomeLinha(v.linhaId) || 'Linha removida')} · ${esc(v.origem)} → ${esc(v.destino)}</span>
          <span class="etiqueta${eProxima ? ' proxima' : ''}">${eProxima ? 'Próxima · ' : ''}Carro ${esc(numeroCarro(v.veiculoId) || '?')}</span>
        </div>`;
      }).join('')
    : '<p class="vazio">Nenhuma viagem cadastrada para hoje.</p>';

  // Alertas
  const alertas = [];
  if (!linhas.length) alertas.push('Nenhuma linha cadastrada. Comece pela aba Linhas.');
  if (!veiculos.length) alertas.push('Nenhum carro cadastrado. Cadastre a frota na aba Veículos.');
  const orfas = viagens.filter((v) => !nomeLinha(v.linhaId) || !numeroCarro(v.veiculoId));
  if (orfas.length) alertas.push(`${orfas.length} viagem(ns) com linha ou carro que não existe mais. Revise na escala.`);
  const diasSemViagem = [...Array(7)].map((_, i) => somarDias(hoje, i)).filter((d) => !viagens.some((v) => v.data === d));
  if (linhas.length && diasSemViagem.length) alertas.push(`${diasSemViagem.length} dia(s) da próxima semana sem nenhuma viagem na escala.`);
  const parados = veiculos.filter((c) => !naSemana.some((v) => v.veiculoId === c.id));
  if (veiculos.length && naSemana.length && parados.length) alertas.push(`Carro(s) sem viagem nos próximos 7 dias: ${parados.map((c) => c.numero).join(', ')}.`);
  $('alertas').innerHTML = alertas.length
    ? alertas.map((a) => `<li>${esc(a)}</li>`).join('')
    : '<li class="ok">Tudo certo: nenhum problema encontrado na escala.</li>';

  // Próximos 7 dias
  $('semana').innerHTML = [...Array(7)].map((_, i) => {
    const d = somarDias(hoje, i);
    const qtd = viagens.filter((v) => v.data === d).length;
    const rotulo = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : diaSemana(d).split('-')[0];
    return `<button type="button" class="dia${qtd ? '' : ' vazio-dia'}${i === 0 ? ' hoje' : ''}" data-ir="viagens" data-dia="${d}" title="${esc(diaSemana(d))}, ${dataBR(d)}">
      <span class="sem">${esc(rotulo)}</span><span class="qtd">${qtd}</span><span class="sem">${dataBR(d).slice(0, 5)}</span>
    </button>`;
  }).join('');
}

$('telaInicio').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  if (!b) return;
  trocarAba(b.dataset.ir, b.dataset.dia ? { data: b.dataset.dia, busca: '' } : (b.dataset.ir === 'viagens' ? { data: '' } : null));
});

// ---------------------------------------------------------------------------
// Formulário (cadastro e edição)
// ---------------------------------------------------------------------------
function campoHtml(c, valor) {
  const v = esc(valor);
  if (c.opcoes) {
    const itens = estado.dados[c.opcoes];
    const rotulo = (x) => x.nome || x.numero;
    return `<label data-campo="${c.nome}">${esc(c.label)}<select name="${c.nome}">
      <option value="">${itens.length ? 'Selecione' : 'Nenhum cadastrado'}</option>
      ${itens.slice().sort(RECURSOS[c.opcoes].ordenar).map((x) => `<option value="${esc(x.id)}"${x.id === valor ? ' selected' : ''}>${esc(rotulo(x))}</option>`).join('')}
    </select></label>`;
  }
  if (c.fixas) {
    return `<label data-campo="${c.nome}">${esc(c.label)}<select name="${c.nome}">
      ${c.fixas.map(([val, txt]) => `<option value="${val}"${val === valor ? ' selected' : ''}>${txt}</option>`).join('')}
    </select></label>`;
  }
  const tipo = c.tipo || 'text';
  const extra = tipo === 'password' ? ' autocomplete="new-password"' : '';
  return `<label data-campo="${c.nome}">${esc(c.label)}<input name="${c.nome}" type="${tipo}" value="${v}"${extra}></label>`;
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

  $('formRegistro').noValidate = true; // a validação é feita pelo painel, com mensagens ao lado do campo
  $('formRegistro').innerHTML = r.campos.map((c) => campoHtml(c, registro?.[c.nome] ?? '')).join('')
    + `<button type="submit" class="btn">${registro ? 'Salvar alterações' : 'Cadastrar'}</button>`;
}

// Na escala, escolher a linha preenche origem e destino.
$('formRegistro').addEventListener('change', (e) => {
  limparErroCampo(e.target.name);
  if (estado.aba !== 'viagens' || e.target.name !== 'linhaId') return;
  const linha = estado.dados.linhas.find((l) => l.id === e.target.value);
  if (!linha) return;
  const f = $('formRegistro');
  f.elements.origem.value = linha.origem;
  f.elements.destino.value = linha.destino;
  limparErroCampo('origem'); limparErroCampo('destino');
});
$('formRegistro').addEventListener('input', (e) => limparErroCampo(e.target.name));

// Validação feita antes de enviar. Devolve { campo: mensagem }.
function validarLocal(aba, x, id) {
  const erros = {};
  for (const c of RECURSOS[aba].campos) {
    if (!String(x[c.nome] ?? '').trim()) erros[c.nome] = c.opcoes ? 'Escolha uma opção.' : 'Preencha este campo.';
  }
  if (aba === 'veiculos' && x.numero?.trim()) {
    const repetido = estado.dados.veiculos.find((v) => v.id !== id && v.numero.toLowerCase() === x.numero.trim().toLowerCase());
    if (repetido) erros.numero = `Já existe o carro ${repetido.numero}.`;
  }
  if (aba === 'usuarios') {
    if (x.login && !/^[a-z0-9._-]{3,80}$/.test(x.login.trim().toLowerCase())) erros.login = 'Use de 3 a 80 letras minúsculas, números, ponto, hífen ou underline, sem espaços.';
    if (x.login && estado.dados.usuarios.some((u) => u.login === x.login.trim().toLowerCase())) erros.login = 'Esse login já existe.';
    if (x.senha && x.senha.length < 10) erros.senha = `A senha tem ${x.senha.length} caracteres. O mínimo é 10.`;
  }
  if (aba === 'viagens' && x.data && x.hora && x.veiculoId) {
    const conflito = estado.dados.viagens.find((v) => v.id !== id && v.data === x.data && v.hora === x.hora && v.veiculoId === x.veiculoId);
    if (conflito) erros.veiculoId = `O carro ${numeroCarro(x.veiculoId)} já faz a ${nomeLinha(conflito.linhaId) || 'outra linha'} nesse dia e horário.`;
  }
  return erros;
}

function mostrarErros(erros) {
  for (const [campo, msg] of Object.entries(erros)) {
    const label = $('formRegistro').querySelector(`[data-campo="${campo}"]`);
    if (!label) continue;
    label.classList.add('invalido');
    label.querySelector('.erro-campo')?.remove();
    label.insertAdjacentHTML('beforeend', `<small class="erro-campo">${esc(msg)}</small>`);
    label.querySelector('input, select')?.setAttribute('aria-invalid', 'true');
  }
  const primeiro = Object.keys(erros)[0];
  $('formRegistro').elements[primeiro]?.focus();
}

function limparErroCampo(campo) {
  const label = campo && $('formRegistro').querySelector(`[data-campo="${campo}"]`);
  if (!label) return;
  label.classList.remove('invalido');
  label.querySelector('.erro-campo')?.remove();
  label.querySelector('input, select')?.removeAttribute('aria-invalid');
}

$('formRegistro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const aba = estado.aba, r = RECURSOS[aba];
  const form = e.target;
  const botao = form.querySelector('button[type="submit"]');
  const registro = Object.fromEntries(new FormData(form));
  const editando = estado.editandoId;

  form.querySelectorAll('.erro-campo').forEach((n) => n.remove());
  form.querySelectorAll('.invalido').forEach((n) => n.classList.remove('invalido'));
  form.querySelector('.confirmar-passado')?.remove();

  const erros = validarLocal(aba, registro, editando);
  if (Object.keys(erros).length) { mostrarErros(erros); return; }

  // Data que já passou: pede confirmação com um segundo clique.
  if (aba === 'viagens' && registro.data < hojeISO()) {
    const assinatura = `${registro.data}|${registro.hora}|${registro.veiculoId}`;
    if (estado.confirmarPassado !== assinatura) {
      estado.confirmarPassado = assinatura;
      botao.insertAdjacentHTML('beforebegin', `<p class="confirmar-passado">A data ${dataBR(registro.data)} já passou. Se for isso mesmo, clique em <b>${esc(botao.textContent)}</b> de novo.</p>`);
      return;
    }
  }

  botao.disabled = true;
  try {
    if (editando) await api(`/${aba}/${encodeURIComponent(editando)}`, { method: 'PUT', body: JSON.stringify(registro) });
    else await api('/' + aba, { method: 'POST', body: JSON.stringify(registro) });
    limparAviso();
    toast(editando ? 'Alterações salvas.' : `${primeiraMaiuscula(r.singular)} cadastrad${r.singular === 'veículo' || r.singular === 'cooperado' ? 'o' : 'a'}.`);
    estado.editandoId = null;
    estado.confirmarPassado = '';
    await carregar();
    atualizarTudo();
  } catch (err) {
    avisar(err.message);
  } finally {
    botao.disabled = false;
  }
});

$('cancelarEdicao').addEventListener('click', () => { estado.editandoId = null; estado.confirmarPassado = ''; limparAviso(); renderForm(); renderLista(); });

const primeiraMaiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Filtros e lista
// ---------------------------------------------------------------------------
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

function linhaTabela(r, x, comAcoes) {
  return `<tr${x.id === estado.editandoId ? ' class="editando"' : ''}>`
    + r.colunas.map(([c]) => `<td>${textoCelula(c, x)}</td>`).join('')
    + (comAcoes ? `<td class="acoes">
        <button type="button" class="btn btn-claro btn-pequeno" data-editar="${esc(x.id)}">Editar</button>
        <button type="button" class="btn btn-perigo btn-pequeno" data-excluir="${esc(x.id)}">Excluir</button>
      </td>` : '')
    + '</tr>';
}

function renderLista() {
  const r = RECURSOS[estado.aba];
  const todos = estado.dados[estado.aba];
  const lista = filtrar(todos).sort(r.ordenar);
  const comAcoes = !r.somenteCadastro;
  const nCol = r.colunas.length + (comAcoes ? 1 : 0);

  $('tituloLista').textContent = `${r.aba} (${lista.length}${lista.length !== todos.length ? ' de ' + todos.length : ''})`;
  $('cabecalho').innerHTML = '<tr>' + r.colunas.map(([, t]) => `<th>${esc(t)}</th>`).join('') + (comAcoes ? '<th>Ações</th>' : '') + '</tr>';

  let html = '';
  if (r.agruparPorDia) {
    const hoje = hojeISO();
    let diaAtual = null;
    for (const x of lista) {
      if (x.data !== diaAtual) {
        diaAtual = x.data;
        const qtd = lista.filter((v) => v.data === diaAtual).length;
        const marca = diaAtual === hoje ? '<span class="etiqueta admin">Hoje</span>' : diaAtual < hoje ? '<span class="etiqueta">Já passou</span>' : '';
        html += `<tr class="grupo"><td colspan="${nCol}">${esc(primeiraMaiuscula(diaSemana(diaAtual)))}, ${dataBR(diaAtual)} · ${qtd} ${qtd > 1 ? 'viagens' : 'viagem'}${marca}</td></tr>`;
      }
      html += linhaTabela(r, x, comAcoes);
    }
  } else {
    html = lista.map((x) => linhaTabela(r, x, comAcoes)).join('');
  }
  $('linhasTabela').innerHTML = html;

  const vazio = $('vazio');
  vazio.classList.toggle('hidden', lista.length > 0);
  vazio.textContent = todos.length ? 'Nenhum resultado para esse filtro.' : `Nenhum(a) ${r.singular} cadastrado(a) ainda. Use o formulário acima para começar.`;
}

$('linhasTabela').addEventListener('click', (e) => {
  const editar = e.target.dataset.editar, excluir = e.target.dataset.excluir;
  if (editar) {
    estado.editandoId = editar;
    estado.confirmarPassado = '';
    limparAviso();
    renderForm(); renderLista();
    $('cardForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('formRegistro').querySelector('input, select')?.focus({ preventScroll: true });
  }
  if (excluir) abrirExclusao(excluir);
});

// ---------------------------------------------------------------------------
// Exclusão com confirmação dentro da página
// ---------------------------------------------------------------------------
let paraExcluir = null;

function abrirExclusao(id) {
  const r = RECURSOS[estado.aba];
  const x = estado.dados[estado.aba].find((v) => v.id === id);
  if (!x) return;
  paraExcluir = { aba: estado.aba, id };
  $('dialogoTitulo').textContent = `Excluir ${r.singular}?`;
  let texto = r.descrever ? r.descrever(x) : '';
  if (estado.aba === 'linhas' || estado.aba === 'veiculos') {
    const campo = estado.aba === 'linhas' ? 'linhaId' : 'veiculoId';
    const usadas = estado.dados.viagens.filter((v) => v[campo] === id).length;
    if (usadas) texto += ` Está em ${usadas} viagem(ns) da escala, então o sistema não vai deixar excluir. Remova ou troque essas viagens antes.`;
  }
  $('dialogoTexto').textContent = texto;
  $('dialogoExcluir').showModal();
  $('dialogoCancelar').focus();
}

$('dialogoCancelar').addEventListener('click', () => $('dialogoExcluir').close());
$('dialogoExcluir').addEventListener('close', () => { paraExcluir = null; });

$('dialogoConfirmar').addEventListener('click', async () => {
  if (!paraExcluir) return;
  const { aba, id } = paraExcluir;
  const botao = $('dialogoConfirmar');
  botao.disabled = true;
  try {
    await api(`/${aba}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (estado.editandoId === id) estado.editandoId = null;
    $('dialogoExcluir').close();
    limparAviso();
    toast('Excluído.');
    await carregar();
    atualizarTudo();
  } catch (err) {
    $('dialogoExcluir').close();
    avisar(err.message);
  } finally {
    botao.disabled = false;
  }
});
