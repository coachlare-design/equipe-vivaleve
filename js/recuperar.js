// Recuperação com o código de alta entropia: abre a chave privada NESTE aparelho e cria frase-senha nova.
import { h, trocar, aviso, campo, entrada, formulario, botao, copiar, blocos } from "./ui.js";
import { post } from "./api.js";
import * as cripto from "./cripto.js";
import { campoFraseGerada } from "./frase.js";

const raiz = document.getElementById("app");

function moldura(...filhos) {
  trocar(raiz, h("main", { class: "porta" }, h("div", { class: "caixa" },
    h("div", { class: "marca" }, h("span", { class: "ponto" }), "Conheça-TE Psi · Equipe"), ...filhos)));
}

function inicio() {
  const status = h("p", { class: "pequeno", role: "status" });
  const form = formulario(async (fd) => {
    status.className = "carregando"; status.textContent = "Conferindo o código neste aparelho...";
    try {
      const rec = await cripto.derivarRecuperacao(String(fd.get("codigo") || ""));
      const r = await post("/api/auth/recuperar/iniciar", { email: String(fd.get("email") || "").trim(),
        verificador: cripto.b64(rec.verificador), totp: String(fd.get("totp") || "").replace(/\D/g, "") });
      const privada = await cripto.desembrulhar(r.recuperacao_embrulhada, rec.embrulho);
      await novaFrase(r, privada);
    } finally { status.className = "pequeno"; status.textContent = ""; }
  },
  campo("E-mail", entrada({ type: "email", name: "email", required: true, autocomplete: "username" })),
  campo("Código de recuperação", entrada({ name: "codigo", required: true, autocomplete: "off", spellcheck: "false" }), "O que você guardou no cadastro. Com ou sem hífens."),
  campo("Código de 6 números do app autenticador", entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", required: true, maxlength: "7" })),
  h("button", { type: "submit", class: "btn", text: "Continuar" }), status);
  moldura(h("h1", { text: "Recuperar acesso" }), h("div", { class: "card" }, form),
    h("p", { class: "pequeno", text: "Perdeu também o código de recuperação? Fale com o responsável técnico da clínica: é preciso criar uma chave nova." }),
    h("p", { class: "pequeno" }, h("a", { href: "index.html", text: "Voltar para a entrada" })));
}

async function novaFrase(r, privada) {
  const codigo = await cripto.novoCodigoRecuperacao();
  const textoCodigo = blocos(codigo, "blocos grade2");
  const confirma = h("input", { type: "checkbox", required: true });
  confirma.dataset.rotulo = "Guardei o novo código de recuperação";
  // Rodada 2 (M4/B4): frase nova GERADA aqui. Sem saber o papel com certeza (vem do servidor), gera o maior piso do build
  // se o servidor disser admin; nunca menos que 6 palavras.
  const gerada = await campoFraseGerada(Number(r.min_palavras) >= 7 ? "admin" : "associado", "Sua nova frase-senha (gerada pela plataforma)");
  const form = formulario({ travarAoConcluir: true }, async () => {
    const f = gerada.valor();
    const s = await cripto.obterSodium();
    const nova = await cripto.pacoteNovaFrase(f, privada, r.kdf); // parâmetros >= piso fixo (achado 1)
    const rec = await cripto.derivarRecuperacao(codigo);
    await post("/api/auth/recuperar/concluir", { token: r.token, ...nova,
      recuperacao_embrulhada: await cripto.embrulhar(privada, rec.embrulho), verificador_recuperacao: cripto.b64(rec.verificador) });
    s.memzero(privada); s.memzero(rec.embrulho);
    gerada.limpar();
    moldura(h("h1", { text: "Acesso recuperado" }), h("div", { class: "card" },
      h("p", { text: "Frase-senha nova criada. As sessões antigas foram encerradas e o responsável técnico foi avisado." }),
      h("a", { class: "btn", href: "index.html", text: "Entrar" })));
  },
  gerada.el,
  h("div", { class: "alerta" }, h("b", { text: "Novo código de recuperação" }), "O código antigo deixa de valer. Guarde este no gerenciador de senhas ou em papel."),
  textoCodigo,
  h("div", { class: "acoes-linha" }, botao("Copiar o código", () => copiar(codigo, "Código copiado.", textoCodigo), "btn mini ghost")),
  h("label", { class: "marcar" }, confirma, "Guardei o novo código de recuperação."),
  h("button", { type: "submit", class: "btn", text: "Salvar frase-senha nova" }));
  moldura(h("h1", { text: "Nova frase-senha" }), h("div", { class: "card" }, form));
}

try { inicio(); } catch (e) { aviso(e.message, "erro"); }
