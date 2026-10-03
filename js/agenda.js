// AGENDA DA EQUIPE (só admin/RT): horários livres e agendados dos Calendly de cada profissional, numa grade da semana.
// Cores por profissional: claro = livre, cheio = agendado (com o nome do(a) paciente), cinza riscado = cancelado.
// A tela consulta a API a cada 30 s; aviso novo (agendou, remarcou, cancelou) toca um som, mostra o aviso no topo e,
// se a pessoa permitir, uma notificação do computador. A coleta no Calendly é do servidor (a cada 2 min).
import { h, trocar, aviso, botao, campo, entrada, selecao, formulario, SEM_CORRETOR, dataHoraBR, confirmar, vazio } from "./ui.js";
import { get, post } from "./api.js";
import * as ext from "./extensoes.js";

const FUSO = "America/Sao_Paulo";
const HORA_MIN = 7;
const HORA_MAX = 22;
const CORES = [["verde", "Verde"], ["azul", "Azul"], ["roxo", "Roxo"], ["laranja", "Laranja"]];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false });

const estado = { de: null, ultimoAviso: null, timer: null, titulo: null, geracao: 0 };

function diaDe(iso) { return fmtDia.format(new Date(iso)); }
function horaDe(iso) { return fmtHora.format(new Date(iso)); }
function somarDias(diaIso, n) {
  const d = new Date(`${diaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function segundaDe(diaIso) {
  const d = new Date(`${diaIso}T12:00:00Z`);
  const dw = d.getUTCDay();
  return somarDias(diaIso, dw === 0 ? -6 : 1 - dw);
}
function rotuloDia(diaIso) {
  const d = new Date(`${diaIso}T12:00:00Z`);
  return `${SEMANA[d.getUTCDay()]} ${diaIso.slice(8, 10)}/${diaIso.slice(5, 7)}`;
}

function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tocar = (freq, quando) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + quando);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + quando + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + quando + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + quando);
      o.stop(ctx.currentTime + quando + 0.4);
    };
    tocar(880, 0);
    tocar(1320, 0.18);
    setTimeout(() => ctx.close(), 1200);
  } catch (_) { /* sem som neste navegador */ }
}

function notificar(texto) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification("Agenda Conheça-TE Psi", { body: texto });
  } catch (_) { /* sem notificação */ }
}

function piscarTitulo(n) {
  if (!estado.titulo) estado.titulo = document.title;
  document.title = `(${n}) Agenda: novidade`;
  const volta = () => { document.title = estado.titulo; window.removeEventListener("focus", volta); };
  window.addEventListener("focus", volta);
}

function legenda(contas) {
  return h("div", { class: "ag-legenda" },
    contas.map((c) => h("span", { class: `ag-leg ag-c-${c.cor}` }, h("i", { class: "ag-bola" }), c.nome)),
    h("span", { class: "ag-leg" }, h("i", { class: "ag-amostra livre" }), "claro: livre"),
    h("span", { class: "ag-leg" }, h("i", { class: "ag-amostra cheio" }), "cheio: agendado"),
    h("span", { class: "ag-leg" }, h("i", { class: "ag-amostra cancelado" }), "riscado: cancelado"));
}

function grade(d, contas) {
  const porConta = Object.fromEntries(contas.map((c) => [c.id, c]));
  const dias = Array.from({ length: d.dias }, (_, i) => somarDias(d.de, i));
  const celulas = new Map(); // "dia|HH" -> [itens]
  const chave = (iso) => `${diaDe(iso)}|${horaDe(iso).slice(0, 2)}`;
  const por = (k) => { if (!celulas.has(k)) celulas.set(k, []); return celulas.get(k); };
  for (const e of d.eventos) if (porConta[e.conta_id]) por(chave(e.inicio)).push({ ...e, tipo: e.status === "cancelado" ? "cancelado" : "agendado" });
  for (const l of d.livres) if (porConta[l.conta_id]) por(chave(l.inicio)).push({ ...l, tipo: "livre" });
  const hoje = fmtDia.format(new Date());
  const linhas = [];
  linhas.push(h("div", { class: "ag-canto" }), ...dias.map((dia) => h("div", { class: `ag-cab${dia === hoje ? " hoje" : ""}`, text: rotuloDia(dia) })));
  for (let hh = HORA_MIN; hh <= HORA_MAX; hh += 1) {
    const hs = String(hh).padStart(2, "0");
    linhas.push(h("div", { class: "ag-hora", text: `${hs}h` }));
    for (const dia of dias) {
      const itens = (celulas.get(`${dia}|${hs}`) || []).sort((a, b) => (a.tipo === "livre") - (b.tipo === "livre") || a.conta_id - b.conta_id);
      linhas.push(h("div", { class: `ag-cel${dia === hoje ? " hoje" : ""}` }, itens.map((it) => {
        const c = porConta[it.conta_id];
        const hora = horaDe(it.inicio);
        if (it.tipo === "livre") return h("span", { class: `ag-item livre ag-c-${c.cor}`, title: `${c.nome}: livre às ${hora}`, text: `${c.nome} ${hora}` });
        const nome = it.paciente_nome || "paciente";
        const titulo = `${c.nome} · ${nome}${it.paciente_whatsapp ? ` · WhatsApp ${it.paciente_whatsapp}` : ""} · ${hora}${it.remarcado ? " · remarcado" : ""}`;
        return h("span", { class: `ag-item ${it.tipo} ag-c-${c.cor}`, title: titulo },
          h("b", { text: `${hora} ${c.nome}` }), h("span", { text: nome }));
      })));
    }
  }
  return h("div", { class: "ag-rolagem" }, h("div", { class: "ag-grade", dataset: { dias: String(d.dias) } }, linhas));
}

function proximos(d, contas) {
  const porConta = Object.fromEntries(contas.map((c) => [c.id, c]));
  const agora = Date.now();
  const lista = d.eventos.filter((e) => e.status !== "cancelado" && new Date(e.fim).getTime() > agora && porConta[e.conta_id]);
  if (!lista.length) return vazio("Nenhuma sessão por vir nesta semana.");
  return h("ul", { class: "ag-lista" }, lista.map((e) => {
    const c = porConta[e.conta_id];
    return h("li", { class: `ag-c-${c.cor}` }, h("i", { class: "ag-bola" }),
      h("b", { text: `${rotuloDia(diaDe(e.inicio))} ${horaDe(e.inicio)}` }), ` · ${c.nome} · ${e.paciente_nome || "paciente"}`,
      e.paciente_whatsapp ? ` · ${e.paciente_whatsapp}` : "", e.remarcado ? " · remarcado" : "");
  }));
}

function formConta(aoTerminar, conta = null) {
  const token = entrada({ name: "token", type: "password", required: true, minlength: "20", ...SEM_CORRETOR });
  return formulario(async (fd, f) => {
    await post("/api/admin/agenda/contas", { nome: String(fd.get("nome")).trim(), cor: fd.get("cor"), token: String(fd.get("token")).trim(),
      link: String(fd.get("link") || "").trim() || null });
    f.reset();
    aviso("Calendly conectado. A agenda já foi lida.");
    aoTerminar();
  },
  campo("Nome no painel", entrada({ name: "nome", required: true, value: conta ? conta.nome : "", maxlength: "40" })),
  campo("Cor", selecao("cor", CORES, conta ? conta.cor : "verde")),
  campo("Link do evento no Calendly (opcional)", entrada({ name: "link", type: "url", placeholder: "https://calendly.com/.../sessao-de-terapia" }),
    "Se a conta tiver mais de um evento, o painel usa este. Vazio: o primeiro com \"terapia\" no link."),
  campo("Token pessoal do Calendly", token,
    "No Calendly: Integrações > API e webhooks > Tokens de acesso pessoal > Gerar. Fica guardado cifrado e nunca aparece de novo."),
  h("button", { type: "submit", class: "btn", text: conta ? "Trocar token" : "Conectar" }));
}

function cartaoContas(contas, recarregar) {
  const corpo = h("div", { class: "ag-contas" });
  for (const c of contas) {
    const erro = c.ultimo_erro ? h("p", { class: "erro-botao", text: `Último problema: ${c.ultimo_erro.replace(/^\S+\s/, "")}` }) : null;
    corpo.append(h("div", { class: `ag-conta ag-c-${c.cor}` },
      h("div", { class: "linha" }, h("i", { class: "ag-bola" }), h("b", { text: c.nome })),
      h("p", { class: "pequeno", text: c.ultima_coleta_em ? `Lido em ${dataHoraBR(c.ultima_coleta_em)}` : "Ainda não lido" }),
      c.agendar_url ? h("p", { class: "pequeno" }, h("a", { href: c.agendar_url, target: "_blank", rel: "noopener noreferrer", text: "Abrir o Calendly" })) : null,
      erro,
      h("details", {}, h("summary", { text: "Trocar token" }), formConta(recarregar, c)),
      botao("Desconectar", async () => {
        const ok = await confirmar({ titulo: `Desconectar ${c.nome}?`, texto: "O token é apagado e a agenda dessa pessoa sai do painel.", textoConfirmar: "Desconectar", perigo: true });
        if (!ok) return;
        await post(`/api/admin/agenda/contas/${c.id}/desconectar`);
        aviso(`${c.nome} desconectado(a).`);
        recarregar();
      }, "btn ghost mini")));
  }
  return h("details", { class: "card", open: contas.length ? null : true },
    h("summary", { text: contas.length ? "Contas do Calendly conectadas" : "Conectar o primeiro Calendly" }),
    corpo, h("h3", { text: "Conectar outra conta" }), formConta(recarregar));
}

async function tela(el) {
  clearInterval(estado.timer);
  const minha = ++estado.geracao; // a rota pode renderizar duas vezes: só a última tela vigia
  estado.de = estado.de || segundaDe(fmtDia.format(new Date()));
  const area = h("div", { class: "ag" });
  const areaContas = h("div");
  trocar(el, h("h1", { text: "Agenda da equipe" }), area, areaContas);

  // comContas=false (atualização automática) não mexe no cartão das contas, para não apagar um token sendo digitado.
  const desenhar = async (comContas = true) => {
    const [d, av] = await Promise.all([get(`/api/admin/agenda?de=${estado.de}&dias=7`), get("/api/admin/agenda/avisos?desde_id=0")]);
    if (estado.ultimoAviso === null) estado.ultimoAviso = d.ultimo_aviso_id;
    const contas = d.contas;
    const coletas = contas.map((c) => c.ultima_coleta_em).filter(Boolean).sort();
    const nav = h("div", { class: "ag-nav" },
      botao("‹ Semana anterior", async () => { estado.de = somarDias(estado.de, -7); await desenhar(); }, "btn ghost mini"),
      botao("Esta semana", async () => { estado.de = segundaDe(fmtDia.format(new Date())); await desenhar(); }, "btn ghost mini"),
      botao("Próxima semana ›", async () => { estado.de = somarDias(estado.de, 7); await desenhar(); }, "btn ghost mini"),
      botao("Ler o Calendly agora", async () => { await post("/api/admin/agenda/coletar"); await desenhar(); aviso("Agenda atualizada."); }, "btn mini"),
      "Notification" in window && Notification.permission === "default"
        ? botao("Avisar no computador", async () => { await Notification.requestPermission(); await desenhar(); }, "btn ghost mini") : null);
    trocar(area,
      h("p", { class: "pequeno", text: `Semana de ${rotuloDia(d.de)} a ${rotuloDia(somarDias(d.de, 6))}. `
        + (coletas.length ? `Última leitura do Calendly: ${dataHoraBR(coletas[0])}. ` : "")
        + "A tela se atualiza sozinha a cada 30 segundos." }),
      nav,
      av.avisos.length ? h("div", { class: "card ag-avisos" }, h("h3", { text: "Últimos avisos" }),
        h("ul", { class: "ag-lista" }, av.avisos.slice(0, 5).map((a) => h("li", {}, h("b", { text: dataHoraBR(a.em) }), ` · ${a.texto}`)))) : null,
      contas.length ? legenda(contas) : null,
      contas.length ? grade(d, contas) : vazio("Nenhum Calendly conectado ainda. Conecte abaixo."),
      contas.length ? h("div", { class: "card" }, h("h3", { text: "Próximas sessões desta semana" }), proximos(d, contas)) : null);
    if (comContas) trocar(areaContas, cartaoContas(contas, desenhar));
  };

  const vigiar = async () => {
    if (!area.isConnected || minha !== estado.geracao) { if (minha === estado.geracao) clearInterval(estado.timer); return; }
    try {
      const r = await get(`/api/admin/agenda/avisos?desde_id=${estado.ultimoAviso || 0}`);
      if (r.avisos.length) {
        estado.ultimoAviso = Math.max(...r.avisos.map((a) => a.id));
        const texto = r.avisos.map((a) => a.texto).join(" ");
        bip();
        aviso(texto);
        notificar(texto);
        if (document.hidden) piscarTitulo(r.avisos.length);
      }
      await desenhar(false);
    } catch (_) { /* tenta de novo no próximo ciclo */ }
  };

  await desenhar();
  if (minha !== estado.geracao) return;
  clearInterval(estado.timer);
  estado.timer = setInterval(vigiar, 30000);
}

ext.registrarRota("agenda", (el) => tela(el), ["admin"]);
ext.registrarMenu("admin", "#/agenda", "Agenda");
