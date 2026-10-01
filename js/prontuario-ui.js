// Interface do prontuário cifrado (Fase 2). Texto decifrado entra na tela só por textContent (Trusted Types).
// Nada clínico é gravado no aparelho: sem localStorage, sem IndexedDB, respostas da API com no-store,
// rascunho cifrado só em memória (cofre-sessao.js).
// Rodada 3 (personas e conformidade): linguagem simples ("protegido", "repassar o acesso"), confirmação antes de exportar
// com finalidade e destinatário, documentos emitidos e instrumentos de avaliação, campos novos da identificação, cancelar
// na retificação, aba Acessos sem repetição. A parte de cripto (salvar, carregar, autoria) não mudou.
import { h, trocar, aviso, campo, entrada, formulario, segmentado, botao, pill, vazio, dataBR, dataHoraBR, hojeISO, SEM_CORRETOR,
  selecao, confirmar, resumoAparelho, rotuloRT } from "./ui.js";
import { get, post } from "./api.js";
import * as cripto from "./cripto.js";
import * as cc from "./cofre-cripto.js";
import * as M from "./prontuario-modelo.js";
import * as sessao from "./cofre-sessao.js";
import * as certs from "./certificados.js";

// ---------------------------------------------------------------- chave da pessoa (abrir de novo depois de recarregar)

export function formAbrirChave(aoAbrir, texto = "Sua chave não está aberta nesta aba (ela fecha sozinha por segurança). Digite a frase-senha para abrir de novo.") {
  const status = h("p", { class: "pequeno", role: "status" });
  const frase = entrada({ type: "password", name: "frase", autocomplete: "current-password", required: true });
  return h("div", { class: "caixa-cifrada" }, h("p", { class: "pequeno", text: texto }), formulario(async (fd) => {
    status.className = "carregando"; status.textContent = "Abrindo sua chave neste aparelho...";
    try {
      const eu = await get("/api/auth/eu");
      const s = await cripto.obterSodium();
      const { login, embrulho } = await cripto.derivarChaves(String(fd.get("frase") || ""), eu.chaves.sal, eu.chaves.ops, eu.chaves.mem);
      s.memzero(login);
      try { await cripto.abrirCofre(eu.chaves, embrulho); } catch (_) { throw new Error("Frase-senha incorreta."); } finally { s.memzero(embrulho); }
      frase.value = "";
      aviso("Chave aberta nesta aba.");
      await aoAbrir();
    } finally { status.className = "pequeno"; status.textContent = ""; }
  }, campo("Frase-senha", frase), h("button", { type: "submit", class: "btn mini", text: "Abrir minha chave" }), status));
}

// ---------------------------------------------------------------- chaves públicas, gravação e leitura

// Rodada 2 (A2): os destinatários de cada registro novo são decididos AQUI (certificados.destinatariosConfiaveis): eu
// (pública calculada da minha privada), o RT e a mestra fixados no build e, só na anotação do RT, o(a) responsável com
// certificado do RT. Um "responsável" a mais, uma pública trocada ou uma mestra diferente vindos do servidor são recusados.
export async function chavesPara(pid, leituraId = null) {
  return get(`/api/cofre/pacientes/${pid}/chaves${leituraId ? `?leitura_id=${leituraId}` : ""}`);
}

export async function salvarRegistro({ pid, usuario, tipo, dados, extra = {}, leituraId = null }) {
  certs.exigirRaiz();
  if (!cripto.cofre.assinaturaConfere) {
    throw new Error(`Sua chave de assinatura no servidor não confere com a deste aparelho. Nada foi salvo. Avise ${rotuloRT()}.`);
  }
  const ch = await chavesPara(pid, leituraId);
  const { destinatarios, mestra } = await certs.destinatariosConfiaveis(ch, usuario);
  // Rodada 2 (B2): carimbo do aparelho e data de referência entram na assinatura (o servidor não muda a data mostrada).
  const corpo = { ...(await cc.cifrarRegistro({ tipo, dados, pacienteId: Number(pid), autorId: usuario.id, destinatarios, mestra })),
    ...extra, em_cliente: new Date().toISOString() };
  // Autoria: a nota sai deste aparelho ASSINADA com a sua chave Ed25519 (o servidor e quem lê conferem).
  corpo.assinatura = await cc.assinarRegistro(corpo, Number(pid), usuario.id, cripto.cofre.privada);
  return post(`/api/cofre/pacientes/${pid}/registros`, { ...corpo, leitura_id: leituraId || undefined });
}

// via "pessoal" usa a chave da pessoa (memória da aba); via "mestra" recebe { publica, privada } da chave-mestra.
// euId: id de quem está logado(a) (da sessão do app, não da resposta do servidor).
// Rodada 2 (A1): a assinatura de cada registro só vale com chave certificada pelo RT fixado no build (ou a do RT fixado,
// ou a minha, derivada da minha privada). A pública que vem na própria linha NÃO basta.
export async function carregar(pid, { leituraId = null, mestra = null, euId = null } = {}) {
  certs.exigirRaiz();
  const q = new URLSearchParams();
  if (leituraId) q.set("leitura_id", leituraId);
  if (mestra) { q.set("via", "mestra"); if (mestra.versao) q.set("mestra_versao", mestra.versao); }
  const resp = await get(`/api/cofre/pacientes/${pid}/prontuario${q.toString() ? `?${q}` : ""}`);
  const pub = mestra ? mestra.publica : cripto.cofre.publica;
  const priv = mestra ? mestra.privada : cripto.cofre.privada;
  const aceitas = await certs.chavesDeAutoria(resp, mestra ? null : euId);
  const regs = [];
  for (const r of resp.registros) {
    const base = { ...r, dados: null, estado: r.descartado ? "descartado" : r.envelope ? "ok" : "sem_chave" };
    if (!r.descartado) {
      const ok = r.assinatura_ok !== false && await cc.verificarAssinatura(r, Number(pid), aceitas.get(Number(r.autor_id)) || []);
      if (!ok) base.estado = "assinatura_invalida";
    }
    // B2: a data mostrada é a ASSINADA (data_ref); se a do servidor (sessão) divergir, a tela aponta.
    base.data_diverge = Boolean(r.tipo === "evolucao" && r.sessao_data && r.data_ref && r.sessao_data !== r.data_ref);
    if (base.estado === "ok") {
      try { base.dados = await cc.decifrarRegistro(r, Number(pid), pub, priv); } catch (_) { base.estado = "erro"; }
    }
    delete base.cifra; delete base.envelope;
    regs.push(base);
  }
  return { resp, regs, modelo: M.organizar(regs) };
}

// ---------------------------------------------------------------- exportação (gerada no navegador, registrada no log antes)

function baixar(texto, nome, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = h("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function paraDom(no) {
  if (typeof no === "string" || typeof no === "number") return document.createTextNode(String(no));
  const [tag, attrs, ...filhos] = no;
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const f of filhos) el.append(paraDom(f));
  return el;
}

export function imprimirArvore(arvore) {
  const area = h("div", { class: "area-impressao" }, paraDom(arvore));
  document.body.append(area);
  document.body.classList.add("imprimindo");
  const fim = () => { area.remove(); document.body.classList.remove("imprimindo"); window.removeEventListener("afterprint", fim); };
  window.addEventListener("afterprint", fim);
  window.print();
  setTimeout(fim, 60000);
}

// Rodada 3 (conformidade A4): por que e para quem sai a cópia. Fica no registro da exportação.
export const FINALIDADES = [["uso_profissional", "Uso profissional (consulta minha)"], ["pedido_titular", "Pedido do(a) paciente (titular dos dados)"],
  ["transferencia", "Transferência de atendimento"], ["ordem_judicial", "Ordem judicial"], ["crp", "Pedido do Conselho (CRP)"], ["outro", "Outro"]];

// Rodada 3 (persona associada A8): antes de gerar, uma folha de confirmação explica o risco e pede a finalidade.
export async function exportar(pid, estado, formato, usuario) {
  const p = estado.resp.paciente;
  let r = null;
  let escolha = null;
  const ok = await confirmar({
    titulo: formato === "html" ? "Baixar o prontuário" : "Imprimir ou salvar em PDF",
    texto: `Você vai gerar uma cópia do prontuário de ${p.codigo} SEM proteção. Ela fica no seu aparelho (no celular, a pasta de downloads `
      + "costuma ir para a nuvem) e sai do controle da plataforma. Fica registrado quem gerou, quando e para quê.",
    campos: [campo("Para que é a cópia", selecao("finalidade", FINALIDADES)),
      campo("Para quem vai (se não for só para você)", entrada({ name: "destinatario", maxlength: "120" }), "Ex.: o(a) próprio(a) paciente, o(a) novo(a) psicólogo(a), o juízo.")],
    textoConfirmar: formato === "html" ? "Baixar a cópia" : "Abrir para imprimir",
    aoConfirmar: async (v) => {
      escolha = v;
      r = await post(`/api/cofre/pacientes/${pid}/exportacoes`, { formato, registros: estado.regs.length,
        leitura_id: estado.leituraId || undefined, via: estado.mestra ? "mestra" : "pessoal",
        finalidade: v.finalidade || "uso_profissional", destinatario: v.destinatario || "" });
    },
  });
  if (!ok || !r) return;
  const meta = { codigo: p.codigo, plano: p.plano, exportacao_id: r.id, exportado_em: r.em, por: usuario.nome,
    clinica: estado.resp.clinica, autores_info: estado.resp.autores_info, finalidade: r.finalidade, destinatario: r.destinatario || (escolha && escolha.destinatario) };
  if (formato === "html") {
    baixar(M.documentoHtml(estado.modelo, meta), `prontuario-${p.codigo}-${hojeISO()}.html`, "text/html;charset=utf-8");
    aviso("Cópia gerada neste aparelho e registrada. Guarde com sigilo e apague quando não precisar mais.");
  } else {
    imprimirArvore(M.arvoreDocumento(estado.modelo, meta));
  }
}

// ---------------------------------------------------------------- anexos (termo, documento, instrumento)

async function lerAnexo(input, codigo, data, prefixo) {
  const f = input.files && input.files[0];
  if (!f) return null;
  if (f.size > 3 * 1024 * 1024) throw new Error("Arquivo acima de 3 MB.");
  // B6: só PDF, PNG ou JPEG (conferido pelo conteúdo); o nome vira um nome seguro definido pela plataforma.
  const bytes = new Uint8Array(await f.arrayBuffer());
  const tipoReal = M.tipoDoConteudo(bytes);
  if (!tipoReal) throw new Error("Anexo só em PDF, PNG ou JPEG.");
  return { nome: M.anexoSeguro({ tipo: tipoReal }, codigo, data, prefixo).nome, tipo: tipoReal, b64: cripto.b64(bytes) };
}

// ---------------------------------------------------------------- componentes

export function camposLidos(tipo, dados, opcoes = {}) {
  if (!dados) return [h("p", { class: "pequeno", text: "Conteúdo indisponível." })];
  if (tipo === "evolucao" || tipo === "anotacao_rt") return [h("p", { class: "texto-clinico", text: dados.texto || "" })];
  const out = [];
  for (const [k, rot, t, , opc] of (M.CAMPOS[tipo] || [])) {
    const v = dados[k];
    if (v === undefined || v === null || v === "" || v === false) continue;
    out.push(h("div", { class: "campo-lido" }, h("span", { class: "rotulo", text: rot }),
      h("div", { class: "texto-clinico", text: M.valorLegivel(t, v, opc) })));
  }
  if (dados.arquivo && M.COM_ANEXO.has(tipo)) {
    // Rodada 2 (B6): tipo e nome do arquivo baixado são definidos AQUI, nunca pelo que veio no registro.
    const anexo = M.anexoSeguro(dados.arquivo, opcoes.codigo, dados.data || dados.data_emissao || dados.data_aplicacao, tipo);
    out.push(h("div", { class: "acoes-linha" }, botao(`Baixar anexo (${anexo.nome})`, () => {
      baixar(cripto.deB64(dados.arquivo.b64), anexo.nome, anexo.tipo);
    }, "btn mini ghost")));
  }
  return out.length ? out : [h("p", { class: "pequeno", text: "Sem conteúdo." })];
}

export function cartaoItem(it, tipo, titulo, opcoes = {}) {
  const r = it.reg;
  const c = h("div", { class: `mcard nota${it.retificacoes.length ? " retificada" : ""}${tipo === "anotacao_rt" ? " anotacao" : ""}` },
    h("div", { class: "linha pequeno" }, h("span", { text: titulo }),
      h("span", {}, it.retificacoes.length ? pill("retificada", "w") : null, r.data_diverge ? pill("data divergente", "r") : null,
        " ", r.autor_nome || "")));
  if (r.em_cliente && r.estado === "ok") c.append(h("p", { class: "pequeno", text: `Assinada no aparelho em ${dataHoraBR(r.em_cliente)}.` }));
  if (r.data_diverge) {
    c.append(h("p", { class: "pequeno", text: `A data assinada (${dataBR(r.data_ref)}) é diferente da data da sessão no servidor (${dataBR(r.sessao_data)}). Avise ${rotuloRT()}.` }));
  }
  if (r.estado === "descartado") c.append(h("p", { class: "pequeno", text: "Descartado no fim da guarda de 5 anos." }));
  else if (r.estado === "sem_chave") c.append(h("p", { class: "pequeno", text: `Você ainda não tem acesso a este registro (aguardando ${rotuloRT()} repassar o acesso).` }));
  else if (r.estado === "erro") c.append(h("p", { class: "pequeno", text: `Não deu para abrir este registro. Avise ${rotuloRT()}.` }));
  else if (r.estado === "assinatura_invalida") c.append(h("div", { class: "alerta r" }, h("b", { text: "Registro bloqueado" }),
    `A assinatura de autoria não confere: o conteúdo não é mostrado. ${rotuloRT().replace(/^o /, "O ")} foi avisado.`));
  else if (it.retificacoes.length) {
    c.append(h("div", { class: "risco" }, camposLidos(tipo, it.original, opcoes)));
    for (const x of it.retificacoes) {
      if (!x.dados) continue;
      c.append(h("div", { class: "retificacao" }, camposLidos(tipo, x.dados.conteudo, opcoes),
        h("p", { class: "pequeno", text: `Retificação por ${x.autor_nome || ""} em ${dataHoraBR(x.em_cliente || x.em)} · motivo: ${x.dados.motivo || ""}` })));
    }
  } else c.append(...camposLidos(tipo, it.original, opcoes));
  if (it.ignoradas && it.ignoradas.length) {
    c.append(h("div", { class: "alerta r" }, h("b", { text: "Retificação ignorada" }),
      `${it.ignoradas.length} retificação(ões) de outra pessoa aponta(m) para este registro. Só quem escreveu retifica; não foi aplicada. Avise ${rotuloRT()}.`));
  }
  if (opcoes.acoes && opcoes.acoes.length) c.append(h("div", { class: "acoes-linha" }, opcoes.acoes));
  return c;
}

// Editor rápido de texto clínico: rascunho cifrado em memória a cada pausa, Ctrl+Enter salva, atalhos de seção.
export function editorTexto({ rotulo, rascunho, aoSalvar, textoBotao = "Salvar nota protegida", inicial = "", atalhos = true, extraAcima = null, aoCancelar = null }) {
  // Rodada 2 (M3): sem corretor ortográfico (o do Edge/Chrome aprimorado manda o texto para a nuvem, em claro).
  const area = h("textarea", { class: "entrada nota-texto", rows: "6", "aria-label": rotulo, ...SEM_CORRETOR });
  area.value = inicial;
  const estado = h("p", { class: "pequeno rascunho", role: "status", "aria-live": "polite", text: "Rascunho só na memória desta aba, cifrado. Nada fica gravado no aparelho." });
  const contador = h("span", { class: "pequeno", text: "" });
  let espera = null;
  const ajustar = () => {
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight + 2, 640)}px`;
    const n = area.value.trim() ? area.value.trim().split(/\s+/).length : 0;
    contador.textContent = n ? `${n} palavra${n > 1 ? "s" : ""}` : "";
  };
  area.addEventListener("input", () => {
    ajustar();
    clearTimeout(espera);
    espera = setTimeout(async () => {
      const em = await sessao.guardarRascunho(rascunho, area.value);
      estado.textContent = em ? `Rascunho cifrado nesta aba às ${em.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` : "Rascunho vazio.";
    }, 700);
  });
  sessao.lerRascunho(rascunho).then((t) => {
    if (t && !area.value) { area.value = t; ajustar(); estado.textContent = "Rascunho recuperado desta aba."; }
  });
  const salvar = botao(textoBotao, async () => {
    const texto = area.value.trim();
    if (texto.length < 3) throw new Error("Escreva a nota antes de salvar.");
    await aoSalvar(texto);
    clearTimeout(espera);
    sessao.apagarRascunho(rascunho);
    area.value = "";
    ajustar();
  });
  area.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar.click(); } });
  const chips = atalhos ? h("div", { class: "chips" }, ["Relato", "Intervenção", "Observação clínica", "Plano"].map((c) => {
    const b = h("button", { type: "button", class: "chip", text: c });
    b.addEventListener("click", () => {
      const pre = area.value && !area.value.endsWith("\n") ? "\n" : "";
      area.value += `${pre}${c}: `;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
      area.dispatchEvent(new Event("input"));
    });
    return b;
  })) : null;
  setTimeout(ajustar, 0);
  return h("div", { class: "editor" }, extraAcima, h("label", { class: "campo" }, h("span", { class: "rotulo", text: rotulo }), area),
    chips, h("div", { class: "linha" }, estado, contador), salvar,
    aoCancelar ? h("button", { type: "button", class: "btn ghost", text: "Cancelar", onclick: aoCancelar }) : null,
    h("p", { class: "pequeno dica-teclado so-teclado", text: "No computador: Ctrl+Enter salva." }));
}

// Formulário para os itens estruturados (identificação, demanda, procedimento, encaminhamento, encerramento, documento,
// instrumento). Rodada 3: listas de opções, marca de sim ou não e anexo cifrado (documento e instrumento).
export function formEstruturado(tipo, { inicial = null, comMotivo = false, textoBotao = "Salvar protegido", aoSalvar, aoCancelar = null, codigo = "" }) {
  const entradas = {};
  const filhos = M.CAMPOS[tipo].map(([k, rot, t, obrig, opcoes]) => {
    let el;
    if (t === "area") el = h("textarea", { class: "entrada", name: k, rows: "3", ...SEM_CORRETOR });
    else if (t === "opcoes") el = selecao(k, [["", "Escolha..."], ...opcoes]);
    else if (t === "marca") el = h("input", { type: "checkbox", name: k });
    else el = entrada({ type: t === "data" ? "date" : "text", name: k, ...SEM_CORRETOR });
    if (inicial && inicial[k] !== undefined && inicial[k] !== null) { if (t === "marca") el.checked = Boolean(inicial[k]); else el.value = inicial[k]; }
    entradas[k] = [el, obrig, rot, t];
    if (t === "marca") return h("label", { class: "marcar" }, el, rot);
    return campo(obrig ? rot : `${rot} (opcional)`, el);
  });
  const anexo = M.COM_ANEXO.has(tipo) && tipo !== "termo"
    ? h("input", { type: "file", class: "entrada", accept: "application/pdf,image/png,image/jpeg", name: "arquivo" }) : null;
  const motivo = comMotivo ? entrada({ name: "motivo", required: true, maxlength: "300", ...SEM_CORRETOR }) : null;
  return formulario(async () => {
    const dados = {};
    for (const [k, [el, obrig, rot, t]] of Object.entries(entradas)) {
      if (t === "marca") { if (el.checked) dados[k] = true; continue; }
      const v = el.value.trim();
      if (obrig && !v) throw new Error(`Preencha: ${rot}.`);
      if (v) dados[k] = v;
    }
    if (tipo === "identificacao" && dados.menor_idade && !dados.responsavel_legal) {
      throw new Error("Menor de idade: preencha o(a) responsável legal (o termo também precisa ser aceito por ele(a)).");
    }
    if (anexo) {
      const arq = await lerAnexo(anexo, codigo, dados.data_emissao || dados.data_aplicacao || hojeISO(), tipo);
      if (arq) dados.arquivo = arq;
      else if (inicial && inicial.arquivo) dados.arquivo = inicial.arquivo;
    }
    if (comMotivo && (motivo.value.trim().length < 3)) throw new Error("Escreva o motivo da retificação.");
    await aoSalvar(dados, comMotivo ? motivo.value.trim() : null);
  }, filhos,
  anexo ? campo("Arquivo (opcional: PDF ou foto, até 3 MB; protegido antes de sair do aparelho)", anexo) : null,
  comMotivo ? campo("Motivo da retificação (a versão original continua visível)", motivo) : null,
  h("div", { class: "acoes-linha" }, h("button", { type: "submit", class: "btn", text: textoBotao }),
    aoCancelar ? h("button", { type: "button", class: "btn ghost", text: "Cancelar", onclick: aoCancelar }) : null));
}

// Rodada 3 (persona associada B3): o termo assinado em papel ou pelo gov.br é anexado aqui, no cartão único do termo
// (tela do(a) paciente). O arquivo é cifrado neste aparelho e vira um registro do prontuário; o servidor grava o aceite.
export function formTermoAnexo(el, { paciente, usuario, versao, aoTerminar }) {
  const desenhar = () => {
    if (!cripto.cofre.privada) { trocar(el, formAbrirChave(async () => desenhar())); return; }
    const data = entrada({ type: "date", name: "data", value: hojeISO(), max: hojeISO(), required: true });
    const arquivo = h("input", { type: "file", class: "entrada", accept: "application/pdf,image/png,image/jpeg", name: "arquivo", required: true });
    const confirma = h("input", { type: "checkbox", name: "assinado", required: true });
    confirma.dataset.rotulo = "O termo foi assinado pelo(a) paciente";
    arquivo.dataset.rotulo = "Arquivo do termo assinado";
    trocar(el, formulario({ travarAoConcluir: true }, async () => {
      const arq = await lerAnexo(arquivo, paciente.codigo, data.value, "termo");
      if (!arq) throw new Error("Escolha o arquivo do termo assinado.");
      await salvarRegistro({ pid: paciente.id, usuario, tipo: "termo",
        dados: { data: data.value, forma: "via assinada anexada", versao_texto: versao || "", arquivo: arq },
        extra: { termo_data: data.value, data_ref: data.value } });
      aviso("Termo assinado anexado e protegido.");
      if (aoTerminar) await aoTerminar();
    }, campo("Data da assinatura", data), campo("Arquivo do termo assinado (PDF ou foto, até 3 MB)", arquivo),
    h("label", { class: "marcar" }, confirma, "O termo foi assinado pelo(a) paciente (ou pelo(a) responsável legal, se menor de idade)."),
    h("button", { type: "submit", class: "btn", text: "Anexar termo assinado" })));
  };
  desenhar();
}

// ---------------------------------------------------------------- prontuário completo (associado(a), RT e mestra)

export async function montarProntuario(el, ctx) {
  const pid = Number(ctx.paciente.id);
  const eu = ctx.usuario;
  const souResp = ctx.admin ? ctx.paciente.associado_id === eu.id : true;
  const est = { aba: "sessoes", leituraId: ctx.leituraId || null, mestra: ctx.mestra || null };

  const cabeca = h("div", { class: "linha" }, h("h2", { text: "Prontuário" }), pill(souResp && !est.mestra ? "protegido: só você lê" : "protegido", "k"));
  const corpo = h("div");
  trocar(el, h("section", { class: "card prontuario" }, cabeca, corpo));

  async function iniciar() {
    if (!est.mestra && !cripto.cofre.privada) {
      trocar(corpo, formAbrirChave(iniciar, sessao.rascunhoSelado()
        ? "Seu rascunho está guardado cifrado. Digite a frase-senha para abrir a sua chave e continuar."
        : undefined));
      return;
    }
    if (!souResp && !est.mestra) {
      const l = sessao.leituraValida(pid);
      if (!l) { pedirMotivo(); return; }
      est.leituraId = l.id;
    }
    trocar(corpo, h("p", { class: "carregando", text: "Abrindo neste aparelho..." }));
    Object.assign(est, await carregar(pid, { leituraId: est.leituraId, mestra: est.mestra, euId: eu.id }));
    desenhar();
    await avisarEnvelopesDefeituosos();
  }

  // Rodada 2 (B5): na leitura do RT ou com a mestra, envelope que existe mas não abre vira alerta crítico.
  async function avisarEnvelopesDefeituosos() {
    if (souResp && !est.mestra) return;
    const ruins = est.regs.filter((r) => r.estado === "erro").map((r) => r.id);
    if (!ruins.length || !eu.rt) return;
    try { await post(`/api/cofre/pacientes/${pid}/envelopes-com-defeito`, { registros: ruins, via: est.mestra ? "mestra" : "rt" }); } catch (_) { /* segue */ }
    aviso(`${ruins.length} registro(s) não abriram com a sua chave: alerta registrado.`, "erro");
  }

  function pedirMotivo() {
    const motivo = h("textarea", { class: "entrada", name: "motivo", rows: "2", required: true, minlength: "10", maxlength: "500", ...SEM_CORRETOR });
    trocar(corpo, h("div", { class: "alerta b" }, h("b", { text: "Leitura clínica do responsável técnico" }),
      "O motivo fica registrado e aparece para o(a) profissional responsável. A leitura vale 30 minutos. Leia só o necessário (Código de Ética, art. 6º)."),
    formulario(async (fd) => {
      const texto = String(fd.get("motivo") || "").trim();
      if (texto.length < 10) throw new Error("Escreva o motivo (10 caracteres ou mais).");
      const r = await post("/api/admin/leituras", { paciente_id: pid, motivo: texto, recurso: "prontuario" });
      sessao.leituras.set(pid, { id: r.leitura_id, ate: new Date(Date.now() + r.valida_por_min * 60000).toISOString() });
      await iniciar();
    }, campo("Motivo da leitura", motivo), h("button", { type: "submit", class: "btn", text: "Registrar motivo e abrir" })));
  }

  const recarregar = async () => { Object.assign(est, await carregar(pid, { leituraId: est.leituraId, mestra: est.mestra, euId: eu.id })); desenhar(); };
  const podeEscrever = souResp && !est.mestra;
  const gravar = async (tipo, dados, extra = {}) => {
    await salvarRegistro({ pid, usuario: eu, tipo, dados, extra, leituraId: souResp ? null : est.leituraId });
    aviso("Salvo e protegido neste aparelho.");
    await recarregar();
  };

  function botaoRetificar(it, tipo, trocarPor, voltar) {
    if (!podeEscrever || it.reg.autor_id !== eu.id || it.reg.estado !== "ok") return null;
    const b = h("button", { type: "button", class: "btn mini ghost", text: "Retificar" });
    b.addEventListener("click", () => {
      const aoSalvar = async (conteudo, motivo) => gravar("retificacao", { motivo, conteudo }, { retifica_id: it.reg.id });
      let form;
      if (tipo === "evolucao" || tipo === "anotacao_rt") {
        const motivo = entrada({ name: "motivo", maxlength: "300", ...SEM_CORRETOR });
        form = editorTexto({ rotulo: "Texto corrigido (a versão original continua visível)", rascunho: `retif:${it.reg.id}`,
          inicial: it.atual ? it.atual.texto || "" : "", atalhos: tipo === "evolucao", textoBotao: "Salvar retificação",
          extraAcima: campo("Motivo da retificação", motivo), aoCancelar: voltar,
          aoSalvar: async (texto) => {
            if (motivo.value.trim().length < 3) throw new Error("Escreva o motivo da retificação.");
            await aoSalvar({ texto }, motivo.value.trim());
          } });
      } else form = formEstruturado(tipo, { inicial: it.atual, comMotivo: true, textoBotao: "Salvar retificação", aoSalvar, aoCancelar: voltar,
        codigo: est.resp.paciente.codigo });
      trocarPor(h("div", { class: "mcard" }, h("b", { text: "Retificar (nada se apaga)" }), form));
    });
    return b;
  }

  function lista(itens, tipo, titulo) {
    return itens.map((it) => {
      let atual = null;
      const trocarPor = (novo) => { atual.replaceWith(novo); atual = novo; };
      const montar = () => {
        const b = botaoRetificar(it, tipo, trocarPor, () => trocarPor(montar()));
        return cartaoItem(it, tipo, titulo(it), { acoes: [b].filter(Boolean), codigo: est.resp.paciente.codigo });
      };
      atual = montar();
      return atual;
    });
  }

  function abaSessoes() {
    const partes = [];
    if (podeEscrever) {
      for (const s of est.resp.sessoes_sem_nota.slice().reverse()) {
        const box = h("div", { class: "alerta" }, h("b", { text: `Sessão de ${dataBR(s.data)} às ${s.hora} sem nota` }),
          s.prazo ? `Prazo de 48h: ${dataHoraBR(s.prazo)}.` : "");
        const b = h("button", { type: "button", class: "btn mini", text: "Escrever nota" });
        b.addEventListener("click", () => {
          box.replaceWith(h("div", { class: "mcard" }, h("b", { text: `Nota da sessão de ${dataBR(s.data)}` }),
            editorTexto({ rotulo: "Evolução da sessão", rascunho: `evolucao:${pid}:${s.raiz}`,
              aoSalvar: (texto) => gravar("evolucao", { texto }, { sessao_raiz_id: s.raiz, data_ref: s.data }) })));
        });
        box.append(h("div", { class: "acoes" }, b));
        partes.push(box);
      }
    }
    if (eu.rt && !souResp && !est.mestra) {
      const b = h("button", { type: "button", class: "btn mini ghost", text: "Acrescentar anotação do responsável técnico" });
      b.addEventListener("click", () => b.replaceWith(h("div", { class: "mcard anotacao" },
        editorTexto({ rotulo: "Anotação do responsável técnico (não altera a nota do(a) profissional)", rascunho: `anot:${pid}`, textoBotao: "Salvar anotação protegida",
          aoSalvar: (texto) => gravar("anotacao_rt", { texto }) }))));
      partes.push(h("div", { class: "acoes-linha" }, b));
    }
    partes.push(h("h3", { text: "Evolução" }));
    partes.push(est.modelo.evolucoes.length ? lista(est.modelo.evolucoes, "evolucao",
      (it) => `${dataBR(it.reg.data_ref || it.reg.sessao_data)} · sessão ${it.numero}`) : vazio("Nenhuma nota de sessão ainda."));
    if (est.modelo.anotacoes.length) {
      partes.push(h("h3", { text: "Anotações do responsável técnico" }), lista(est.modelo.anotacoes, "anotacao_rt", (it) => `${dataBR(it.reg.em)} · anotação`));
    }
    return partes;
  }

  function secaoFicha(tipo, titulo, itens, { multiplo = false, novo = titulo.toLowerCase() } = {}) {
    const partes = [h("h3", { text: titulo })];
    partes.push(itens.length ? lista(itens, tipo, (it) => dataBR(it.reg.data_ref || it.reg.em)) : vazio("Nada registrado."));
    if (podeEscrever && (multiplo || !itens.length)) {
      const b = h("button", { type: "button", class: "btn mini ghost", text: `Registrar ${novo}` });
      const zona = h("div", { class: "acoes-linha" }, b);
      b.addEventListener("click", () => {
        const caixa = h("div", { class: "mcard" });
        const cancelar = () => caixa.replaceWith(zona);
        const dataRef = (dados) => (tipo === "encerramento" ? dados.data : tipo === "documento" ? dados.data_emissao
          : tipo === "instrumento" ? dados.data_aplicacao : null);
        caixa.append(formEstruturado(tipo, { codigo: est.resp.paciente.codigo, aoCancelar: cancelar,
          aoSalvar: (dados) => gravar(tipo, dados, dataRef(dados) ? { data_ref: dataRef(dados) } : {}) }));
        zona.replaceWith(caixa);
      });
      partes.push(zona);
    }
    return partes;
  }

  function abaFicha() {
    const m = est.modelo;
    return [secaoFicha("identificacao", "Identificação", m.identificacao), secaoFicha("demanda", "Demanda e objetivos", m.demanda),
      secaoFicha("procedimento", "Procedimentos", m.procedimentos, { multiplo: true, novo: "procedimento" }),
      secaoFicha("encaminhamento", "Encaminhamento", m.encaminhamentos, { multiplo: true }),
      secaoFicha("encerramento", "Encerramento", m.encerramentos, { multiplo: true })];
  }

  // Rodada 3 (conformidade A2): documentos emitidos (declaração, atestado, relatório, laudo, parecer, relatório de
  // transferência) e instrumentos de avaliação, cifrados como o resto. O termo assinado aparece aqui só para leitura: ele
  // se registra no cartão único "Termo do(a) paciente" da página do(a) paciente.
  function abaDocumentos() {
    const m = est.modelo;
    return [secaoFicha("documento", "Documentos emitidos", m.documentos, { multiplo: true, novo: "documento emitido" }),
      secaoFicha("instrumento", "Instrumentos de avaliação", m.instrumentos, { multiplo: true, novo: "instrumento" }),
      h("h3", { text: "Termo assinado (anexo)" }),
      m.termos.length ? lista(m.termos, "termo", (it) => `Termo · ${dataBR(it.reg.data_ref || it.reg.em)}`)
        : vazio("Nenhum termo assinado anexado. O aceite pelo link aparece no cartão do termo, na página do(a) paciente.")];
  }

  async function abaAcessos(zona) {
    const lista_ = await get(`/api/cofre/pacientes/${pid}/acessos`);
    trocar(zona, h("p", { class: "pequeno", text: "Quem abriu, escreveu, corrigiu, baixou ou repassou o acesso a este prontuário, inclusive o responsável técnico (com o motivo)." }),
      lista_.length ? lista_.map((a) => h("div", { class: "mcard" },
        h("div", { class: "linha pequeno" }, h("b", { text: `${a.quem || "sistema"}${a.rt ? " (responsável técnico)" : ""}` }), h("span", { text: dataHoraBR(a.em) })),
        h("p", { class: "pequeno", text: `${a.acao}${a.vezes > 1 ? ` (${a.vezes} vezes em poucos minutos)` : ""} · ${resumoAparelho(a.dispositivo)}` }),
        a.motivo ? h("p", { class: "pequeno", text: `Motivo: ${a.motivo}` }) : null)) : vazio("Nenhum acesso registrado."));
  }

  function desenhar() {
    const p = est.resp.paciente;
    const m = est.modelo;
    const linhaTopo = h("p", { class: "pequeno" }, h("b", { text: m.nome || "Nome ainda não registrado" }),
      ` · ${p.codigo} · desde ${dataBR(p.criado_em)} · ${p.termo_em ? `termo aceito em ${dataBR(p.termo_em)}` : "termo pendente"}`);
    const zona = h("div");
    const abas = segmentado("Seção do prontuário", [["sessoes", "Sessões"], ["ficha", "Ficha"], ["documentos", "Documentos"], ["acessos", "Acessos"]], est.aba,
      (v) => { est.aba = v; pintar(); });
    const pintar = () => {
      if (est.aba === "acessos") { trocar(zona, h("p", { class: "carregando", text: "Carregando..." })); abaAcessos(zona).catch((e) => aviso(e.message, "erro")); return; }
      trocar(zona, est.aba === "ficha" ? abaFicha() : est.aba === "documentos" ? abaDocumentos() : abaSessoes());
    };
    const avisoModo = est.mestra ? h("div", { class: "alerta r" }, h("b", { text: "Aberto com a chave de guarda da clínica" }), "Leitura registrada. Feche a tela ao terminar.")
      : !souResp ? h("div", { class: "alerta b" }, h("b", { text: "Leitura do responsável técnico" }), `Registrada com o motivo. Vale até ${dataHoraBR(est.resp.leitura_valida_ate)}.`) : null;
    const suspeitas = m.suspeitas && m.suspeitas.length ? h("div", { class: "alerta r" }, h("b", { text: "Retificação de outra pessoa ignorada" }),
      `${m.suspeitas.length} registro(s) de retificação apontam para nota de outro(a) autor(a). Não foram aplicados. Avise ${rotuloRT()}.`) : null;
    trocar(corpo, avisoModo, suspeitas, est.resp.descartado_em ? h("div", { class: "alerta" }, h("b", { text: "Prontuário descartado" }),
      `Destruído com segurança em ${dataHoraBR(est.resp.descartado_em)} (fim da guarda).`) : null,
    linhaTopo, abas, zona,
    h("div", { class: "acoes-linha exportar" },
      botao("Imprimir ou salvar em PDF", () => exportar(pid, est, "impressao", eu), "btn mini ghost"),
      botao("Baixar arquivo (HTML)", () => exportar(pid, est, "html", eu), "btn mini ghost")),
    h("p", { class: "pequeno", text: "Gerar uma cópia fica registrado (quem, quando e para quê). A cópia sai do alcance da plataforma: guarde com sigilo." }));
    pintar();
  }

  try { await iniciar(); } catch (e) {
    trocar(corpo, h("div", { class: "alerta r" }, h("b", { text: "Não deu para abrir o prontuário." }), e.message));
  }
}

export { resumoAparelho };
