// Endereço da API. O build (frontend/build.py) troca o valor abaixo por API_ORIGIN.
export const API = "https://api.equipe.vivaleve.conhecate.com";
// Rodada 2 (A1/A2): RAIZ DE CONFIANÇA fora do servidor. Impressões aprovadas, fixadas no build:
//   mestra        chave-mestra vigente (X25519) - o navegador só sela para ela
//   rt            chave de cifra do RT (X25519) - o navegador só sela para ela
//   rt_assinatura chave de assinatura do RT (Ed25519); lista separada por vírgula (a primeira é a vigente, as demais de
//                 RT anteriores, para conferir certificados e notas antigas). Só certificado assinado por ela vale.
// Build de produção RECUSA sair com qualquer uma vazia (exceto --bootstrap, a 1ª subida, em que o cofre fica fechado).
// Sem build (testes no Node), os testes preenchem estas propriedades.
export const IMPRESSOES = { mestra: "", rt: "", rt_assinatura: "" };
export const BOOTSTRAP = "1" === "1";
// Achado 1: parâmetros do Argon2id para derivações NOVAS, fixados no build (build.py --kdf-ops/--kdf-mem, nunca abaixo do
// piso ops 3 / 64 MiB, que também está fixo em cripto.js). Sem build (testes no Node), vale o piso.
export const KDF = { ops: Number("3") || 3, mem: Number("67108864") || 64 * 1024 * 1024 };
// Rodada 2 (M4/B4): a frase-senha é GERADA pela plataforma (lista de 2048 palavras); número de palavras fixado no build,
// nunca menor que 6 (associado(a)) e 7 (admin/RT). O servidor não consegue baixar esse número.
export const FRASE = {
  palavras: Math.max(6, Number("6") || 6),
  palavras_admin: Math.max(7, Number("7") || 7),
};
