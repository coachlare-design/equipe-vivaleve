// Utilitários de interface. Tudo é montado com createElement/textContent: nenhum innerHTML,
// o que mantém a página compatível com Trusted Types (require-trusted-types-for 'script').
// Rodada 3 (personas): datas sempre no fuso de São Paulo, erro de formulário DENTRO do formulário (persistente, sem
// cobrir botão), aviso de confirmação no topo que some sozinho e na troca de tela, folha de confirmação, copiar com
// retorno, nome do responsável técnico no lugar de "RT".

// Anti-clickjacking: a hospedagem estática (GitHub Pages) não envia frame-ancestors/X-Frame-Options e a CSP em meta não
// aceita frame-ancestors. Se a página estiver dentro de um frame de outro site, ela se esvazia e não carrega nada.
if (typeof window !== "undefined" && window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error("Página aberta dentro de outro site: bloqueada.");
}

export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

export function limpar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function trocar(el, ...filhos) {
  limpar(el);
  anexar(el, filhos);
  return el;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function moeda(centavos) {
  return ((centavos || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------- datas (sempre America/Sao_Paulo)

export const FUSO = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false });

// ISO de dia ("2026-09-30") fica como está; carimbo UTC ("2026-10-01T00:30:00Z") vira o dia em São Paulo (30/09).
export function diaLocal(iso) {
  if (!iso) return "";
  const t = String(iso);
  if (!t.includes("T")) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t.slice(0, 10) : fmtDia.format(d);
}

export function dataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = diaLocal(iso).split("-");
  return `${d}/${m}/${a}`;
}

export function diaMes(iso) {
  if (!iso) return "";
  const [, m, d] = diaLocal(iso).split("-");
  return `${d}/${m}`;
}

export function horaBR(isoUtc) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  return Number.isNaN(d.getTime()) ? "" : fmtHora.format(d);
}

export function dataHoraBR(isoUtc) {
  if (!isoUtc) return "";
  return `${dataBR(isoUtc)} às ${horaBR(isoUtc)}`;
}

export function hojeISO() {
  return fmtDia.format(new Date());
}

export function horaAgora() {
  const [hh, mm] = fmtHora.format(new Date()).split(":").map(Number);
  return `${String(hh).padStart(2, "0")}:${mm < 30 ? "00" : "30"}`;
}

export function mesAtual() {
  return hojeISO().slice(0, 7);
}

export function mesVizinho(mes, delta) {
  let [a, m] = mes.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; a -= 1; }
  while (m > 12) { m -= 12; a += 1; }
  return `${a}-${String(m).padStart(2, "0")}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function nomeMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

export function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

export const STATUS_SESSAO = {
  realizada: "Realizada",
  falta_paciente: "Falta do(a) paciente",
  remarcada: "Remarcada",
  falta_profissional: "Falta da profissional",
  agendada: "Agendada",
  entrevista: "Entrevista inicial (gratuita)",
};

// Rodada 4 (persona associada A1/P1): "versão v0" vira texto simples.
export function nomeVersaoTermo(versao, provisorio = false) {
  const v = String(versao || "");
  if (provisorio || v === "v0") return "texto provisório";
  return `versão ${v.replace(/^v/, "")}`;
}

// Rodada 4 (N3): conflito de horário com outro(a) paciente pede confirmação; com o(a) mesmo(a) paciente é barrado.
export async function comConflitoConfirmado(enviar) {
  try {
    return await enviar(false);
  } catch (e) {
    const det = e && e.dados && e.dados.detail;
    if (e && e.status === 409 && det && det.conflito_horario && det.pode_confirmar) {
      const ok = await confirmar({ titulo: "Horário já ocupado", texto: e.message, textoConfirmar: "Marcar mesmo assim" });
      if (!ok) throw new Error("Nada foi salvo. Escolha outro horário.");
      return await enviar(true);
    }
    throw e;
  }
}

export const STATUS_PACIENTE = { ativo: "ativo(a)", atraso: "mensalidade em atraso", cancelado: "cancelado(a)", encerrado: "encerrado(a)" };
export const PLANO = { mensal: "mensal", avulsa: "avulso" };

export function pill(texto, tipo = "") {
  return h("span", { class: `pill ${tipo}`.trim(), text: texto });
}

// ---------------------------------------------------------------- clínica e responsável técnico

const clinica = { rt_nome: "", razao_social: "", cnpj: "", rt_crp: "" };
export function definirClinica(c) { Object.assign(clinica, c || {}); }
export function dadosClinica() { return { ...clinica }; }
// "o responsável técnico (Carlos)" no lugar da sigla RT (persona associada A1).
export function rotuloRT(curto = false) {
  const primeiro = (clinica.rt_nome || "").split(" ")[0];
  if (curto) return primeiro ? `responsável técnico (${primeiro})` : "responsável técnico";
  return primeiro ? `o responsável técnico (${primeiro})` : "o responsável técnico da clínica";
}

// ---------------------------------------------------------------- avisos de confirmação

let temporizador = null;
let mostradoEm = 0;
// Confirmações ("Registro salvo.") aparecem no topo, abaixo do cabeçalho, e somem em 5,5 s ou na troca de tela.
// Erro que não pertence a um formulário fica até a pessoa fechar.
export function aviso(texto, tipo = "ok") {
  let el = document.getElementById("aviso-flutuante");
  if (!el) {
    el = h("div", { id: "aviso-flutuante", role: tipo === "erro" ? "alert" : "status", "aria-live": tipo === "erro" ? "assertive" : "polite" });
    document.body.append(el);
  }
  el.className = `aviso-flutuante ${tipo}`;
  const fechar = h("button", { type: "button", "aria-label": "Fechar aviso", text: "Fechar" });
  fechar.addEventListener("click", limparAvisos);
  trocar(el, h("span", { text: texto }), fechar);
  el.hidden = false;
  mostradoEm = Date.now();
  clearTimeout(temporizador);
  if (tipo !== "erro") temporizador = setTimeout(limparAvisos, 5500);
}

// Na troca de tela: some o aviso antigo, mas não o que acabou de aparecer (ex.: "Nota salva" logo antes de voltar).
export function limparAvisosAntigos() {
  if (Date.now() - mostradoEm > 1500) limparAvisos();
}

export function limparAvisos() {
  clearTimeout(temporizador);
  const el = document.getElementById("aviso-flutuante");
  if (el) el.remove();
}

// ---------------------------------------------------------------- formulários

export function campo(rotulo, entrada, ajuda = null) {
  const id = entrada.id || `c-${Math.random().toString(36).slice(2, 9)}`;
  entrada.id = id;
  entrada.dataset.rotulo = rotulo;
  const aj = ajuda ? h("span", { class: "ajuda", id: `${id}-ajuda`, text: ajuda }) : null;
  if (aj) entrada.setAttribute("aria-describedby", aj.id);
  return h("label", { class: "campo", for: id }, h("span", { class: "rotulo", text: rotulo }), entrada, aj);
}

export function segmentado(nome, opcoes, valor, aoMudar) {
  const grupo = h("div", { class: "seg", role: "radiogroup", "aria-label": nome });
  const botoes = opcoes.map(([v, rot]) => {
    const b = h("button", { type: "button", class: v === valor ? "on" : "", role: "radio", "aria-checked": v === valor ? "true" : "false", text: rot });
    b.addEventListener("click", () => {
      for (const x of botoes) { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); }
      b.classList.add("on");
      b.setAttribute("aria-checked", "true");
      aoMudar(v);
    });
    return b;
  });
  grupo.append(...botoes);
  return grupo;
}

// Erro de um botão: fica logo abaixo dele, até o próximo clique (persona associada A2).
export function botao(texto, aoClicar, classe = "btn") {
  const b = h("button", { type: "button", class: classe, text: texto });
  let erro = null;
  b.addEventListener("click", async (ev) => {
    if (b.disabled) return;
    b.disabled = true;
    if (erro) { erro.remove(); erro = null; }
    try { await aoClicar(ev); } catch (e) {
      erro = h("p", { class: "erro-botao", role: "alert", text: (e && e.message) || "Algo deu errado." });
      if (b.isConnected) b.after(erro); else aviso(erro.textContent, "erro");
    } finally { b.disabled = false; }
  });
  return b;
}

function rotuloDe(el) {
  return el.dataset.rotulo || el.getAttribute("aria-label") || el.name || "campo";
}

// Formulário com validação simples (obrigatórios vazios) e erro DENTRO do formulário, logo acima do botão de enviar,
// com aria-invalid e foco no campo. O erro só some quando a pessoa corrige o campo ou envia de novo com sucesso.
// opcoes.travarAoConcluir: depois de dar certo, o botão de enviar fica desabilitado (evita registro em dobro).
// Uso: formulario(aoEnviar, ...filhos) ou formulario({ travarAoConcluir: true }, aoEnviar, ...filhos).
export function formulario(...args) {
  const opcoes = typeof args[0] === "function" ? {} : args.shift();
  const aoEnviar = args.shift();
  const filhos = args;
  const f = h("form", { class: "form", novalidate: true }, ...filhos);
  const erro = h("p", { class: "erro-form", role: "alert", hidden: true });
  let marcado = null;
  const limparErro = () => {
    erro.hidden = true;
    erro.textContent = "";
    if (marcado) { marcado.removeAttribute("aria-invalid"); marcado = null; }
  };
  const mostrarErro = (texto, el = null) => {
    erro.textContent = texto;
    erro.hidden = false;
    if (el) { marcado = el; el.setAttribute("aria-invalid", "true"); el.focus(); }
    const enviar = f.querySelector("button[type=submit]");
    if (enviar && !erro.isConnected) enviar.before(erro);
    else if (!erro.isConnected) f.append(erro);
  };
  f.addEventListener("input", (ev) => { if (marcado && ev.target === marcado) limparErro(); });
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const enviar = f.querySelector("button[type=submit]");
    if (enviar && enviar.disabled) return;
    limparErro();
    for (const el of f.querySelectorAll("input[required], select[required], textarea[required]")) {
      if (el.closest("[hidden]")) continue;
      const vazio = el.type === "checkbox" ? !el.checked : !String(el.value || "").trim();
      if (vazio) { mostrarErro(el.type === "checkbox" ? `Marque: ${rotuloDe(el)}.` : `Preencha: ${rotuloDe(el)}.`, el); return; }
      const min = Number(el.getAttribute("minlength") || 0);
      if (min && String(el.value).trim().length < min) { mostrarErro(`${rotuloDe(el)}: escreva pelo menos ${min} caracteres.`, el); return; }
    }
    if (enviar) enviar.disabled = true;
    let ok = false;
    try { await aoEnviar(new FormData(f), f); ok = true; } catch (e) {
      mostrarErro((e && e.message) || "Algo deu errado.");
    } finally { if (enviar && !(ok && opcoes.travarAoConcluir)) enviar.disabled = false; }
  });
  f.mostrarErro = mostrarErro;
  return f;
}

// Rodada 2 (M3): campo clínico sem corretor ortográfico/gramatical (no Edge e no Chrome com correção aprimorada, o texto
// digitado iria para o serviço de correção na nuvem, em claro, antes de qualquer cifra), sem autocorreção, sem maiúscula
// automática e sem preenchimento automático. data-gramm* desliga extensões de correção conhecidas.
export const SEM_CORRETOR = Object.freeze({ spellcheck: "false", autocorrect: "off", autocapitalize: "off", autocomplete: "off",
  "data-gramm": "false", "data-gramm_editor": "false", "data-enable-grammarly": "false", "data-ms-editor": "false" });

export function entrada(props) {
  return h("input", { class: "entrada", ...props });
}

// Rodada 4 (polimento P6): campo de frase-senha com "Mostrar", que volta a esconder sozinho em 15 s.
export function comMostrar(campoSenha) {
  const b = h("button", { type: "button", class: "btn mini ghost mostrar", text: "Mostrar", "aria-pressed": "false" });
  let t = null;
  const esconder = () => { campoSenha.type = "password"; b.textContent = "Mostrar"; b.setAttribute("aria-pressed", "false"); clearTimeout(t); };
  b.addEventListener("click", () => {
    if (campoSenha.type === "password") {
      campoSenha.type = "text"; b.textContent = "Esconder"; b.setAttribute("aria-pressed", "true");
      clearTimeout(t); t = setTimeout(esconder, 15000);
    } else esconder();
  });
  campoSenha.form?.addEventListener?.("submit", esconder);
  return h("div", { class: "com-mostrar" }, campoSenha, b);
}

export function selecao(nome, opcoes, valor = "", props = {}) {
  return h("select", { class: "entrada", name: nome, ...props },
    opcoes.map(([v, rot]) => h("option", { value: v, selected: v === valor ? true : null, text: rot })));
}

export function vazio(texto) {
  return h("p", { class: "vazio", text: texto });
}

// Rodada 4 (persona associada N1): copiar nunca mostra erro técnico (em inglês) do navegador. 1ª tentativa pela área de
// transferência; se o navegador negar, 2ª tentativa por uma caixa de texto escondida + execCommand("copy"); se ainda assim
// não der, seleciona o texto visível (quando a tela mostra um) e explica em português como copiar à mão.
export async function copiar(texto, rotulo = "Copiado.", alvo = null) {
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext !== false) { await navigator.clipboard.writeText(texto); ok = true; }
  } catch (_) { ok = false; }
  if (!ok) ok = copiarPorSelecao(texto);
  if (ok) { aviso(rotulo); return true; }
  if (alvo) selecionarTexto(alvo);
  throw new Error(alvo ? "Não deu para copiar sozinho. O texto ficou selecionado: toque e segure sobre ele e escolha Copiar."
    : "Não deu para copiar sozinho. Toque e segure o texto na tela e escolha Copiar.");
}

function copiarPorSelecao(texto) {
  const area = h("textarea", { readonly: true, "aria-hidden": "true", class: "copia-oculta" });
  area.value = texto;
  document.body.append(area);
  let ok = false;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, texto.length);
    ok = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch (_) { ok = false; }
  area.remove();
  return Boolean(ok);
}

export function selecionarTexto(el) {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) { el.focus(); el.select(); return; }
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch (_) { /* sem seleção: a mensagem explica */ }
}

// Caixa de texto visível e selecionável (ex.: a mensagem pronta do termo), para copiar à mão se o botão falhar.
export function caixaTexto(texto, rotulo = "Texto") {
  const area = h("textarea", { class: "entrada caixa-texto", readonly: true, rows: "4", "aria-label": rotulo });
  area.value = texto;
  area.addEventListener("focus", () => area.select());
  return area;
}

// No celular: "Enviar pelo WhatsApp ou outro app" (folha de compartilhar do sistema). Só aparece se o navegador tiver.
export function podeCompartilhar() {
  return typeof navigator.share === "function";
}
export async function compartilhar(texto, titulo = "Viva Leve Psi") {
  try { await navigator.share({ title: titulo, text: texto }); return true; } catch (e) {
    if (e && e.name === "AbortError") return false; // a pessoa fechou a folha
    throw new Error("Não deu para abrir o compartilhamento. Use Copiar ou toque e segure o texto.");
  }
}

// ---------------------------------------------------------------- códigos de conferência da chave (rodada 4, NB1 e A1)
// A impressão de uma chave (16 letras e números em 4 grupos) vira "código de conferência", fácil de ler em voz alta: cada
// grupo de 4 aparece grande e, embaixo, com uma palavra por caractere ("6HID" = seis, Hotel, Ilha, Dado). O alfabeto da
// impressão tem só A a Z e 2 a 7 (sem 0, 1, 8 e 9), então não há confusão entre O e 0 ou I e 1.
const FALADO = {
  A: "Amor", B: "Bola", C: "Casa", D: "Dado", E: "Escola", F: "Faca", G: "Gato", H: "Hotel", I: "Ilha", J: "Janela", K: "Kiwi",
  L: "Lua", M: "Mesa", N: "Navio", O: "Ovo", P: "Pato", Q: "Queijo", R: "Rato", S: "Sapo", T: "Tatu", U: "Uva", V: "Vaca",
  W: "Wi-fi", X: "Xícara", Y: "Yoga", Z: "Zebra", 2: "dois", 3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete",
};
export function gruposConferencia(imp) {
  return String(imp || "").toUpperCase().replace(/[^A-Z2-7]/g, "").match(/.{1,4}/g) || [];
}
export function grupoFalado(grupo) {
  return [...grupo].map((c) => FALADO[c] || c).join(", ");
}
export const EXPLICA_CONFERENCIA = "O código 1 confere a chave que tranca as suas notas (só você abre). O código 2 confere a sua "
  + "assinatura (prova que a nota foi escrita por você). O responsável técnico confere os dois para garantir que ninguém trocou a sua chave no caminho.";

export function blocoConferencia(rotulo, imp) {
  const grupos = gruposConferencia(imp);
  return h("div", { class: "conferencia" },
    h("span", { class: "rotulo", text: rotulo }),
    h("ol", { class: "grupos", "aria-label": `${rotulo}: ${grupos.join(" ")}` },
      grupos.map((g, i) => h("li", {}, h("span", { class: "g", text: g }), h("span", { class: "falado", text: `${i + 1}º grupo: ${grupoFalado(g)}` })))));
}

// Folha de confirmação (persona: confirmar antes de exportar, congelar, abrir ocorrência...). Devolve uma Promise que
// resolve com os valores do formulário interno (ou true) ao confirmar, e null ao cancelar.
export function confirmar({ titulo, texto = "", campos = [], textoConfirmar = "Confirmar", perigo = false, aoConfirmar = null }) {
  return new Promise((resolve) => {
    const fundo = h("div", { class: "folha-fundo", role: "presentation" });
    const fechar = (v) => { fundo.remove(); document.removeEventListener("keydown", esc); resolve(v); };
    const esc = (e) => { if (e.key === "Escape") fechar(null); };
    const form = formulario(async (fd) => {
      const valores = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
      if (aoConfirmar) await aoConfirmar(valores);
      fechar(campos.length ? valores : true);
    }, ...campos,
    h("div", { class: "acoes-linha" },
      h("button", { type: "submit", class: perigo ? "btn perigo" : "btn", text: textoConfirmar }),
      h("button", { type: "button", class: "btn ghost", text: "Cancelar", onclick: () => fechar(null) })));
    const folha = h("div", { class: "folha", role: "dialog", "aria-modal": "true", "aria-label": titulo },
      h("h2", { text: titulo }), texto ? (texto instanceof Node ? texto : h("p", { text: texto })) : null, form);
    fundo.append(folha);
    fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(null); });
    document.addEventListener("keydown", esc);
    document.body.append(fundo);
    const primeiro = folha.querySelector("input, select, textarea, button");
    if (primeiro) primeiro.focus();
  });
}

// "Chrome no Android", "Safari no iPhone" (persona associada A13: nada de user agent cru).
export function resumoAparelho(ua) {
  const t = String(ua || "");
  if (!t) return "aparelho não informado";
  const sistema = /iPhone|iPad/.test(t) ? "iPhone ou iPad" : /Android/.test(t) ? "Android" : /Windows/.test(t) ? "Windows"
    : /Mac OS/.test(t) ? "Mac" : /Linux/.test(t) ? "Linux" : "outro sistema";
  const nav = /Edg\//.test(t) ? "Edge" : /SamsungBrowser/.test(t) ? "Samsung Internet" : /Firefox\//.test(t) ? "Firefox"
    : /Chrome\//.test(t) ? "Chrome" : /Safari\//.test(t) ? "Safari" : "navegador";
  return `${nav} no ${sistema}`;
}

// Texto em blocos de 4 que nunca quebram no meio (chave do app autenticador, código de recuperação).
export function blocos(texto, classe = "blocos") {
  const limpo = String(texto || "").replace(/[\s-]/g, "");
  const partes = limpo.match(/.{1,4}/g) || [];
  return h("p", { class: classe, "aria-label": partes.join(" ") }, partes.map((p) => h("span", { text: p })));
}
