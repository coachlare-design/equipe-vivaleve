// Cliente da API. Cookie de sessão HttpOnly (o JS nunca o vê) + cabeçalho anti-CSRF em todo POST.
import { API } from "./config.js";

let csrf = null;
let aoExpirar = null;

export function definirCsrf(token) { csrf = token; }
export function quandoExpirar(fn) { aoExpirar = fn; }

export class ErroApi extends Error {
  constructor(status, mensagem, dados = null) {
    super(mensagem);
    this.status = status;
    this.dados = dados; // rodada 4: detalhe estruturado (conflito de horário, cadastro aguardando aprovação)
  }
}

export async function api(metodo, caminho, corpo) {
  const opcoes = { method: metodo, credentials: "include", cache: "no-store", headers: {}, redirect: "error" };
  if (corpo !== undefined) {
    opcoes.headers["Content-Type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }
  if (metodo !== "GET" && csrf) opcoes.headers["X-CSRF-Token"] = csrf;
  let resposta;
  try {
    resposta = await fetch(API + caminho, opcoes);
  } catch (_) {
    throw new ErroApi(0, "Sem conexão com a plataforma. Confira a internet e tente de novo.");
  }
  let dados = null;
  try { dados = await resposta.json(); } catch (_) { dados = null; }
  if (!resposta.ok) {
    if (resposta.status === 401 && aoExpirar && !caminho.startsWith("/api/auth/login")) aoExpirar();
    const det = dados && dados.detail;
    const msg = det && typeof det === "object" ? det.mensagem : det;
    throw new ErroApi(resposta.status, msg || "Não deu certo. Tente de novo.", dados);
  }
  return dados;
}

export const get = (c) => api("GET", c);
export const post = (c, corpo = {}) => api("POST", c, corpo);
