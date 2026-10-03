// Telas do(a) associado(a): celular primeiro. Só P-código, datas e status; nada clínico.
// Rodada 3 (persona associada Marina): linguagem sem jargão (responsável técnico em vez de RT, sem número de cláusula na
// tela, "sua parte: 60%"), termo do(a) paciente num lugar só com aceite pelo link ou termo assinado, registro que não
// grava duas vezes, remarcação que já agenda a nova data, "Meu mês" explicado e coerente com o painel.
import { h, trocar, aviso, campo, entrada, formulario, segmentado, botao, pill, vazio, selecao, copiar,
  moeda, dataBR, diaMes, dataHoraBR, hojeISO, horaAgora, mesAtual, mesVizinho, nomeMes, plural, resumoAparelho, rotuloRT,
  STATUS_SESSAO, STATUS_PACIENTE, PLANO, caixaTexto, podeCompartilhar, compartilhar, nomeVersaoTermo, comConflitoConfirmado } from "./ui.js";
import { get, post } from "./api.js";
import * as cripto from "./cripto.js";
import * as ext from "./extensoes.js";
import * as sessaoCofre from "./cofre-sessao.js";
import { campoFraseGerada } from "./frase.js";

const PILL_SESSAO = { realizada: "g", falta_paciente: "", remarcada: "w", falta_profissional: "r", agendada: "cinza", entrevista: "g" };
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Rodada 4 (N5): "sexta, 02/10 às 19:00" a partir de "2026-10-02 19:00".
function quandoReuniao(ref) {
  const [dia, hora] = String(ref || "").split(" ");
  if (!dia) return "";
  const d = new Date(`${dia}T12:00:00`);
  return `${DIAS_SEMANA[d.getDay()]}, ${diaMes(dia)}${hora ? ` às ${hora}` : ""}`;
}

// Explicação curta que abre ao tocar (no lugar do número de cláusula na tela).
function explica(rotulo, texto, contrato = null) {
  return h("details", { class: "pequeno" }, h("summary", { text: rotulo }),
    h("p", { text: texto }), contrato ? h("p", { class: "pequeno", text: `Ver no contrato: ${contrato}.` }) : null);
}

function cartaoPaciente(p) {
  const direita = p.proxima ? pill(`${diaMes(p.proxima.data)} ${p.proxima.hora}`)
    : p.status !== "ativo" ? pill(STATUS_PACIENTE[p.status], "w") : !p.termo_em ? pill("termo pendente", "w") : null;
  const info = [p.plano === "mensal" ? (p.periodo ? `${p.sessoes_periodo} de 4 sessões na mensalidade (até ${diaMes(p.periodo.fim)})`
    : `${p.sessoes_mes} ${p.sessoes_mes === 1 ? "sessão" : "sessões"} no mês · mensalidade ainda não paga`) : `${p.sessoes_mes} no mês`,
  p.termo_em ? "termo aceito" : null, p.sob_rt ? "com o responsável técnico" : null].filter(Boolean).join(" · ");
  const c = h("a", { class: "mcard clicavel", href: `#/paciente/${p.id}` },
    h("div", { class: "linha" }, h("span", {}, h("b", { text: p.codigo }), ` · ${PLANO[p.plano] || p.plano}`), direita),
    h("span", { class: "pequeno", text: info }));
  return c;
}

function blocoRascunho() {
  const rots = sessaoCofre.rotulosRascunhos().filter((r) => r.startsWith("evolucao:"));
  return rots.map((r) => {
    const [, pid, raiz] = r.split(":");
    return h("div", { class: "alerta b" }, h("b", { text: "Rascunho de nota que ainda não foi salvo" }),
      "Ele está guardado cifrado nesta aba e some se você sair ou fechar a aba.",
      h("div", { class: "acoes" }, h("a", { class: "btn mini", href: `#/nota/${pid}/${raiz}`, text: "Continuar a nota" })));
  });
}

export async function painel(el, _p, ctx) {
  const d = await get("/api/eu/painel");
  const primeiro = (d.usuario.nome || "").split(" ")[0];
  const pr = d.prazos;
  const blocos = [...blocoRascunho()];
  for (const r of pr.registrar) {
    blocos.push(h("div", { class: "alerta b" }, h("b", { text: "Registrar sessão" }), `${r.paciente} · ${diaMes(r.data)} às ${r.hora}`,
      h("div", { class: "acoes" }, h("a", { class: "btn mini", href: `#/registrar/${r.paciente_id}/${r.sessao_id}`, text: "Registrar agora" }))));
  }
  for (const r of pr.reposicoes) {
    blocos.push(h("div", { class: "alerta" }, h("b", { text: "Reposição pendente (até 7 dias)" }),
      `${r.paciente} · você faltou em ${diaMes(r.data_falta)} · reponha até ${dataBR(r.prazo)}`,
      h("div", { class: "acoes" }, h("a", { class: "btn mini ghost", href: `#/registrar/${r.paciente_id}`, text: "Registrar reposição" }))));
  }
  for (const p of d.pacientes.filter((x) => !x.termo_em)) {
    blocos.push(h("div", { class: "alerta" }, h("b", { text: "Termo do(a) paciente pendente" }),
      `${p.codigo} · envie o link para o(a) paciente aceitar antes da 1ª sessão paga`,
      h("div", { class: "acoes" }, h("a", { class: "btn mini ghost", href: `#/paciente/${p.id}`, text: "Enviar o termo" }))));
  }
  for (const r of pr.prontuario) {
    blocos.push(h("div", { class: r.horas_restantes < 12 ? "alerta r" : "alerta" }, h("b", { text: "Nota clínica pendente" }),
      `${r.paciente} · sessão de ${diaMes(r.data)} · ${r.horas_restantes > 0 ? `faltam ${Math.floor(r.horas_restantes)}h` : "prazo de 48h vencido"}`,
      r.paciente_id && ext.obter("nota-clinica") ? h("div", { class: "acoes" }, h("a", { class: "btn mini", href: `#/nota/${r.paciente_id}/${r.raiz}`, text: "Escrever nota" })) : null));
  }
  for (const a of pr.avulsas) blocos.push(blocoAvulsa(a, d.pacientes, ctx));
  for (const o of pr.defesas) {
    blocos.push(h("div", { class: "alerta" }, h("b", { text: "Ocorrência aberta" }), `Sua versão pode ser enviada até ${dataBR(o.prazo)}.`,
      h("div", { class: "acoes" }, h("a", { class: "btn mini ghost", href: "#/ocorrencias", text: "Ver e responder" }))));
  }
  const cobertos = new Set(["sessao_sem_registro", "reposicao_5d", "termo_pendente", "avulsa_a_vincular", "ocorrencia_aberta", "prontuario_36h",
    "paciente_novo"]); // rodada 4 (P10): o cartão do termo pendente já pede o termo do(a) paciente novo(a)
  const outros = d.alertas.filter((a) => !cobertos.has(a.tipo));
  const m = d.mes;
  const rt = d.usuario.rt;
  trocar(el,
    h("div", { class: "linha" }, h("h1", { text: `Olá, ${primeiro}` }), pill(plural(d.com_voce, "paciente com você", "pacientes com você"), "g")),
    blocos.length ? blocos : h("div", { class: "alerta g" }, h("b", { text: "Tudo em dia" }), "Nenhum prazo pendente agora."),
    outros.length ? [h("h2", { text: "Avisos" }), outros.map((a) => h("div", { class: a.nivel === "critico" ? "alerta r" : "alerta b" },
      h("b", { text: a.tipo === "reuniao_amanha" && a.data_ref ? `Reunião quinzenal de casos: ${quandoReuniao(a.data_ref)}` : a.titulo }),
      a.tipo === "reuniao_amanha" && a.data_ref ? "Amanhã. A pauta e o link chegam pelo grupo da equipe."
        : [a.paciente, a.data_ref ? `fato em ${dataBR(a.data_ref.slice(0, 10))}` : null, `aviso de ${dataHoraBR(a.criado_em)}`].filter(Boolean).join(" · ")))] : null,
    h("h2", { text: "Hoje" }),
    d.hoje.length ? d.hoje.map((s) => h("a", { class: "mcard clicavel", href: `#/registrar/${s.paciente_id}/${s.sessao_id}` },
      h("div", { class: "linha" }, h("b", { text: s.paciente }), pill(s.hora)))) : vazio("Nenhuma sessão agendada para hoje."),
    h("h2", { text: "Pacientes" }),
    d.pacientes.length ? d.pacientes.map(cartaoPaciente) : vazio("Nenhum(a) paciente ainda."),
    h("h2", { text: `Mês: ${nomeMes(m.mes)}` }),
    h("a", { class: "mcard clicavel pilha", href: "#/mes" },
      h("div", { class: "linha" }, h("span", { text: "Sessões realizadas" }), h("b", { text: String(m.sessoes_realizadas) })),
      h("div", { class: "linha" }, h("span", { text: "Honorários previstos" }), h("b", { text: moeda(m.honorarios_previstos) })),
      rt ? null : h("div", { class: "linha pequeno" }, h("span", { text: `Sua parte: ${m.faixa_pct}%` }),
        h("span", { text: m.faltam_para_faixa > 0 ? `chega a 65% com 10 mensalidades pagas no mês (agora: ${m.ativos_no_mes})` : "10 ou mais mensalidades pagas: 65% no mês seguinte" })),
      h("span", { class: "pequeno", text: "Honorários entram quando a Kiwify confirma o pagamento. Toque para ver o mês." })),
    h("p", { class: "pequeno", text: "A plataforma mostra só o código do(a) paciente. Nada clínico fica neste painel." }));
}

function blocoAvulsa(a, pacientes, ctx) {
  const sel = selecao("paciente", [["", "Escolha o(a) paciente"], ["novo", "Paciente novo(a)"],
    ...pacientes.map((p) => [String(p.id), p.codigo])]);
  return h("div", { class: "alerta b" }, h("b", { text: "Sessão avulsa paga" }), `Aprovada em ${dataBR(a.aprovado_em)}. Diga de qual paciente é.`,
    h("div", { class: "acoes" }, sel, botao("Vincular", async () => {
      if (!sel.value) throw new Error("Escolha o(a) paciente.");
      await post(`/api/eu/avulsas/${a.pagamento_id}/vincular`, sel.value === "novo" ? { novo: true } : { paciente_id: Number(sel.value) });
      aviso("Pagamento vinculado.");
      ctx.recarregar();
    }, "btn mini")));
}

export async function pacientes(el) {
  const lista = await get("/api/eu/pacientes");
  trocar(el, h("h1", { text: "Pacientes" }),
    lista.length ? lista.map(cartaoPaciente) : vazio("Nenhum(a) paciente ainda. Quando a Kiwify aprovar uma compra pelo seu link, o código do(a) paciente aparece aqui."));
}

// ---------------------------------------------------------------- termo do(a) paciente: um lugar só (persona B3)

function cartaoTermo(d, ctx) {
  const t = d.termo;
  const v = t.vigente;
  const caixa = h("div", { class: "card pilha", id: "termo" });
  const marcaProv = v.provisorio ? pill("texto provisório", "w") : pill(nomeVersaoTermo(v.versao), "g");
  const textoTermo = h("details", {}, h("summary", { text: "Ver o texto do termo" }), h("div", { class: "texto-termo", text: v.texto }));
  const zonaAcao = h("div", { class: "pilha" });
  const titulo = h("div", { class: "linha quebra" }, h("h2", { text: "Termo do(a) paciente" }), marcaProv);
  if (t.aceito && !t.precisa_novo_aceite) {
    const u = t.ultimo;
    caixa.append(titulo, h("div", { class: "resumo-ok" },
      h("span", { text: `Aceito em ${dataBR(u.data_aceite)} · ${u.forma === "link" ? "pelo link, pelo(a) paciente" : "termo assinado anexado"} · ${nomeVersaoTermo(u.versao)}` })),
    textoTermo);
    return caixa;
  }
  const mostrarLink = (r) => {
    const msg = `Olá! Antes da nossa primeira sessão, leia e aceite o termo de atendimento da clínica Conheça-TE Psi neste link: ${r.link} (vale até ${dataBR(r.expira_em)}). Se pedir, o código é ${r.codigo}.`;
    const caixaMsg = caixaTexto(msg, "Mensagem pronta para o(a) paciente");
    const linkTexto = h("p", { class: "link-longo", text: r.link });
    trocar(zonaAcao, h("div", { class: "alerta b" }, h("b", { text: "Link criado" }),
      "Envie ao(à) paciente pelo canal que vocês já usam. O link vale 7 dias e só serve uma vez.",
      h("p", { class: "pequeno", text: "Mensagem pronta (dá para tocar, selecionar e copiar à mão):" }), caixaMsg,
      h("div", { class: "acoes" },
        podeCompartilhar() ? botao("Enviar pelo WhatsApp ou outro app", async () => { await compartilhar(msg, "Termo de atendimento"); }, "btn mini") : null,
        botao("Copiar mensagem pronta", () => copiar(msg, "Mensagem copiada.", caixaMsg), podeCompartilhar() ? "btn mini ghost" : "btn mini"),
        botao("Copiar só o link", () => copiar(r.link, "Link copiado.", linkTexto), "btn mini ghost")),
      linkTexto,
      h("p", { class: "pequeno", text: `Código (se a pessoa preferir digitar): ${r.codigo}` })));
  };
  const gerar = botao(t.link_aberto ? "Gerar um link novo" : "Enviar link para o(a) paciente aceitar", async () => {
    mostrarLink(await post(`/api/eu/pacientes/${d.id}/termo/link`));
  }, "btn");
  const anexarExt = ext.obter("termo-anexo");
  const anexar = anexarExt ? botao("Anexar termo assinado (papel ou gov.br)", async () => {
    const zona = h("div", { class: "caixa-cifrada" });
    trocar(zonaAcao, zona);
    anexarExt(zona, { paciente: d, usuario: ctx.usuario, versao: v.versao, aoTerminar: ctx.recarregar });
  }, "btn ghost") : null;
  caixa.append(...[titulo,
    t.precisa_novo_aceite ? h("div", { class: "alerta" }, h("b", { text: "Termo novo para aceitar" }),
      `O(a) paciente aceitou o ${nomeVersaoTermo(t.ultimo.versao)}; a clínica publicou a ${nomeVersaoTermo(v.versao, v.provisorio)}. Envie a versão nova.`)
      : h("div", { class: "alerta" }, h("b", { text: "Pendente" }), "Sem o aceite do(a) paciente, a 1ª sessão paga não pode ser registrada. A entrevista inicial gratuita pode."),
    t.link_aberto ? h("p", { class: "pequeno", text: `Link enviado em ${dataBR(t.link_aberto.criado_em)}, vale até ${dataBR(t.link_aberto.expira_em)}. Aguardando o aceite.` }) : null,
    h("p", { class: "pequeno", text: "Escolha um caminho: o(a) paciente aceita pelo link (no celular dele(a)) ou você anexa o termo assinado. O aceite fica registrado com data, hora e a versão do texto." }),
    h("div", { class: "acoes-coluna" }, gerar, anexar), zonaAcao, textoTermo].filter(Boolean));
  return caixa;
}

function formAgendar(pid, ctx, horaHabitual = null) {
  return formulario(async (fd) => {
    await comConflitoConfirmado((confirmar_conflito) => post("/api/eu/sessoes", { paciente_id: pid, data: fd.get("data"), hora: fd.get("hora"),
      status: "agendada", confirmar_conflito }));
    aviso("Sessão agendada.");
    ctx.recarregar();
  }, h("div", { class: "grade g2" },
    campo("Data", entrada({ type: "date", name: "data", value: hojeISO(), required: true })),
    campo("Horário", entrada({ type: "time", name: "hora", value: horaHabitual || "14:00", required: true }))),
  h("button", { type: "submit", class: "btn ghost", text: "Agendar" }));
}

function formRetificar(s, ctx, aoCancelar) {
  const opcoes = Object.entries(STATUS_SESSAO).filter(([k]) => k !== "agendada");
  const box = h("div", { class: "mcard" }, h("b", { text: "Corrigir o registro (a versão anterior fica no histórico)" }));
  const form = formulario(async (fd) => {
    const corpo = { motivo: fd.get("motivo"), status: fd.get("status"), data: fd.get("data"), hora: fd.get("hora") };
    if (corpo.status === "remarcada") corpo.iniciativa = fd.get("iniciativa") || "paciente";
    await post(`${ctx.usuario.papel === "admin" && s.associado_id !== ctx.usuario.id ? "/api/admin" : "/api/eu"}/sessoes/${s.id}/retificar`, corpo);
    aviso("Correção salva. A versão anterior continua no histórico.");
    ctx.recarregar();
  },
  campo("Situação", selecao("status", opcoes, s.status)),
  h("div", { class: "grade g2" }, campo("Data", entrada({ type: "date", name: "data", value: s.data })),
    campo("Horário", entrada({ type: "time", name: "hora", value: s.hora }))),
  campo("Se remarcada, quem pediu", selecao("iniciativa", [["paciente", "O(a) paciente"], ["profissional", "Eu"]], s.iniciativa || "paciente")),
  campo("Motivo da correção", entrada({ name: "motivo", required: true, minlength: "5", maxlength: "300" }), "Sem conteúdo clínico."),
  h("div", { class: "acoes-linha" }, h("button", { type: "submit", class: "btn mini", text: "Salvar correção" }),
    h("button", { type: "button", class: "btn mini ghost", text: "Cancelar", onclick: aoCancelar })));
  box.append(form);
  return box;
}

export async function paciente(el, [id], ctx) {
  const d = await get(`/api/eu/pacientes/${id}`);
  const lista = h("div");
  for (const s of d.sessoes) {
    const linha = h("div", { class: "mcard" },
      h("div", { class: "linha" }, h("span", { text: `${dataBR(s.data)} · ${s.hora}` }),
        h("span", {}, s.motivo_retificacao ? pill("corrigida", "w") : null, " ", pill(STATUS_SESSAO[s.status], PILL_SESSAO[s.status]))),
      s.motivo_retificacao ? h("p", { class: "pequeno", text: `Corrigida: ${s.motivo_retificacao}` }) : null,
      s.status === "remarcada" ? h("p", { class: "pequeno", text: `Pedido de: ${s.iniciativa === "profissional" ? "você" : "paciente"}${s.nova_data ? ` · nova data ${dataBR(s.nova_data)}` : ""}` }) : null);
    const acoes = h("div", { class: "acoes-linha" });
    if (s.status === "agendada") acoes.append(h("a", { class: "btn mini", href: `#/registrar/${d.id}/${s.id}`, text: "Registrar como foi" }));
    const bRet = h("button", { type: "button", class: "btn mini ghost", text: "Corrigir" });
    bRet.addEventListener("click", () => {
      const f = formRetificar(s, ctx, () => f.replaceWith(bRet));
      bRet.replaceWith(f);
    });
    acoes.append(bRet);
    linha.append(acoes);
    lista.append(linha);
  }
  const extPront = ext.obter("prontuario");
  const zonaPront = h("div");
  if (extPront) extPront(zonaPront, { paciente: d, cripto, usuario: ctx.usuario, recarregar: ctx.recarregar });
  trocar(el,
    h("div", { class: "linha quebra" }, h("h1", { text: d.codigo }), h("span", {}, pill(`plano ${PLANO[d.plano] || d.plano}`), " ", pill(STATUS_PACIENTE[d.status], d.status === "ativo" ? "g" : "w"))),
    d.sob_rt ? h("p", { class: "pequeno", text: `Paciente com ${rotuloRT()}.` }) : null,
    cartaoTermo(d, ctx),
    d.reposicoes_pendentes.map((r) => h("div", { class: "alerta" }, h("b", { text: "Reposição pendente" }), `Você faltou em ${dataBR(r.data_falta)}; reponha até ${dataBR(r.prazo)}.`)),
    h("div", { class: "acoes-linha" }, h("a", { class: "btn", href: `#/registrar/${d.id}`, text: "Registrar sessão" })),
    h("h2", { text: "Agendar próxima sessão" }), h("div", { class: "card" }, formAgendar(d.id, ctx,
      (d.sessoes.find((s) => ["realizada", "agendada", "entrevista"].includes(s.status)) || {}).hora)),
    zonaPront,
    h("h2", { text: "Presenças e faltas" }), d.sessoes.length ? lista : vazio("Nenhum registro ainda."),
    d.historico_versoes.length ? [h("h2", { text: "Correções feitas" }), d.historico_versoes.map((v) =>
      h("p", { class: "pequeno", text: `${dataHoraBR(v.registrado_em)} · registro de ${dataBR(v.data)} · motivo: ${v.motivo_retificacao}` }))] : null);
  if (location.hash.endsWith("#termo")) document.getElementById("termo")?.scrollIntoView();
}

export async function registrar(el, [pid, agendamento], ctx) {
  const base = "/api/eu";
  if (!pid) {
    const lista = (await get(`${base}/pacientes`)).filter((p) => p.status === "ativo" || p.status === "atraso");
    trocar(el, h("h1", { text: "Registrar sessão" }), h("p", { class: "pequeno", text: "Escolha o(a) paciente." }),
      lista.length ? lista.map((p) => h("a", { class: "mcard clicavel", href: `#/registrar/${p.id}` },
        h("div", { class: "linha" }, h("b", { text: p.codigo }), pill(`plano ${PLANO[p.plano] || p.plano}`)))) : vazio("Nenhum(a) paciente ativo(a)."));
    return;
  }
  const d = await get(`${base}/pacientes/${pid}`);
  const ag = agendamento ? d.sessoes.find((s) => String(s.id) === String(agendamento) && s.status === "agendada") : null;
  const temEntrevista = d.sessoes.some((s) => s.status === "entrevista");
  const st = { status: d.termo_em ? "realizada" : "", duracao: 50, iniciativa: "paciente", aviso: 24, forca: false, reposicao: null,
    entrevista: false };
  const ultimaHora = (d.sessoes.find((s) => s.status === "realizada") || {}).hora;
  const data = entrada({ type: "date", name: "data", value: ag ? ag.data : hojeISO(), max: hojeISO(), required: true });
  const hora = entrada({ type: "time", name: "hora", value: ag ? ag.hora : (ultimaHora || horaAgora()), required: true });
  const novaData = entrada({ type: "date", name: "nova_data", min: hojeISO() });
  const novaHora = entrada({ type: "time", name: "nova_hora" });
  const extras = h("div", { class: "pilha" });
  const repos = d.reposicoes_pendentes;
  const notaInfo = h("p", { class: "pequeno" });

  function desenharExtras() {
    const partes = [];
    if (st.status === "realizada" && !temEntrevista) {
      // Rodada 4 (N4): a entrevista inicial gratuita não pede o termo e não conta como sessão paga.
      const cbE = h("input", { type: "checkbox", checked: st.entrevista });
      cbE.addEventListener("change", () => { st.entrevista = cbE.checked; desenharExtras(); });
      partes.push(h("label", { class: "marcar" }, cbE, "É a entrevista inicial gratuita (antes da compra: não pede o termo e não conta como sessão paga)"));
    }
    if (st.status === "realizada") {
      partes.push(h("p", { class: "pequeno", text: "Duração (opcional)" }),
        segmentado("Duração", [["30", "30 min"], ["50", "50 min"], ["60", "60 min"], ["", "outra"]], String(st.duracao || ""), (v) => { st.duracao = v ? Number(v) : null; }));
      if (repos.length && !st.entrevista) {
        const cb = h("input", { type: "checkbox", checked: Boolean(st.reposicao) });
        cb.addEventListener("change", () => { st.reposicao = cb.checked ? repos[0].raiz : null; });
        partes.push(h("label", { class: "marcar" }, cb, `É a reposição da sua falta de ${dataBR(repos[0].data_falta)} (prazo ${dataBR(repos[0].prazo)})`));
      }
    }
    if (st.status === "falta_paciente") {
      partes.push(h("div", { class: "alerta b" }, d.plano === "mensal" ? "No plano mensal, a falta do(a) paciente conta como sessão realizada (entra nas 4 da mensalidade)."
        : "Falta registrada. Ela entra no seu mês como sessão do plano avulso."));
    }
    if (st.status === "remarcada") {
      partes.push(h("p", { class: "pequeno", text: "Quem pediu a remarcação?" }),
        segmentado("Quem pediu", [["paciente", "O(a) paciente"], ["profissional", "Eu"]], st.iniciativa, (v) => { st.iniciativa = v; desenharExtras(); }));
      if (st.iniciativa === "profissional") {
        partes.push(h("p", { class: "pequeno", text: "Com quanta antecedência você avisou o(a) paciente?" }),
          segmentado("Antecedência", [["12", "Menos de 24h"], ["24", "24h ou mais"]], String(st.aviso), (v) => { st.aviso = Number(v); }),
          explica("Regra de remarcação", "Você pode remarcar 1 vez por mês por paciente, avisando com 24h ou mais. Fora disso, a clínica recebe um aviso.", "cláusula 8.2 b"));
      }
      partes.push(h("div", { class: "grade g2" }, campo("Nova data combinada (opcional)", novaData), campo("Horário da nova sessão", novaHora, "Com data e horário, a nova sessão já fica agendada.")));
    }
    if (st.status === "remarcada" || st.status === "falta_profissional") {
      const cb = h("input", { type: "checkbox", checked: st.forca });
      cb.addEventListener("change", () => { st.forca = cb.checked; });
      partes.push(h("label", { class: "marcar" }, cb, "Foi por motivo de saúde ou força maior (com documento)"));
      if (st.status === "falta_profissional") partes.push(h("p", { class: "pequeno", text: "A sessão precisa ser reposta em até 7 dias." }));
    }
    trocar(extras, partes);
    notaInfo.textContent = !st.status ? "Escolha como foi."
      : st.status === "realizada"
        ? (ext.obter("nota-clinica") ? "Depois de salvar, a nota clínica abre na hora, protegida neste aparelho. Você também pode escrever depois, em até 48h." : "")
        : "Este registro não pede nota clínica.";
  }

  const form = formulario({ travarAoConcluir: true }, async () => {
    if (!st.status) throw new Error("Escolha como foi a sessão.");
    const entrevista = st.status === "realizada" && st.entrevista;
    const corpo = { paciente_id: Number(pid), data: data.value, hora: hora.value, status: entrevista ? "entrevista" : st.status };
    if (ag) corpo.agendamento_id = ag.id;
    if (st.status === "realizada") { if (st.duracao) corpo.duracao_min = st.duracao; if (st.reposicao && !entrevista) corpo.reposicao_de = st.reposicao; }
    if (st.status === "remarcada") {
      corpo.iniciativa = st.iniciativa;
      if (st.iniciativa === "profissional") corpo.aviso_horas = st.aviso;
      if (novaData.value) { corpo.nova_data = novaData.value; if (novaHora.value) corpo.nova_hora = novaHora.value; }
    }
    if (st.status === "remarcada" || st.status === "falta_profissional") corpo.forca_maior = st.forca;
    const r = await comConflitoConfirmado((confirmar_conflito) => post("/api/eu/sessoes", { ...corpo, confirmar_conflito }));
    if ((r.status === "realizada" || r.status === "entrevista") && ext.obter("nota-clinica")) { ctx.ir(`#/nota/${pid}/${r.raiz}`); return; }
    // Persona A3: o formulário some e fica só o resumo do que foi salvo (sem salvar de novo por engano).
    trocar(el, h("h1", { text: d.codigo }),
      h("div", { class: "resumo-ok", role: "status" }, h("span", { text: `${STATUS_SESSAO[r.status]} · ${diaMes(r.data)} às ${r.hora} · registro salvo` })),
      r.novo_agendamento ? h("div", { class: "alerta g" }, h("b", { text: "Nova sessão agendada" }), `${dataBR(r.novo_agendamento.data)} às ${r.novo_agendamento.hora}.`) : null,
      h("div", { class: "acoes-linha" }, h("a", { class: "btn", href: "#/painel", text: "Voltar ao painel" }),
        h("a", { class: "btn ghost", href: `#/paciente/${pid}`, text: "Ver ou corrigir" })));
  },
  h("p", { class: "pequeno", text: "Como foi?" }),
  segmentado("Como foi", [["realizada", "Realizada"], ["falta_paciente", "Faltou (paciente)"], ["remarcada", "Remarcada"], ["falta_profissional", "Falta minha"]],
    st.status, (v) => { st.status = v; desenharExtras(); }),
  h("div", { class: "grade g2" }, campo("Data", data), campo("Horário", hora)),
  extras, notaInfo,
  h("button", { type: "submit", class: "btn", text: "Salvar registro" }));

  trocar(el,
    h("div", { class: "linha" }, h("h1", { text: d.codigo }), pill(ag ? `${diaMes(ag.data)} ${ag.hora}` : `plano ${PLANO[d.plano] || d.plano}`)),
    !d.termo_em ? h("div", { class: "alerta" }, h("b", { text: "Falta o aceite do termo" }),
      "Sem ele, dá para registrar a entrevista inicial gratuita, remarcação ou falta sua. Sessão paga só depois do aceite (e com data a partir dele).",
      h("div", { class: "acoes" }, h("a", { class: "btn mini ghost", href: `#/paciente/${d.id}`, text: "Enviar o termo" }))) : null,
    form);
  desenharExtras();
}

export async function mes(el, [mesParam], ctx) {
  const m = mesParam || mesAtual();
  const d = await get(`/api/eu/mes/${m}`);
  const r = d.resumo;
  const f = d.fechamento;
  const rt = ctx && ctx.usuario && ctx.usuario.rt;
  const nav = h("div", { class: "acoes-linha" },
    h("a", { class: "btn mini ghost", href: `#/mes/${mesVizinho(m, -1)}`, text: "Mês anterior" }),
    m < mesAtual() ? h("a", { class: "btn mini ghost", href: `#/mes/${mesVizinho(m, 1)}`, text: "Próximo mês" }) : null);
  const fechaLogo = !d.congelado && r.horas_para_fechar > 0 && r.horas_para_fechar <= 48;
  const t = f ? f.totais : null;
  const blocoFech = f ? [
    h("h2", { text: "Valores do mês" }),
    h("div", { class: "mcard pilha" },
      linhaValor(`Honorários pela Kiwify (sua parte: ${r.faixa_pct}%)`, t.honorarios_kiwify, "Já caem na sua conta pela Kiwify a cada pagamento aprovado."),
      t.extra_faixa_transferencia ? linhaValor("Bônus da faixa de 65%", t.extra_faixa_transferencia, "Diferença de 60% para 65%, paga pela clínica até o dia 15.") : null,
      t.um_quarto_receber ? linhaValor("Sessões de paciente que você recebeu", t.um_quarto_receber, "1/4 da mensalidade por sessão feita depois da transferência.") : null,
      t.descontos ? linhaValor("Desconto por falta sua sem reposição", -t.descontos, "Falta da profissional não reposta em 7 dias.") : null,
      t.devolver_ou_compensar ? linhaValor("A devolver ou compensar", -t.devolver_ou_compensar, "Valor de paciente que saiu ou pagamento recebido depois da transferência.") : null,
      h("div", { class: "total-final" }, h("span", { text: "Total do mês" }), h("span", { text: moeda(t.total_mes !== undefined ? t.total_mes : t.honorarios_kiwify + t.saldo_transferencia) })),
      h("p", { class: "pequeno", text: t.saldo_transferencia > 0 ? `Desse total, ${moeda(t.saldo_transferencia)} a clínica transfere até o dia 15.`
        : t.saldo_transferencia < 0 ? `Você devolve ou compensa ${moeda(-t.saldo_transferencia)} com a clínica.` : "Nada a receber da clínica além do que veio pela Kiwify." })),
    h("h2", { text: "Datas por paciente (para a NF)" }),
    f.pacientes.map((p) => h("div", { class: "mcard" },
      h("div", { class: "linha" }, h("b", { text: p.paciente }), pill(PLANO[p.plano] || p.plano)),
      h("p", { class: "pequeno", text: `Realizadas: ${p.datas_realizadas.map(diaMes).join(", ") || "nenhuma"}` }),
      p.datas_falta_paciente.length ? h("p", { class: "pequeno", text: `Faltas do(a) paciente (contam como sessão no mensal): ${p.datas_falta_paciente.map(diaMes).join(", ")}` }) : null,
      p.pagamentos.map((pg) => h("p", { class: "pequeno", text: `Pagamento em ${dataBR(pg.aprovado_em)} · ${moeda(pg.honorarios_kiwify)} pela Kiwify${pg.extra_faixa ? ` · bônus ${moeda(pg.extra_faixa)}` : ""}` })))),
    f.descontos_11_8.length ? f.descontos_11_8.map((x) => h("p", { class: "pequeno", text: `Desconto: ${x.paciente}, falta sua em ${dataBR(x.data_falta)} sem reposição até ${dataBR(x.prazo_reposicao)}.` })) : null,
    f.transferencias.map((x) => h("p", { class: "pequeno", text: `Transferência de ${x.paciente}: ${x.papel === "recebeu" ? "você recebeu" : "saiu"} · sessões ${x.sessoes.map(diaMes).join(", ") || "nenhuma"} · ${moeda(x.valor)}` })),
  ] : vazio("Sem pagamentos nem sessões neste mês.");
  const conf = d.congelado
    ? (d.conferencia ? h("div", { class: "alerta g" }, h("b", { text: "NF informada" }), `NF nº ${d.conferencia.nf_numero} de ${dataBR(d.conferencia.nf_data)}.`)
      : h("div", { class: "card" }, h("h3", { text: "Conferi e emiti a NF" }), formulario({ travarAoConcluir: true }, async (fd) => {
        await post(`/api/eu/mes/${m}/conferir`, { nf_numero: fd.get("nf"), nf_data: fd.get("data"), observacao: fd.get("obs") || "" });
        aviso("Conferência registrada.");
        ctx.recarregar();
      }, h("div", { class: "grade g2" }, campo("Número da NF", entrada({ name: "nf", required: true, maxlength: "40" })),
        campo("Data da NF", entrada({ type: "date", name: "data", value: hojeISO(), required: true }))),
      campo("Observação (opcional)", entrada({ name: "obs", maxlength: "500" })),
      h("button", { type: "submit", class: "btn", text: "Registrar conferência" }))))
    : h("div", { class: fechaLogo ? "alerta" : "alerta b" }, h("b", { text: fechaLogo ? `O mês fecha em ${Math.ceil(r.horas_para_fechar)}h` : "Prévia do mês" }),
      `O mês fecha no dia ${dataBR(d.prazos.congelamento)} às 06:00. Confira seus registros antes. Depois, informe a NF até ${dataBR(d.prazos.conferencia_e_nf)}.`);
  trocar(el, h("h1", { text: `Meu mês: ${nomeMes(m)}` }), nav, conf,
    h("div", { class: "mcard pilha" },
      h("div", { class: "linha" }, h("span", { text: "Sessões realizadas" }), h("b", { text: String(r.sessoes_realizadas) })),
      h("div", { class: "linha" }, h("span", { text: "Faltas do(a) paciente" }), h("b", { text: String(r.faltas_paciente) })),
      h("div", { class: "linha" }, h("span", { text: "Remarcadas" }), h("b", { text: String(r.remarcadas) })),
      h("div", { class: "linha" }, h("span", { text: "Faltas suas" }), h("b", { text: String(r.faltas_profissional) })),
      h("div", { class: "linha" }, h("span", { text: "Honorários previstos" }), h("b", { text: moeda(r.honorarios_previstos) })),
      h("p", { class: "pequeno", text: "Honorários entram quando a Kiwify confirma o pagamento do(a) paciente. Sessão atendida sem pagamento confirmado ainda não soma aqui." })),
    rt ? null : h("div", { class: "mcard pilha" },
      h("div", { class: "linha" }, h("span", { text: "Pacientes com você" }), h("b", { text: String(r.pacientes_com_voce) })),
      h("div", { class: "linha" }, h("span", { text: "Com mensalidade paga neste mês" }), h("b", { text: String(r.ativos_no_mes) })),
      h("div", { class: "linha" }, h("span", { text: "Sua parte neste mês" }), h("b", { text: `${r.faixa_pct}%` })),
      explica("Como chego a 65%?", `Com 10 ou mais pacientes com mensalidade paga no mês, a sua parte sobe para 65% no mês seguinte.${r.faltam_para_faixa ? ` Faltam ${r.faltam_para_faixa}.` : ""} "Pacientes com você" (o número do painel) inclui quem ainda não pagou o mês.`, "cláusulas 1.7 e 11.3")),
    blocoFech);
}

function linhaValor(rotulo, valor, explicacao = null) {
  const linha = h("div", { class: "linha" }, h("span", { class: "pequeno", text: rotulo }), h("span", { text: moeda(valor) }));
  return explicacao ? h("div", {}, linha, h("p", { class: "pequeno", text: explicacao })) : linha;
}

export async function ocorrencias(el, _p, ctx) {
  const d = await get("/api/eu/ocorrencias");
  const e = d.escada;
  trocar(el, h("h1", { text: "Advertências e sua defesa" }),
    h("p", { class: "pequeno", text: "A contagem (conversa, advertência formal, justa causa) só considera ocorrências registradas depois da sua versão. Passados 90 dias sem nova ocorrência, a contagem recomeça." }),
    h("div", { class: "mcard pilha" },
      h("div", { class: "linha" }, h("span", { text: "Registradas" }), h("b", { text: String(e.registradas) })),
      e.ultima ? h("div", { class: "linha pequeno" }, h("span", { text: `Última: ${dataBR(e.ultima)}` }), h("span", { text: e.zera_em ? `a contagem recomeça em ${dataBR(e.zera_em)}` : "contagem já recomeçou" })) : null),
    d.ocorrencias.length ? d.ocorrencias.map((o) => {
      const defesa = o.eventos.find((x) => x.tipo === "defesa");
      const decisao = [...o.eventos].reverse().find((x) => x.tipo === "decisao");
      const c = h("div", { class: "card" },
        h("div", { class: "linha topo-al" }, h("b", { text: o.tipo_legivel }), pill(o.situacao_legivel, o.situacao === "registrada" ? "r" : "w")),
        h("p", { class: "pequeno", text: `Fato em ${dataBR(o.data_fato)}${o.aviso_em ? ` · aviso em ${dataBR(o.aviso_em)}` : ""}${o.prazo_defesa ? ` · sua versão até ${dataBR(o.prazo_defesa)}` : o.situacao === "aguardando_aviso" ? " · o prazo começa quando a clínica registrar o aviso escrito" : " · neste caso o contrato não prevê prazo de defesa"}` }),
        h("p", { text: o.fato }),
        defesa ? h("div", { class: "alerta b" }, h("b", { text: "Sua versão" }), defesa.texto) : null,
        decisao ? h("div", { class: "alerta" }, h("b", { text: `Decisão: ${o.situacao_legivel}${decisao.degrau_aplicado ? ` (${decisao.degrau_aplicado === "advertencia" ? "advertência formal" : decisao.degrau_aplicado.replace("_", " ")})` : ""}` }), decisao.texto || "") : null);
      if (o.pode_defender) {
        c.append(formulario({ travarAoConcluir: true }, async (fd) => {
          await post(`/api/eu/ocorrencias/${o.id}/defesa`, { texto: fd.get("texto") });
          aviso("Sua versão foi anexada.");
          ctx.recarregar();
        }, campo("Sua versão (sem conteúdo clínico)", h("textarea", { class: "entrada", name: "texto", required: true, minlength: "5", maxlength: "4000" })),
        h("button", { type: "submit", class: "btn", text: "Enviar minha versão" })));
      }
      return c;
    }) : vazio("Nenhuma ocorrência."));
}

export async function leituras(el) {
  const lista = await get("/api/eu/leituras");
  trocar(el, h("h1", { text: "Leituras do responsável técnico" }),
    h("p", { class: "pequeno", text: `Cada vez que ${rotuloRT()} abre um registro clínico de paciente seu(sua), o motivo fica registrado e aparece aqui.` }),
    lista.length ? lista.map((l) => h("div", { class: "mcard" },
      h("div", { class: "linha" }, h("b", { text: l.paciente }), h("span", { class: "pequeno", text: dataHoraBR(l.em) })),
      h("p", { class: "pequeno", text: `Motivo: ${l.motivo}` }))) : vazio("Nenhuma leitura registrada."));
}

export async function conta(el, _p, ctx) {
  const sessoes = await get("/api/auth/sessoes");
  const status = h("p", { class: "pequeno", role: "status" });
  // Rodada 2 (M4/B4): a frase nova é GERADA (6 palavras; admin/RT 7, piso do build). Não se escolhe frase.
  const gerada = await campoFraseGerada(ctx.usuario.papel === "admin" ? "admin" : "associado", "Nova frase-senha (criada pela plataforma)");
  const form = formulario(async (fd, f) => {
    const atual = String(fd.get("atual") || "");
    const nova = gerada.valor();
    status.className = "carregando"; status.textContent = "Refazendo sua chave neste aparelho...";
    try {
      const eu = await get("/api/auth/eu");
      const s = await cripto.obterSodium();
      const velhas = await cripto.derivarChaves(atual, eu.chaves.sal, eu.chaves.ops, eu.chaves.mem);
      let privada;
      try {
        privada = await cripto.desembrulhar(eu.chaves.privada_embrulhada, velhas.embrulho,
          { ops: eu.chaves.ops, mem: eu.chaves.mem, sal: eu.chaves.sal });
      } catch (_) { throw new Error("Frase-senha atual incorreta."); }
      // Achado 15: a frase nova usa os parâmetros VIGENTES (>= piso fixo) e o bloco leva esses parâmetros; o servidor
      // grava o que veio no bloco.
      const novas = await cripto.pacoteNovaFrase(nova, privada, eu.kdf);
      await post("/api/auth/trocar-frase", { chave_login_atual: cripto.b64(velhas.login), totp: String(fd.get("totp")).replace(/\D/g, ""),
        ...novas });
      s.memzero(privada); s.memzero(velhas.embrulho);
      f.reset();
      gerada.limpar();
      aviso("Frase-senha trocada. As outras sessões foram encerradas.");
    } finally { status.className = "pequeno"; status.textContent = ""; }
  },
  campo("Frase-senha atual", entrada({ type: "password", name: "atual", autocomplete: "current-password", required: true })),
  gerada.el,
  campo("Código de 6 números do app autenticador", entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", required: true, maxlength: "7" })),
  h("button", { type: "submit", class: "btn", text: "Trocar frase-senha" }), status);
  const extCofre = ext.obter("destravar-cofre");
  const zonaCofre = h("div");
  if (extCofre) extCofre(zonaCofre, { cripto, usuario: ctx.usuario, recarregar: ctx.recarregar });
  else zonaCofre.append(h("p", { class: "pequeno", text: cripto.cofre.privada ? "Sua chave está aberta só na memória desta aba." : "Sua chave não está aberta nesta aba." }));
  trocar(el, h("h1", { text: "Conta e segurança" }),
    h("h2", { text: "Aparelhos com sessão aberta" }),
    sessoes.map((s) => h("div", { class: "mcard" }, h("div", { class: "linha" },
      h("span", {}, h("b", { text: resumoAparelho(s.agente) }), h("br"), h("span", { class: "pequeno", text: `último uso ${dataHoraBR(s.ultimo_uso)}` })),
      s.atual ? pill("este aparelho", "g") : botao("Encerrar", async () => { await post(`/api/auth/sessoes/${s.id}/encerrar`); aviso("Sessão encerrada."); ctx.recarregar(); }, "btn mini ghost")))),
    h("h2", { text: "Sua chave" }),
    zonaCofre,
    h("h2", { text: "Trocar frase-senha" }), h("div", { class: "card" }, form));
}

export async function mais(el) {
  const reunioes = await get("/api/eu/reunioes");
  const item = (href, rot, desc) => h("a", { class: "mcard clicavel", href }, h("b", { text: rot }), h("p", { class: "pequeno", text: desc }));
  trocar(el, h("h1", { text: "Mais" }),
    item("#/ocorrencias", "Advertências e sua defesa", "Ocorrências do contrato e o espaço para a sua versão."),
    item("#/leituras", "Leituras do responsável técnico", "Quem abriu registro clínico dos(as) seus(suas) pacientes e por quê."),
    item("#/conta", "Conta e segurança", "Aparelhos conectados, sua chave e troca de frase-senha."),
    h("h2", { text: "Reuniões quinzenais" }),
    reunioes.length ? reunioes.map((r) => h("div", { class: "mcard linha" }, h("span", { text: `${DIAS_SEMANA[new Date(`${r.data}T12:00:00`).getDay()]}, ${dataBR(r.data)}` }), pill(r.hora))) : vazio("Nenhuma reunião marcada."));
}
