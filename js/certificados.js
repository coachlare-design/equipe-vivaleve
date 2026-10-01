// Rodada 2 (achados A1 e A2 da revisão de cripto do cofre): de quem são as chaves, decidido NESTE navegador.
// Sem DOM: roda também no Node (testes). Referência em Python: backend/app/certificados.py.
//
// Raiz de confiança: as impressões gravadas no pacote do site (config.js, IMPRESSOES), que o servidor não consegue trocar.
//   * mestra e RT (cifra): o navegador só sela para as públicas cujas impressões batem com as do build;
//   * RT (assinatura): só vale certificado assinado por essa Ed25519;
//   * colegas: pública de cifra e de assinatura só valem com CERTIFICADO do RT:
//       vl:cert:v1|usuario_id|codigo|crp|X25519 (base64)|Ed25519 (base64)|desde
//   * eu: a pública é a CALCULADA da minha privada (cripto.abrirCofre), nunca a que o servidor manda.
// Destinatários de cada registro novo: eu, o RT fixado, a mestra fixada e, só quando o RT escreve em prontuário de outra
// pessoa (anotação do RT), o(a) responsável com certificado válido. Nada a mais, venha o que vier do servidor.
import { obterSodium, b64, deB64, parAssinatura, cofre } from "./cripto.js";
import { impressao } from "./cofre-cripto.js";
import { IMPRESSOES } from "./config.js";

export const fixada = (v) => typeof v === "string" && v.length > 0 && !v.startsWith("__");

export function impressoesRtAssinatura() {
  return fixada(IMPRESSOES.rt_assinatura) ? IMPRESSOES.rt_assinatura.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) : [];
}

export function raizFixada() {
  return fixada(IMPRESSOES.mestra) && fixada(IMPRESSOES.rt) && impressoesRtAssinatura().length > 0;
}

export function exigirRaiz() {
  if (!raizFixada()) {
    throw new Error("O pacote do site ainda não tem as impressões das chaves do responsável técnico e da clínica: o cofre fica fechado (nada é "
      + "gravado nem mostrado). Avise o responsável técnico.");
  }
}

export function mensagemCertificado({ usuario_id: uid, codigo, crp, publica, assinatura_pub: assinaturaPub, desde }) {
  const campos = [String(Number(uid)), String(codigo), String(crp), String(publica), String(assinaturaPub), String(desde)];
  if (campos.some((c) => c.includes("|"))) throw new Error("certificado com campo inválido");
  return `vl:cert:v1|${campos.join("|")}`;
}

// O RT assina, NO NAVEGADOR, as chaves de uma pessoa. pessoa = { id, codigo, crp, chave_publica, chave_assinatura } (base64).
export async function assinarCertificado(pessoa, desde, privadaX25519) {
  if (!privadaX25519) throw new Error("Sua chave não está aberta nesta aba: abra a chave para certificar.");
  const s = await obterSodium();
  if (!pessoa.chave_publica || !pessoa.chave_assinatura) throw new Error("A pessoa ainda não registrou as duas chaves (precisa entrar uma vez).");
  if (deB64(pessoa.chave_publica).length !== 32 || deB64(pessoa.chave_assinatura).length !== 32) throw new Error("Chave com tamanho inválido.");
  const par = await parAssinatura(privadaX25519);
  try {
    const msg = mensagemCertificado({ usuario_id: pessoa.id, codigo: pessoa.codigo, crp: pessoa.crp, publica: pessoa.chave_publica,
      assinatura_pub: pessoa.chave_assinatura, desde });
    return b64(s.crypto_sign_detached(s.from_string(msg), par.privada));
  } finally {
    s.memzero(par.privada);
  }
}

// A Ed25519 é de um RT fixado no build?
export async function assinaturaDoRt(pubB64) {
  if (!pubB64) return false;
  try { return impressoesRtAssinatura().includes(await impressao(pubB64)); } catch (_) { return false; }
}

export async function cifraDoRt(pubB64) {
  if (!pubB64 || !fixada(IMPRESSOES.rt)) return false;
  try { return (await impressao(pubB64)) === IMPRESSOES.rt; } catch (_) { return false; }
}

export async function mestraFixada(pubB64) {
  if (!pubB64 || !fixada(IMPRESSOES.mestra)) return false;
  try { return (await impressao(pubB64)) === IMPRESSOES.mestra; } catch (_) { return false; }
}

// Confere um certificado: emissor é RT fixado no build, chaves com 32 bytes e assinatura válida. `usuarioId` (opcional):
// o certificado tem de ser dessa pessoa.
export async function verificarCertificado(cert, usuarioId = null) {
  if (!cert || typeof cert !== "object") return false;
  if (usuarioId !== null && Number(cert.usuario_id) !== Number(usuarioId)) return false;
  if (!(await assinaturaDoRt(cert.emissor_assinatura))) return false;
  const s = await obterSodium();
  try {
    if (deB64(cert.publica).length !== 32 || deB64(cert.assinatura_pub).length !== 32) return false;
    return s.crypto_sign_verify_detached(deB64(cert.assinatura), s.from_string(mensagemCertificado(cert)), deB64(cert.emissor_assinatura));
  } catch (_) {
    return false;
  }
}

// Pública X25519 de uma pessoa (como vem em /chaves: { id, publica, certificado }) SÓ se o certificado confere e é dela.
export async function publicaCertificada(pessoa) {
  if (!pessoa || !(await verificarCertificado(pessoa.certificado, pessoa.id)) || pessoa.certificado.publica !== pessoa.publica) {
    throw new Error("A chave desta pessoa ainda não foi conferida pelo responsável técnico. Nada foi selado. Ele precisa conferir a impressão "
      + "com a pessoa e certificar (Associados(as) > Certificar).");
  }
  return pessoa.certificado.publica;
}

// Monta os destinatários de um registro NOVO a partir de /api/cofre/pacientes/{id}/chaves, sem aceitar nada às cegas.
// usuario = { id, rt } (da sessão). Devolve { destinatarios: [{ id, publica }], mestra: { versao, publica } }.
export async function destinatariosConfiaveis(ch, usuario) {
  exigirRaiz();
  if (!cofre.privada || !cofre.publica) throw new Error("Sua chave não está aberta nesta aba.");
  const minha = b64(cofre.publica);
  if (!ch || !ch.mestra) throw new Error("O cofre ainda não tem a chave de guarda da clínica: o responsável técnico precisa fazer a cerimônia antes da 1ª nota.");
  if (ch.eu && (Number(ch.eu.id) !== Number(usuario.id) || ch.eu.publica !== minha)) {
    throw new Error("Sua chave pública no servidor não confere com a deste aparelho. Nada foi salvo. Avise o responsável técnico.");
  }
  if (!(await mestraFixada(ch.mestra.publica))) throw new Error("A chave-mestra servida não confere com a aprovada no pacote do site. Nada foi salvo. Avise o responsável técnico.");
  if (!ch.rt || !(await cifraDoRt(ch.rt.publica))) throw new Error("A chave do RT servida não confere com a aprovada no pacote do site. Nada foi salvo. Avise o responsável técnico.");
  const destinatarios = [{ id: Number(usuario.id), publica: minha }];
  if (Number(ch.rt.id) === Number(usuario.id)) {
    if (ch.rt.publica !== minha) throw new Error("A sua chave não é a chave do RT gravada no pacote do site. Nada foi salvo.");
  } else {
    destinatarios.push({ id: Number(ch.rt.id), publica: ch.rt.publica });
  }
  // Responsável só entra quando o RT escreve no prontuário de outra pessoa (anotação do RT), e só com certificado.
  const r = ch.responsavel;
  if (usuario.rt && r && Number(r.id) !== Number(usuario.id) && Number(r.id) !== Number(ch.rt.id)) {
    destinatarios.push({ id: Number(r.id), publica: await publicaCertificada(r) });
  }
  return { destinatarios, mestra: { versao: ch.mestra.versao, publica: ch.mestra.publica } };
}

// Chaves Ed25519 aceitas por autor(a) para conferir os registros de um prontuário (resposta de /prontuario):
// certificados conferidos contra o RT fixado, a Ed25519 de RT fixada (para ids de RT) e a minha, derivada da minha privada.
export async function chavesDeAutoria(resp, euId = null) {
  const mapa = new Map();
  const add = (id, k) => { const n = Number(id); if (!mapa.has(n)) mapa.set(n, new Set()); mapa.get(n).add(k); };
  for (const [aid, lista] of Object.entries((resp && resp.autores) || {})) {
    for (const c of lista || []) if (await verificarCertificado(c, aid)) add(aid, c.assinatura_pub);
  }
  for (const r of (resp && resp.rts) || []) if (await assinaturaDoRt(r.assinatura)) add(r.id, r.assinatura);
  if (euId !== null && cofre.assinaturaPublica) add(euId, b64(cofre.assinaturaPublica));
  return mapa;
}
