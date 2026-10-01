// Cripto do COFRE CLÍNICO (Fase 2), só com construções padrão do libsodium.js. Sem DOM: roda também no Node (testes).
// Referência em Python: backend/app/cofre_ref.py; vetores cruzados em docs/vetores-cofre.json.
//
//   registro   -> chave própria (32 bytes aleatórios)
//   conteúdo   -> XChaCha20-Poly1305-IETF, nonce de 24 bytes, AD "vl:reg:v1|uid|tipo|paciente_id|autor_id"
//   envelopes  -> crypto_box_seal(chave, publica X25519) para autor(a), responsável, RT e chave-mestra offline
//   reembrulho -> crypto_box_seal_open com a chave de quem já tem acesso e crypto_box_seal para a pessoa nova
//   mestra     -> par X25519 gerado no navegador; privada vira texto "VLM1-..." (com conferência) e QR, nunca vai ao servidor
//   age        -> identidade X25519 padrão do age (AGE-SECRET-KEY-1... / age1...) para abrir os backups
//   autoria    -> crypto_sign (Ed25519) do(a) autor(a) sobre "vl:assin:v2|uid|tipo|paciente|autor|retifica|refere|sessao|
//                 data_ref|em_cliente|BLAKE2b-256(nonce||cifra)" (rodada 2, B2: as datas entram na assinatura); o par nasce
//                 da privada X25519 (cripto.parAssinatura). Quem lê confere SÓ contra chave certificada pelo RT (rodada 2,
//                 A1; certificados.js) e não mostra registro com assinatura inválida. Referência: backend/app/assinatura.py.
import { obterSodium, b64, deB64, parAssinatura } from "./cripto.js";

export const TIPOS = ["identificacao", "demanda", "evolucao", "procedimento", "encaminhamento", "encerramento", "termo",
  "anotacao_rt", "retificacao", "documento", "instrumento"]; // rodada 3: documentos emitidos e instrumentos (Res. CFP 01/2009 V e VI)
export const PREFIXO_MESTRA = "VLM1";
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function ad(uid, tipo, pacienteId, autorId) {
  return `vl:reg:v1|${uid}|${tipo}|${pacienteId}|${autorId}`;
}

// JSON igual ao do Python (sort_keys, sem espaços, UTF-8 sem escapar acentos): o mesmo texto gera o mesmo bloco nos vetores.
export function jsonCanonico(v) {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonCanonico(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function base32(u8) {
  let bits = 0, valor = 0, saida = "";
  for (const byte of u8) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto) {
  let bits = 0, valor = 0;
  const saida = [];
  for (const ch of texto.toUpperCase()) {
    const i = ALFABETO.indexOf(ch);
    if (i < 0) throw new Error("caractere fora do alfabeto");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) { saida.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(saida);
}

const grupos = (t, n = 4) => t.match(new RegExp(`.{1,${n}}`, "g")).join("-");

export async function impressao(publica) {
  const s = await obterSodium();
  const pub = typeof publica === "string" ? deB64(publica) : publica;
  return grupos(base32(s.crypto_generichash(32, pub)).slice(0, 16));
}

// ---------------------------------------------------------------- registros

export async function cifrarRegistro({ tipo, dados, pacienteId, autorId, destinatarios, mestra, uid = null, chave = null, nonce = null }) {
  if (!TIPOS.includes(tipo)) throw new Error("tipo de registro inválido");
  if (!mestra || !mestra.publica) throw new Error("sem chave-mestra: o RT precisa fazer a cerimônia");
  const s = await obterSodium();
  const id = uid || s.to_hex(s.randombytes_buf(16));
  const k = chave || s.crypto_aead_xchacha20poly1305_ietf_keygen();
  const n = nonce || s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const claro = s.from_string(jsonCanonico({ v: 1, tipo, dados }));
  const cifra = s.crypto_aead_xchacha20poly1305_ietf_encrypt(claro, ad(id, tipo, pacienteId, autorId), null, n, k);
  s.memzero(claro);
  const vistos = new Set();
  const envelopes = [];
  for (const d of destinatarios) {
    if (vistos.has(d.id)) continue;
    vistos.add(d.id);
    envelopes.push({ destinatario: "usuario", usuario_id: d.id, envelope: b64(s.crypto_box_seal(k, deB64(d.publica))) });
  }
  envelopes.push({ destinatario: "mestra", mestra_versao: mestra.versao, envelope: b64(s.crypto_box_seal(k, deB64(mestra.publica))) });
  if (!chave) s.memzero(k);
  return { uid: id, tipo, nonce: b64(n), cifra: b64(cifra), envelopes };
}

// ---------------------------------------------------------------- autoria (assinatura Ed25519)

const txt = (v) => (v === null || v === undefined ? "" : String(v));

export async function mensagemAssinatura({ uid, tipo, pacienteId, autorId, retificaId = null, refereA = null, sessaoRaizId = null,
  dataRef = null, emCliente = null, nonce, cifra }) {
  const s = await obterSodium();
  const n = typeof nonce === "string" ? deB64(nonce) : nonce;
  const c = typeof cifra === "string" ? deB64(cifra) : cifra;
  const junto = new Uint8Array(n.length + c.length);
  junto.set(n, 0); junto.set(c, n.length);
  const resumo = s.to_hex(s.crypto_generichash(32, junto));
  return `vl:assin:v2|${[uid, tipo, pacienteId, autorId, retificaId, refereA, sessaoRaizId, dataRef, emCliente].map(txt).join("|")}|${resumo}`;
}

// corpo = o que vai no POST (uid, tipo, nonce, cifra e os extras retifica_id/refere_a/sessao_raiz_id/data_ref/em_cliente).
export async function assinarRegistro(corpo, pacienteId, autorId, privadaX25519) {
  if (!privadaX25519) throw new Error("Sua chave não está aberta nesta aba: não dá para assinar a nota.");
  const s = await obterSodium();
  const par = await parAssinatura(privadaX25519);
  try {
    const msg = await mensagemAssinatura({ uid: corpo.uid, tipo: corpo.tipo, pacienteId, autorId, retificaId: corpo.retifica_id,
      refereA: corpo.refere_a, sessaoRaizId: corpo.sessao_raiz_id, dataRef: corpo.data_ref, emCliente: corpo.em_cliente,
      nonce: corpo.nonce, cifra: corpo.cifra });
    return b64(s.crypto_sign_detached(s.from_string(msg), par.privada));
  } finally {
    s.memzero(par.privada); // B8
  }
}

// reg = registro como o servidor devolve (uid, tipo, autor_id, retifica_id, refere_a, sessao_raiz_id, data_ref, em_cliente,
// nonce, cifra, assinatura, assinatura_pub). `aceitas`: a(s) pública(s) Ed25519 (base64) que ESTE aparelho aceita para o(a)
// autor(a): string, lista ou Set (rodada 2, A1: vêm de certificado do RT conferido, da chave do RT fixada no build ou da
// própria chave derivada). Sem `aceitas`, confere só a matemática (testes de vetor); a tela passa sempre o conjunto.
export async function verificarAssinatura(reg, pacienteId, aceitas = null) {
  if (!reg || !reg.assinatura || !reg.assinatura_pub || !reg.cifra) return false;
  if (aceitas !== null && aceitas !== undefined) {
    const conj = typeof aceitas === "string" ? new Set([aceitas]) : new Set(aceitas);
    if (!conj.has(reg.assinatura_pub)) return false;
  }
  const s = await obterSodium();
  try {
    const msg = await mensagemAssinatura({ uid: reg.uid, tipo: reg.tipo, pacienteId, autorId: reg.autor_id, retificaId: reg.retifica_id,
      refereA: reg.refere_a, sessaoRaizId: reg.sessao_raiz_id, dataRef: reg.data_ref, emCliente: reg.em_cliente,
      nonce: reg.nonce, cifra: reg.cifra });
    return s.crypto_sign_verify_detached(deB64(reg.assinatura), s.from_string(msg), deB64(reg.assinatura_pub));
  } catch (_) {
    return false;
  }
}

export async function abrirChave(envelopeB64, publica, privada) {
  const s = await obterSodium();
  return s.crypto_box_seal_open(deB64(envelopeB64), publica, privada);
}

export async function decifrarRegistro(reg, pacienteId, publica, privada) {
  const s = await obterSodium();
  const k = await abrirChave(reg.envelope, publica, privada);
  try {
    const claro = s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, deB64(reg.cifra), ad(reg.uid, reg.tipo, pacienteId, reg.autor_id),
      deB64(reg.nonce), k);
    const obj = JSON.parse(s.to_string(claro));
    s.memzero(claro);
    if (obj.v !== 1 || obj.tipo !== reg.tipo) throw new Error("registro com formato inesperado");
    return obj.dados;
  } finally {
    s.memzero(k);
  }
}

// Abre a chave do registro com a chave de quem já tem acesso e sela para a pessoa nova. O texto não é decifrado.
export async function reembrulhar(envelopeB64, publica, privada, destinoPublicaB64) {
  const s = await obterSodium();
  const k = await abrirChave(envelopeB64, publica, privada);
  try {
    return b64(s.crypto_box_seal(k, deB64(destinoPublicaB64)));
  } finally {
    s.memzero(k);
  }
}

// ---------------------------------------------------------------- chave-mestra

export async function gerarMestra() {
  const s = await obterSodium();
  const par = s.crypto_box_keypair();
  return { publica: par.publicKey, privada: par.privateKey };
}

export async function publicaDe(privada) {
  const s = await obterSodium();
  return s.crypto_scalarmult_base(privada);
}

export async function textoMestra(privada) {
  const s = await obterSodium();
  const bruto = new Uint8Array(34);
  bruto.set(privada, 0);
  bruto.set(s.crypto_generichash(32, privada).slice(0, 2), 32);
  const t = `${PREFIXO_MESTRA}-${grupos(base32(bruto))}`;
  s.memzero(bruto);
  return t;
}

export async function lerMestra(texto) {
  const s = await obterSodium();
  const limpo = String(texto).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!limpo.startsWith(PREFIXO_MESTRA)) throw new Error("A chave-mestra começa com VLM1.");
  let bruto;
  try { bruto = deBase32(limpo.slice(PREFIXO_MESTRA.length)); } catch (_) { throw new Error("Há caractere que não existe na chave (use A a Z e 2 a 7)."); }
  if (bruto.length !== 34) throw new Error("Tamanho da chave não confere: falta ou sobra caractere.");
  const priv = bruto.slice(0, 32);
  const ok = s.memcmp(s.crypto_generichash(32, priv).slice(0, 2), bruto.slice(32));
  s.memzero(bruto);
  if (!ok) { s.memzero(priv); throw new Error("Conferência não bate: há erro de digitação na chave-mestra."); }
  return priv;
}

// Trechos para a confirmação da cerimônia: grupos (1 a n) da chave em texto.
export function grupoDoTexto(texto, n) {
  return String(texto).split("-")[n] || "";
}

// ---------------------------------------------------------------- age (bech32, BIP-173), mesmo formato do age/rage

const CARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(valores) {
  const ger = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of valores) {
    const topo = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((topo >>> i) & 1) chk ^= ger[i];
  }
  return chk >>> 0;
}

function converterBits(dados, de, para) {
  let acc = 0, bits = 0;
  const saida = [], maxv = (1 << para) - 1;
  for (const v of dados) {
    acc = (acc << de) | v;
    bits += de;
    while (bits >= para) { bits -= para; saida.push((acc >>> bits) & maxv); }
    acc &= (1 << bits) - 1;
  }
  if (bits) saida.push((acc << (para - bits)) & maxv);
  return saida;
}

export function bech32(hrp, dados) {
  const d5 = converterBits(dados, 8, 5);
  const exp = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const pm = polymod([...exp, ...d5, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (pm >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...d5, ...chk].map((x) => CARSET[x]).join("")}`;
}

export async function ageDe(escalar) {
  const s = await obterSodium();
  return { identidade: bech32("age-secret-key-", escalar).toUpperCase(), destinatario: bech32("age", s.crypto_scalarmult_base(escalar)) };
}

export async function gerarAge() {
  const s = await obterSodium();
  const escalar = s.randombytes_buf(32);
  const r = await ageDe(escalar);
  s.memzero(escalar);
  return r;
}

// Corpo de POST /api/cofre/mestra: SÓ a parte pública (a privada nunca entra aqui).
export function corpoCerimonia({ publica, ageDestinatario, totp, guardeiPapel, guardeiPendrive, motivo = "" }) {
  if (!(publica instanceof Uint8Array) || publica.length !== 32) throw new Error("chave pública inválida");
  return { publica: b64(publica), age_recipient: ageDestinatario, totp, guardei_papel: !!guardeiPapel, guardei_pendrive: !!guardeiPendrive, motivo };
}

// ---------------------------------------------------------------- rascunho cifrado só em memória

export async function cifrarRascunho(texto, chave, rotulo) {
  const s = await obterSodium();
  const n = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  return { n, c: s.crypto_aead_xchacha20poly1305_ietf_encrypt(s.from_string(texto), `vl:rascunho:v1|${rotulo}`, null, n, chave) };
}

export async function decifrarRascunho(bloco, chave, rotulo) {
  const s = await obterSodium();
  return s.to_string(s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, bloco.c, `vl:rascunho:v1|${rotulo}`, bloco.n, chave));
}
