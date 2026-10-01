// Módulo de cripto do navegador (libsodium.js, sem cripto caseira).
// Espelho exato de backend/app/kdf_ref.py; vetores em docs/vetores-cripto.json (teste: frontend/tests/vetores.test.mjs).
//
// frase-senha -> normalizar -> Argon2id (sal 16 bytes, ops, mem) -> mestra (32 bytes)
//   login    = crypto_kdf_derive_from_key(32, 1, "VLlogin_", mestra)  -> vai ao servidor (que guarda só um scrypt)
//   embrulho = crypto_kdf_derive_from_key(32, 2, "VLwrap__", mestra)  -> NUNCA sai deste aparelho
// A chave privada X25519 é embrulhada com XChaCha20-Poly1305-IETF e só vive decifrada na memória desta aba
// (objeto `cofre`). Nada disso vai para localStorage, sessionStorage ou IndexedDB.
//
// Correção do achado 1 da auditoria (30/09): PISO FIXO do Argon2id embutido aqui (ops >= 3, mem >= 64 MiB). Este
// arquivo faz parte do build verificado (SRI + manifesto): o servidor NÃO consegue baixar o custo. Parâmetros abaixo
// do piso são recusados ANTES de derivar (a chave de login nem chega a ser calculada). O bloco embrulhado v2 leva os
// parâmetros e o sal e a AD amarra esses valores: {v:2, alg, n, c, kdf:{alg:"argon2id13", ops, mem, sal}}.
// Par de assinatura Ed25519 (autoria dos registros clínicos): semente = kdf(32, 3, "VLassina", privada X25519).
//
// PONTO DE EXTENSÃO (Construtor 2): use `cofre.privada` / `cofre.publica` para abrir e fechar envelopes
// (crypto_box_seal / crypto_box_seal_open) e `obterSodium()` para as demais primitivas.

import sodium from "../vendor/libsodium-wrappers-sumo.mjs";
import { KDF } from "./config.js";

const AD_PRIVADA = "vl:privada:v1";
// Piso NÃO NEGOCIÁVEL (mesmo valor de backend/app/seguranca.py). Teto de sanidade contra servidor que peça memória demais.
export const PISO_KDF = Object.freeze({ ops: 3, mem: 64 * 1024 * 1024 });
export const TETO_KDF = Object.freeze({ ops: 10, mem: 1024 * 1024 * 1024 });

export function kdfAceitavel(ops, mem) {
  return Number.isInteger(ops) && Number.isInteger(mem) && ops >= PISO_KDF.ops && mem >= PISO_KDF.mem &&
    ops <= TETO_KDF.ops && mem <= TETO_KDF.mem;
}

export function conferirKdf(ops, mem) {
  if (!kdfAceitavel(ops, mem)) {
    throw new Error("O servidor pediu parâmetros de proteção da frase-senha abaixo do mínimo seguro. Nada foi enviado. Avise o responsável técnico.");
  }
}

// Parâmetros para derivações NOVAS (inscrição, troca de frase, recuperação): o maior entre o piso, o do build
// (config.js, gerado pelo build.py) e o sugerido pelo servidor, limitado ao teto.
export function parametrosNovos(sugerido = null) {
  const ops = Math.min(TETO_KDF.ops, Math.max(PISO_KDF.ops, KDF.ops || 0, (sugerido && Number.isInteger(sugerido.ops)) ? sugerido.ops : 0));
  const mem = Math.min(TETO_KDF.mem, Math.max(PISO_KDF.mem, KDF.mem || 0, (sugerido && Number.isInteger(sugerido.mem)) ? sugerido.mem : 0));
  return { ops, mem };
}

function adV2(ops, mem, salB64) {
  return `vl:privada:v2|argon2id13|${ops}|${mem}|${salB64}`;
}
const ALFABETO_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

let pronto = null;
let carregado = false;

export async function obterSodium() {
  if (!pronto) pronto = sodium.ready;
  await pronto;
  carregado = true;
  return sodium;
}

// publica: CALCULADA da privada (rodada 2, A2), nunca a que o servidor mandou. assinaturaPublica: Ed25519 derivada,
// guardada ao abrir para não recriar a privada Ed25519 a cada leitura (B8).
export const cofre = { publica: null, privada: null, assinaturaPublica: null, assinaturaConfere: true, assinaturaRegistrada: true };

// Construtor 2: módulos do cofre registram aqui o que também precisa sumir junto com a chave (rascunhos, leituras).
export const aoLimparCofre = [];
// Rodada 3: módulos que precisam saber quando a chave abriu de novo (ex.: recuperar o rascunho selado).
export const aoAbrirCofre = [];

// Rodada 3 (persona associada B2): { preservarRascunho: true } na saída por inatividade ou aba oculta. A chave privada e
// a chave dos rascunhos são apagadas do mesmo jeito; o rascunho fica só como texto cifrado, com a chave dele SELADA para a
// pública da pessoa (só a frase-senha abre de novo). Sair, fechar a aba e o pagehide continuam apagando tudo.
export function limparCofre(opcoes = {}) {
  const publica = cofre.publica;
  if (cofre.privada) {
    try { sodium.memzero(cofre.privada); } catch (_) { /* libsodium ainda não carregou */ }
  }
  cofre.privada = null;
  cofre.publica = null;
  cofre.assinaturaPublica = null;
  for (const f of aoLimparCofre) {
    try { f({ ...opcoes, publica }); } catch (_) { /* segue limpando */ }
  }
}

// Acesso síncrono ao libsodium já carregado (null antes de obterSodium terminar).
export function sodiumPronto() {
  return carregado ? sodium : null;
}

export function b64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function deB64(texto) {
  const s = atob(texto);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function normalizarFrase(frase) {
  return String(frase).normalize("NFKC").trim().split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

export function contarPalavras(frase) {
  const n = normalizarFrase(frase);
  return n ? n.split(" ").length : 0;
}

export async function derivarMestra(frase, sal, ops, mem) {
  conferirKdf(ops, mem); // achado 1: nunca deriva abaixo do piso, venha o valor de onde vier
  const s = await obterSodium();
  return s.crypto_pwhash(32, normalizarFrase(frase), sal, ops, mem, s.crypto_pwhash_ALG_ARGON2ID13);
}

export async function derivarChaves(frase, salB64, ops, mem) {
  const s = await obterSodium();
  const mestra = await derivarMestra(frase, deB64(salB64), ops, mem);
  const login = s.crypto_kdf_derive_from_key(32, 1, "VLlogin_", mestra);
  const embrulho = s.crypto_kdf_derive_from_key(32, 2, "VLwrap__", mestra);
  s.memzero(mestra);
  return { login, embrulho };
}

// Sem `kdf`: bloco v1 (recuperação, chave vinda do código de 192 bits). Com { ops, mem, sal }: bloco v2.
export async function embrulhar(segredo, chave, nonce = null, kdf = null) {
  const s = await obterSodium();
  const n = nonce || s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  if (kdf) {
    conferirKdf(kdf.ops, kdf.mem);
    const k = { alg: "argon2id13", ops: kdf.ops, mem: kdf.mem, sal: kdf.sal };
    const c = s.crypto_aead_xchacha20poly1305_ietf_encrypt(segredo, adV2(k.ops, k.mem, k.sal), null, n, chave);
    return { v: 2, alg: "xchacha20poly1305-ietf", n: b64(n), c: b64(c), kdf: k };
  }
  const c = s.crypto_aead_xchacha20poly1305_ietf_encrypt(segredo, AD_PRIVADA, null, n, chave);
  return { v: 1, alg: "xchacha20poly1305-ietf", n: b64(n), c: b64(c) };
}

// `usado` (opcional) = { ops, mem, sal } com que a chave foi derivada: o bloco v2 tem de ter sido feito com os MESMOS
// valores e acima do piso (senão alguém trocou os parâmetros no caminho).
export async function desembrulhar(bloco, chave, usado = null) {
  const s = await obterSodium();
  if (!bloco || bloco.alg !== "xchacha20poly1305-ietf") throw new Error("formato de bloco desconhecido");
  if (bloco.v === 2) {
    const k = bloco.kdf || {};
    if (k.alg !== "argon2id13") throw new Error("formato de bloco desconhecido");
    conferirKdf(k.ops, k.mem);
    if (usado && (usado.ops !== k.ops || usado.mem !== k.mem || usado.sal !== k.sal)) {
      throw new Error("Os parâmetros da sua chave não conferem com os do servidor. Nada foi aberto. Avise o responsável técnico.");
    }
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, deB64(bloco.c), adV2(k.ops, k.mem, k.sal), deB64(bloco.n), chave);
  }
  if (bloco.v !== 1) throw new Error("formato de bloco desconhecido");
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, deB64(bloco.c), AD_PRIVADA, deB64(bloco.n), chave);
}

// ---------------------------------------------------------------- autoria (Ed25519)

export async function parAssinatura(privadaX25519) {
  const s = await obterSodium();
  const semente = s.crypto_kdf_derive_from_key(32, 3, "VLassina", privadaX25519);
  const par = s.crypto_sign_seed_keypair(semente);
  s.memzero(semente);
  return { publica: par.publicKey, privada: par.privateKey };
}

// Prova de posse na inscrição: assina "vl:assinatura:v1|<pública X25519 em base64>".
export async function provaAssinatura(privadaX25519, publicaX25519B64) {
  const s = await obterSodium();
  const par = await parAssinatura(privadaX25519);
  try {
    const prova = s.crypto_sign_detached(s.from_string(`vl:assinatura:v1|${publicaX25519B64}`), par.privada);
    return { chave_assinatura: b64(par.publica), prova_assinatura: b64(prova) };
  } finally {
    s.memzero(par.privada); // B8
  }
}

function base32(u8) {
  let bits = 0, valor = 0, saida = "";
  for (const byte of u8) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_B32[(valor << (5 - bits)) & 31];
  return saida;
}

export async function novoCodigoRecuperacao() {
  const s = await obterSodium();
  const bruto = base32(s.randombytes_buf(24));
  return bruto.match(/.{1,4}/g).join("-");
}

export function normalizarCodigo(codigo) {
  return String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function derivarRecuperacao(codigo) {
  const s = await obterSodium();
  const base = s.crypto_generichash(32, s.from_string(normalizarCodigo(codigo)));
  const embrulho = s.crypto_kdf_derive_from_key(32, 1, "VLrecwrp", base);
  const verificador = s.crypto_kdf_derive_from_key(32, 2, "VLrecver", base);
  s.memzero(base);
  return { embrulho, verificador };
}

// Tudo o que /api/convites/concluir precisa, gerado neste aparelho.
export async function pacoteInscricao(frase, codigoRecuperacao, ops, mem) {
  const s = await obterSodium();
  conferirKdf(ops, mem);
  const sal = s.randombytes_buf(16);
  const { login, embrulho } = await derivarChaves(frase, b64(sal), ops, mem);
  const par = s.crypto_box_keypair();
  const rec = await derivarRecuperacao(codigoRecuperacao);
  const corpo = {
    sal: b64(sal),
    chave_login: b64(login),
    chave_publica: b64(par.publicKey),
    privada_embrulhada: await embrulhar(par.privateKey, embrulho, null, { ops, mem, sal: b64(sal) }),
    recuperacao_embrulhada: await embrulhar(par.privateKey, rec.embrulho),
    verificador_recuperacao: b64(rec.verificador),
    ...(await provaAssinatura(par.privateKey, b64(par.publicKey))),
  };
  s.memzero(embrulho); s.memzero(rec.embrulho); s.memzero(par.privateKey);
  return corpo;
}

// Troca de frase e recuperação: sal novo, parâmetros novos (>= piso) e bloco v2.
export async function pacoteNovaFrase(frase, privada, sugerido = null) {
  const s = await obterSodium();
  const { ops, mem } = parametrosNovos(sugerido);
  const sal = b64(s.randombytes_buf(16));
  const { login, embrulho } = await derivarChaves(frase, sal, ops, mem);
  const corpo = { sal, chave_login: b64(login), privada_embrulhada: await embrulhar(privada, embrulho, null, { ops, mem, sal }) };
  s.memzero(embrulho); s.memzero(login);
  return corpo;
}

// Depois do login: abre a chave privada e guarda só na memória desta aba. Confere que o bloco foi feito com os
// parâmetros usados agora (e acima do piso) e que a chave de assinatura do servidor é a derivada desta privada.
// Rodada 2 (A2): a pública é CALCULADA da privada (crypto_scalarmult_base). Se a que o servidor mandou for outra, o cofre
// NÃO abre: um servidor que troca a "minha" pública receberia a chave de cada nota nova.
export async function abrirCofre(chaves, embrulho) {
  const s = await obterSodium();
  const privada = await desembrulhar(chaves.privada_embrulhada, embrulho,
    chaves.privada_embrulhada && chaves.privada_embrulhada.v === 2 ? { ops: chaves.ops, mem: chaves.mem, sal: chaves.sal } : null);
  const publica = s.crypto_scalarmult_base(privada);
  if (!chaves.publica || b64(publica) !== chaves.publica) {
    s.memzero(privada);
    throw new Error("A chave pública que o servidor informou não é a da sua chave privada. Nada foi aberto. Avise o responsável técnico.");
  }
  const par = await parAssinatura(privada);
  cofre.assinaturaConfere = !chaves.assinatura || b64(par.publica) === chaves.assinatura;
  cofre.assinaturaRegistrada = !!chaves.assinatura;
  s.memzero(par.privada);
  cofre.privada = privada;
  cofre.publica = publica;
  cofre.assinaturaPublica = par.publica;
  for (const f of aoAbrirCofre) {
    try { f(); } catch (_) { /* segue */ }
  }
  return true;
}
