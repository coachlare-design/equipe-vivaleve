// Inscrição por convite: dados (com aviso de privacidade), verificação em duas etapas, frase-senha e chave criada NESTE
// aparelho, código de recuperação.
// Rodada 3 (persona associada B1): no celular, o app autenticador abre por um botão (link otpauth://) e a chave pode ser
// copiada; o QR fica para quem vai usar outro aparelho. Linguagem simples no lugar de "2FA".
import { h, trocar, aviso, campo, entrada, formulario, dataBR, botao, copiar, blocos, blocoConferencia, EXPLICA_CONFERENCIA } from "./ui.js";
import { post } from "./api.js";
import * as cripto from "./cripto.js";
import { impressao } from "./cofre-cripto.js";
import { campoFraseGerada } from "./frase.js";

const raiz = document.getElementById("app");
// O token vem no fragmento (#t=...). Sai da barra de endereço na hora.
const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
history.replaceState(null, "", location.pathname);

function moldura(...filhos) {
  trocar(raiz, h("main", { class: "porta" }, h("div", { class: "caixa" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Viva Leve Psi · Equipe"), ...filhos)));
  window.scrollTo(0, 0);
}

function passo(n) {
  return h("span", { class: "pill", text: `passo ${n} de 3` });
}

const noCelular = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 600;

async function inicio() {
  if (!token) { moldura(h("h1", { text: "Convite não encontrado" }), h("p", { text: "Abra o link completo que a clínica enviou." })); return; }
  let conv;
  try { conv = await post("/api/convites/abrir", { token }); } catch (e) {
    moldura(h("h1", { text: "Convite indisponível" }), h("p", { text: e.message })); return;
  }
  const nome = entrada({ name: "nome", required: true, minlength: "3", maxlength: "120", value: conv.nome_sugerido || "", autocomplete: "name" });
  const priv = conv.privacidade || { versao: "", itens: [] };
  const aceite = h("input", { type: "checkbox", name: "privacidade", required: true });
  aceite.dataset.rotulo = "Li o aviso de privacidade";
  const form = formulario(async (fd) => {
    const crp = String(fd.get("crp") || "").trim();
    if (!/^\d{2}\/\d{3,6}$/.test(crp)) throw new Error("CRP no formato 05/12345 (região, barra e número).");
    const dados = { token, nome: fd.get("nome"), crp, email: fd.get("email"), aceite_privacidade: aceite.checked,
      privacidade_versao: priv.versao };
    const r = await post("/api/convites/iniciar", dados);
    await passoDois(conv, dados, r);
  },
  campo("Nome completo", nome),
  campo("CRP", entrada({ name: "crp", required: true, placeholder: "05/12345", maxlength: "20", inputmode: "text" }), "Região, barra e número, como na carteira do Conselho."),
  campo("E-mail profissional", entrada({ type: "email", name: "email", required: true, value: conv.email_destino || "", autocomplete: "email", inputmode: "email" })),
  h("details", { class: "mcard" }, h("summary", { text: "Ler o aviso de privacidade (provisório)" }),
    h("ul", { class: "passo-a-passo pequeno" }, priv.itens.map((t) => h("li", { text: t })))),
  h("label", { class: "marcar" }, aceite, "Li o aviso de privacidade e concordo com o registro descrito nele."),
  h("button", { type: "submit", class: "btn", text: "Continuar" }));
  moldura(h("h1", { text: conv.nome_sugerido ? `Bem-vindo(a), ${conv.nome_sugerido.split(" ")[0]}` : "Bem-vindo(a) à equipe" }),
    h("p", { class: "pequeno", text: `Convite de ${conv.convidado_por} · vale até ${dataBR(conv.expira_em)}` }),
    h("div", { class: "card" }, h("div", { class: "linha" }, h("h3", { text: "Seus dados" }), passo(1)), form));
  nome.focus();
}

function blocoAutenticador(totp) {
  const img = h("img", { class: "qr", alt: "QR code para o app autenticador", src: String(totp.qr_data_uri).startsWith("data:image/svg+xml") ? totp.qr_data_uri : "" });
  const uri = String(totp.totp_uri || "");
  const abrir = uri.startsWith("otpauth://") ? h("a", { class: "btn", href: uri, text: "Abrir no app autenticador" }) : null;
  const textoChave = blocos(totp.totp_segredo);
  const copiarChave = botao("Copiar a chave", () => copiar(totp.totp_segredo, "Chave copiada. Cole no app autenticador.", textoChave), "btn ghost");
  const comoFunciona = h("div", { class: "alerta b" }, h("b", { text: "O que é a verificação em duas etapas" }),
    "Além da frase-senha, cada entrada pede um código de 6 números que muda a cada 30 segundos. Ele aparece num app "
    + "autenticador no seu celular. Assim, mesmo que alguém descubra a sua frase, não entra sem o seu celular.");
  const semApp = h("p", { class: "pequeno", text: "Não tem app? Instale o Google Authenticator (Android ou iPhone), o Microsoft Authenticator ou o Aegis e volte aqui." });
  const chave = h("div", {}, h("p", { class: "pequeno", text: "Chave para digitar ou colar no app (tipo: com base no tempo):" }), textoChave);
  if (noCelular()) {
    return h("div", { class: "mcard pilha" }, h("b", { text: "1. Ligue o app autenticador" }), comoFunciona, semApp,
      h("ol", { class: "passo-a-passo pequeno" },
        h("li", { text: "Toque em \"Abrir no app autenticador\". O app abre e já cadastra a Viva Leve Psi." }),
        h("li", { text: "Se o app não abrir, toque em \"Copiar a chave\", abra o app, escolha \"inserir chave\" e cole." }),
        h("li", { text: "Volte para esta tela." })),
      h("div", { class: "acoes-linha" }, abrir, copiarChave), chave,
      h("details", {}, h("summary", { text: "Vou usar outro aparelho (mostrar QR code)" }), img));
  }
  return h("div", { class: "mcard pilha" }, h("b", { text: "1. Ligue o app autenticador" }), comoFunciona, semApp,
    h("div", { class: "linha topo-al quebra" }, img, h("p", { class: "pequeno", text: "Abra o app no celular, toque em adicionar e aponte a câmera para o QR code." })),
    chave, h("div", { class: "acoes-linha" }, copiarChave));
}

async function passoDois(conv, dados, totp) {
  // Rodada 2 (M4/B4): a frase é GERADA aqui (6 palavras; admin/RT 7, piso fixo no build).
  const gerada = await campoFraseGerada(conv.papel === "admin" ? "admin" : "associado", "2. Sua frase-senha (criada pela plataforma)");
  const form = formulario(async (fd) => {
    const f = gerada.valor();
    if (cripto.contarPalavras(f) < Number(conv.min_palavras || 0)) throw new Error("O servidor pede mais palavras do que este pacote gera. Avise a clínica.");
    passoTres(conv, dados, f, { afiliado: fd.get("afiliado"), calendly: fd.get("calendly") });
    gerada.limpar();
  },
  blocoAutenticador(totp),
  gerada.el,
  conv.papel === "associado" ? [
    // Rodada 4 (A1/P12): o que é cada campo, e que pode ficar em branco.
    campo("Seu código de afiliado(a) na Kiwify (se já tiver)", entrada({ name: "afiliado", maxlength: "80" }),
      "A Kiwify é onde o(a) paciente paga. O código de afiliado(a) liga a compra a você. Se não sabe o que é, deixe em branco: a clínica confere na aprovação."),
    campo("Seu link do Calendly (se já tiver)", entrada({ name: "calendly", maxlength: "300", placeholder: "https://calendly.com/...", inputmode: "url" }),
      "O Calendly é a agenda on-line onde o(a) paciente marca a entrevista. Se ainda não tem, deixe em branco."),
  ] : null,
  h("button", { type: "submit", class: "btn", text: "Continuar" }));
  moldura(h("h1", { text: "Segurança da conta" }), h("div", { class: "card" }, h("div", { class: "linha" }, h("h3", { text: "App autenticador e frase-senha" }), passo(2)), form));
}

async function passoTres(conv, dados, frase, extra) {
  const codigo = await cripto.novoCodigoRecuperacao();
  const textoCodigo = blocos(codigo, "blocos grade2");
  const status = h("p", { class: "pequeno", role: "status", "aria-live": "polite" });
  const confirma = h("input", { type: "checkbox", name: "anotei", required: true });
  confirma.dataset.rotulo = "Guardei o código de recuperação";
  const form = formulario({ travarAoConcluir: true }, async (fd) => {
    const cod = String(fd.get("totp") || "").replace(/\D/g, "");
    if (cod.length !== 6) throw new Error("Digite o código de 6 números que aparece no app autenticador.");
    status.className = "carregando";
    status.textContent = "Criando sua chave neste aparelho...";
    try {
      const k = cripto.parametrosNovos(conv.kdf); // nunca abaixo do piso fixo do build (achado 1)
      const pac = await cripto.pacoteInscricao(frase, codigo, k.ops, k.mem);
      const r = await post("/api/convites/concluir", { token, totp: cod, ...pac,
        kiwify_afiliado_id: extra.afiliado || null, calendly_url: extra.calendly || null });
      // Rodada 4 (NB1): códigos de conferência calculados NESTE aparelho (da chave que acabou de nascer aqui), para ler ao
      // responsável técnico por telefone antes da aprovação.
      fim(r, { cifra: await impressao(pac.chave_publica), assinatura: await impressao(pac.chave_assinatura) });
    } finally { status.className = "pequeno"; if (status.textContent.startsWith("Criando")) status.textContent = ""; }
  },
  h("div", { class: "alerta" }, h("b", { text: "Código de recuperação" }),
    "É o único jeito de voltar a entrar se você esquecer a frase-senha. Ele aparece só agora. Guarde no gerenciador de senhas "
    + "ou anote em papel, longe do celular."),
  textoCodigo,
  h("div", { class: "acoes-linha" }, botao("Copiar o código", () => copiar(codigo, "Código copiado. Cole no seu gerenciador de senhas.", textoCodigo), "btn mini ghost")),
  h("label", { class: "marcar" }, confirma, "Guardei o código de recuperação em lugar seguro."),
  campo("Código de 6 números do app autenticador", entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", required: true, maxlength: "7" })),
  h("button", { type: "submit", class: "btn", text: "Concluir cadastro" }), status);
  moldura(h("h1", { text: "Quase lá" }), h("div", { class: "card" }, h("div", { class: "linha" }, h("h3", { text: "Recuperação" }), passo(3)), form),
    h("p", { class: "pequeno", text: "Sua frase-senha nunca sai do seu aparelho. A clínica recebe só a parte que serve para conferir a entrada." }));
}

function fim(r, imps) {
  if (r.status === "ativo") {
    moldura(h("h1", { text: "Conta criada" }), h("div", { class: "card" }, h("p", { text: "Pronto. Você já pode entrar." }),
      h("a", { class: "btn", href: "index.html", text: "Ir para a entrada" })));
    return;
  }
  moldura(h("h1", { text: "Cadastro enviado" }),
    h("div", { class: "card pilha" },
      h("p", { text: "O responsável técnico da clínica vai ligar para você e pedir estes dois códigos de conferência. Leia para o responsável técnico por telefone, grupo por grupo: ele confere com o que aparece na tela dele e libera o seu acesso, em geral no mesmo dia útil." }),
      blocoConferencia("Código de conferência 1", imps.cifra),
      blocoConferencia("Código de conferência 2", imps.assinatura),
      h("details", {}, h("summary", { text: "Para que servem?" }), h("p", { class: "pequeno", text: EXPLICA_CONFERENCIA })),
      h("p", { class: "pequeno", text: "Não são senha: pode ler em voz alta, mas não mande por mensagem. Se fechar esta tela, entre com o seu e-mail, a frase-senha e o código do app: enquanto aguarda, a plataforma mostra só estes códigos." })),
    h("p", { class: "pequeno", text: "Você recebe um e-mail quando for liberado(a)." }),
    h("a", { class: "btn ghost", href: "index.html", text: "Ir para a entrada" }));
}

inicio().catch((e) => aviso(e.message, "erro"));
