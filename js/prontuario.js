// FASE 2: COFRE CLÍNICO (Construtor 2). Registra nos pontos de extensão do núcleo:
//   "prontuario"      detalhe do(a) paciente (associado(a) e admin/RT)
//   "nota-clinica"    logo depois de salvar a sessão realizada: editor da nota, rápido no celular
//   "destravar-cofre" tela Conta: abrir ou fechar a chave nesta aba
//   "reembrulhar"     cartão de transferência do admin
//   "termo-anexo"     rodada 3: anexar a via assinada do termo (cifrada) no cartão único do termo
//   rotas #/nota/... (nota da sessão) e #/cofre/... (admin: cerimônia, mestra, descarte)
// e liga a vigia de inatividade (15 min, com aviso aos 13 min).
import { h, trocar, aviso, pill, botao, dataBR, diaMes, rotuloRT, STATUS_SESSAO, blocoConferencia, EXPLICA_CONFERENCIA } from "./ui.js";
import { get } from "./api.js";
import * as cripto from "./cripto.js";
import * as ext from "./extensoes.js";
import * as sessao from "./cofre-sessao.js";
import { montarProntuario, editorTexto, salvarRegistro, formAbrirChave, formTermoAnexo } from "./prontuario-ui.js";
import { impressao, impressaoConjunta } from "./cofre-cripto.js";
import * as telasCofre from "./telas-cofre.js";

ext.registrar("prontuario", (el, ctx) => { montarProntuario(el, ctx); });
ext.registrar("termo-anexo", (el, ctx) => formTermoAnexo(el, ctx));

function editorDaSessao(el, { paciente, sessao: s, usuario, aoTerminar }) {
  const desenhar = () => {
    if (!cripto.cofre.privada) {
      trocar(el, formAbrirChave(async () => desenhar(), sessao.rascunhoSelado()
        ? "Seu rascunho está guardado cifrado. Digite a frase-senha para abrir a sua chave e continuar a nota."
        : undefined));
      return;
    }
    trocar(el,
      h("div", { class: "linha" }, h("b", { text: "Nota clínica" }), pill("protegida: só você lê", "k")),
      h("p", { class: "pequeno", text: `${paciente.codigo} · sessão de ${dataBR(s.data)} às ${s.hora}` }),
      editorTexto({ rotulo: "Evolução da sessão", rascunho: `evolucao:${paciente.id}:${s.raiz}`,
        aoSalvar: async (texto) => {
          await salvarRegistro({ pid: paciente.id, usuario, tipo: "evolucao", dados: { texto }, extra: { sessao_raiz_id: s.raiz, data_ref: s.data } });
          aviso("Nota salva e protegida. Prazo de 48h cumprido.");
          aoTerminar();
        } }),
      botao("Escrever depois (até 48h)", async () => aoTerminar(), "btn ghost"));
  };
  desenhar();
}

ext.registrar("nota-clinica", (el, { sessao: s, paciente, usuario, ir }) => {
  editorDaSessao(el, { paciente, sessao: s, usuario, aoTerminar: () => ir("#/painel") });
});

// Rodada 3 (persona associada A3): depois de salvar o registro, a tela vira esta: resumo do que foi salvo (sem botão de
// salvar de novo) + a nota. Se a aba ficar oculta (ligação) ou a pessoa sair por inatividade, voltar aqui recupera o
// rascunho guardado cifrado.
ext.registrarRota("nota", async (el, [pid, raiz], ctx) => {
  const d = await get(`/api/eu/pacientes/${pid}`);
  const s = d.sessoes.find((x) => String(x.raiz) === String(raiz) && (x.status === "realizada" || x.status === "entrevista"));
  if (!s) throw new Error("Sessão não encontrada.");
  const caixa = h("div", { class: "card" });
  trocar(el, h("h1", { text: `${d.codigo} · nota da sessão` }),
    h("div", { class: "resumo-ok", role: "status" }, h("span", { text: `${STATUS_SESSAO[s.status]} · ${diaMes(s.data)} às ${s.hora}${s.duracao_min ? ` · ${s.duracao_min} min` : ""} · registro salvo` })),
    h("p", { class: "pequeno" }, "Algo errado no registro? ", h("a", { href: `#/paciente/${pid}`, text: "Corrigir na página do(a) paciente" })),
    caixa);
  editorDaSessao(caixa, { paciente: d, sessao: s, usuario: ctx.usuario, aoTerminar: () => ctx.ir(`#/paciente/${pid}`) });
});

ext.registrar("destravar-cofre", async (el, { recarregar, usuario }) => {
  if (cripto.cofre.privada) {
    // Rodada 2 (A1/A2): "Minha chave": impressões CALCULADAS neste aparelho, para o RT conferir por telefone ou
    // pessoalmente antes de certificar ou de repassar um prontuário para você.
    // Simplificação de 02/10: associado(a) vê UM código (as duas chaves juntas), o mesmo da tela de aprovação do RT.
    // O RT continua vendo os dois, porque são as impressões separadas que vão no pacote do site.
    const ehRt = Boolean(usuario && usuario.rt);
    const impCifra = await impressao(cripto.cofre.publica);
    const impAssin = cripto.cofre.assinaturaPublica ? await impressao(cripto.cofre.assinaturaPublica) : "(indisponível)";
    const impConj = cripto.cofre.assinaturaPublica ? await impressaoConjunta(cripto.cofre.publica, cripto.cofre.assinaturaPublica) : "(indisponível)";
    trocar(el, h("div", { class: "caixa-cifrada pilha" },
      h("p", { class: "pequeno", text: "Sua chave está aberta só nesta aba. Ela fecha sozinha depois de 15 minutos sem uso, ao sair, ao fechar a aba ou com a aba escondida por mais de 1 minuto." }),
      h("h3", { text: ehRt ? "Minha chave: códigos de conferência" : "Minha chave: código de conferência" }),
      ehRt ? [blocoConferencia("Código de conferência 1", impCifra), blocoConferencia("Código de conferência 2", impAssin)]
        : blocoConferencia("Código de conferência", impConj),
      h("details", {}, h("summary", { text: ehRt ? "Para que servem?" : "Para que serve?" }), h("p", { class: "pequeno", text: EXPLICA_CONFERENCIA })),
      h("p", { class: "pequeno", text: usuario && usuario.rt
        ? "Calculados neste aparelho. São os códigos da sua chave de responsável técnico que vão no pacote do site."
        : `Calculado neste aparelho. Quando ${rotuloRT()} pedir, leia este código por telefone ou pessoalmente, grupo por grupo (nunca pela plataforma).` }),
      botao("Fechar a chave agora", async () => { cripto.limparCofre(); aviso("Chave fechada."); recarregar(); }, "btn mini ghost")));
  } else {
    trocar(el, formAbrirChave(async () => recarregar()));
  }
});

ext.registrar("reembrulhar", (el, ctx) => telasCofre.reembrulharTransferencia(el, ctx));

ext.registrarRota("cofre", telasCofre.cofre, ["admin"]);
ext.registrarMenu("admin", "#/cofre", "Cofre");

// Inatividade: aos 13 min aparece o aviso "Continuar aqui"; aos 15 min a página avisa o app (evento), que sai SEM
// recarregar: chave apagada, sessão encerrada no servidor e rascunho selado para a frase-senha da própria pessoa.
sessao.vigiarInatividade(15, () => { window.dispatchEvent(new Event("vl:inatividade")); },
  () => Boolean(document.querySelector(".topo")) || Boolean(cripto.cofre.privada));
window.addEventListener("pagehide", () => sessao.limparSessaoCofre());
