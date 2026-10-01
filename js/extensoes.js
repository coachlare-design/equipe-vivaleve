// PONTO DE EXTENSÃO do front para o Construtor 2 (prontuário cifrado).
// Um módulo novo registra renderizadores por nome; as telas do núcleo chamam `obter(nome)` e,
// se existir, entregam o contêiner e o contexto. Ex.: registrar("nota-clinica", (el, {sessao, paciente}) => {...}).
// Nomes usados hoje pelo núcleo: "nota-clinica" (tela Registrar), "prontuario" (detalhe do paciente),
// "destravar-cofre" (conta), "reembrulhar" (transferência no admin).
const mapa = new Map();

export function registrar(nome, fn) {
  mapa.set(nome, fn);
}

export function obter(nome) {
  return mapa.get(nome) || null;
}

// Construtor 2: extensão também pode registrar telas (rota do hash) e item de menu do admin.
const rotasExt = { admin: {}, associado: {} };
const menusExt = { admin: [], associado: [] };

export function registrarRota(nome, fn, papeis = ["admin", "associado"]) {
  for (const p of papeis) rotasExt[p][nome] = fn;
}

export function registrarMenu(papel, href, rotulo) {
  menusExt[papel].push([href, rotulo]);
}

export function rotas(papel) {
  return rotasExt[papel] || {};
}

export function menus(papel) {
  return menusExt[papel] || [];
}
