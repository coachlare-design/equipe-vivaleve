// Página pública do termo do(a) paciente (rodada 3, persona associada B3 e conformidade A1).
// O(a) paciente abre o link que recebeu (#c=CODIGO) ou digita o código, lê o texto da versão vigente e aceita.
// Sem login, sem cookie, sem dado pessoal: o servidor grava a versão, o hash do texto, a data e a hora, o IP em HMAC e o
// tipo de aparelho. O código sai da barra de endereço na hora.
import { h, trocar, campo, entrada, formulario, dataBR } from "./ui.js";
import { post } from "./api.js";

const raiz = document.getElementById("app");
const doLink = new URLSearchParams(location.hash.slice(1)).get("c") || "";
history.replaceState(null, "", location.pathname);

function moldura(...filhos) {
  trocar(raiz, h("main", { class: "porta" }, h("div", { class: "caixa" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Viva Leve Psi"), ...filhos)));
  window.scrollTo(0, 0);
}

function pedirCodigo(msg = "") {
  const cod = entrada({ name: "codigo", required: true, autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "20" });
  moldura(h("h1", { text: "Termo de atendimento" }),
    msg ? h("div", { class: "alerta r" }, msg) : null,
    h("div", { class: "card" }, formulario(async (fd) => { await abrir(String(fd.get("codigo") || "")); },
      campo("Código que você recebeu", cod, "Está na mensagem do(a) seu(sua) psicólogo(a), no formato ABCDE-FGHJK."),
      h("button", { type: "submit", class: "btn", text: "Abrir o termo" }))));
  cod.focus();
}

async function abrir(codigo) {
  let d;
  try { d = await post("/api/termo/abrir", { codigo }); } catch (e) { pedirCodigo(e.message); return; }
  const t = d.termo;
  const prof = d.profissional;
  const c = d.clinica || {};
  const aceite = h("input", { type: "checkbox", name: "concordo", required: true });
  aceite.dataset.rotulo = "Li e concordo com o termo";
  moldura(h("h1", { text: "Termo de atendimento psicológico" }),
    t.provisorio ? h("div", { class: "alerta" }, h("b", { text: "Versão provisória" }),
      "Este texto ainda passa por revisão jurídica. Se ele mudar, você recebe a versão nova para ler e aceitar de novo.") : null,
    h("div", { class: "card pilha" },
      prof ? h("p", { text: `Psicólogo(a): ${prof.nome}, CRP ${prof.crp}` }) : null,
      h("p", { class: "pequeno", text: `${c.razao_social || ""}${c.cnpj ? ` · CNPJ ${c.cnpj}` : ""}${c.rt_nome ? ` · Responsável técnico: ${c.rt_nome}, CRP ${c.rt_crp}` : ""}` }),
      h("div", { class: "texto-termo", tabindex: "0", text: t.texto }),
      formulario({ travarAoConcluir: true }, async () => {
        await post("/api/termo/aceitar", { codigo, li_e_concordo: aceite.checked, texto_sha256: t.texto_sha256 });
        moldura(h("h1", { text: "Termo aceito" }), h("div", { class: "alerta g" }, h("b", { text: "Obrigado(a)." }),
          `O seu aceite ${t.provisorio ? "do texto provisório" : `da versão ${String(t.versao).replace(/^v/, "")}`}, publicado em ${dataBR(t.em)}, ficou registrado com a data e a hora. Pode fechar esta página.`));
      },
      h("label", { class: "marcar" }, aceite, "Li o termo e concordo com ele."),
      h("button", { type: "submit", class: "btn", text: "Aceitar o termo" }))),
    h("p", { class: "pequeno", text: `Este link vale até ${dataBR(d.expira_em)} e serve uma vez. A plataforma não guarda seu nome nem seus contatos.` }));
}

if (doLink) abrir(doLink); else pedirCodigo();
