// Estado do cofre NESTA ABA, só em memória: rascunhos cifrados, leituras do RT em curso e vigia de inatividade.
// Nada daqui vai para localStorage, sessionStorage, IndexedDB ou cache.
//
// Rodada 3 (persona associada B2): "atendi uma ligação e o rascunho sumiu".
//  * Aos 13 minutos sem uso aparece um aviso grande: "Por segurança, você sai em 2 minutos. [Continuar aqui]".
//  * Na saída por inatividade ou com a aba oculta por mais de 1 minuto, a chave privada e a chave dos rascunhos são
//    APAGADAS como antes; o rascunho fica só como texto cifrado, e a chave dele fica SELADA (crypto_box_seal) para a
//    pública da própria pessoa. Só quem digitar a frase-senha de novo (e abrir a privada) recupera o rascunho, nesta aba.
//  * Sair, fechar a aba, recarregar e o pagehide continuam apagando tudo (rascunho inclusive).
import { obterSodium, sodiumPronto, aoLimparCofre, aoAbrirCofre, cofre } from "./cripto.js";
import { cifrarRascunho, decifrarRascunho } from "./cofre-cripto.js";
import { h, botao } from "./ui.js";

let chaveRascunhos = null;
let selada = null; // chave dos rascunhos selada para a pública da pessoa (só a privada dela abre)
const rascunhos = new Map();
export const leituras = new Map(); // paciente_id -> { id, ate }

export async function guardarRascunho(rotulo, texto) {
  const s = await obterSodium();
  if (!texto) { rascunhos.delete(rotulo); return null; }
  if (!chaveRascunhos) {
    if (selada) return null; // chave selada esperando a frase-senha: não mistura rascunho novo com o guardado
    chaveRascunhos = s.crypto_aead_xchacha20poly1305_ietf_keygen();
  }
  rascunhos.set(rotulo, { ...(await cifrarRascunho(texto, chaveRascunhos, rotulo)), em: new Date() });
  return rascunhos.get(rotulo).em;
}

export async function lerRascunho(rotulo) {
  const b = rascunhos.get(rotulo);
  if (!b || !chaveRascunhos) return null;
  try { return await decifrarRascunho(b, chaveRascunhos, rotulo); } catch (_) { return null; }
}

export function apagarRascunho(rotulo) {
  rascunhos.delete(rotulo);
}

export function temRascunho(rotulo) {
  return rascunhos.has(rotulo);
}

// Rótulos dos rascunhos guardados (ex.: "evolucao:12:340"): só os rótulos, nunca o texto.
export function rotulosRascunhos() {
  return [...rascunhos.keys()];
}

export function rascunhoSelado() {
  return Boolean(selada) && rascunhos.size > 0;
}

function zerar(u8) {
  if (u8) { try { u8.fill(0); } catch (_) { /* nada */ } }
}

export function limparSessaoCofre() {
  rascunhos.clear();
  leituras.clear();
  zerar(chaveRascunhos);
  chaveRascunhos = null;
  zerar(selada);
  selada = null;
}

// Gancho chamado por cripto.limparCofre. Com preservarRascunho, sela a chave dos rascunhos para a pública da pessoa.
function aoLimpar(opcoes = {}) {
  leituras.clear();
  const s = sodiumPronto();
  if (opcoes.preservarRascunho && chaveRascunhos && rascunhos.size && opcoes.publica && s) {
    zerar(selada);
    selada = s.crypto_box_seal(chaveRascunhos, opcoes.publica);
    zerar(chaveRascunhos);
    chaveRascunhos = null;
    return;
  }
  if (opcoes.preservarRascunho && selada && rascunhos.size) return; // já estava selada
  limparSessaoCofre();
}

// Ao abrir a chave de novo: se a chave dos rascunhos estiver selada para esta pessoa, recupera; senão, descarta.
function aoAbrir() {
  if (!selada) return;
  const s = sodiumPronto();
  try {
    chaveRascunhos = s.crypto_box_seal_open(selada, cofre.publica, cofre.privada);
  } catch (_) {
    rascunhos.clear(); // outra pessoa entrou nesta aba: o rascunho de quem saiu não abre e some
  }
  zerar(selada);
  selada = null;
}

aoLimparCofre.push(aoLimpar);
aoAbrirCofre.push(aoAbrir);

export function leituraValida(pid) {
  const l = leituras.get(Number(pid));
  if (!l) return null;
  if (new Date(l.ate).getTime() - Date.now() < 15000) { leituras.delete(Number(pid)); return null; }
  return l;
}

// Inatividade: depois de `minutos` sem toque, tecla ou rolagem, chama aoExpirar (que sai com o rascunho selado).
// `avisoMin` antes, mostra o aviso com "Continuar aqui".
let ultimo = Date.now();
let vigia = null;
let banner = null;
let contagem = null;

function esconderAviso() {
  clearInterval(contagem);
  contagem = null;
  if (banner) { banner.remove(); banner = null; }
}

function mostrarAviso(minutos, aoContinuar) {
  if (banner) return;
  const resta = h("span", {});
  const atualizar = () => {
    const s = Math.max(0, Math.round((ultimo + minutos * 60000 - Date.now()) / 1000));
    resta.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  banner = h("div", { class: "banner-inatividade", role: "alertdialog", "aria-live": "assertive", "aria-label": "Aviso de saída por segurança" },
    h("div", { class: "dentro" },
      h("b", {}, "Por segurança, você sai em ", resta, " sem uso."),
      h("span", { text: rascunhos.size ? "Seu rascunho fica guardado cifrado nesta aba: depois é só entrar de novo." : "Toque em continuar para ficar." }),
      botao("Continuar aqui", async () => { aoContinuar(); }, "btn")));
  document.body.append(banner);
  atualizar();
  contagem = setInterval(atualizar, 1000);
  const b = banner.querySelector("button");
  if (b) b.focus();
}

export function vigiarInatividade(minutos, aoExpirar, ativo = () => true, avisoMin = 2) {
  // Rodada 4 (persona associada N2): com o aviso aberto, qualquer tecla, toque, digitação ou rolagem conta como uso:
  // o aviso fecha e a contagem recomeça (antes, quem continuava digitando saía no meio da frase).
  const marcar = () => { ultimo = Date.now(); if (banner) esconderAviso(); };
  for (const ev of ["pointerdown", "keydown", "scroll", "touchstart", "input", "wheel"]) window.addEventListener(ev, marcar, { passive: true, capture: true });
  const continuar = () => { ultimo = Date.now(); esconderAviso(); };
  const conferir = () => {
    if (!ativo()) { ultimo = Date.now(); esconderAviso(); return; }
    const parado = Date.now() - ultimo;
    if (parado > minutos * 60000) {
      esconderAviso();
      ultimo = Date.now();
      aoExpirar();
    } else if (parado > (minutos - avisoMin) * 60000) {
      mostrarAviso(minutos, continuar);
    }
  };
  document.addEventListener("visibilitychange", conferir);
  clearInterval(vigia);
  vigia = setInterval(conferir, 5000);
}
