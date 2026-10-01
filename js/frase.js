// Rodada 2 (M4 e B4): a frase-senha é GERADA aqui, no navegador, por sorteio uniforme numa lista de 2048 palavras
// (11 bits cada): 6 palavras para associado(a) (66 bits) e 7 para admin/RT (77 bits). A pessoa não escolhe a frase
// (frase escolhida tem bem menos entropia do que o número de palavras sugere) e o servidor não consegue baixar o número
// de palavras: o piso está no build (config.js, FRASE).
//
// Rodada 3 (persona associada): a frase aparece numerada e grande, com botão de copiar e a orientação de guardar num
// gerenciador de senhas. A confirmação é amigável: em vez de redigitar a frase inteira no celular, a pessoa digita 2
// palavras sorteadas (ex.: a 2ª e a 5ª), sem diferença de maiúscula, acento ou espaço. Isso prova que ela guardou a frase
// e não muda nada na força da frase (continuam 66/77 bits sorteados).
import { h, entrada, botao, copiar } from "./ui.js";
import { obterSodium, normalizarFrase } from "./cripto.js";
import { PALAVRAS } from "./palavras-ptbr.js";
import { FRASE } from "./config.js";

export function palavrasPara(papel) {
  return papel === "admin" ? Math.max(7, FRASE.palavras_admin) : Math.max(6, FRASE.palavras);
}

export async function gerarFrase(n) {
  const s = await obterSodium();
  const qtd = Math.max(6, Number(n) || 0);
  const out = [];
  for (let i = 0; i < qtd; i++) out.push(PALAVRAS[s.randombytes_uniform(PALAVRAS.length)]);
  return out.join(" ");
}

export function confere(gerada, digitada) {
  return normalizarFrase(gerada) === normalizarFrase(digitada);
}

const semAcento = (t) => normalizarFrase(String(t || "")).normalize("NFD").replace(/[̀-ͯ]/g, "");

// Confere a palavra da posição `pos` (0 = primeira). Tolera maiúsculas, acentos e espaços nas pontas.
export function conferePalavra(gerada, pos, digitada) {
  const p = normalizarFrase(gerada).split(" ")[pos];
  return Boolean(p) && semAcento(p) === semAcento(digitada).trim();
}

export function sortearPosicoes(n, rnd = Math.random) {
  const a = Math.floor(rnd() * n);
  let b = Math.floor(rnd() * (n - 1));
  if (b >= a) b += 1;
  return [Math.min(a, b), Math.max(a, b)];
}

const ORDINAL = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"];

// Bloco de formulário: mostra a frase gerada (numerada), copiar, sortear outra e a confirmação de 2 palavras.
// `valor()` devolve a frase só se as 2 palavras conferem (senão lança erro com a explicação).
export async function campoFraseGerada(papel, rotulo = "Sua frase-senha (criada pela plataforma)") {
  const n = palavrasPara(papel);
  let frase = await gerarFrase(n);
  let pos = sortearPosicoes(n);
  const lista = h("ol", { class: "frase-palavras", "aria-live": "polite" });
  const c1 = entrada({ type: "text", name: "confirma_palavra_1", required: true, autocomplete: "off", spellcheck: "false",
    autocorrect: "off", autocapitalize: "off" });
  const c2 = entrada({ type: "text", name: "confirma_palavra_2", required: true, autocomplete: "off", spellcheck: "false",
    autocorrect: "off", autocapitalize: "off" });
  const rot1 = h("span", { class: "rotulo" });
  const rot2 = h("span", { class: "rotulo" });
  const desenhar = () => {
    lista.replaceChildren(...frase.split(" ").map((p, i) => h("li", {}, h("span", { text: `${i + 1}.` }), p)));
    rot1.textContent = `Digite a ${ORDINAL[pos[0]]} palavra`;
    rot2.textContent = `Digite a ${ORDINAL[pos[1]]} palavra`;
    c1.dataset.rotulo = rot1.textContent;
    c2.dataset.rotulo = rot2.textContent;
    c1.value = ""; c2.value = "";
  };
  desenhar();
  const outra = botao("Sortear outra frase", async () => { frase = await gerarFrase(n); pos = sortearPosicoes(n); desenhar(); }, "btn mini ghost");
  const copia = botao("Copiar a frase", () => copiar(frase, "Frase copiada. Cole no seu gerenciador de senhas.", lista), "btn mini ghost");
  c1.id = `fr1-${Math.random().toString(36).slice(2, 8)}`;
  c2.id = `fr2-${Math.random().toString(36).slice(2, 8)}`;
  const el = h("div", { class: "mcard pilha" },
    h("b", { text: rotulo }),
    h("p", { class: "pequeno", text: `São ${n} palavras sorteadas neste aparelho. É com elas que você entra na plataforma e abre as suas notas.` }),
    lista,
    h("div", { class: "acoes-linha" }, copia, outra),
    h("div", { class: "alerta b" }, h("b", { text: "Onde guardar" }),
      "O melhor lugar é um gerenciador de senhas (o do Google, o Chaves do iCloud no iPhone, Bitwarden ou 1Password). "
      + "Se preferir, anote em papel e guarde longe do celular. A plataforma não aceita frase escolhida: frase pensada por pessoa é fácil de adivinhar."),
    h("p", { class: "pequeno", text: "Para conferir que você guardou, digite 2 palavras da frase (maiúsculas e acentos não importam)." }),
    h("div", { class: "grade g2" },
      h("label", { class: "campo", for: c1.id }, rot1, c1),
      h("label", { class: "campo", for: c2.id }, rot2, c2)));
  return {
    el,
    valor() {
      if (!conferePalavra(frase, pos[0], c1.value) || !conferePalavra(frase, pos[1], c2.value)) {
        throw new Error(`As palavras digitadas não são a ${ORDINAL[pos[0]]} e a ${ORDINAL[pos[1]]} da frase. Confira o que você guardou.`);
      }
      return frase;
    },
    limpar() { frase = ""; lista.replaceChildren(); c1.value = ""; c2.value = ""; },
  };
}
