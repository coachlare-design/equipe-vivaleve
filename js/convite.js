// Inscrição por convite: dados (com aviso de privacidade), frase-senha e chave criada NESTE aparelho, código de
// recuperação, verificação em duas etapas.
// Rodada 3 (persona associada B1): no celular, o app autenticador abre por um botão (link otpauth://) e a chave pode ser
// copiada; o QR fica para quem vai usar outro aparelho. Linguagem simples no lugar de "2FA".
// Simplificação de 02/10 (Carlos: "confuso e trabalhoso"): 4 telas com UMA tarefa cada, e a lista do que vem antes de
// começar; o app autenticador é a última tela, com o código digitado logo abaixo de onde ele é ligado (o código vale
// 30 s, por isso fica no fim); código de afiliado(a) e Calendly saíram daqui (a clínica preenche na aprovação, em
// Associados > Dados); UM código de conferência no fim, no lugar de dois. Nada mudou na força da frase, da chave nem da
// verificação em duas etapas.
import { h, trocar, aviso, campo, entrada, formulario, dataBR, botao, copiar, blocos, blocoConferencia, EXPLICA_CONFERENCIA } from "./ui.js";
import { post } from "./api.js";
import * as cripto from "./cripto.js";
import { impressaoConjunta } from "./cofre-cripto.js";
import { campoFraseGerada } from "./frase.js";

const raiz = document.getElementById("app");
// O token vem no fragmento (#t=...). Sai da barra de endereço na hora.
const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
history.replaceState(null, "", location.pathname);

const TOTAL = 4;

function moldura(...filhos) {
  trocar(raiz, h("main", { class: "porta" }, h("div", { class: "caixa" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Viva Leve Psi · Equipe"), ...filhos)));
  window.scrollTo(0, 0);
}

function passo(n) {
  return h("span", { class: "pill", text: `passo ${n} de ${TOTAL}` });
}

function cartao(n, titulo, ...filhos) {
  return h("div", { class: "card" }, h("div", { class: "linha" }, h("h3", { text: titulo }), passo(n)), ...filhos);
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
    await passoFrase(conv, r);
  },
  campo("Nome completo", nome),
  campo("CRP", entrada({ name: "crp", required: true, placeholder: "05/12345", maxlength: "20", inputmode: "text" }), "Região, barra e número, como na carteira do Conselho."),
  campo("E-mail profissional", entrada({ type: "email", name: "email", required: true, value: conv.email_destino || "", autocomplete: "email", inputmode: "email" })),
  h("details", { class: "mcard" }, h("summary", { text: "Ler o aviso de privacidade (provisório)" }),
    h("ul", { class: "passo-a-passo pequeno" }, priv.itens.map((t) => h("li", { text: t })))),
  h("label", { class: "marcar" }, aceite, "Li o aviso de privacidade e concordo com o registro descrito nele."),
  h("button", { type: "submit", class: "btn", text: "Continuar" }));
  const roteiro = h("div", { class: "mcard pilha" },
    h("b", { text: "Como é a inscrição (uns 5 minutos)" }),
    h("ol", { class: "passo-a-passo pequeno" },
      h("li", { text: "Seus dados." }),
      h("li", { text: "Guardar a sua frase-senha, criada pela plataforma." }),
      h("li", { text: "Guardar um código de recuperação." }),
      h("li", { text: "Ligar um app autenticador no celular." })),
    h("p", { class: "pequeno", text: "Tenha o celular à mão. Se usa gerenciador de senhas (o do Google, o Chaves do iCloud, Bitwarden), deixe aberto: é lá que a frase e o código ficam guardados." }));
  moldura(h("h1", { text: conv.nome_sugerido ? `Bem-vindo(a), ${conv.nome_sugerido.split(" ")[0]}` : "Bem-vindo(a) à equipe" }),
    h("p", { class: "pequeno", text: `Convite de ${conv.convidado_por} · vale até ${dataBR(conv.expira_em)}` }),
    roteiro, cartao(1, "Seus dados", form));
  nome.focus();
}

async function passoFrase(conv, totp) {
  // Rodada 2 (M4/B4): a frase é GERADA aqui (6 palavras; admin/RT 7, piso fixo no build).
  const gerada = await campoFraseGerada(conv.papel === "admin" ? "admin" : "associado", "Sua frase-senha (criada pela plataforma)");
  const form = formulario(async () => {
    const f = gerada.valor();
    if (cripto.contarPalavras(f) < Number(conv.min_palavras || 0)) throw new Error("O servidor pede mais palavras do que este pacote gera. Avise a clínica.");
    await passoRecuperacao(conv, totp, f);
    gerada.limpar();
  },
  gerada.el,
  h("button", { type: "submit", class: "btn", text: "Guardei a frase, continuar" }));
  moldura(h("h1", { text: "Sua frase-senha" }), cartao(2, "Frase-senha", form));
}

async function passoRecuperacao(conv, totp, frase) {
  const codigo = await cripto.novoCodigoRecuperacao();
  const textoCodigo = blocos(codigo, "blocos grade2");
  const confirma = h("input", { type: "checkbox", name: "anotei", required: true });
  confirma.dataset.rotulo = "Guardei o código de recuperação";
  const form = formulario(async () => { passoAutenticador(conv, totp, frase, codigo); },
    h("p", { text: "É o único jeito de voltar a entrar se você esquecer a frase-senha. Ele aparece só agora." }),
    textoCodigo,
    h("div", { class: "acoes-linha" }, botao("Copiar o código", () => copiar(codigo, "Código copiado. Cole no seu gerenciador de senhas.", textoCodigo), "btn mini ghost")),
    h("p", { class: "pequeno", text: "Guarde no gerenciador de senhas, junto da frase, ou anote em papel e guarde longe do celular." }),
    h("label", { class: "marcar" }, confirma, "Guardei o código de recuperação em lugar seguro."),
    h("button", { type: "submit", class: "btn", text: "Continuar" }));
  moldura(h("h1", { text: "Código de recuperação" }), cartao(3, "Recuperação", form));
}

function blocoAutenticador(totp) {
  const img = h("img", { class: "qr", alt: "QR code para o app autenticador", src: String(totp.qr_data_uri).startsWith("data:image/svg+xml") ? totp.qr_data_uri : "" });
  const uri = String(totp.totp_uri || "");
  const abrir = uri.startsWith("otpauth://") ? h("a", { class: "btn", href: uri, text: "Abrir no app autenticador" }) : null;
  const textoChave = blocos(totp.totp_segredo);
  const copiarChave = botao("Copiar a chave", () => copiar(totp.totp_segredo, "Chave copiada. Cole no app autenticador.", textoChave), "btn ghost");
  const semApp = h("p", { class: "pequeno", text: "Não tem app? Instale o Google Authenticator ou o Microsoft Authenticator (Android ou iPhone) e volte aqui." });
  const chave = h("details", {}, h("summary", { text: "Digitar a chave à mão" }),
    h("p", { class: "pequeno", text: "Chave para digitar ou colar no app (tipo: com base no tempo):" }), textoChave);
  if (noCelular()) {
    return h("div", { class: "pilha" }, h("b", { text: "1. Ligue o app" }), semApp,
      h("ol", { class: "passo-a-passo pequeno" },
        h("li", { text: "Toque em \"Abrir no app autenticador\". O app abre e já cadastra a Viva Leve Psi." }),
        h("li", { text: "Se o app não abrir, toque em \"Copiar a chave\", abra o app, escolha \"inserir chave\" e cole." }),
        h("li", { text: "Volte para esta tela." })),
      h("div", { class: "acoes-linha" }, abrir, copiarChave), chave,
      h("details", {}, h("summary", { text: "Vou usar outro aparelho (mostrar QR code)" }), img));
  }
  return h("div", { class: "pilha" }, h("b", { text: "1. Ligue o app" }), semApp,
    h("div", { class: "linha topo-al quebra" }, img, h("p", { class: "pequeno", text: "Abra o app no celular, toque em adicionar e aponte a câmera para o QR code." })),
    chave, h("div", { class: "acoes-linha" }, copiarChave));
}

function passoAutenticador(conv, totp, frase, codigo) {
  const status = h("p", { class: "pequeno", role: "status", "aria-live": "polite" });
  const campoCodigo = entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", required: true, maxlength: "7" });
  const form = formulario({ travarAoConcluir: true }, async (fd) => {
    const cod = String(fd.get("totp") || "").replace(/\D/g, "");
    if (cod.length !== 6) throw new Error("Digite o código de 6 números que aparece no app autenticador.");
    status.className = "carregando";
    status.textContent = "Criando sua chave neste aparelho...";
    try {
      const k = cripto.parametrosNovos(conv.kdf); // nunca abaixo do piso fixo do build (achado 1)
      const pac = await cripto.pacoteInscricao(frase, codigo, k.ops, k.mem);
      // Afiliado(a) e Calendly não são pedidos aqui: a clínica preenche na aprovação.
      const r = await post("/api/convites/concluir", { token, totp: cod, ...pac, kiwify_afiliado_id: null, calendly_url: null });
      // Rodada 4 (NB1): código de conferência calculado NESTE aparelho (das chaves que acabaram de nascer aqui), para ler
      // ao responsável técnico por telefone antes da aprovação.
      fim(r, { conjunta: await impressaoConjunta(pac.chave_publica, pac.chave_assinatura) });
    } finally { status.className = "pequeno"; if (status.textContent.startsWith("Criando")) status.textContent = ""; }
  },
  h("p", { class: "pequeno", text: "Além da frase-senha, cada entrada pede um código de 6 números que muda a cada 30 segundos e aparece no app do seu celular. Assim, mesmo que alguém descubra a sua frase, não entra sem o seu celular." }),
  blocoAutenticador(totp),
  campo("2. Digite o código de 6 números que apareceu no app", campoCodigo),
  h("button", { type: "submit", class: "btn", text: "Concluir cadastro" }), status);
  moldura(h("h1", { text: "Último passo" }), cartao(4, "App autenticador", form),
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
      h("p", { text: "O responsável técnico da clínica vai ligar para você e pedir este código de conferência. Leia para o responsável técnico por telefone, grupo por grupo: ele confere com o que aparece na tela dele e libera o seu acesso, em geral no mesmo dia útil." }),
      blocoConferencia("Código de conferência", imps.conjunta),
      h("details", {}, h("summary", { text: "Para que serve?" }), h("p", { class: "pequeno", text: EXPLICA_CONFERENCIA })),
      h("p", { class: "pequeno", text: "Não é senha: pode ler em voz alta, mas não mande por mensagem. Se fechar esta tela, entre com o seu e-mail, a frase-senha e o código do app: enquanto aguarda, a plataforma mostra só este código." })),
    h("p", { class: "pequeno", text: "Você recebe um e-mail quando for liberado(a)." }),
    h("a", { class: "btn ghost", href: "index.html", text: "Ir para a entrada" }));
}

inicio().catch((e) => aviso(e.message, "erro"));
