// Entrada da página principal: entrar, casca (topo + navegação) e rotas por hash.
// Rodada 3 (personas): navegação lateral no computador e barra inferior com 5 ícones no celular (o resto em "Mais"),
// avisos limpos a cada troca de tela, saída por inatividade sem recarregar a página (o rascunho fica selado) e com a
// explicação do motivo na tela de entrada.
import { h, trocar, aviso, limparAvisos, limparAvisosAntigos, campo, entrada, formulario, definirClinica, confirmar, comMostrar,
  blocoConferencia, EXPLICA_CONFERENCIA, rotuloRT } from "./ui.js";
import { impressaoConjunta } from "./cofre-cripto.js";
import { get, post, definirCsrf, quandoExpirar } from "./api.js";
import * as cripto from "./cripto.js";
import * as A from "./telas-associado.js";
import * as ADM from "./telas-admin.js";
import * as ext from "./extensoes.js";
import { icone } from "./icones.js";
import { palavrasPara } from "./frase.js";
import * as sessaoCofre from "./cofre-sessao.js";
import "./prontuario.js"; // Fase 2 (Construtor 2): cofre clínico, registra ganchos, rotas e menu

const raiz = document.getElementById("app");
const estado = { usuario: null };
let ultimoEmail = ""; // rodada 4 (P5): depois da saída por inatividade, o e-mail volta preenchido (não é segredo)

// [hash, rótulo, ícone]
const NAV_ASSOCIADO = [
  ["#/painel", "Painel", "casa"],
  ["#/pacientes", "Pacientes", "pessoas"],
  ["#/registrar", "Registrar", "mais"],
  ["#/mes", "Meu mês", "calendario"],
  ["#/mais", "Mais", "menu"],
];
const LATERAL_ASSOCIADO = [
  ["Dia a dia", [["#/painel", "Painel", "casa"], ["#/pacientes", "Pacientes", "pessoas"], ["#/registrar", "Registrar sessão", "mais"],
    ["#/mes", "Meu mês", "calendario"]]],
  ["Mais", [["#/ocorrencias", "Advertências e defesa", "balanca"], ["#/leituras", "Leituras do responsável técnico", "olho"],
    ["#/mais", "Reuniões quinzenais", "calendario"], ["#/conta", "Conta e segurança", "usuario"]]],
];
const NAV_ADMIN = [
  ["#/admin", "Início", "casa"],
  ["#/associados", "Equipe", "pessoas"],
  ["#/pacientes", "Pacientes", "lista"],
  ["#/fechamento", "Fechamento", "moeda"],
  ["#/mais", "Mais", "menu"],
];
const LATERAL_ADMIN = [
  ["Rotina", [["#/admin", "Visão geral", "casa"], ["#/associados", "Associados(as)", "pessoas"], ["#/pacientes", "Pacientes", "lista"],
    ["#/fechamento", "Fechamento", "moeda"], ["#/ocorrencias", "Ocorrências", "balanca"], ["#/transferencias", "Transferências", "setas"],
    ["#/convites", "Convites", "envelope"]]],
  ["Meus atendimentos", [["#/painel", "Pacientes com o RT", "usuario"], ["#/registrar", "Registrar sessão", "mais"]]],
  ["Proteção de dados", [["#/titular", "Pedidos do(a) titular", "escudo"], ["#/leituras", "Leituras clínicas", "olho"],
    ["#/termo", "Termo do(a) paciente", "documento"], ["#/log", "Registro de acessos", "lista"]]],
  ["Sistema", [["#/backup", "Backup", "disco"], ["#/cofre", "Cofre", "cadeado"], ["#/conta", "Conta", "usuario"]]],
];

const ROTAS_ASSOCIADO = {
  painel: A.painel, pacientes: A.pacientes, paciente: A.paciente, registrar: A.registrar, mes: A.mes,
  ocorrencias: A.ocorrencias, leituras: A.leituras, conta: A.conta, mais: A.mais,
};
const ROTAS_ADMIN = {
  admin: ADM.visao, associados: ADM.associados, convites: ADM.convites, pacientes: ADM.pacientes, paciente: ADM.paciente,
  transferencias: ADM.transferencias, fechamento: ADM.fechamento, ocorrencias: ADM.ocorrencias, log: ADM.log,
  painel: A.painel, registrar: A.registrar, mes: A.mes, conta: A.conta, "meu-paciente": A.paciente, leituras: ADM.leituras,
  backup: ADM.backup, titular: ADM.titular, termo: ADM.termo, mais: ADM.mais,
};

function aplicarSessao(dados) {
  definirCsrf(dados.csrf);
  definirClinica(dados.clinica);
  estado.usuario = dados.usuario;
  montarCasca();
}

async function sair() {
  // Persona associada: sair apaga o rascunho; avisa antes se houver um.
  if (sessaoCofre.rotulosRascunhos().length) {
    const ok = await confirmar({ titulo: "Sair agora?", texto: "Há um rascunho de nota que ainda não foi salvo. Ao sair, ele é apagado por segurança.",
      textoConfirmar: "Sair e apagar o rascunho", perigo: true });
    if (!ok) return;
  }
  try { await post("/api/auth/logout"); } catch (_) { /* sessão já caiu */ }
  cripto.limparCofre();
  sessaoCofre.limparSessaoCofre();
  definirCsrf(null);
  estado.usuario = null;
  limparAvisos();
  history.replaceState(null, "", location.pathname);
  telaEntrada("Você saiu. Até logo.");
}

// Saída por inatividade (cofre-sessao.js): sem recarregar a página, para o rascunho selado sobreviver nesta aba.
async function sairPorInatividade() {
  if (!estado.usuario) return;
  ultimoEmail = estado.usuario.email || ultimoEmail;
  cripto.limparCofre({ preservarRascunho: true });
  try { await post("/api/auth/logout"); } catch (_) { /* sessão já caiu */ }
  definirCsrf(null);
  estado.usuario = null;
  limparAvisos();
  const rasc = sessaoCofre.rascunhoSelado();
  telaEntrada(rasc
    ? "Você saiu por segurança depois de 15 minutos sem uso. Seu rascunho está guardado cifrado nesta aba: entre de novo para continuar de onde parou. Se fechar ou recarregar a aba, ele se perde."
    : "Você saiu por segurança depois de 15 minutos sem uso. Entre de novo para continuar.");
}
window.addEventListener("vl:inatividade", () => { sairPorInatividade(); });

function telaEntrada(mensagem = "") {
  const status = h("p", { class: "pequeno", role: "status", "aria-live": "polite" });
  const recado = mensagem ? h("div", { class: "alerta b", role: "status" }, mensagem) : null;
  const email = entrada({ type: "email", name: "email", autocomplete: "username", required: true, inputmode: "email", value: ultimoEmail || null });
  const frase = entrada({ type: "password", name: "frase", autocomplete: "current-password", required: true, ...{ spellcheck: "false", autocapitalize: "off" } });
  const codigo = entrada({ type: "text", name: "totp", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7", required: true, pattern: "[0-9 ]*" });
  const form = formulario(async (fd) => {
    const em = String(fd.get("email") || "").trim();
    const fr = String(fd.get("frase") || "");
    const cod = String(fd.get("totp") || "").replace(/\D/g, "");
    if (cod.length !== 6) throw new Error("O código do app autenticador tem 6 números.");
    status.className = "carregando";
    status.textContent = "Abrindo sua chave neste aparelho...";
    try {
      const pre = await post("/api/auth/pre-login", { email: em });
      // Achado 1: parâmetros abaixo do piso são recusados ANTES de derivar; a chave de login nem é calculada.
      cripto.conferirKdf(pre.ops, pre.mem);
      const { login, embrulho } = await cripto.derivarChaves(fr, pre.sal, pre.ops, pre.mem);
      const s = await cripto.obterSodium();
      let resp;
      try {
        resp = await post("/api/auth/login", { email: em, chave_login: cripto.b64(login), totp: cod });
      } catch (e) {
        if (e.status === 403 && e.dados && e.dados.pendente) {
          // Rodada 4 (persona admin NB1): cadastro aguardando aprovação. Nada de sessão: só os códigos de conferência,
          // CALCULADOS AQUI da chave privada (não os que o servidor diz), para ler ao responsável técnico por telefone.
          let imps = null, erroImp = null;
          try { imps = await impressoesCalculadas(e.dados.chaves, embrulho); } catch (x) { erroImp = x; }
          s.memzero(embrulho); s.memzero(login);
          frase.value = "";
          definirClinica(e.dados.clinica);
          telaAguardando(e.dados.nome || "", em, imps, erroImp);
          return;
        }
        s.memzero(embrulho); s.memzero(login);
        throw e;
      }
      let aberto = false, erroChave = null;
      try { await cripto.abrirCofre(resp.chaves, embrulho); aberto = true; } catch (e) { erroChave = e; /* segue só com o operacional */ }
      s.memzero(embrulho); s.memzero(login);
      const curta = cripto.contarPalavras(fr) < palavrasPara(resp.usuario.papel);
      frase.value = "";
      status.className = "pequeno"; status.textContent = "";
      aplicarSessao(resp);
      if (aberto) await conferirChaveAssinatura(resp.chaves);
      if (erroChave) aviso(erroChave.message || "Sua chave não abriu nesta aba.", "erro");
      else if (curta) aviso("Sua frase-senha tem menos palavras que o mínimo atual. Troque em Conta: a nova é criada pela plataforma.", "erro");
      if (!location.hash || location.hash === "#/") location.hash = resp.usuario.papel === "admin" ? "#/admin" : "#/painel";
      rotear();
    } catch (e) {
      status.className = "pequeno";
      status.textContent = "";
      codigo.value = "";
      throw e;
    }
  },
  campo("E-mail", email),
  campo("Frase-senha", comMostrar(frase), "A frase-senha nunca sai deste aparelho."),
  campo("Código de 6 números do app autenticador", codigo),
  h("button", { type: "submit", class: "btn", text: "Entrar" }),
  status);
  trocar(raiz, h("main", { class: "porta" }, h("div", { class: "caixa" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Conheça-TE Psi · Equipe"),
    h("h1", { text: "Entrar na plataforma" }),
    recado,
    h("div", { class: "card" }, form),
    h("p", { class: "pequeno" }, h("a", { href: "recuperar.html", text: "Esqueci a frase-senha (usar o código de recuperação)" })),
    h("p", { class: "pequeno so-teclado", text: "No computador, evite extensões no navegador que você usa para a plataforma." }))));
  (ultimoEmail ? frase : email).focus();
}

// Rodada 4 (NB1): impressões (códigos de conferência) calculadas NESTE aparelho a partir da chave privada aberta com a
// frase-senha. Se a pública que o servidor guarda não for a desta privada, avisa (alguém trocou a chave no caminho).
async function impressoesCalculadas(chaves, embrulho) {
  const s = await cripto.obterSodium();
  const privada = await cripto.desembrulhar(chaves.privada_embrulhada, embrulho,
    chaves.privada_embrulhada && chaves.privada_embrulhada.v === 2 ? { ops: chaves.ops, mem: chaves.mem, sal: chaves.sal } : null);
  try {
    const publica = s.crypto_scalarmult_base(privada);
    if (!chaves.publica || cripto.b64(publica) !== chaves.publica) {
      throw new Error("A chave que o servidor guarda não é a da sua frase-senha. Não leia nenhum código: avise o responsável técnico.");
    }
    const par = await cripto.parAssinatura(privada);
    s.memzero(par.privada);
    return { conjunta: await impressaoConjunta(publica, par.publica) };
  } finally { s.memzero(privada); }
}

// Tela única de quem ainda aguarda a aprovação: o código de conferência e nada mais (sem sessão, sem menu).
function telaAguardando(nome, email, imps, erro) {
  ultimoEmail = email || ultimoEmail;
  const primeiro = String(nome || "").split(" ")[0];
  trocar(raiz, h("main", { class: "porta" }, h("div", { class: "caixa" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Conheça-TE Psi · Equipe"),
    h("h1", { text: primeiro ? `${primeiro}, seu cadastro aguarda a aprovação` : "Cadastro aguardando aprovação" }),
    erro ? h("div", { class: "alerta r", role: "alert" }, h("b", { text: "Não deu para calcular o código" }), erro.message || "Tente de novo.")
      : h("div", { class: "card pilha" },
        h("p", { text: `Leia para ${rotuloRT()} por telefone este código de conferência, grupo por grupo. Ele confere com o que aparece na tela dele antes de liberar o seu acesso.` }),
        blocoConferencia("Código de conferência", imps.conjunta),
        h("details", {}, h("summary", { text: "Para que serve?" }), h("p", { class: "pequeno", text: EXPLICA_CONFERENCIA })),
        h("p", { class: "pequeno", text: "Este código foi calculado neste aparelho, a partir da sua frase-senha. Não é senha: pode ler em voz alta. Nunca mande por mensagem." })),
    h("p", { class: "pequeno", text: "Enquanto o cadastro não for aprovado, a plataforma mostra só esta tela. Você recebe um e-mail quando o acesso estiver liberado." }),
    h("button", { type: "button", class: "btn ghost", text: "Voltar para a entrada", onclick: () => telaEntrada() }))));
  window.scrollTo(0, 0);
}

// Autoria: a chave de assinatura registrada no servidor tem de ser a derivada da privada deste(a) usuário(a).
// Conta antiga sem chave registrada: registra agora (uma vez, com prova de posse).
async function conferirChaveAssinatura(chaves) {
  try {
    if (!cripto.cofre.assinaturaRegistrada && cripto.cofre.privada) {
      await post("/api/auth/chave-assinatura", await cripto.provaAssinatura(cripto.cofre.privada, chaves.publica));
      cripto.cofre.assinaturaRegistrada = true;
      cripto.cofre.assinaturaConfere = true;
    } else if (!cripto.cofre.assinaturaConfere) {
      aviso("Sua chave de assinatura no servidor não confere com a deste aparelho. Notas clínicas ficam bloqueadas. Avise o responsável técnico.", "erro");
    }
  } catch (_) { /* sem registro agora: o cofre recusa gravar e explica */ }
}

let conteudo = null;
let navs = [];

function linkNav([href, rot, ic], classe = "") {
  return h("a", { href, class: classe, dataset: { alvo: href.slice(2) } }, icone(ic), h("span", { text: rot }));
}

function montarCasca() {
  const u = estado.usuario;
  const admin = u.papel === "admin";
  conteudo = h("main", { class: "conteudo", id: "conteudo", tabindex: "-1" });
  const topo = h("header", { class: "topo" },
    h("div", { class: "linha" },
      // Rodada 4 (NP12): no celular, só "Conheça-TE Psi" (o complemento quebrava em 2 linhas).
      h("div", { class: "marca" }, h("span", { class: "ponto" }), "Conheça-TE Psi", h("span", { class: "so-largo", text: admin ? " · Clínica" : " · Equipe" })),
      h("div", { class: "quem" }, h("span", { class: "nome", text: u.nome }),
        h("button", { type: "button", class: "btn mini ghost", text: "Sair", onclick: sair }))));
  const grupos = admin ? LATERAL_ADMIN : LATERAL_ASSOCIADO;
  const extras = ext.menus(admin ? "admin" : "associado").filter(([href]) => !grupos.some(([, itens]) => itens.some(([x]) => x === href)));
  const lateral = h("nav", { class: "lateral", "aria-label": "Seções" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Conheça-TE Psi"),
    grupos.map(([titulo, itens]) => [h("div", { class: "grupo", text: titulo }), itens.map((x) => linkNav(x))]),
    extras.map(([href, rot]) => linkNav([href, rot, "menu"])));
  const inferior = h("nav", { class: "nav-inferior", "aria-label": "Seções principais" },
    (admin ? NAV_ADMIN : NAV_ASSOCIADO).map((x) => linkNav(x, x[0] === "#/registrar" ? "destaque" : "")));
  navs = [lateral, inferior];
  trocar(raiz, h("div", { class: "casca" }, lateral, h("div", { class: "principal" }, topo, conteudo)), inferior);
}

// Rodada 4 (persona admin NA3): cada troca de tela começa no topo (antes, no celular, a aba nova abria na altura da
// anterior, no meio dos cartões). "Recarregar" a mesma tela depois de uma ação mantém a posição.
let rotaAnterior = null;
function topoSeMudou() {
  const atual = location.hash || "";
  if (atual !== rotaAnterior && !atual.endsWith("#termo")) window.scrollTo(0, 0);
  return atual;
}

async function rotear() {
  if (!estado.usuario) return;
  limparAvisosAntigos();
  topoSeMudou();
  const admin = estado.usuario.papel === "admin";
  const partes = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const nome = partes[0] || (admin ? "admin" : "painel");
  const tabela = { ...(admin ? ROTAS_ADMIN : ROTAS_ASSOCIADO), ...ext.rotas(admin ? "admin" : "associado") };
  const tela = tabela[nome] || (admin ? ADM.visao : A.painel);
  const principais = (admin ? NAV_ADMIN : NAV_ASSOCIADO).map(([x]) => x.slice(2));
  const equivalente = { paciente: "pacientes", "meu-paciente": "painel", nota: "pacientes" }[nome] || nome;
  for (const nav of navs) {
    for (const a of nav.querySelectorAll("a")) {
      const alvo = a.dataset.alvo;
      const ativo = alvo === equivalente || (nav.classList.contains("nav-inferior") && alvo === "mais" && !principais.includes(equivalente));
      a.classList.toggle("ativa", ativo);
      if (ativo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
  }
  trocar(conteudo, h("p", { class: "carregando", text: "Carregando..." }));
  try {
    await tela(conteudo, partes.slice(1), { usuario: estado.usuario, recarregar: rotear, ir: (hash) => { location.hash = hash; } });
  } catch (e) {
    if (e.status !== 401) trocar(conteudo, h("div", { class: "alerta r" }, h("b", { text: "Não deu para abrir esta tela." }), e.message));
  }
  rotaAnterior = topoSeMudou();
  conteudo.focus({ preventScroll: true });
}

async function iniciar() {
  quandoExpirar(() => {
    cripto.limparCofre({ preservarRascunho: true });
    estado.usuario = null;
    limparAvisos();
    telaEntrada("Sua sessão terminou. Entre de novo.");
  });
  window.addEventListener("hashchange", rotear);
  try {
    aplicarSessao(await get("/api/auth/eu"));
    rotear();
  } catch (_) {
    telaEntrada();
  }
}

// Rodada 2 (B3): sem chave nem texto decifrado em cache de voltar/avançar.
//  * pagehide: apaga a chave e esvazia a tela (o front também vai com Cache-Control: no-store, que tira a página do bfcache);
//  * pageshow vindo do bfcache (persisted): recarrega do zero;
//  * aba oculta por mais de GRACA_OCULTA_S: apaga a chave e redesenha (no celular, pagehide nem sempre dispara). A folga
//    evita pedir a frase-senha a cada troca rápida de app; a chave nunca fica aberta com a aba esquecida em segundo plano.
// Rodada 3 (persona associada B2): na aba oculta, o rascunho fica SELADO (só a frase-senha abre de novo), não some.
const GRACA_OCULTA_S = 60;
function fecharPorOcultar() {
  if (!cripto.cofre.privada) return;
  cripto.limparCofre({ preservarRascunho: true });
  if (estado.usuario) rotear(); else trocar(raiz);
}
window.addEventListener("pagehide", () => { cripto.limparCofre(); sessaoCofre.limparSessaoCofre(); trocar(raiz); });
window.addEventListener("pageshow", (ev) => { if (ev.persisted) location.reload(); });
let ocultaDesde = null;
let tOculta = null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    ocultaDesde = Date.now();
    clearTimeout(tOculta);
    tOculta = setTimeout(fecharPorOcultar, GRACA_OCULTA_S * 1000);
  } else {
    clearTimeout(tOculta);
    if (ocultaDesde && Date.now() - ocultaDesde >= GRACA_OCULTA_S * 1000) fecharPorOcultar();
    ocultaDesde = null;
  }
});

iniciar().catch(() => aviso("Não deu para iniciar a plataforma.", "erro"));
