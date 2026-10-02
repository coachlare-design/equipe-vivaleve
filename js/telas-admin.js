// Telas do admin/RT. Sem ranking de desempenho: só prazos do contrato, ativos e fechamento.
// Rodada 3 (persona admin Carlos): listas que atualizam depois de criar e não deixam criar em dobro (confirmação +
// botão travado + recusa no servidor), avisos que não ficam velhos, checklist da revogação como pendência, total a pagar
// por pessoa e da clínica, congelar só mês encerrado e com confirmação, menos alertas, sem jargão técnico, telas de
// Backup, Pedidos do titular e Termo, "Pausar encaminhamentos" separado de "Suspender acesso", presença na reunião e
// vigência do contrato.
import { h, trocar, aviso, campo, entrada, formulario, botao, pill, vazio, selecao, copiar, confirmar, segmentado,
  moeda, dataBR, diaMes, dataHoraBR, hojeISO, mesAtual, mesVizinho, nomeMes, plural, STATUS_SESSAO, STATUS_PACIENTE, PLANO,
  blocoConferencia, EXPLICA_CONFERENCIA } from "./ui.js";
import { get, post } from "./api.js";
import * as ext from "./extensoes.js";
import * as cripto from "./cripto.js";
import { impressaoConjunta } from "./cofre-cripto.js";
import * as certs from "./certificados.js";

const PILL_STATUS_PESSOA = { ativo: "g", pendente: "", suspenso: "w", revogado: "r" };
const ROTULO_STATUS_PESSOA = { ativo: "ativo(a)", pendente: "aguardando aprovação", suspenso: "acesso suspenso", revogado: "revogado(a)" };
const CAMPO_TOTP = { inputmode: "numeric", autocomplete: "one-time-code", required: true, maxlength: "7" };

function tabela(cabecalhos, linhas) {
  return h("div", { class: "tabela" }, h("table", {},
    h("thead", {}, h("tr", {}, cabecalhos.map((c) => h("th", { class: c.startsWith("#") ? "num" : "", text: c.replace(/^#/, "") })))),
    h("tbody", {}, linhas)));
}

function campoTotp(rotulo = "Seu código do app autenticador") {
  return campo(rotulo, entrada({ name: "totp", ...CAMPO_TOTP }));
}
const so6 = (v) => String(v || "").replace(/\D/g, "");

// ---------------------------------------------------------------- visão geral

export async function visao(el, _p, ctx) {
  const [d, reunioes, pessoas] = await Promise.all([get("/api/admin/visao"), get("/api/admin/reunioes"), get("/api/admin/associados")]);
  const k = d.kpis;
  const barras = h("div", { class: "barras" });
  const maximo = Math.max(d.faixa_min_ativos + 2, ...d.ativos_por_associado.map((a) => a.ativos_mes));
  for (const a of d.ativos_por_associado) {
    const cheio = h("span", { class: "cheio" });
    cheio.style.width = `${(100 * a.ativos_mes) / maximo}%`;
    const marco = h("span", { class: "marco", title: "linha dos 10" });
    marco.style.left = `${(100 * d.faixa_min_ativos) / maximo}%`;
    barras.append(h("div", { class: "b" }, h("em", { text: a.nome.split(" ")[0] }), h("span", { class: "trilho" }, cheio, marco),
      h("b", { text: `${a.ativos_mes}${a.ativos_mes >= d.faixa_min_ativos ? " · 65%" : ""}` })));
  }
  const zonaAlertas = h("div");
  const desenharAlertas = (lista, tipos) => {
    const repetidos = tipos.filter((t) => t.n > 1);
    trocar(zonaAlertas,
      repetidos.length ? h("div", { class: "pilha pequeno" }, repetidos.map((t) => h("div", { class: "linha" }, h("span", { text: `${t.titulo} (${t.n})` }),
        botao("Resolver todos", async () => {
          const ok = await confirmar({ titulo: "Resolver todos deste tipo?", texto: `${plural(t.n, "aviso", "avisos")}: ${t.titulo}. Eles saem da lista (ficam no histórico).`, textoConfirmar: "Resolver todos" });
          if (!ok) return;
          await post("/api/admin/alertas/resolver-tipo", { tipo: t.tipo });
          aviso("Avisos resolvidos.");
          ctx.recarregar();
        }, "btn mini ghost")))) : null,
      lista.length ? lista.map((a) => h("div", { class: a.nivel === "critico" ? "alerta r" : a.nivel === "info" ? "alerta b" : "alerta" },
        h("b", { text: a.titulo }), [a.paciente, a.associado_nome ? a.associado_nome.split(" ")[0] : null,
          a.data_ref ? `fato em ${dataBR(a.data_ref.slice(0, 10))}` : null, `aviso de ${dataHoraBR(a.criado_em)}`].filter(Boolean).join(" · "),
        h("div", { class: "acoes" },
          // Rodada 4 (NA6): a ocorrência aberta a partir do aviso já vem com a data do fato e o P-código.
          a.sugere_ocorrencia && a.associado_id ? h("a", { class: "btn mini ghost", text: "Abrir ocorrência",
            href: `#/ocorrencias/novo/${a.associado_id}/${a.sugere_ocorrencia}/${a.id}/${(a.data_ref || "").slice(0, 10) || "-"}/${encodeURIComponent(a.paciente || "-")}` }) : null,
          botao("Resolver", async () => { await post(`/api/admin/alertas/${a.id}/resolver`); aviso("Aviso resolvido."); ctx.recarregar(); }, "btn mini ghost")))) : vazio("Nenhum aviso aberto."));
  };
  // Rodada 4 (NP6): a revogação já aparece como cartão no topo; o aviso igual sai da lista.
  const semRepetir = d.pendencias_revogacao.length ? d.alertas.filter((a) => a.tipo !== "revogacao_pendencias") : d.alertas;
  desenharAlertas(semRepetir, d.alertas_por_tipo.filter((t) => !(d.pendencias_revogacao.length && t.tipo === "revogacao_pendencias")));
  const contratosPerto = d.contratos.filter((c) => c.contrato && c.contrato.dias_restantes <= 15);
  const bk = d.backup;
  trocar(el,
    h("div", { class: "linha quebra" }, h("h1", { text: "Visão geral" }), pill(`${nomeMes(d.mes)} · fecha em ${plural(d.dias_para_fechar, "dia", "dias")}`)),
    !d.mes_anterior_congelado ? h("div", { class: "alerta" }, h("b", { text: `${nomeMes(d.mes_anterior)} ainda não foi fechado` }),
      "O fechamento automático roda no dia 1 às 06:00. Abra o fechamento para conferir e congelar.",
      h("div", { class: "acoes" }, h("a", { class: "btn mini", href: `#/fechamento/${d.mes_anterior}`, text: "Abrir o fechamento" }))) : null,
    d.pendencias_revogacao.map((p) => h("div", { class: "alerta" }, h("b", { text: `Revogação de ${p.nome}: ${p.faltam} de ${p.total} passos fora da plataforma pendentes` }),
      "Kiwify, Calendly e o resto do checklist. Esquecer a Kiwify custa dinheiro todo mês.",
      h("div", { class: "acoes" }, h("a", { class: "btn mini", href: "#/associados", text: "Ver e marcar" })))),
    contratosPerto.map((c) => h("div", { class: c.contrato.vencido ? "alerta r" : "alerta" },
      h("b", { text: c.contrato.vencido ? `Contrato de ${c.nome} venceu em ${dataBR(c.contrato.fim)}` : `Contrato de ${c.nome} vence em ${dataBR(c.contrato.fim)}` }),
      "Renove ou encerre (cláusula 18).", h("div", { class: "acoes" }, h("a", { class: "btn mini ghost", href: "#/associados", text: "Renovar" })))),
    bk && bk.configurado && bk.atrasado ? h("div", { class: "alerta r" }, h("b", { text: "Backup sem sucesso nas últimas 26 horas" }),
      h("div", { class: "acoes" }, h("a", { class: "btn mini", href: "#/backup", text: "Ver o backup" }))) : null,
    h("div", { class: "kpis" },
      [[k.pacientes_ativos, "pacientes ativos"], [k.associados, "associados(as)"], [k.sessoes_mes, "sessões no mês"], [k.alertas_abertos, "avisos abertos"]]
        .map(([v, r]) => h("div", { class: "kpi" }, h("b", { text: String(v) }), h("span", { text: r })))),
    k.pendentes_aprovacao ? h("div", { class: "alerta b" }, h("b", { text: `${plural(k.pendentes_aprovacao, "inscrição aguardando", "inscrições aguardando")} aprovação` }),
      h("div", { class: "acoes" }, h("a", { class: "btn mini", href: "#/associados", text: "Ver" }))) : null,
    k.sob_rt ? h("p", { class: "pequeno" }, `${plural(k.sob_rt, "paciente está", "pacientes estão")} com você (RT). `, h("a", { href: "#/painel", text: "Ver" })) : null,
    h("div", { class: "grade g2" },
      h("div", { class: "card" }, h("h3", { text: "Mensalidades pagas no mês, por pessoa" }),
        d.ativos_por_associado.length ? barras : vazio("Nenhum(a) associado(a) ativo(a)."),
        h("p", { class: "pequeno", text: "A marca terracota é a linha dos 10: com 10 ou mais, a pessoa vai a 65% no mês seguinte. Não é ranking." })),
      h("div", { class: "card" }, h("h3", { text: "Avisos" }), zonaAlertas)),
    h("div", { class: "grade g2" },
      cartaoReunioes(reunioes, pessoas, ctx),
      h("div", { class: "card pilha" }, h("h3", { text: "Integridade dos registros" }),
        h("p", { class: "pequeno", text: "A plataforma confere sozinha, de hora em hora, que nenhum registro foi alterado ou apagado por fora, e manda o resumo diário por e-mail." }),
        botao("Conferir agora", async () => {
          const r = await get("/api/admin/cadeia");
          aviso(r.ok ? `Registros íntegros: nada foi alterado ou apagado (${r.elos} conferidos).` : `ATENÇÃO: a conferência encontrou problema: ${r.problemas[0]}`, r.ok ? "ok" : "erro");
        }, "btn mini ghost"))));
}

function cartaoReunioes(reunioes, pessoas, ctx) {
  const hoje = hojeISO();
  const item = (r) => {
    const passou = r.data <= hoje;
    // Rodada 4 (NA2): conta e oferece só quem já estava aprovado(a) na data da reunião (e não tinha saído).
    const assoc = r.convocados || [];
    const pres = new Map((r.presencas || []).map((x) => [x.associado_id, x]));
    const faltam = assoc.filter((p) => !pres.has(p.id));
    const caixa = h("div", { class: "mcard pilha" },
      h("div", { class: "linha" }, h("b", { text: `${dataBR(r.data)} às ${r.hora}` }),
        passou ? pill(faltam.length ? `${faltam.length} sem presença` : "presença completa", faltam.length ? "w" : "g") : pill("marcada")),
      (r.presencas || []).map((x) => h("p", { class: "pequeno", text: `${x.nome}: ${{ presente: "presente", falta_justificada: `falta justificada (${x.justificativa})`, falta: "faltou sem justificativa (ocorrência aberta)" }[x.situacao]}` })));
    if (passou && assoc.length) {
      const sel = selecao("associado_id", [["", "Escolha a pessoa"], ...assoc.map((p) => [String(p.id), p.nome])], faltam[0] ? String(faltam[0].id) : "", { required: true });
      const st = { situacao: "presente" };
      const just = entrada({ name: "justificativa", maxlength: "300" });
      const zonaJust = h("div", { hidden: true }, campo("Justificativa", just));
      caixa.append(h("details", {}, h("summary", { text: "Registrar presença" }), formulario(async () => {
        if (st.situacao === "falta") {
          const ok = await confirmar({ titulo: "Falta sem justificativa", texto: "Isto abre a ocorrência de falta à reunião quinzenal. A pessoa recebe o aviso escrito e tem 3 dias úteis para a versão dela.", textoConfirmar: "Registrar e abrir ocorrência" });
          if (!ok) return;
        }
        const res = await post(`/api/admin/reunioes/${r.id}/presencas`, { associado_id: Number(sel.value), situacao: st.situacao, justificativa: just.value });
        aviso(res.ocorrencia_id ? "Falta registrada e ocorrência aberta (aviso escrito enviado; a pessoa tem 3 dias úteis para a versão dela)."
          : st.situacao === "falta_justificada" ? "Falta justificada registrada." : "Presença registrada.");
        ctx.recarregar();
      }, campo("Pessoa", sel),
      segmentado("Presença", [["presente", "Presente"], ["falta_justificada", "Faltou com justificativa"], ["falta", "Faltou sem justificativa"]], "presente",
        (v) => { st.situacao = v; zonaJust.hidden = v !== "falta_justificada"; }),
      zonaJust, h("button", { type: "submit", class: "btn mini", text: "Registrar" }))));
    }
    return caixa;
  };
  return h("div", { class: "card" }, h("h3", { text: "Reuniões quinzenais" }),
    reunioes.slice(0, 4).map(item),
    h("details", {}, h("summary", { text: "Marcar reunião" }),
      formulario(async (fd) => { await post("/api/admin/reunioes", { data: fd.get("data"), hora: fd.get("hora") }); aviso("Reunião marcada. O aviso vai na véspera."); ctx.recarregar(); },
        h("div", { class: "grade g2" }, campo("Data", entrada({ type: "date", name: "data", required: true })), campo("Hora", entrada({ type: "time", name: "hora", value: "19:00", required: true }))),
        h("button", { type: "submit", class: "btn mini", text: "Marcar reunião" }))));
}

// ---------------------------------------------------------------- associados(as)

export async function associados(el, partes, ctx) {
  if (partes[0] === "revogar") return revogar(el, Number(partes[1]), ctx);
  const lista = await get("/api/admin/associados");
  trocar(el, h("h1", { text: "Associados(as) e acesso" }),
    lista.map((p) => {
      const c = h("div", { class: "card pilha" },
        h("div", { class: "linha topo-al" }, h("div", {}, h("b", { text: `${p.nome}` }), h("div", { class: "pequeno", text: `${p.codigo} · CRP ${p.crp} · ${p.email}` })),
          h("span", {}, pill(ROTULO_STATUS_PESSOA[p.status], PILL_STATUS_PESSOA[p.status]),
            p.encaminhamentos_pausados_em ? [" ", pill("encaminhamentos pausados", "w")] : null)),
        h("p", { class: "pequeno", text: `Último acesso: ${p.ultimo_acesso ? dataHoraBR(p.ultimo_acesso.ultimo_uso) : "nunca"} · ${plural(p.sessoes_abertas, "sessão aberta agora", "sessões abertas agora")}` }),
        p.papel === "associado" ? h("p", { class: "pequeno", text: `Pacientes: ${p.pacientes.join(", ") || "nenhum(a)"}` }) : null,
        p.papel === "associado" ? h("p", { class: "pequeno", text: `Código de afiliado(a) na Kiwify: ${p.status === "revogado" ? `encerrado em ${dataBR(p.status_em)}` : p.kiwify_afiliado_id || (p.afiliado_declarado ? `informado ${p.afiliado_declarado} (confirme na aprovação)` : "não informado")}` }) : null,
        p.contrato && p.contrato.encerrado ? h("p", { class: "pequeno", text: `Contrato: desde ${dataBR(p.contrato.inicio_contrato)} · encerrado em ${dataBR(p.contrato.encerrado_em)} (revogação)` })
          : p.contrato ? h("p", { class: "pequeno", text: `Contrato: desde ${dataBR(p.contrato.inicio_contrato)} · período atual até ${dataBR(p.contrato.fim)} (${p.contrato.vencido ? "vencido" : `${plural(p.contrato.dias_na_tela ?? p.contrato.dias_restantes, "dia", "dias")}, contando hoje`})` }) : null,
        p.encaminhamentos_pausados_em ? h("p", { class: "pequeno", text: `Encaminhamentos pausados desde ${dataBR(p.encaminhamentos_pausados_em)}: ${p.encaminhamentos_motivo || ""}. A pessoa segue atendendo quem já tem; paciente novo vai para você.` }) : null,
        p.escada && p.escada.registradas ? h("p", { class: "pequeno", text: `Ocorrências registradas: ${p.escada.registradas} (última em ${dataBR(p.escada.ultima)}${p.escada.zera_em ? `; contagem zera em ${dataBR(p.escada.zera_em)}` : ""})` }) : null,
        p.rt ? null : h("p", { class: "pequeno" }, "Chave: ", p.certificado ? pill("conferida pelo RT", "g")
          : pill(p.chave_assinatura ? "falta conferir com a pessoa" : "a pessoa ainda não entrou", "w")),
        p.pendencias_revogacao && p.pendencias_revogacao.length ? blocoPendencias(p, ctx) : null);
      const acoes = h("div", { class: "acoes-linha" });
      // Achado 6: aprovar, suspender, reativar e trocar o código de afiliado(a) pedem o 2FA de quem executa.
      // Rodada 2 (A1/A2): o RT aprova CERTIFICANDO as chaves da pessoa, depois de conferir as impressões com ela.
      if (p.status === "pendente") acoes.append(botao(ctx.usuario.rt ? "Aprovar e conferir a chave" : "Aprovar", async () => {
        const cert = ctx.usuario.rt ? await prepararCertificado(c, p) : null;
        if (ctx.usuario.rt && !cert) return;
        const r = await pedirCampos(c, [
          ["afiliado", "Código de afiliado(a) na Kiwify (confirme; vazio = sem código)", { value: p.afiliado_declarado || "", maxlength: "80" }],
          ["totp", "Seu código do app autenticador", CAMPO_TOTP]]);
        if (!r) return;
        await post(`/api/admin/associados/${p.id}/aprovar`, { totp: so6(r.totp), kiwify_afiliado_id: r.afiliado || null, certificado: cert || undefined });
        aviso(cert ? "Aprovado(a), com a chave conferida. O contrato começa hoje (90 dias, contando hoje)." : "Aprovado(a). O RT precisa conferir a chave antes da 1ª nota.");
        ctx.recarregar();
      }, "btn mini"));
      if (ctx.usuario.rt && !p.rt && p.status === "ativo" && !p.certificado && p.chave_assinatura) acoes.append(botao("Conferir a chave", async () => {
        const cert = await prepararCertificado(c, p);
        if (!cert) return;
        const r = await pedirCampos(c, [["totp", "Seu código do app autenticador", CAMPO_TOTP]]);
        if (!r) return;
        await post(`/api/admin/associados/${p.id}/certificar`, { totp: so6(r.totp), certificado: cert });
        aviso("Chave conferida e certificada."); ctx.recarregar();
      }, "btn mini"));
      if (p.papel === "associado" && p.status === "ativo") {
        // Persona admin A2: dois controles diferentes. Pausar = cl. 9.5 (só para de receber paciente novo, segue atendendo).
        if (p.encaminhamentos_pausados_em) acoes.append(botao("Retomar encaminhamentos", async () => {
          const r = await pedirCampos(c, [["totp", "Seu código do app autenticador", CAMPO_TOTP]]);
          if (!r) return;
          await post(`/api/admin/associados/${p.id}/retomar`, { totp: so6(r.totp) });
          aviso("Encaminhamentos retomados."); ctx.recarregar();
        }, "btn mini ghost"));
        else acoes.append(botao("Pausar encaminhamentos", async () => {
          const r = await pedirCampos(c, [["motivo", "Motivo (ex.: prazo de defesa em curso)", { minlength: "3", required: true }], ["totp", "Seu código do app autenticador", CAMPO_TOTP]],
            "Pausar encaminhamentos: a pessoa continua entrando e atendendo os(as) pacientes que já tem. Venda nova pelo link dela vai para você (RT), com aviso.");
          if (!r) return;
          await post(`/api/admin/associados/${p.id}/pausar`, { motivo: r.motivo, totp: so6(r.totp) });
          aviso("Encaminhamentos pausados."); ctx.recarregar();
        }, "btn mini ghost"));
      }
      if (p.status === "ativo" && p.id !== ctx.usuario.id && !(p.rt && !ctx.usuario.rt)) {
        acoes.append(botao("Suspender acesso (emergência)", async () => {
          const r = await pedirCampos(c, [["motivo", "Motivo da suspensão", { minlength: "3", required: true }], ["totp", "Seu código do app autenticador", CAMPO_TOTP]],
            "Suspender acesso: a pessoa sai na hora e não entra mais até você reativar. Os(as) pacientes ficam sem registro de sessão nesse tempo. Para só parar de receber pacientes novos, use Pausar encaminhamentos.");
          if (!r) return;
          const res = await post(`/api/admin/associados/${p.id}/suspender`, { motivo: r.motivo, totp: so6(r.totp) });
          aviso(res.sessoes_encerradas ? `Acesso suspenso. ${plural(res.sessoes_encerradas, "sessão aberta foi encerrada", "sessões abertas foram encerradas")}.` : "Acesso suspenso. Não havia sessão aberta.");
          ctx.recarregar();
        }, "btn mini ghost"));
      }
      if (p.status === "suspenso") acoes.append(botao("Reativar acesso", async () => {
        const r = await pedirCampos(c, [["totp", "Seu código do app autenticador", CAMPO_TOTP]]);
        if (!r) return;
        await post(`/api/admin/associados/${p.id}/reativar`, { totp: so6(r.totp) });
        aviso("Acesso reativado.");
        ctx.recarregar();
      }, "btn mini ghost"));
      if (p.papel === "associado" && ["ativo", "suspenso"].includes(p.status)) acoes.append(botao(p.contrato ? "Renovar contrato" : "Registrar início do contrato", async () => {
        const r = await pedirCampos(c, [["dias", "Duração do período (em dias)", { type: "number", min: "30", max: "730", value: "90", required: true }],
          ["observacao", "Observação (opcional)", { maxlength: "300" }]],
        p.contrato ? `O novo período começa em ${dataBR(new Date(new Date(`${p.contrato.fim}T12:00:00`).getTime() + 86400000).toISOString())}.` : "O período começa hoje.");
        if (!r) return;
        await post(`/api/admin/associados/${p.id}/contrato`, { dias: Number(r.dias) || 90, observacao: r.observacao || "" });
        aviso("Contrato registrado."); ctx.recarregar();
      }, "btn mini ghost"));
      if (p.status !== "revogado") {
        const bDados = h("button", { type: "button", class: "btn mini ghost", text: "Kiwify e Calendly" });
        bDados.addEventListener("click", () => {
          const f = formulario(async (fd) => {
            await post(`/api/admin/associados/${p.id}/dados`, { kiwify_afiliado_id: fd.get("afiliado") || null, calendly_url: fd.get("calendly") || null,
              totp: so6(fd.get("totp")) || null });
            aviso("Dados salvos."); ctx.recarregar();
          }, campo("Código de afiliado(a) na Kiwify", entrada({ name: "afiliado", value: p.kiwify_afiliado_id || "" })),
          campo("Link do Calendly", entrada({ name: "calendly", value: p.calendly_url || "", placeholder: "https://calendly.com/..." })),
          campo("Seu código do app autenticador (só se trocar o código de afiliado(a))", entrada({ name: "totp", ...CAMPO_TOTP, required: false })),
          h("div", { class: "acoes-linha" }, h("button", { type: "submit", class: "btn mini", text: "Salvar" }),
            h("button", { type: "button", class: "btn mini ghost", text: "Cancelar", onclick: () => f.replaceWith(bDados) })));
          bDados.replaceWith(f);
        });
        acoes.append(bDados);
      }
      if (p.papel === "associado" && p.status !== "revogado") {
        acoes.append(h("a", { class: "btn mini link-perigo", href: `#/associados/revogar/${p.id}`, text: p.status === "pendente" ? "Recusar inscrição" : "Revogar (definitivo)" }));
      }
      c.append(acoes);
      return c;
    }));
}

// Rodada 4 (persona admin NA5): "Marcar como feito" pede confirmação (a marcação fica no histórico para sempre) e, se foi
// engano, "Corrigir a marcação" grava uma correção com motivo que anula a marcação (o histórico mostra as duas).
function resumoTexto(t, n = 70) {
  const s = String(t || "");
  return s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}...` : s;
}

export async function confirmarMarcacao(texto) {
  return confirmar({ titulo: "Marcar como feito?", texto: `"${resumoTexto(texto)}". A marcação fica registrada com data e o seu nome, e não se apaga. Se for engano, depois dá para registrar uma correção (que também fica no histórico).`,
    textoConfirmar: "Marcar como feito" });
}

async function pedirCorrecao(texto) {
  return confirmar({ titulo: "Corrigir a marcação?", texto: `"${resumoTexto(texto)}" volta a ficar pendente. A marcação antiga e esta correção ficam no histórico.`,
    campos: [campo("Motivo da correção", entrada({ name: "motivo", required: true, minlength: "5", maxlength: "300", placeholder: "ex.: marquei o passo errado" }))],
    textoConfirmar: "Registrar a correção", perigo: true });
}

function historicoCorrecoes(lista) {
  return (lista || []).map((c) => h("p", { class: "pequeno", text: `Marcado em ${dataHoraBR(c.marcado_em)} e corrigido em ${dataHoraBR(c.em)}${c.por ? ` por ${c.por}` : ""}: ${c.motivo}` }));
}

function blocoPendencias(p, ctx) {
  const itens = p.pendencias_revogacao;
  const faltam = itens.filter((x) => !x.feito_em).length;
  return h("div", { class: faltam ? "alerta" : "alerta g" }, h("b", { text: faltam ? `Fora da plataforma: ${faltam} de ${itens.length} passos pendentes` : "Checklist da revogação concluído" }),
    h("ol", { class: "passos" }, itens.map((x, i) => h("li", { class: x.feito_em ? "feito" : "" }, h("span", { class: "n", text: String(i + 1) }),
      h("div", {}, h("div", { text: x.texto }), historicoCorrecoes(x.correcoes),
        x.feito_em ? [h("span", { class: "pequeno", text: `feito em ${dataHoraBR(x.feito_em)}${x.feito_por ? ` por ${x.feito_por}` : ""} ` }),
          botao("Corrigir a marcação", async () => {
            const r = await pedirCorrecao(x.texto);
            if (!r) return;
            await post(`/api/admin/pendencias/${x.id}/corrigir`, { motivo: r.motivo });
            aviso("Correção registrada. O passo voltou a ficar pendente."); ctx.recarregar();
          }, "btn mini link-perigo")]
          : botao("Marcar como feito", async () => {
            if (!(await confirmarMarcacao(x.texto))) return;
            await post(`/api/admin/pendencias/${x.id}/feito`); aviso("Passo marcado."); ctx.recarregar();
          }, "btn mini ghost"))))));
}

// Rodada 2: o RT confere as impressões (calculadas AQUI das chaves que o servidor mandou) com a pessoa, fora da plataforma,
// e assina o certificado com a chave dele(a), aberta nesta aba. Devolve { desde, assinatura } ou null (cancelado).
function prepararCertificado(container, p) {
  return new Promise((resolve) => {
    (async () => {
      if (!cripto.cofre.privada) throw new Error("Abra a sua chave (Conta) para conferir: a assinatura é feita neste navegador.");
      if (!p.chave_publica || !p.chave_assinatura) throw new Error("A pessoa ainda não registrou a chave de assinatura (precisa entrar uma vez).");
      if (!(await certs.assinaturaDoRt(cripto.b64(cripto.cofre.assinaturaPublica)))) {
        throw new Error("A sua chave de assinatura não é a do RT gravada no pacote do site: os navegadores recusariam esta conferência. Fale com o suporte técnico.");
      }
      const imp = await impressaoConjunta(p.chave_publica, p.chave_assinatura);
      const conferi = h("input", { type: "checkbox" });
      // Rodada 4 (NB1) + simplificação de 02/10: a pessoa pendente vê UM código (as duas chaves juntas) na última tela da
      // inscrição e, ao entrar, numa tela "aguardando aprovação". Aqui ele aparece em grupos de 4 com as palavras.
      const caixa = h("div", { class: "alerta b pilha" }, h("b", { text: `Conferir a chave de ${p.nome}` }),
        h("ol", { class: "passo-a-passo pequeno" },
          h("li", { text: `Ligue para ${p.nome.split(" ")[0]} (ou fale pessoalmente). Não use mensagem escrita.` }),
          h("li", { text: "Peça para a pessoa ler o código de conferência que aparece na tela dela: no fim da inscrição ou ao entrar na plataforma (tela \"aguardando aprovação\")." }),
          h("li", { text: "Confira grupo por grupo com o código abaixo. Só confirme se TODOS os grupos baterem. Se algum for diferente, não aprove e avise o suporte técnico." })),
        blocoConferencia("Código de conferência", imp),
        h("details", {}, h("summary", { text: "Para que serve?" }), h("p", { class: "pequeno", text: EXPLICA_CONFERENCIA })),
        h("label", { class: "marcar" }, conferi, "Conferi o código com a pessoa, por telefone ou pessoalmente, e todos os grupos bateram."),
        h("div", { class: "acoes" },
          botao("Confirmar", async () => {
            if (!conferi.checked) throw new Error("Confira o código com a pessoa antes.");
            const desde = new Date().toISOString();
            const assinatura = await certs.assinarCertificado({ id: p.id, codigo: p.codigo, crp: p.crp, chave_publica: p.chave_publica,
              chave_assinatura: p.chave_assinatura }, desde, cripto.cofre.privada);
            caixa.remove();
            resolve({ desde, assinatura });
          }, "btn mini"),
          botao("Cancelar", async () => { caixa.remove(); resolve(null); }, "btn mini ghost")));
      container.append(caixa);
    })().catch((e) => { aviso(e.message, "erro"); resolve(null); });
  });
}

// campos: [[nome, rótulo, props da entrada]]. Devolve { nome: valor } ou null (cancelado).
function pedirCampos(container, campos, explicacao = null) {
  return new Promise((resolve) => {
    const entradas = campos.map(([nome, , props]) => entrada({ name: nome, ...(props || {}) }));
    const caixa = h("div", { class: "mcard" });
    const f = formulario(async (fd) => {
      caixa.remove();
      resolve(Object.fromEntries(campos.map(([nome]) => [nome, String(fd.get(nome) || "").trim()])));
    },
    explicacao ? h("p", { class: "pequeno", text: explicacao }) : null,
    ...campos.map(([, rotulo], i) => campo(rotulo, entradas[i])),
    h("div", { class: "acoes-linha" }, h("button", { type: "submit", class: "btn mini", text: "Confirmar" }),
      h("button", { type: "button", class: "btn mini ghost", text: "Cancelar", onclick: () => { caixa.remove(); resolve(null); } })));
    caixa.append(f);
    container.append(caixa);
    entradas[0].focus();
  });
}

async function revogar(el, uid, ctx) {
  const lista = await get("/api/admin/associados");
  const p = lista.find((x) => x.id === uid);
  if (!p) { trocar(el, vazio("Pessoa não encontrada.")); return; }
  const recusa = p.status === "pendente";
  const resultado = h("div");
  const seloTopo = h("span", {}, pill(ROTULO_STATUS_PESSOA[p.status], PILL_STATUS_PESSOA[p.status]));
  const form = formulario({ travarAoConcluir: true }, async (fd) => {
    const r = await post(`/api/admin/associados/${uid}/revogar`, { confirmacao_nome: fd.get("nome"), totp: so6(fd.get("totp")), motivo: fd.get("motivo") });
    trocar(seloTopo, pill(recusa ? "inscrição recusada" : ROTULO_STATUS_PESSOA.revogado, PILL_STATUS_PESSOA.revogado));
    trocar(resultado, h("div", { class: "alerta g" }, h("b", { text: `${recusa ? "Inscrição recusada" : "Acesso revogado"}. ${plural(r.sessoes_encerradas, "sessão encerrada", "sessões encerradas")}.` }),
      `Pacientes com você (RT): ${r.pacientes_sob_rt.join(", ") || "nenhum(a)"}.`),
    recusa ? null : [h("h2", { text: "Passos fora da plataforma" }),
      h("p", { class: "pequeno", text: "Ficam como pendência em Associados(as) e na Visão geral até você marcar cada um." }),
      h("ol", { class: "passo-a-passo pequeno" }, r.checklist_externo.map((x) => h("li", { text: x }))),
      h("div", { class: "acoes-linha" }, h("a", { class: "btn", href: "#/associados", text: "Ver as pendências" }),
        h("a", { class: "btn ghost", href: "#/transferencias", text: "Abrir transferências" }))]);
    form.remove();
  },
  campo(`Digite o nome "${p.nome}" para confirmar`, entrada({ name: "nome", required: true, autocomplete: "off" })),
  campo("Motivo", entrada({ name: "motivo", required: true, minlength: "3", maxlength: "500" })),
  campoTotp(),
  h("button", { type: "submit", class: "btn perigo", text: recusa ? "Recusar inscrição" : "Revogar acesso agora" }));
  trocar(el, h("div", { class: "linha quebra" }, h("h1", { text: `${recusa ? "Recusar inscrição" : "Revogar"}: ${p.nome}` }), seloTopo),
    h("div", { class: "mcard pilha" },
      h("div", { class: "linha pequeno" }, h("span", { text: "Sessões abertas agora" }), h("b", { text: String(p.sessoes_abertas) })),
      h("div", { class: "linha pequeno" }, h("span", { text: "Último acesso" }), h("span", { text: p.ultimo_acesso ? dataHoraBR(p.ultimo_acesso.ultimo_uso) : "nunca" })),
      h("div", { class: "linha pequeno" }, h("span", { text: "Pacientes" }), h("span", { text: p.pacientes.join(", ") || "nenhum(a)" }))),
    h("div", { class: "card" }, h("h3", { text: "O que acontece agora" }),
      h("ul", { class: "pequeno" },
        h("li", { text: p.sessoes_abertas ? `Encerra ${plural(p.sessoes_abertas, "sessão aberta", "sessões abertas")} na hora.` : "Não há sessão aberta agora." }),
        h("li", { text: `${p.pacientes.join(" e ") || "Os(as) pacientes"} passam para você (RT).` }),
        h("li", { text: "Os prontuários continuam íntegros e legíveis por você; a pessoa perde o acesso a eles na hora." }),
        recusa ? null : h("li", { text: "Depois: Kiwify, Calendly, marca e transferência de cada paciente (ficam como pendência até você marcar)." }))),
    h("div", { class: "card" }, form), resultado);
}

// ---------------------------------------------------------------- convites

export async function convites(el, _p, ctx) {
  const saida = h("div");
  const zonaLista = h("div");
  const desenharLista = async () => {
    const lista = await get("/api/admin/convites");
    trocar(zonaLista, lista.length ? tabela(["Criado", "Para", "Situação", ""], lista.map((c) => h("tr", {},
      h("td", { text: dataHoraBR(c.criado_em) }), h("td", { text: [c.nome_sugerido, c.email_destino].filter(Boolean).join(" · ") || "qualquer pessoa" }),
      h("td", {}, pill(c.situacao, c.situacao === "aberto" ? "" : c.situacao === "usado" ? "g" : "cinza"), c.usado_por_nome ? ` ${c.usado_por_nome}` : ""),
      h("td", {}, c.situacao === "aberto" ? botao("Cancelar", async () => {
        await post(`/api/admin/convites/${c.id}/cancelar`); aviso("Convite cancelado."); await desenharLista();
      }, "btn mini ghost") : null)))) : vazio("Nenhum convite ainda."));
  };
  const form = formulario(async (fd, f) => {
    const email = String(fd.get("email") || "").trim();
    const ok = await confirmar({ titulo: "Criar convite?", texto: `Convite de uso único, vale 72 horas${email ? `, só para ${email}` : ", para qualquer pessoa que tiver o link"}.`, textoConfirmar: "Criar convite" });
    if (!ok) return;
    const r = await post("/api/admin/convites", { papel: "associado", email_destino: email || null, nome_sugerido: fd.get("nome") || null });
    trocar(saida, h("div", { class: "alerta g" }, h("b", { text: "Convite criado" }), r.aviso,
      h("p", { class: "link-longo", text: r.link }),
      h("div", { class: "acoes" }, botao("Copiar link", () => copiar(r.link, "Link copiado."), "btn mini"))));
    f.reset();
    await desenharLista();
  },
  campo("E-mail da pessoa (opcional; o convite fica só para ela)", entrada({ type: "email", name: "email" })),
  campo("Nome (opcional, só para você reconhecer)", entrada({ name: "nome", maxlength: "120" })),
  h("button", { type: "submit", class: "btn", text: "Criar convite (72h, uso único)" }));
  trocar(el, h("h1", { text: "Convites" }), h("div", { class: "card" }, form), saida, h("h2", { text: "Convites recentes" }), zonaLista);
  await desenharLista();
}

// ---------------------------------------------------------------- pacientes

async function listaAssociados() {
  return (await get("/api/admin/associados")).filter((p) => p.status === "ativo");
}

export async function pacientes(el, _p, ctx) {
  const [lista, pessoas] = await Promise.all([get("/api/admin/pacientes"), listaAssociados()]);
  const opcoesPessoas = [["", "Escolha o(a) responsável..."], ["0", "sem responsável por enquanto"], ...pessoas.map((p) => [String(p.id), `${p.codigo} · ${p.nome}`])];
  const novo = formulario(async (fd) => {
    const resp = fd.get("assoc");
    if (resp === "") throw new Error("Escolha o(a) responsável (ou \"sem responsável por enquanto\").");
    const r = await post("/api/admin/pacientes", { plano: fd.get("plano"), associado_id: resp && resp !== "0" ? Number(resp) : null });
    aviso(`${r.codigo} criado.`);
    ctx.recarregar();
  }, h("div", { class: "grade g2" }, campo("Plano", selecao("plano", [["mensal", "mensal"], ["avulsa", "avulso"]])), campo("Responsável", selecao("assoc", opcoesPessoas))),
  h("button", { type: "submit", class: "btn mini ghost", text: "Lançar paciente à mão" }));
  trocar(el, h("h1", { text: "Pacientes (só código)" }),
    h("p", { class: "pequeno", text: "O normal é a compra na Kiwify criar o código do(a) paciente sozinha. Lançar à mão é para exceção ou para corrigir a atribuição." }),
    lista.length ? tabela(["Paciente", "Responsável", "Plano", "Situação", "Termo", "#Sessões no mês"], lista.map((p) => h("tr", {},
      h("td", {}, h("a", { href: `#/paciente/${p.id}`, text: p.codigo })),
      h("td", {}, p.associado_nome ? `${p.associado_codigo} ${p.associado_nome.split(" ")[0]}${p.sob_rt ? " (com o RT)" : ""}` : pill("sem responsável", "r")),
      h("td", { text: PLANO[p.plano] || p.plano }), h("td", {}, pill(STATUS_PACIENTE[p.status], p.status === "ativo" ? "g" : "w")),
      h("td", { text: p.termo_em ? `aceito ${dataBR(p.termo_em)}` : "pendente" }),
      h("td", { class: "num", text: p.plano === "mensal" ? `${Math.min(p.sessoes_mes, 4)} de 4${p.sessoes_mes > 4 ? ` (+${p.sessoes_mes - 4})` : ""}` : String(p.sessoes_mes) })))) : vazio("Nenhum(a) paciente."),
    h("p", { class: "pequeno", text: "Sessões no mês: realizadas e faltas do(a) paciente (que contam como sessão no mensal). A mensalidade cobre 4." }),
    h("div", { class: "card" }, novo));
}

const EVENTO_PACIENTE = {
  criado: (d) => `criado${d.origem === "kiwify" ? " pela compra na Kiwify" : d.origem === "avulsa" ? " pela sessão avulsa" : " à mão"}${d.associado_id ? "" : ", sem responsável"}`,
  vinculo: (d) => `responsável alterado${d.sob_rt ? " (com o RT)" : ""}${d.motivo ? `: ${motivoLegivel(d.motivo)}` : ""}`,
  status: (d) => `situação: ${STATUS_PACIENTE[d.status] || d.status}${d.motivo ? ` (${String(d.motivo).replace(/_/g, " ")})` : ""}`,
  termo: (d) => `termo aceito em ${dataBR(d.data)}`,
  nova_assinatura: (d) => `assinatura nova da transferência ${d.transferencia || ""}`,
  mesclado: () => "juntado a outro código (compra da transferência)",
};
const MOTIVOS_VINCULO = { revogacao: "revogação de quem atendia", encaminhamentos_pausados: "venda pelo link de quem está com encaminhamentos pausados",
  afiliado_inativo_ou_desconhecido: "venda com código de quem saiu ou desconhecido" };
function motivoLegivel(m) {
  const t = String(m || "");
  if (t.startsWith("transferencia:")) return `transferência ${t.slice(14)}`;
  return MOTIVOS_VINCULO[t] || t.replace(/_/g, " ");
}
function eventoLegivel(e) {
  let d = {};
  try { d = JSON.parse(e.dados || "{}"); } catch (_) { d = {}; }
  const f = EVENTO_PACIENTE[e.tipo];
  return `${dataHoraBR(e.em)} · ${f ? f(d) : e.tipo.replace(/_/g, " ")}`;
}

export async function paciente(el, [id], ctx) {
  const [d, pessoas] = await Promise.all([get(`/api/admin/pacientes/${id}`), listaAssociados()]);
  const opcoes = [["", "Escolha..."], ...pessoas.map((p) => [String(p.id), `${p.codigo} · ${p.nome}`])];
  const souResp = d.associado_id === ctx.usuario.id;
  const zonaPront = h("div");
  trocar(el, h("div", { class: "linha quebra" }, h("h1", { text: d.codigo }), h("span", {}, pill(`plano ${PLANO[d.plano] || d.plano}`), " ", pill(STATUS_PACIENTE[d.status], d.status === "ativo" ? "g" : "w"))),
    !d.associado_id ? h("div", { class: "alerta r" }, h("b", { text: "Sem responsável" }), "Escolha quem atende este(a) paciente.") : null,
    souResp ? h("div", { class: "acoes-linha" }, h("a", { class: "btn", href: `#/registrar/${d.id}`, text: "Registrar sessão (paciente com você)" }),
      h("a", { class: "btn ghost", href: `#/meu-paciente/${d.id}`, text: "Termo e agenda" })) : null,
    h("div", { class: "grade g2" },
      h("div", { class: "card" }, h("h3", { text: "Escolher ou corrigir o(a) responsável" }), formulario(async (fd) => {
        if (!fd.get("assoc")) throw new Error("Escolha a pessoa.");
        await post(`/api/admin/pacientes/${d.id}/vincular`, { associado_id: Number(fd.get("assoc")), motivo: fd.get("motivo") });
        aviso("Responsável salvo."); ctx.recarregar();
      }, campo("Responsável", selecao("assoc", opcoes, "")), campo("Motivo", entrada({ name: "motivo", required: true, minlength: "3" })),
      h("p", { class: "pequeno", text: "Paciente em atendimento que troca de profissional: use Transferência." }),
      h("button", { type: "submit", class: "btn mini", text: "Salvar" }))),
      h("div", { class: "card" }, h("h3", { text: "Situação" }), formulario(async (fd) => {
        await post(`/api/admin/pacientes/${d.id}/status`, { status: fd.get("status"), motivo: fd.get("motivo") });
        aviso("Situação salva."); ctx.recarregar();
      }, campo("Situação", selecao("status", Object.entries(STATUS_PACIENTE), d.status)), campo("Motivo", entrada({ name: "motivo", required: true, minlength: "3" })),
      h("button", { type: "submit", class: "btn mini", text: "Salvar" })),
      h("a", { class: "btn mini ghost", href: `#/transferencias/novo/${d.id}`, text: "Abrir transferência" }))),
    h("h2", { text: "Pagamentos (dados para a NF)" }),
    d.pagamentos.length ? tabela(["Data", "Produto", "Tipo", "Pedido na Kiwify", "#Valor"], d.pagamentos.map((p) => h("tr", {},
      h("td", { text: dataBR(p.aprovado_em) }), h("td", { text: PLANO[p.produto] || p.produto }), h("td", { text: p.tipo }), h("td", { text: p.kiwify_pedido_id || "manual" }),
      h("td", { class: "num", text: moeda(p.valor_centavos) })))) : vazio("Nenhum pagamento."),
    h("h2", { text: "Sessões" }),
    d.sessoes.length ? tabela(["Data", "Hora", "Situação", "Obs."], d.sessoes.map((s) => h("tr", {},
      h("td", { text: dataBR(s.data) }), h("td", { text: s.hora }), h("td", { text: STATUS_SESSAO[s.status] }),
      h("td", { class: "pequeno", text: s.motivo_retificacao ? `corrigida: ${s.motivo_retificacao}` : s.forca_maior ? "força maior" : "" })))) : vazio("Nenhuma sessão."),
    zonaPront,
    h("h2", { text: "Histórico" }),
    d.eventos.map((e) => h("p", { class: "pequeno", text: eventoLegivel(e) })));
  const extPront = ext.obter("prontuario");
  if (extPront) extPront(zonaPront, { paciente: d, cripto: null, usuario: ctx.usuario, admin: true, recarregar: ctx.recarregar });
}

// ---------------------------------------------------------------- transferências

const concordou = (t) => !t.concordancia_exigida || Boolean(t.passos.find((p) => p.passo === "concordancia_paciente").feito_em);

export async function transferencias(el, partes, ctx) {
  const [lista, pessoas, pacs] = await Promise.all([get("/api/admin/transferencias"), listaAssociados(), get("/api/admin/pacientes")]);
  const pacPre = partes[0] === "novo" ? partes[1] : "";
  const destinos = pessoas.filter((p) => !p.encaminhamentos_pausados_em);
  const form = formulario(async (fd) => {
    const pac = pacs.find((p) => String(p.id) === fd.get("pac"));
    const para = destinos.find((p) => String(p.id) === fd.get("para"));
    if (!pac || !para) throw new Error("Escolha o(a) paciente e quem recebe.");
    const ok = await confirmar({ titulo: "Abrir transferência?", texto: `${pac.codigo} passa de ${pac.associado_nome || "sem responsável"} para ${para.nome} em ${dataBR(fd.get("data"))}. Os passos aparecem logo abaixo.`, textoConfirmar: "Abrir transferência" });
    if (!ok) return;
    await post("/api/admin/transferencias", { paciente_id: Number(fd.get("pac")), para_associado_id: Number(fd.get("para")), motivo: fd.get("motivo"),
      data_efetiva: fd.get("data"), observacao: fd.get("obs") || "" });
    aviso("Transferência aberta. Siga o passo a passo.");
    if (partes[0] === "novo") ctx.ir("#/transferencias"); else ctx.recarregar();
  },
  campo("Paciente", selecao("pac", [["", "Escolha..."], ...pacs.filter((p) => p.status !== "encerrado").map((p) => [String(p.id), `${p.codigo} · ${p.associado_nome || "sem responsável"}`])], pacPre)),
  campo("Para", selecao("para", [["", "Escolha..."], ...destinos.map((p) => [String(p.id), `${p.codigo} · ${p.nome}`])])),
  campo("Motivo", selecao("motivo", [["a_pedido", "a pedido do(a) paciente"], ["qualidade", "qualidade (exige advertência formal antes)"], ["afastamento", "afastamento maior que 15 dias ou CRP suspenso"], ["termino", "término do contrato"]])),
  campo("Data efetiva", entrada({ type: "date", name: "data", value: hojeISO(), required: true })),
  campo("Observação (sem conteúdo clínico)", entrada({ name: "obs", maxlength: "500" })),
  h("button", { type: "submit", class: "btn", text: "Abrir transferência" }));
  const extRe = ext.obter("reembrulhar");
  const cartao = (t) => {
    const linkTr = h("p", { class: "link-longo", text: t.link_pagamento });
    const passos = h("ol", { class: "passos" }, t.passos.map((p, i) => {
      if (p.passo === "concordancia_paciente" && !t.concordancia_exigida && !p.feito_em) return null;
      let acao = null;
      if (!p.feito_em && p.passo === "concordancia_paciente") {
        acao = h("details", {}, h("summary", { text: "Registrar a concordância" }), formulario(async (fd) => {
          await post(`/api/admin/transferencias/${t.id}/passos`, { passo: p.passo, data: fd.get("data"), forma: fd.get("forma") });
          aviso("Concordância registrada."); ctx.recarregar();
        }, h("div", { class: "grade g2" }, campo("Data", entrada({ type: "date", name: "data", value: hojeISO(), max: hojeISO(), required: true })),
          campo("Como concordou", entrada({ name: "forma", required: true, minlength: "3", maxlength: "80", placeholder: "ex.: mensagem escrita" }))),
        h("button", { type: "submit", class: "btn mini", text: "Registrar" })));
      } else if (!p.feito_em && !p.automatico) {
        acao = botao("Marcar como feito", async () => {
          if (!(await confirmarMarcacao(p.texto))) return;
          await post(`/api/admin/transferencias/${t.id}/passos`, { passo: p.passo }); aviso("Passo marcado."); ctx.recarregar();
        }, "btn mini ghost");
      } else if (!p.feito_em && p.automatico) {
        // Rodada 4 (NB2): "Repassar o acesso", "Nova assinatura" e "Honorários" se marcam SOZINHOS, pelo evento real.
        acao = h("span", { class: "pequeno automatico", text: p.passo === "reembrulhar_chaves"
          ? (t.concordancia_exigida && !concordou(t) ? "Marca sozinho quando o acesso for repassado, depois da concordância do(a) paciente." : "Marca sozinho quando o acesso for repassado (Preparar o repasse, abaixo).")
          : p.passo === "nova_assinatura" ? "Marca sozinho quando a compra nova chegar pelo link." : "Calculado sozinho no fechamento." });
      }
      const corrigir = p.feito_em && !p.automatico && !(p.passo === "concordancia_paciente" && t.passos.find((x) => x.passo === "reembrulhar_chaves").feito_em)
        ? botao("Corrigir a marcação", async () => {
          const r = await pedirCorrecao(p.texto);
          if (!r) return;
          await post(`/api/admin/transferencias/${t.id}/passos/${p.passo}/corrigir`, { motivo: r.motivo });
          aviso("Correção registrada. O passo voltou a ficar pendente."); ctx.recarregar();
        }, "btn mini link-perigo") : null;
      return h("li", { class: p.feito_em ? "feito" : "" }, h("span", { class: "n", text: String(i + 1) }),
        h("div", {}, h("div", { text: p.texto }),
          p.passo === "cancelar_assinatura" && t.pedido_atual ? h("p", { class: "pequeno", text: `Procure pelo pedido ${t.pedido_atual.kiwify_pedido_id} de ${dataBR(t.pedido_atual.aprovado_em)}.` }) : null,
          historicoCorrecoes(p.correcoes),
          p.feito_em ? [h("span", { class: "pequeno", text: `feito em ${dataHoraBR(p.feito_em)}${p.detalhe && p.detalhe.forma ? ` · ${p.detalhe.forma} (${dataBR(p.detalhe.data)})` : ""} ` }), corrigir] : acao));
    }));
    const corpo = [
      h("p", { class: "pequeno", text: `${t.de_nome || "sem responsável"} para ${t.para_nome} · ${t.motivo_legivel}` }),
      h("p", { class: "pequeno", text: "Link de pagamento do(a) novo(a) profissional (já leva o código desta transferência):" }),
      h("div", { class: "acoes-linha" }, botao("Copiar o link de pagamento", () => copiar(t.link_pagamento, "Link copiado.", linkTr), "btn mini ghost")),
      h("details", {}, h("summary", { text: "Ver o link" }), linkTr),
      passos];
    const c = t.concluida
      ? h("details", { class: "card" }, h("summary", {}, `${t.codigo} · ${t.paciente} `, pill("concluída", "g")), ...corpo)
      : h("div", { class: "card" }, h("div", { class: "linha topo-al" }, h("b", { text: `${t.codigo} · ${t.paciente}` }), pill(dataBR(t.data_efetiva))), ...corpo);
    if (!t.passos.find((p) => p.passo === "nova_assinatura").feito_em) {
      const autos = pacs.filter((p) => p.tem_assinatura && p.codigo !== t.paciente && p.status !== "encerrado");
      if (autos.length) {
        c.append(h("details", {}, h("summary", { text: "A compra nova chegou sem o código e virou outro paciente? Juntar aqui" }), formulario(async (fd) => {
          await post(`/api/admin/transferencias/${t.id}/vincular-assinatura`, { paciente_novo_id: Number(fd.get("auto")) });
          aviso("Nova assinatura juntada."); ctx.recarregar();
        }, campo("Código criado pela compra nova", selecao("auto", autos.map((p) => [String(p.id), `${p.codigo} (${p.associado_nome || "sem responsável"})`]))),
        h("button", { type: "submit", class: "btn mini ghost", text: "Juntar" }))));
      }
    }
    if (extRe) {
      if (concordou(t)) extRe(c, { transferencia: t, usuario: ctx.usuario, recarregar: ctx.recarregar });
      else if (!t.passos.find((p) => p.passo === "reembrulhar_chaves").feito_em) c.append(h("p", { class: "pequeno", text: "O acesso ao prontuário só é repassado depois da concordância do(a) paciente." }));
    }
    return c;
  };
  const abertas = lista.filter((t) => !t.concluida);
  const concluidas = lista.filter((t) => t.concluida);
  trocar(el, h("h1", { text: "Transferências de paciente" }),
    h("details", { class: "card", open: pacPre ? true : null }, h("summary", { text: "Nova transferência" }), form),
    h("h2", { text: `Em andamento (${abertas.length})` }), abertas.length ? abertas.map(cartao) : vazio("Nenhuma transferência em andamento."),
    concluidas.length ? [h("h2", { text: `Concluídas (${concluidas.length})` }), concluidas.map(cartao)] : null);
}

// ---------------------------------------------------------------- fechamento

// Rodada 4 (NP1): o Excel em português lê "3922,80" (vírgula decimal) com separador ponto e vírgula.
export function valorCsv(centavos) {
  return ((centavos || 0) / 100).toFixed(2).replace(".", ",");
}

export function csvDoFechamento(m, dados) {
  const linhas = [["mes", "associado", "crp", "paciente", "plano", "pedidos_kiwify", "sessoes_realizadas", "faltas_paciente"]];
  for (const b of dados.associados) for (const p of b.pacientes) {
    linhas.push([m, b.nome, b.crp, p.paciente, p.plano, p.pagamentos.map((x) => x.pedido_kiwify || "manual").join(" "),
      p.datas_realizadas.join(" "), p.datas_falta_paciente.join(" ")]);
  }
  linhas.push([], ["mes", "associado", "honorarios_kiwify", "a_pagar_clinica_dia_15", "a_devolver", "total_mes"]);
  const soma = { hk: 0, pagar: 0, devolver: 0, total: 0 };
  for (const b of dados.associados) {
    const t = b.totais;
    const v = { hk: t.honorarios_kiwify, pagar: t.a_pagar_clinica || Math.max(t.saldo_transferencia, 0),
      devolver: t.a_devolver || Math.max(-t.saldo_transferencia, 0), total: t.total_mes !== undefined ? t.total_mes : t.honorarios_kiwify + t.saldo_transferencia };
    for (const k of Object.keys(soma)) soma[k] += v[k];
    linhas.push([m, b.nome, valorCsv(v.hk), valorCsv(v.pagar), valorCsv(v.devolver), valorCsv(v.total)]);
  }
  linhas.push([m, "Total da clínica", valorCsv(soma.hk), valorCsv(soma.pagar), valorCsv(soma.devolver), valorCsv(soma.total)]);
  const tc = dados.totais_clinica;
  if (tc) linhas.push([], ["mes", "receita_liquida", "honorarios_via_kiwify", "a_pagar_dia_15", "a_receber_de_volta", "fica_com_a_clinica"],
    [m, valorCsv(tc.liquido), valorCsv(tc.honorarios_via_kiwify), valorCsv(tc.a_pagar_dia_15), valorCsv(tc.a_receber_de_volta || 0), valorCsv(tc.fica_com_a_clinica)]);
  return linhas.map((l) => l.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

export async function fechamento(el, [mesParam], ctx) {
  const m = mesParam || mesVizinho(mesAtual(), -1);
  const d = await get(`/api/admin/fechamento/${m}`);
  const dados = d.dados;
  const confs = new Map(d.conferencias.map((c) => [c.associado_id, c]));
  const aberto = m >= mesAtual();
  const tc = dados.totais_clinica;
  const totalPessoa = (t) => (t.total_mes !== undefined ? t.total_mes : t.honorarios_kiwify + t.saldo_transferencia);
  const congelar = aberto
    ? h("div", { class: "alerta b" }, h("b", { text: "Mês em andamento" }), `O fechamento de ${nomeMes(m)} é congelado depois do último dia, sozinho, no dia 1 às 06:00.`)
    : formulario(async (fd) => {
      const motivo = String(fd.get("motivo") || "");
      const pagar = dados.associados.reduce((s, b) => s + Math.max(b.totais.saldo_transferencia, 0), 0);
      const ok = await confirmar({ titulo: d.congelado ? "Gerar nova versão do fechamento?" : `Congelar ${nomeMes(m)}?`,
        texto: `${plural(dados.associados.length, "pessoa", "pessoas")} no fechamento · a clínica paga ${moeda(pagar)} até o dia 15. Depois de congelado, cada pessoa confere e informa a NF.`,
        textoConfirmar: d.congelado ? "Gerar nova versão" : "Congelar o mês" });
      if (!ok) return;
      const r = await post(`/api/admin/fechamento/${m}/congelar`, { motivo });
      aviso(`Mês congelado (versão ${r.versao}).`); ctx.recarregar();
    }, d.congelado ? campo("Motivo da nova versão", entrada({ name: "motivo", required: true, minlength: "3" })) : null,
    h("button", { type: "submit", class: d.congelado ? "btn ghost" : "btn", text: d.congelado ? "Gerar nova versão" : "Congelar o mês" }));
  trocar(el,
    h("div", { class: "linha quebra" }, h("h1", { text: `Fechamento: ${nomeMes(m)}` }), pill(d.congelado ? `congelado (versão ${d.versao})` : aberto ? "mês em andamento" : "prévia, ainda não congelado", d.congelado ? "g" : "w")),
    h("div", { class: "acoes-linha" }, h("a", { class: "btn mini ghost", href: `#/fechamento/${mesVizinho(m, -1)}`, text: "Mês anterior" }),
      h("a", { class: "btn mini ghost", href: `#/fechamento/${mesVizinho(m, 1)}`, text: "Próximo mês" }),
      botao("Baixar planilha (CSV)", () => {
        const url = URL.createObjectURL(new Blob(["﻿" + csvDoFechamento(m, dados)], { type: "text/csv;charset=utf-8" }));
        const a = h("a", { href: url, download: `fechamento-${m}.csv` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "btn mini ghost")),
    !aberto && !d.congelado ? h("div", { class: "alerta" }, h("b", { text: "Mês encerrado e ainda não congelado" }), `Os prazos correm: NF até ${dataBR(dados.prazos.conferencia_e_nf)} e pagamentos até ${dataBR(dados.prazos.transferencias)}.`) : null,
    h("p", { class: "pequeno", text: `Congela no dia 1 às 06:00 · cada pessoa confere e informa a NF até ${dataBR(dados.prazos.conferencia_e_nf)} · a clínica paga até ${dataBR(dados.prazos.transferencias)}.` }),
    tc ? h("div", { class: "card pilha" }, h("h3", { text: "Totais da clínica" }),
      linhaV("Receita líquida (depois da taxa da Kiwify)", tc.liquido),
      linhaV("Honorários já pagos pela Kiwify", tc.honorarios_via_kiwify),
      linhaV("A clínica paga até o dia 15", tc.a_pagar_dia_15),
      tc.a_receber_de_volta ? linhaV("A clínica recebe de volta ou compensa", tc.a_receber_de_volta) : null,
      h("div", { class: "total-final" }, h("span", { text: "Fica com a clínica" }), h("span", { text: moeda(tc.fica_com_a_clinica) }))) : null,
    h("div", { class: "card" }, congelar),
    dados.associados.length ? dados.associados.map((b) => {
      const conf = confs.get(b.associado_id);
      const t = b.totais;
      return h("div", { class: "card pilha" },
        h("div", { class: "linha topo-al" }, h("div", {}, h("b", { text: b.nome }), h("div", { class: "pequeno", text: `${b.codigo} · CRP ${b.crp}` })),
          pill(`${plural(b.ativos_ultimo_dia, "mensalidade paga", "mensalidades pagas")} · ${b.faixa_pct_mes}%`, b.faixa_pct_mes > 60 ? "g" : "")),
        h("p", { class: "pequeno", text: `No mês seguinte: ${b.faixa_pct_mes_seguinte}% · NF da pessoa: ${conf ? `nº ${conf.nf_numero} de ${dataBR(conf.nf_data)}` : "pendente"}` }),
        h("div", { class: "lista-cartoes" }, b.pacientes.map((p) => h("div", { class: "mcard pequeno" },
          h("div", { class: "linha" }, h("b", { text: p.paciente }), h("span", { text: p.pagamentos.map((x) => `${x.pedido_kiwify || "manual"} (${diaMes(x.aprovado_em)})`).join(", ") || "sem pagamento no mês" })),
          h("div", { text: `Realizadas: ${p.datas_realizadas.map(diaMes).join(", ") || "nenhuma"}${p.datas_falta_paciente.length ? ` · faltas do(a) paciente: ${p.datas_falta_paciente.map(diaMes).join(", ")}` : ""}` })))),
        h("div", { class: "mcard pilha" },
          linhaV("Líquido dos pagamentos", t.liquido), linhaV("Honorários pela Kiwify (60%)", t.honorarios_kiwify),
          t.extra_faixa_transferencia ? linhaV("Bônus da faixa de 65%", t.extra_faixa_transferencia) : null,
          t.um_quarto_receber ? linhaV("1/4 por sessão de paciente recebido(a)", t.um_quarto_receber) : null,
          t.descontos ? linhaV("Desconto por falta sem reposição", -t.descontos) : null,
          t.devolver_ou_compensar ? linhaV("A devolver ou compensar", -t.devolver_ou_compensar) : null,
          h("div", { class: "linha" }, h("span", { class: "pequeno", text: t.saldo_transferencia >= 0 ? "A clínica paga até o dia 15" : "A pessoa devolve ou compensa" }), h("b", { text: moeda(Math.abs(t.saldo_transferencia)) })),
          h("div", { class: "total-final" }, h("span", { text: "Total do mês da pessoa" }), h("span", { text: moeda(totalPessoa(t)) }))),
        b.estornos.length ? h("p", { class: "pequeno", text: `Estornos no mês: ${b.estornos.map((e) => `${e.paciente || "sem código"} em ${diaMes(e.data)}`).join(", ")}.` }) : null,
        b.transferencias.map((x) => h("p", { class: "pequeno", text: `${x.transferencia} ${x.paciente}: ${x.papel === "recebeu" ? "recebeu" : "saiu"} · sessões ${x.sessoes.map(diaMes).join(", ") || "nenhuma"} · ${moeda(x.valor)}` })));
    }) : vazio("Nada a fechar neste mês."));
}

function linhaV(rotulo, v) {
  return h("div", { class: "linha" }, h("span", { class: "pequeno", text: rotulo }), h("span", { text: moeda(v) }));
}

// ---------------------------------------------------------------- ocorrências

const ROTULO_DEGRAU = { conversa: "conversa", advertencia: "advertência formal", justa_causa: "justa causa", falta_grave: "falta grave" };

export async function ocorrencias(el, partes, ctx) {
  const [lista, tipos, pessoas] = await Promise.all([get("/api/admin/ocorrencias"), get("/api/admin/ocorrencias/tipos"),
    get("/api/admin/associados")]);
  const assoc = pessoas.filter((p) => p.papel === "associado" && ["ativo", "suspenso"].includes(p.status));
  const pre = partes[0] === "novo" ? { assoc: partes[1], tipo: partes[2], alerta: partes[3],
    data: partes[4] && partes[4] !== "-" ? partes[4] : "", paciente: partes[5] && partes[5] !== "-" ? partes[5] : "" } : {};
  const form = formulario(async (fd) => {
    const pessoa = assoc.find((p) => String(p.id) === fd.get("assoc"));
    if (!pessoa) throw new Error("Escolha a pessoa.");
    const ok = await confirmar({ titulo: "Abrir ocorrência?", texto: `${pessoa.nome} · ${tipos[fd.get("tipo")]}. A pessoa recebe por e-mail o aviso escrito com o fato e tem 3 dias úteis para a versão dela.${fd.get("tipo") === "outra" ? " O tipo \"outra\" não conta na escada até você classificar num item do contrato." : ""}`, textoConfirmar: "Abrir ocorrência" });
    if (!ok) return;
    await post("/api/admin/ocorrencias", { associado_id: Number(fd.get("assoc")), tipo: fd.get("tipo"), fato: fd.get("fato"), data_fato: fd.get("data"),
      alerta_id: pre.alerta ? Number(pre.alerta) : null });
    aviso("Ocorrência aberta.");
    if (partes[0] === "novo") ctx.ir("#/ocorrencias"); else ctx.recarregar();
  },
  campo("Associado(a)", selecao("assoc", [["", "Escolha..."], ...assoc.map((p) => [String(p.id), `${p.codigo} · ${p.nome}`])], pre.assoc || "")),
  campo("Tipo", selecao("tipo", Object.entries(tipos).map(([k, v]) => [k, `${v} (${k})`]), pre.tipo || "")),
  campo("Data do fato", entrada({ type: "date", name: "data", value: pre.data || hojeISO(), max: hojeISO(), required: true })),
  campo("Fato (sem conteúdo clínico; vai no aviso escrito)", h("textarea", { class: "entrada", name: "fato", required: true, minlength: "5", maxlength: "1000",
    value: pre.paciente ? `${decodeURIComponent(pre.paciente)}: ${tipos[pre.tipo] || ""}${pre.data ? ` (fato em ${dataBR(pre.data)})` : ""}.` : null })),
  h("button", { type: "submit", class: "btn", text: "Abrir ocorrência" }));
  const cartao = (o) => {
    const defesa = o.eventos.find((e) => e.tipo === "defesa");
    const e = o.escada || {};
    const c = h("div", { class: "card pilha" },
      h("div", { class: "linha topo-al" }, h("b", { text: `${o.associado_nome} · ${o.tipo_legivel}` }),
        pill(o.prazo_defesa && o.situacao === "aguardando_defesa" ? `aguardando versão até ${dataBR(o.prazo_defesa)}` : o.situacao_legivel,
          o.situacao === "registrada" ? "r" : o.pode_decidir ? "" : "w")),
      h("p", { class: "pequeno", text: `Fato em ${dataBR(o.data_fato)} · aviso escrito: ${o.aviso_em ? dataBR(o.aviso_em) : "ainda não"} · degrau sugerido: ${o.degrau_legivel}` }),
      h("p", { class: "pequeno", text: `Escada de ${o.associado_nome.split(" ")[0]}: ${e.registradas ? `${plural(e.registradas, "registrada", "registradas")} (${(e.degraus || []).map((x) => `${ROTULO_DEGRAU[x.degrau] || x.degrau} em ${dataBR(x.data_fato)}`).join(", ")})${e.zera_em ? `; zera em ${dataBR(e.zera_em)}` : ""}` : "nenhuma registrada"}` }),
      h("p", { text: o.fato }),
      defesa ? h("div", { class: "alerta b" }, h("b", { text: "Versão da pessoa" }), defesa.texto) : null,
      o.eventos.filter((x) => x.tipo === "decisao").map((x) => h("div", { class: "alerta" }, h("b", { text: `Decisão: ${o.situacao_legivel}${x.degrau_aplicado ? ` (${ROTULO_DEGRAU[x.degrau_aplicado] || x.degrau_aplicado})` : ""}` }), x.texto)));
    if (o.situacao === "aguardando_aviso") {
      c.append(h("div", { class: "alerta" }, h("b", { text: "Falta o aviso escrito" }), "O e-mail automático não saiu. Avise a pessoa por escrito e registre aqui: o prazo de 3 dias úteis só começa a contar daí.",
        formulario(async (fd) => {
          await post(`/api/admin/ocorrencias/${o.id}/aviso`, { canal: fd.get("canal"), data: fd.get("data") });
          aviso("Aviso registrado. O prazo da pessoa começou."); ctx.recarregar();
        }, h("div", { class: "grade g2" }, campo("Como avisou", entrada({ name: "canal", required: true, minlength: "3", maxlength: "40", placeholder: "ex.: e-mail próprio" })),
          campo("Data do aviso", entrada({ type: "date", name: "data", value: hojeISO(), max: hojeISO(), required: true }))),
        h("button", { type: "submit", class: "btn mini", text: "Registrar aviso" }))));
    }
    if (o.tipo === "outra" && !o.classificado_como && !["registrada", "descartada_8_3", "arquivada"].includes(o.situacao)) {
      c.append(h("details", {}, h("summary", { text: "Classificar (o tipo \"outra\" não conta na escada até ser classificado)" }), formulario(async (fd) => {
        await post(`/api/admin/ocorrencias/${o.id}/classificar`, { tipo: fd.get("tipo"), texto: fd.get("texto") || "" });
        aviso("Ocorrência classificada."); ctx.recarregar();
      }, campo("Item do contrato", selecao("tipo", [["fora_da_escada", "Fica fora da escada"], ...Object.entries(tipos).filter(([k2]) => k2 !== "outra").map(([k2, v]) => [k2, `${v} (${k2})`])])),
      campo("Por quê (opcional)", entrada({ name: "texto", maxlength: "500" })),
      h("button", { type: "submit", class: "btn mini", text: "Classificar" }))));
    } else if (o.tipo === "outra" && o.classificado_como) {
      c.append(h("p", { class: "pequeno", text: `Classificada como: ${o.classificado_como === "fora_da_escada" ? "fora da escada" : tipos[o.classificado_como] || o.classificado_como}.` }));
    }
    if (o.pode_decidir) {
      c.append(formulario({ travarAoConcluir: true }, async (fd) => {
        await post(`/api/admin/ocorrencias/${o.id}/decisao`, { decisao: fd.get("decisao"), degrau_aplicado: fd.get("degrau") || null, texto: fd.get("texto") || "" });
        aviso("Decisão registrada."); ctx.recarregar();
      }, h("div", { class: "grade g2" },
        campo("Decisão", selecao("decisao", [["registrada", "registrar"], ["descartada_8_3", "descartar (força maior)"], ["arquivada", "arquivar"]])),
        campo("Degrau aplicado", selecao("degrau", [["conversa", "conversa"], ["advertencia", "advertência formal"], ["justa_causa", "justa causa"]], o.degrau_sugerido === "falta_grave" ? "justa_causa" : o.degrau_sugerido))),
      campo("Registro escrito (e-mail ou ata)", h("textarea", { class: "entrada", name: "texto", maxlength: "2000" })),
      h("button", { type: "submit", class: "btn mini", text: "Registrar decisão" })));
    } else if (o.situacao === "aguardando_defesa") {
      c.append(h("p", { class: "pequeno", text: `A decisão abre quando a pessoa enviar a versão dela ou o prazo terminar (${dataBR(o.prazo_defesa)}).` }));
    }
    return c;
  };
  const abertas = lista.filter((o) => !["registrada", "descartada_8_3", "arquivada"].includes(o.situacao));
  const fechadas = lista.filter((o) => ["registrada", "descartada_8_3", "arquivada"].includes(o.situacao));
  trocar(el, h("h1", { text: "Ocorrências do contrato" }),
    h("p", { class: "pequeno", text: "A plataforma só sinaliza. Quem abre e decide é o RT, depois da versão da pessoa (3 dias úteis contados do aviso escrito), salvo quebra de sigilo e CRP suspenso." }),
    h("details", { class: "card", open: pre.assoc ? true : null }, h("summary", { text: "Abrir ocorrência" }), form),
    h("h2", { text: `Em andamento (${abertas.length})` }), abertas.length ? abertas.map(cartao) : vazio("Nenhuma ocorrência em andamento."),
    fechadas.length ? [h("h2", { text: `Decididas (${fechadas.length})` }), fechadas.map(cartao)] : null);
}

// ---------------------------------------------------------------- registro de acessos e leituras

const ACOES_LEGIVEIS = {
  login_ok: "Entrou", login_falha: "Entrada errada", login_negado: "Entrada negada (acesso suspenso ou revogado)", logout: "Saiu",
  requisicao: "Abriu uma tela", sessao_registrada: "Registrou sessão", sessao_retificada: "Corrigiu sessão",
  associado_aprovado: "Aprovou inscrição", associado_suspenso: "Suspendeu acesso", associado_reativado: "Reativou acesso",
  associado_revogado: "Revogou acesso", encaminhamentos_pausados: "Pausou encaminhamentos", encaminhamentos_retomados: "Retomou encaminhamentos",
  convite_criado: "Criou convite", convite_cancelado: "Cancelou convite", leitura_rt: "Leitura clínica do RT",
  prontuario_aberto: "Abriu prontuário", prontuario_aberto_mestra: "Abriu prontuário com a chave de guarda",
  prontuario_registro: "Escreveu no prontuário", prontuario_exportado: "Gerou cópia do prontuário", prontuario_reembrulhado: "Repassou acesso ao prontuário",
  prontuario_descartado: "Descartou prontuário", webhook_kiwify: "Compra ou renovação na Kiwify", fechamento_congelado: "Congelou o fechamento",
  transferencia_aberta: "Abriu transferência", transferencia_passo: "Marcou passo da transferência", ocorrencia_aberta: "Abriu ocorrência",
  ocorrencia_decidida: "Decidiu ocorrência", ocorrencia_aviso: "Registrou aviso escrito", defesa_enviada: "Enviou versão de ocorrência",
  meta_resumo: "Automação leu os totais", termo_aceito: "Paciente aceitou o termo", termo_link_criado: "Gerou link do termo",
  chave_certificada: "Conferiu a chave de alguém", cofre_mestra_cerimonia: "Cerimônia da chave de guarda", frase_trocada: "Trocou a frase-senha",
  recuperacao_concluida: "Usou o código de recuperação", titular_pedido: "Registrou pedido do titular", titular_resposta: "Respondeu pedido do titular",
  backup_teste_registrado: "Registrou teste do backup", reuniao_presenca: "Registrou presença na reunião", pendencia_feita: "Marcou passo da revogação",
  contrato_registrado: "Registrou contrato", alerta_resolvido: "Resolveu aviso", retencao_expurgo: "Limpeza automática de dados vencidos",
  // Rodada 4 (A8)
  inscricao_concluida: "Concluiu a inscrição", inscricao_iniciada: "Começou a inscrição", cofre_envelopes_bloqueados: "Prontuário sem acesso (pessoa sem acesso)",
  pendencia_corrigida: "Corrigiu passo da revogação", transferencia_passo_corrigido: "Corrigiu passo da transferência",
  transferencia_assinatura_vinculada: "Juntou a compra nova à transferência", paciente_vinculado: "Escolheu o(a) responsável",
  paciente_status: "Mudou a situação do(a) paciente", paciente_criado: "Lançou paciente à mão", pagamento_manual: "Lançou pagamento à mão",
  reuniao_criada: "Marcou reunião", sessao_encerrada: "Encerrou sessão de outro aparelho", chave_assinatura_registrada: "Registrou a chave de assinatura",
  associado_dados: "Mudou Kiwify ou Calendly", ocorrencia_classificada: "Classificou ocorrência", termo_versao_publicada: "Publicou versão do termo",
  prontuario_leitura: "Leitura clínica do RT", login_em_espera: "Entrada em espera (muitas tentativas)",
};
const rotAcao = (a, l = null) => {
  if (a === "login_negado" && l && l.detalhe && l.detalhe.status === "pendente") return "Entrada recusada: cadastro aguardando aprovação";
  if (a === "login_negado" && l && l.detalhe && l.detalhe.status) return `Entrada negada (acesso ${l.detalhe.status === "suspenso" ? "suspenso" : "revogado"})`;
  return ACOES_LEGIVEIS[a] || a.replace(/_/g, " ");
};

export async function log(el, _p, ctx) {
  const pessoas = await get("/api/admin/associados");
  const filtro = { usuario_id: "", acao: "", todas: false };
  const zona = h("div");
  const selA = selecao("a", [["", "Todos os eventos importantes"]]);
  async function carregar(antes = null) {
    const q = new URLSearchParams();
    if (filtro.usuario_id) q.set("usuario_id", filtro.usuario_id);
    if (filtro.acao) q.set("acao", filtro.acao);
    if (filtro.todas) q.set("importantes", "false");
    if (antes) q.set("antes_de", antes);
    q.set("limite", "100");
    const d = await get(`/api/admin/log?${q}`);
    if (selA.options.length <= 1) for (const a of d.acoes) selA.append(h("option", { value: a, text: rotAcao(a) }));
    const linhas = d.linhas.map((l) => h("tr", {}, h("td", { class: "pequeno", text: dataHoraBR(l.em) }), h("td", { text: l.usuario_nome || (l.papel === "kiwify" ? "Kiwify" : l.papel === "paciente" ? "Paciente" : l.papel === "automacao" ? "Automação" : l.papel === "sistema" ? "Plataforma" : "sem login") }),
      h("td", { text: rotAcao(l.acao, l) }), h("td", { class: "pequeno", text: l.alvo_legivel || "" }),
      h("td", { class: "num", text: l.status && l.status >= 400 ? "não deu certo" : "" })));
    const mais = d.linhas.length === 100 ? botao("Mais antigos", () => carregar(d.linhas[d.linhas.length - 1].id), "btn mini ghost") : null;
    trocar(zona, h("p", { class: "pequeno", text: `Guarda: ${d.retencao}.` }), tabela(["Quando", "Quem", "O quê", "Sobre", "#Resultado"], linhas), mais);
  }
  const selU = selecao("u", [["", "todas as pessoas"], ...pessoas.map((p) => [String(p.id), p.nome])]);
  const todas = h("input", { type: "checkbox" });
  selU.addEventListener("change", () => { filtro.usuario_id = selU.value; carregar(); });
  selA.addEventListener("change", () => { filtro.acao = selA.value; carregar(); });
  todas.addEventListener("change", () => { filtro.todas = todas.checked; carregar(); });
  trocar(el, h("h1", { text: "Registro de acessos" }),
    h("p", { class: "pequeno", text: "Tudo o que acontece na plataforma fica aqui, em ordem, e não pode ser apagado. Por padrão aparecem só os eventos importantes." }),
    h("div", { class: "grade g2" }, campo("Pessoa", selU), campo("Evento", selA)),
    h("label", { class: "marcar" }, todas, "Mostrar também cada tela aberta"), zona);
  await carregar();
}

export async function leituras(el) {
  const lista = await get("/api/admin/leituras");
  const RECURSO = { prontuario: "prontuário", mestra: "chave de guarda", reembrulho: "repasse de acesso" };
  trocar(el, h("h1", { text: "Leituras clínicas do RT" }),
    h("p", { class: "pequeno", text: "Cada abertura de prontuário de outra pessoa, com o motivo. A profissional responsável vê o mesmo motivo. É a prova para o CRP." }),
    lista.length ? lista.map((l) => h("div", { class: "mcard" },
      h("div", { class: "linha" }, h("b", { text: `${l.paciente} · ${RECURSO[l.recurso] || l.recurso}` }), h("span", { class: "pequeno", text: dataHoraBR(l.em) })),
      h("p", { class: "pequeno", text: `Responsável: ${l.associado_nome || "sem responsável"} · por ${l.rt_nome || "RT"}` }),
      h("p", { class: "pequeno", text: `Motivo: ${l.motivo}` }))) : vazio("Nenhuma leitura registrada."));
}

// ---------------------------------------------------------------- backup e retenção (persona admin A10; conformidade M3)

export async function backup(el, _p, ctx) {
  const d = await get("/api/admin/backup");
  const u = d.ultimo;
  const t = d.ultimo_teste_restauracao;
  trocar(el, h("h1", { text: "Backup" }),
    !d.configurado ? h("div", { class: "alerta" }, h("b", { text: "Ainda sem notícia do backup" }), "O backup diário grava aqui o resultado de cada execução. Enquanto nada chegar, confira a instalação.")
      : h("div", { class: d.atrasado ? "alerta r" : "alerta g" }, h("b", { text: d.atrasado ? "Atenção: nenhum backup com sucesso nas últimas 26 horas" : "Backup em dia" }),
        `Último backup: ${dataHoraBR(u.em)} · ${u.ok ? "deu certo" : `falhou${u.erro ? ` (${u.erro})` : ""}`}${u.tamanho ? ` · ${(u.tamanho / 1048576).toFixed(1).replace(".", ",")} MB` : ""} · ${u.cifrado ? "cifrado" : "SEM cifra"} · ${u.destino || ""}`),
    h("div", { class: "card pilha" },
      h("div", { class: "linha" }, h("span", { text: "Último backup que deu certo" }), h("b", { text: d.ultimo_ok_em ? dataHoraBR(d.ultimo_ok_em) : "nenhum" })),
      h("div", { class: "linha" }, h("span", { text: "Próximo backup" }), h("b", { text: dataHoraBR(d.proximo) })),
      h("div", { class: "linha" }, h("span", { text: "Último teste de restauração" }), h("b", { text: t ? `${dataBR(t.data)} · ${t.resultado === "ok" ? "abriu certo" : "falhou"}` : "nenhum registrado" }))),
    h("h2", { text: "Como restaurar (em linguagem simples)" }),
    h("ol", { class: "passo-a-passo" },
      h("li", { text: "Use o computador de confiança e o pendrive com a chave do backup (a folha 2 da cerimônia)." }),
      h("li", { text: "Baixe o backup mais recente da conta Google separada do backup (nunca da conta do dia a dia)." }),
      h("li", { text: "Rode o programa de restauração no modo de teste: ele abre o arquivo, confere que nada foi alterado e mostra o resultado, sem mexer na plataforma." }),
      h("li", { text: "Se for uma restauração de verdade (perda do servidor), chame o suporte técnico com o arquivo e o pendrive; o manual de implantação tem o passo a passo." }),
      h("li", { text: "Registre aqui embaixo a data e o resultado do teste. Faça o teste uma vez por semana." })),
    h("div", { class: "card" }, h("h3", { text: "Registrar teste de restauração" }), formulario(async (fd) => {
      await post("/api/admin/backup/testes", { data: fd.get("data"), resultado: fd.get("resultado"), observacao: fd.get("obs") || "" });
      aviso("Teste registrado."); ctx.recarregar();
    }, h("div", { class: "grade g2" }, campo("Data do teste", entrada({ type: "date", name: "data", value: hojeISO(), max: hojeISO(), required: true })),
      campo("Resultado", selecao("resultado", [["ok", "Abriu certo"], ["falhou", "Falhou"]]))),
    campo("Observação (opcional)", entrada({ name: "obs", maxlength: "300" })),
    h("button", { type: "submit", class: "btn mini", text: "Registrar teste" }))),
    d.testes.length ? [h("h2", { text: "Testes anteriores" }), d.testes.map((x) => h("p", { class: "pequeno", text: `${dataBR(x.data)} · ${x.resultado === "ok" ? "abriu certo" : "falhou"} · ${x.por}${x.observacao ? ` · ${x.observacao}` : ""}` }))] : null,
    h("h2", { text: "Por quanto tempo cada dado fica" }),
    tabela(["Dado", "Prazo", "Como sai"], d.retencao.politica.map((x) => h("tr", {}, h("td", { text: x.dado }), h("td", { text: x.prazo }), h("td", { text: x.como })))),
    h("p", { class: "pequeno", text: `Registros com mais de 5 anos (antes de ${dataBR(d.retencao.corte)}): ${d.retencao.log_acesso} no registro de acessos, ${d.retencao.sessoes} sessões, ${d.retencao.pagamentos} pagamentos. A retirada deles é decidida uma vez por ano, com o advogado.` }));
}

// ---------------------------------------------------------------- pedidos do(a) titular (conformidade A4)

export async function titular(el, _p, ctx) {
  const d = await get("/api/admin/titular");
  const form = formulario({ travarAoConcluir: true }, async (fd) => {
    const ok = await confirmar({ titulo: "Registrar pedido?", texto: `Prazo de resposta: ${d.prazo_dias} dias a partir da data do pedido.`, textoConfirmar: "Registrar" });
    if (!ok) return;
    await post("/api/admin/titular", { paciente_codigo: fd.get("codigo"), tipo: fd.get("tipo"), recebido_em: fd.get("data"), canal: fd.get("canal"),
      identidade_conferida: fd.get("identidade"), finalidade: fd.get("finalidade") || "", destinatario: fd.get("destinatario") || "" });
    aviso("Pedido registrado."); ctx.recarregar();
  },
  h("div", { class: "grade g2" }, campo("Código do(a) paciente (nunca o nome)", entrada({ name: "codigo", required: true, placeholder: "P-001", maxlength: "12" })),
    campo("O que a pessoa pediu", selecao("tipo", Object.entries(d.tipos)))),
  h("div", { class: "grade g2" }, campo("Data do pedido", entrada({ type: "date", name: "data", value: hojeISO(), max: hojeISO(), required: true })),
    campo("Canal", entrada({ name: "canal", required: true, minlength: "3", maxlength: "80", placeholder: "ex.: e-mail para a clínica" }))),
  campo("Como a identidade foi conferida", entrada({ name: "identidade", required: true, minlength: "5", maxlength: "300", placeholder: "ex.: e-mail do cadastro e confirmação por chamada" })),
  h("div", { class: "grade g2" }, campo("Finalidade (se a pessoa disse)", entrada({ name: "finalidade", maxlength: "300" })),
    campo("Destinatário da cópia (se houver)", entrada({ name: "destinatario", maxlength: "120" }))),
  h("button", { type: "submit", class: "btn", text: "Registrar pedido" }));
  const cartao = (p) => {
    const c = h("div", { class: "card pilha" },
      h("div", { class: "linha topo-al" }, h("b", { text: `${p.paciente || "sem código"} · ${p.tipo_legivel}` }),
        pill(p.situacao === "respondido" ? `respondido em ${dataBR(p.respondido_em)}` : p.situacao === "vencido" ? "prazo vencido" : `responder até ${dataBR(p.prazo)}`,
          p.situacao === "respondido" ? "g" : p.situacao === "vencido" ? "r" : p.dias_restantes <= 3 ? "w" : "")),
      h("p", { class: "pequeno", text: `Pedido em ${dataBR(p.recebido_em)} por ${p.canal} · identidade: ${p.identidade_conferida}${p.finalidade ? ` · finalidade: ${p.finalidade}` : ""}${p.destinatario ? ` · destinatário: ${p.destinatario}` : ""}` }),
      p.eventos.filter((x) => x.tipo === "resposta").map((x) => h("div", { class: "alerta g" }, h("b", { text: `Resposta entregue em ${dataBR(x.entregue_em)} (${x.forma})` }), x.texto)));
    if (p.situacao !== "respondido") {
      const texto = h("textarea", { class: "entrada", name: "texto", required: true, minlength: "5", maxlength: "4000" });
      if (p.tipo === "eliminacao") texto.value = d.resposta_eliminacao;
      c.append(h("details", {}, h("summary", { text: "Registrar a resposta" }), formulario({ travarAoConcluir: true }, async (fd) => {
        await post(`/api/admin/titular/${p.id}/resposta`, { texto: fd.get("texto"), entregue_em: fd.get("data"), forma: fd.get("forma") });
        aviso("Resposta registrada."); ctx.recarregar();
      }, campo("Resposta (o que foi entregue ou explicado)", texto),
      h("div", { class: "grade g2" }, campo("Data da entrega", entrada({ type: "date", name: "data", value: hojeISO(), max: hojeISO(), required: true })),
        campo("Forma", entrada({ name: "forma", required: true, minlength: "3", maxlength: "80", placeholder: "ex.: PDF por e-mail" }))),
      p.tipo === "acesso" ? h("p", { class: "pequeno", text: "Para entregar a cópia do prontuário: abra o(a) paciente, gere a cópia com a finalidade \"Pedido do(a) paciente\" (fica registrado) e envie com sigilo." }) : null,
      h("button", { type: "submit", class: "btn mini", text: "Registrar resposta" }))));
    }
    return c;
  };
  trocar(el, h("h1", { text: "Pedidos do(a) titular de dados" }),
    h("p", { class: "pequeno", text: `Quando um(a) paciente pede acesso, correção, informação ou eliminação dos dados, registre aqui. A resposta sai em até ${d.prazo_dias} dias; a plataforma avisa 3 dias antes.` }),
    h("details", { class: "card" }, h("summary", { text: "Registrar pedido" }), form),
    d.pedidos.length ? d.pedidos.map(cartao) : vazio("Nenhum pedido registrado."));
}

// ---------------------------------------------------------------- termo do(a) paciente: versões (RT)

export async function termo(el, _p, ctx) {
  if (!ctx.usuario.rt) { trocar(el, h("h1", { text: "Termo do(a) paciente" }), vazio("Só o RT publica versões do termo.")); return; }
  const versoes = await get("/api/admin/termo/versoes");
  const form = formulario({ travarAoConcluir: true }, async (fd) => {
    const ok = await confirmar({ titulo: "Publicar versão nova?", texto: "A partir de agora, os links novos usam esta versão. Quem já aceitou a anterior aparece como \"termo novo para aceitar\".", textoConfirmar: "Publicar" });
    if (!ok) return;
    await post("/api/admin/termo/versoes", { versao: fd.get("versao"), texto: fd.get("texto"), provisorio: fd.get("provisorio") === "on", totp: so6(fd.get("totp")) });
    aviso("Versão publicada."); ctx.recarregar();
  },
  campo("Nome da versão", entrada({ name: "versao", required: true, minlength: "2", maxlength: "20", placeholder: "ex.: v1" })),
  campo("Texto completo", h("textarea", { class: "entrada", name: "texto", required: true, minlength: "200", rows: "12" })),
  h("label", { class: "marcar" }, h("input", { type: "checkbox", name: "provisorio", checked: true }), "Ainda é provisório (falta a revisão jurídica)"),
  campoTotp(),
  h("button", { type: "submit", class: "btn", text: "Publicar versão" }));
  trocar(el, h("h1", { text: "Termo do(a) paciente" }),
    h("p", { class: "pequeno", text: "Cada paciente aceita a versão vigente pelo link ou pelo termo assinado. A versão aceita fica registrada com o aceite." }),
    versoes.map((v, i) => h("div", { class: "card pilha" },
      h("div", { class: "linha quebra" }, h("b", { text: `Versão ${v.versao}${i === 0 ? " (vigente)" : ""}` }),
        h("span", {}, v.provisorio ? pill("provisória, pendente de redação jurídica", "w") : pill("definitiva", "g"), " ", pill(plural(v.aceites, "aceite", "aceites")))),
      h("p", { class: "pequeno", text: `Publicada em ${dataHoraBR(v.em)}` }),
      h("details", {}, h("summary", { text: "Ver o texto" }), h("div", { class: "texto-termo", text: v.texto })))),
    h("details", { class: "card" }, h("summary", { text: "Publicar versão nova (quando o texto jurídico chegar)" }), form));
}

// ---------------------------------------------------------------- mais (celular)

export async function mais(el, _p, ctx) {
  const item = (href, rot, desc) => h("a", { class: "mcard clicavel", href }, h("b", { text: rot }), h("p", { class: "pequeno", text: desc }));
  trocar(el, h("h1", { text: "Mais" }),
    h("h2", { text: "Rotina" }),
    item("#/ocorrencias", "Ocorrências", "Abrir, acompanhar o prazo da versão da pessoa e decidir."),
    item("#/transferencias", "Transferências", "Troca de profissional com o passo a passo da Kiwify."),
    item("#/convites", "Convites", "Chamar alguém novo para a equipe."),
    h("h2", { text: "Meus atendimentos" }),
    item("#/painel", "Pacientes com o RT", "Pacientes que estão com você."),
    h("h2", { text: "Proteção de dados" }),
    item("#/titular", "Pedidos do(a) titular", "Acesso, correção ou eliminação pedidos por paciente, com prazo de 15 dias."),
    item("#/leituras", "Leituras clínicas", "Cada prontuário que você abriu, com o motivo."),
    ctx.usuario.rt ? item("#/termo", "Termo do(a) paciente", "Versões do termo e quantos aceites cada uma tem.") : null,
    item("#/log", "Registro de acessos", "Tudo o que aconteceu na plataforma, em ordem."),
    h("h2", { text: "Sistema" }),
    item("#/backup", "Backup", "Último backup, próximo e teste de restauração."),
    item("#/cofre", "Cofre", "Chave de guarda da clínica, cerimônia e descarte."),
    item("#/conta", "Conta", "Aparelhos conectados, sua chave e troca de frase-senha."));
}
