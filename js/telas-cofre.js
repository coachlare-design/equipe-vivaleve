// Telas do cofre para o admin/RT: visão, cerimônia da chave-mestra, abrir com a chave-mestra (recuperação e troca da
// mestra), descarte por destruição das chaves e integridade. As chaves privadas nascem e morrem nesta aba.
// Rodada 2: impressões conferidas contra as do build (certificados.js); reembrulho só para pública certificada, com a
// impressão mostrada ANTES e conferida com a pessoa; folhas separadas para mestra e age, sem QR de chave privada.
import { h, trocar, aviso, campo, entrada, formulario, botao, pill, vazio, selecao, dataBR, dataHoraBR, hojeISO, SEM_CORRETOR } from "./ui.js";
import { get, post } from "./api.js";
import * as cripto from "./cripto.js";
import * as cc from "./cofre-cripto.js";
import * as certs from "./certificados.js";
import { IMPRESSOES } from "./config.js";
import { desenharQR } from "./qr.js";
import { montarProntuario, formAbrirChave } from "./prontuario-ui.js";

// B7: salvar escolhendo o lugar (pendrive). Com o seletor de arquivos do navegador, quando existe; senão, download comum
// com aviso para NÃO deixar na pasta Downloads (muitas vezes sincronizada com OneDrive ou Google Drive).
async function salvarTexto(texto, nome) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const arq = await window.showSaveFilePicker({ suggestedName: nome, types: [{ description: "Texto", accept: { "text/plain": [".txt"] } }] });
      const w = await arq.createWritable();
      await w.write(new Blob([texto], { type: "text/plain;charset=utf-8" }));
      await w.close();
      aviso("Arquivo salvo onde você escolheu. Confira que foi no pendrive.");
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
  const a = h("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  aviso("Se o navegador salvou na pasta Downloads, MOVA o arquivo para o pendrive e apague de Downloads e da lixeira.", "erro");
}

function imprimirDom(no) {
  const area = h("div", { class: "area-impressao" }, no);
  document.body.append(area);
  document.body.classList.add("imprimindo");
  const fim = () => { area.remove(); document.body.classList.remove("imprimindo"); };
  window.addEventListener("afterprint", fim, { once: true });
  window.print();
}

const grupos4 = (t) => t.match(/.{1,4}/g).join(" ");

async function linhaImpressao(rotulo, publicaB64OuU8, fixadaComo) {
  const imp = publicaB64OuU8 ? await cc.impressao(publicaB64OuU8) : null;
  const lista = Array.isArray(fixadaComo) ? fixadaComo : [fixadaComo].filter((x) => certs.fixada(x));
  const confere = imp && lista.includes(imp);
  return h("div", { class: "linha" }, h("span", { text: rotulo }),
    h("span", {}, h("code", { text: imp || "(sem chave)" }), " ",
      lista.length ? pill(confere ? "confere com o pacote do site" : "NÃO confere com o pacote do site", confere ? "g" : "r") : pill("pacote do site sem impressão", "w")));
}

export async function cofre(el, partes, ctx) {
  const sub = partes[0] || "";
  if (sub === "cerimonia") return cerimonia(el, ctx);
  if (sub === "recuperar") return recuperar(el, ctx);
  if (sub === "descarte") return descarte(el, ctx);
  const [est, integ] = await Promise.all([get("/api/cofre/estado"), get("/api/cofre/integridade")]);
  const item = (href, rot, desc) => h("a", { class: "mcard clicavel", href }, h("b", { text: rot }), h("p", { class: "pequeno", text: desc }));
  const minhas = cripto.cofre.publica ? h("div", { class: "mcard pilha" },
    h("b", { text: "Impressões calculadas NESTE aparelho, da sua chave aberta" }),
    await linhaImpressao("Sua chave que tranca as notas (código de conferência 1)", cripto.cofre.publica, IMPRESSOES.rt),
    await linhaImpressao("Sua chave que assina as notas (código de conferência 2)", cripto.cofre.assinaturaPublica, certs.impressoesRtAssinatura()),
    est.mestra ? await linhaImpressao("Chave-mestra vigente (servidor)", est.mestra.publica, IMPRESSOES.mestra) : null,
    h("p", { class: "pequeno", text: "São estas (não as que o servidor mostra) que vão no pacote do site. Anote no papel da cerimônia; "
      + "a instrução técnica está no manual de implantação." }))
    : h("div", { class: "caixa-cifrada" }, h("p", { class: "pequeno", text: "Abra a sua chave (Conta) para ver as impressões calculadas neste aparelho." }));
  trocar(el, h("h1", { text: "Cofre clínico" }),
    certs.raizFixada() ? null : h("div", { class: "alerta r" }, h("b", { text: "O pacote do site ainda não tem as impressões das chaves (cofre fechado)" }),
      "Nenhuma nota é gravada ou mostrada até o pacote do site ser refeito com as impressões do RT e da chave-mestra (manual de implantação)."),
    est.mestra ? h("div", { class: "alerta g" }, h("b", { text: `Chave-mestra ativa (versão ${est.mestra.versao})` }),
      `Impressão ${est.mestra.impressao} · cerimônia em ${dataHoraBR(est.mestra.em)} · chave do backup configurada`)
      : h("div", { class: "alerta r" }, h("b", { text: "Sem chave-mestra" }), "Nenhuma nota clínica pode ser gravada antes da cerimônia."),
    minhas,
    h("div", { class: "mcard pilha" },
      h("div", { class: "linha" }, h("span", { text: "Integridade dos registros (o servidor declara)" }), pill(integ.cadeia.ok ? `íntegros · ${integ.cadeia.elos} conferidos` : "NÃO confere", integ.cadeia.ok ? "g" : "r")),
      h("div", { class: "linha" }, h("span", { text: "Notas cifradas" }), pill(integ.blocos_problemas.length ? `${integ.blocos_problemas.length} com problema` : "conferidas", integ.blocos_problemas.length ? "r" : "g")),
      h("p", { class: "pequeno link-longo", text: `Selo de integridade de hoje (para guardar fora, se o suporte pedir): ${String(integ.cadeia.cabeca).slice(0, 16)}...` }),
      h("p", { class: "pequeno", text: "A prova de verdade fica fora do servidor: o teste semanal de restauração no seu computador compara com os resumos diários guardados no e-mail e confere a autoria de cada registro." })),
    item("#/cofre/cerimonia", est.mestra ? "Cerimônia (trocar a chave-mestra)" : "Cerimônia da chave-mestra", "Gera no navegador a chave-mestra e a chave do backup, em folhas separadas; o servidor recebe só as públicas."),
    item("#/cofre/recuperar", "Abrir com a chave-mestra", "Recuperação, teste periódico e, depois de trocar a mestra, repasse de tudo para a versão nova."),
    item("#/cofre/descarte", "Descarte (5 anos)", "Destruição das chaves de prontuários com guarda vencida, com confirmação."));
}

// ---------------------------------------------------------------- cerimônia

async function cerimonia(el, ctx) {
  const est = await get("/api/cofre/estado");
  const s = await cripto.obterSodium();
  let chaves = null; // { mestra: {publica, privada}, textoMestra, age: {identidade, destinatario}, impressao }
  const apagar = () => {
    if (chaves) { s.memzero(chaves.mestra.privada); chaves = null; }
  };
  window.addEventListener("hashchange", apagar, { once: true });

  const passo1 = () => trocar(el, h("h1", { text: "Cerimônia da chave-mestra" }),
    est.mestra ? h("div", { class: "alerta" }, h("b", { text: `Já existe a versão ${est.mestra.versao} (${est.mestra.impressao})` }),
      "Depois da troca: peça o pacote novo do site com a impressão nova, abra Cofre > Abrir com a chave-mestra com a folha ANTIGA, repasse tudo para a vigente e aposente a versão antiga. Até lá, guarde as duas folhas.") : null,
    h("div", { class: "card pilha" },
      h("p", { text: "Faça num computador de confiança, com perfil de navegador sem extensões e com a correção ortográfica desligada (Configurações, Idiomas), sozinho(a) na sala." }),
      h("ol", { class: "lista-passos" },
        h("li", { text: "Se quiser, desligue a internet agora: as chaves nascem nesta página, sem rede." }),
        h("li", { text: "São DUAS chaves em DUAS folhas: a chave-mestra (prontuários) e a chave do backup. Imprima cada uma separada." }),
        h("li", { text: "Salve cada arquivo direto no pendrive (escolha o pendrive na janela de salvar). Não deixe em Downloads: muitas vezes ela sincroniza com a nuvem." }),
        h("li", { text: "Guarde a folha da mestra e a folha do age em lugares DIFERENTES entre si e longe do escritório do dia a dia." }),
        h("li", { text: "Não fotografe as folhas e não leia nada delas com o celular." }),
        h("li", { text: "Redigite os trechos pedidos para provar que as cópias estão certas." }),
        h("li", { text: "Religue a internet e confirme com o código do app autenticador: só as partes públicas das chaves vão ao servidor." })),
      botao("Gerar as chaves neste navegador", async () => {
        const m = await cc.gerarMestra();
        chaves = { mestra: m, textoMestra: await cc.textoMestra(m.privada), age: await cc.gerarAge(), impressao: await cc.impressao(m.publica) };
        passo2();
      })));

  // M1 (b): folhas separadas. B7: sem QR de chave privada (leitor de QR no celular pode mandar o texto para a nuvem);
  // a única imagem é o QR da parte PÚBLICA da mestra, que serve só para conferir a impressão.
  const folhaMestra = () => h("div", { class: "folha-chaves" },
    h("h2", { text: "Folha 1 de 2 · Chave-mestra dos prontuários" }),
    h("p", { class: "pequeno", text: `Gerada em ${dataBR(hojeISO())} por ${ctx.usuario.nome}. Sigilosa: quem tem esta folha lê todos os prontuários. Guarde longe da folha 2.` }),
    h("p", { class: "codigo-rec", text: chaves.textoMestra }),
    h("p", { class: "pequeno", text: `Impressão da parte pública: ${chaves.impressao} (vai no pacote do site).` }),
    desenharQR(cripto.b64(chaves.mestra.publica), "QR da parte PÚBLICA da chave-mestra"),
    h("p", { class: "pequeno", text: "Para abrir um prontuário: Plataforma > Cofre > Abrir com a chave-mestra." }));
  const folhaAge = () => h("div", { class: "folha-chaves" },
    h("h2", { text: "Folha 2 de 2 · Chave do backup" }),
    h("p", { class: "pequeno", text: `Gerada em ${dataBR(hojeISO())}. Sigilosa: abre os backups do banco. Guarde longe da folha 1.` }),
    h("p", { class: "codigo-rec", text: grupos4(chaves.age.identidade) }),
    h("p", { class: "pequeno", text: "Ao digitar, junte tudo sem espaços. Para abrir um backup: age -d -i chave.txt arquivo.age" }),
    h("p", { class: "pequeno", text: `Pública (vai no backup.env, AGE_RECIPIENTS): ${chaves.age.destinatario}` }));

  const passo2 = () => {
    trocar(el, h("h1", { text: "Guarde as duas chaves, separadas" }),
      h("div", { class: "alerta r" }, h("b", { text: "Esta é a única vez que estas chaves aparecem." }), "A plataforma não guarda as privadas. Sem elas, e sem a chave do RT, prontuários e backups ficam ilegíveis para sempre."),
      folhaMestra(),
      h("div", { class: "acoes-linha" },
        botao("Imprimir a folha 1 (mestra)", () => imprimirDom(folhaMestra()), "btn ghost"),
        botao("Salvar a chave-mestra no pendrive", () => salvarTexto([`CONHEÇA-TE PSI · CHAVE-MESTRA DO COFRE CLÍNICO (${hojeISO()})`, "",
          chaves.textoMestra, `Impressão da parte pública: ${chaves.impressao}`, "",
          "Guarde este arquivo só no pendrive offline da mestra. Apague de qualquer outro lugar.", ""].join("\n"),
        `chave-mestra-conhecate-psi-${hojeISO()}.txt`), "btn ghost")),
      folhaAge(),
      h("div", { class: "acoes-linha" },
        botao("Imprimir a folha 2 (backup)", () => imprimirDom(folhaAge()), "btn ghost"),
        botao("Salvar a chave do backup no pendrive", () => salvarTexto(`${chaves.age.identidade}\n`, `chave-backup-age-${hojeISO()}.txt`), "btn ghost")),
      h("p", { class: "pequeno", text: "O arquivo da chave do backup tem só a linha AGE-SECRET-KEY, pronto para age -d -i. Use um pendrive diferente do da mestra, se puder." }),
      botao("Já guardei as duas, em lugares diferentes", async () => passo3()));
  };

  const sortear = (min, max) => min + s.randombytes_uniform(max - min + 1);

  const passo3 = () => {
    const grupos = chaves.textoMestra.split("-").length - 1;
    const g1 = 1 + Math.floor(Math.random() * (grupos / 2));
    const g2 = Math.ceil(grupos / 2) + Math.floor(Math.random() * (grupos / 2 - 1)) + 1;
    // B7: conferência do age pelos grupos do MEIO (os 6 últimos caracteres são só o checksum bech32).
    const gruposAge = grupos4(chaves.age.identidade).split(" ");
    const ultimoUtil = gruposAge.length - 3; // os 2 últimos grupos têm o checksum
    const a1 = sortear(5, Math.floor(ultimoUtil / 2)); // grupos 1 a 4 são o prefixo AGE-SECRET-KEY-1
    const a2 = sortear(Math.floor(ultimoUtil / 2) + 1, ultimoUtil);
    const props = { autocomplete: "off", maxlength: "4", spellcheck: "false", autocapitalize: "characters", autocorrect: "off" };
    const t1 = entrada({ name: "g1", ...props });
    const t2 = entrada({ name: "g2", ...props });
    const t3 = entrada({ name: "a1", ...props });
    const t4 = entrada({ name: "a2", ...props });
    const papel = h("input", { type: "checkbox" });
    const pendrive = h("input", { type: "checkbox" });
    const separadas = h("input", { type: "checkbox" });
    const totp = entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7" });
    const motivo = entrada({ name: "motivo", maxlength: "500", ...SEM_CORRETOR });
    trocar(el, h("h1", { text: "Confirme as cópias" }),
      h("p", { class: "pequeno", text: "Olhando o PAPEL (não a tela anterior), digite os trechos pedidos. A tela das chaves já foi fechada." }),
      h("div", { class: "card" }, formulario(async () => {
        const ok1 = t1.value.trim().toUpperCase() === cc.grupoDoTexto(chaves.textoMestra, g1);
        const ok2 = t2.value.trim().toUpperCase() === cc.grupoDoTexto(chaves.textoMestra, g2);
        const ok3 = t3.value.trim().toUpperCase() === gruposAge[a1 - 1];
        const ok4 = t4.value.trim().toUpperCase() === gruposAge[a2 - 1];
        if (!(ok1 && ok2 && ok3 && ok4)) throw new Error("Algum trecho não confere. Confira os papéis; se a cópia estiver errada, recomece a cerimônia.");
        if (!papel.checked || !pendrive.checked || !separadas.checked) throw new Error("Confirme papel, pendrive e folhas separadas.");
        const corpo = cc.corpoCerimonia({ publica: chaves.mestra.publica, ageDestinatario: chaves.age.destinatario, totp: totp.value.replace(/\D/g, ""),
          guardeiPapel: true, guardeiPendrive: true, motivo: motivo.value.trim() });
        const r = await post("/api/cofre/mestra", corpo);
        const imp = chaves.impressao, age = chaves.age.destinatario;
        apagar();
        const impRt = cripto.cofre.publica ? await cc.impressao(cripto.cofre.publica) : "(abra sua chave para ver)";
        const impRtA = cripto.cofre.assinaturaPublica ? await cc.impressao(cripto.cofre.assinaturaPublica) : "(abra sua chave para ver)";
        trocar(el, h("h1", { text: "Cerimônia concluída" }),
          h("div", { class: "alerta g" }, h("b", { text: `Chave-mestra versão ${r.mestra.versao} ativa` }), `Impressão: ${imp}. Anote no papel, ao lado da chave.`),
          h("div", { class: "card pilha" }, h("h3", { text: "Falta fazer (fora da plataforma)" }),
            h("p", { class: "pequeno", text: `1. Configurar o backup com a chave pública dele: ${age}` }),
            h("p", { class: "pequeno", text: `2. Pedir o pacote novo do site com as impressões: chave-mestra ${imp} · RT ${impRt} · assinatura do RT ${impRtA} (manual de implantação).` }),
            h("p", { class: "pequeno", text: "3. Atualizar a conferência externa do site com o pacote novo; só então usar com dado real." }),
            h("p", { class: "pequeno", text: "4. Em até 7 dias, o teste: Cofre > Abrir com a chave-mestra, digitando a chave do papel, numa amostra de pacientes de cada profissional." }),
            est.mestra ? h("p", { class: "pequeno", text: `5. Troca: com o pacote novo do site, abra com a folha da versão ${est.mestra.versao}, repasse tudo para a vigente e aposente a versão ${est.mestra.versao}.` }) : null),
          h("a", { class: "btn", href: "#/cofre", text: "Voltar ao cofre" }));
      },
      campo(`Folha 1: grupo ${g1} da chave-mestra (conte depois do VLM1)`, t1), campo(`Folha 1: grupo ${g2} da chave-mestra`, t2),
      campo(`Folha 2: grupo ${a1} da chave do backup (conte a partir do 1º grupo, AGE-)`, t3),
      campo(`Folha 2: grupo ${a2} da chave do backup`, t4),
      h("label", { class: "marcar" }, papel, "Guardei as folhas impressas num lugar seguro."),
      h("label", { class: "marcar" }, pendrive, "Salvei os arquivos no pendrive e apaguei de qualquer outro lugar."),
      h("label", { class: "marcar" }, separadas, "A folha da mestra e a do age estão em lugares diferentes."),
      est.mestra ? campo("Motivo da troca da chave-mestra", motivo) : null,
      campo("Código do app autenticador", totp),
      h("button", { type: "submit", class: "btn", text: "Enviar só as chaves públicas" }))),
      botao("Recomeçar (gerar outras chaves)", () => { apagar(); passo1(); }, "btn ghost"));
  };
  passo1();
}

// ---------------------------------------------------------------- confirmação de impressão antes de reembrulhar (A2)

// Mostra a impressão calculada AQUI da pública certificada e pede que o RT confira com a que a pessoa vê na tela dela
// (Conta > Minha chave), por telefone ou pessoalmente. Só depois executa.
async function confirmarImpressao(zona, nome, publicaB64, executar) {
  const imp = await cc.impressao(publicaB64);
  const conferi = h("input", { type: "checkbox" });
  trocar(zona, h("div", { class: "alerta b" }, h("b", { text: `Chave de ${nome}: ${imp}` }),
    "Confira esta impressão com a que a pessoa vê em Conta > Minha chave, por telefone ou pessoalmente (fora da plataforma)."),
  h("label", { class: "marcar" }, conferi, `Conferi a impressão com ${nome}.`),
  botao("Repassar o acesso agora", async () => {
    if (!conferi.checked) throw new Error("Confira a impressão com a pessoa antes.");
    await executar(publicaB64);
  }, "btn mini"));
}

// ---------------------------------------------------------------- abrir com a chave-mestra (recuperação e troca)

async function recuperar(el, ctx) {
  const est = await get("/api/cofre/estado");
  if (!est.mestra) { trocar(el, h("h1", { text: "Abrir com a chave-mestra" }), vazio("Ainda não há chave-mestra.")); return; }
  const s = await cripto.obterSodium();
  let mestra = null;
  const fechar = () => { if (mestra) { s.memzero(mestra.privada); mestra = null; } };
  window.addEventListener("hashchange", fechar, { once: true });
  const temporizador = setTimeout(() => { fechar(); trocar(el, h("h1", { text: "Chave-mestra fechada" }), h("p", { text: "Fechada depois de 10 minutos. Abra de novo se precisar." })); }, 10 * 60000);
  window.addEventListener("hashchange", () => clearTimeout(temporizador), { once: true });

  const texto = h("textarea", { class: "entrada mono", rows: "3", name: "mestra", ...SEM_CORRETOR, autocapitalize: "characters" });
  trocar(el, h("h1", { text: "Abrir com a chave-mestra" }),
    h("p", { class: "pequeno", text: "Para recuperar acesso (chave do RT perdida, profissional sem frase nem código), para o teste periódico e para repassar tudo depois de trocar a mestra. Tudo acontece neste navegador; a chave some ao sair da tela ou em 10 minutos." }),
    h("div", { class: "card" }, formulario(async () => {
      const priv = await cc.lerMestra(texto.value);
      const pub = await cc.publicaDe(priv);
      texto.value = "";
      const versao = (est.mestra_versoes || []).find((v) => v.publica === cripto.b64(pub));
      if (!versao) { s.memzero(priv); throw new Error(`Esta chave não é nenhuma das chaves-mestras do cofre (vigente: ${est.mestra.impressao}).`); }
      mestra = { publica: pub, privada: priv, versao: versao.versao, impressao: versao.impressao };
      await escolherPaciente();
    }, campo("Chave-mestra (VLM1-...)", texto, "Digite do papel ou cole do pendrive. Maiúsculas ou minúsculas, com ou sem hífens."),
    h("button", { type: "submit", class: "btn", text: "Conferir a chave" }))));

  async function escolherPaciente() {
    const pacs = await get("/api/admin/pacientes");
    const sel = selecao("pac", pacs.map((p) => [String(p.id), `${p.codigo} · ${p.associado_nome || "sem responsável"}`]));
    const motivo = h("textarea", { class: "entrada", rows: "2", name: "motivo", minlength: "10", ...SEM_CORRETOR });
    const zona = h("div");
    const antiga = mestra.versao < est.mestra.versao;
    trocar(el, h("h1", { text: "Chave-mestra conferida" }), h("div", { class: "alerta g" }, h("b", { text: `Versão ${mestra.versao} · impressão ${mestra.impressao}` }),
      antiga ? "Chave de versão ANTERIOR: abre os registros gravados antes da troca." : "A chave está só na memória desta aba."),
    antiga ? await blocoTroca(pacs) : null,
    h("div", { class: "card" }, formulario(async (fd) => {
      const pid = Number(fd.get("pac"));
      const m = String(fd.get("motivo") || "").trim();
      if (m.length < 10) throw new Error("Escreva o motivo (10 caracteres ou mais).");
      const l = await post("/api/admin/leituras", { paciente_id: pid, motivo: m, recurso: "mestra" });
      const p = pacs.find((x) => x.id === pid);
      await abrirPaciente(zona, p, l.leitura_id);
    }, campo("Paciente", sel), campo("Motivo (fica no log e aparece ao(à) profissional)", motivo),
    h("button", { type: "submit", class: "btn", text: "Abrir com a chave-mestra" }))), zona);
  }

  // M1 (c): troca da mestra com efeito no banco vivo. Abre com a folha ANTIGA e sela para a vigente (conferida contra a
  // impressão do build); depois aposenta a versão antiga (o servidor zera os envelopes dela).
  async function blocoTroca(pacs) {
    const caixa = h("div", { class: "card pilha" }, h("h3", { text: `Troca da chave-mestra: versão ${mestra.versao} para ${est.mestra.versao}` }));
    if (!(await certs.mestraFixada(est.mestra.publica))) {
      caixa.append(h("div", { class: "alerta r" }, h("b", { text: "A chave-mestra vigente não é a do pacote do site" }),
        "Peça o pacote novo do site com a impressão da versão nova antes de repassar."));
      return caixa;
    }
    const progresso = h("p", { class: "pequeno", role: "status" });
    caixa.append(h("p", { class: "pequeno", text: "1) Repassar: para cada paciente, abre a chave de cada registro com esta folha e sela para a mestra vigente. Cada paciente gera uma leitura com motivo no registro de acessos." }),
      botao(`Repassar todos para a versão ${est.mestra.versao}`, async () => {
        let total = 0, faltam = 0;
        for (const [i, p] of pacs.entries()) {
          progresso.textContent = `Paciente ${i + 1} de ${pacs.length} (${p.codigo})...`;
          const l = await post("/api/admin/leituras", { paciente_id: p.id, motivo: `Troca da chave-mestra: versão ${mestra.versao} para ${est.mestra.versao}`, recurso: "mestra" });
          const doc = await get(`/api/cofre/pacientes/${p.id}/prontuario?via=mestra&leitura_id=${l.leitura_id}&mestra_versao=${mestra.versao}`);
          const envelopes = [];
          for (const r of doc.registros) {
            if (!r.envelope || r.mestra_versao !== mestra.versao) continue;
            envelopes.push({ registro_id: r.id, envelope: await cc.reembrulhar(r.envelope, mestra.publica, mestra.privada, est.mestra.publica) });
          }
          if (!envelopes.length) continue;
          const res = await post(`/api/cofre/pacientes/${p.id}/envelopes-mestra`, { leitura_id: l.leitura_id, mestra_versao: est.mestra.versao, envelopes });
          total += res.novos; faltam += res.faltando;
        }
        progresso.textContent = `${total === 1 ? "1 registro repassado" : `${total} registros repassados`} para a versão ${est.mestra.versao}. ${faltam ? `${faltam === 1 ? "1 registro ainda não abriu" : `${faltam} registros ainda não abriram`} (abra com a folha da versão certa).` : "Nenhum registro pendente."}`;
      }, "btn mini"), progresso);
    const totp = entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7" });
    const motivo = entrada({ name: "motivo", maxlength: "500", ...SEM_CORRETOR });
    caixa.append(h("p", { class: "pequeno", text: `2) Aposentar a versão ${mestra.versao}: o servidor apaga o acesso por ela (só depois que todo registro vivo já abre com a vigente). A folha antiga deixa de abrir o banco vivo; nos backups antigos, até a retenção apagá-los.` }),
      formulario(async () => {
        const r = await post(`/api/cofre/mestra/${mestra.versao}/aposentar`, { totp: totp.value.replace(/\D/g, ""), motivo: motivo.value.trim() });
        aviso(`Versão ${mestra.versao} aposentada: ${r.envelopes_zerados === 1 ? "1 acesso apagado" : `${r.envelopes_zerados} acessos apagados`}.`);
      }, campo("Motivo", motivo), campo("Código do app autenticador", totp), h("button", { type: "submit", class: "btn mini perigo", text: `Aposentar a versão ${mestra.versao}` })));
    return caixa;
  }

  async function abrirPaciente(zona, p, leituraId) {
    const acoes = h("div", { class: "card pilha" }, h("h3", { text: "Repassar o acesso" }),
      h("p", { class: "pequeno", text: "Entrega de novo o acesso a cada registro para a chave atual de alguém, sem abrir o texto no servidor. Só para chave conferida pelo RT." }));
    const zonaConfirma = h("div");
    const reemb = async (usuarioId, publicaDestino, nome) => {
      const doc = await carregarEnvelopesMestra(p.id, leituraId);
      const envelopes = [];
      for (const r of doc.registros) if (r.envelope) envelopes.push({ registro_id: r.id, envelope: await cc.reembrulhar(r.envelope, mestra.publica, mestra.privada, publicaDestino) });
      const res = await post(`/api/cofre/pacientes/${p.id}/envelopes`, { usuario_id: usuarioId, leitura_id: leituraId, origem: "recuperacao", envelopes });
      aviso(`Acesso repassado a ${nome}: ${res.novos === 1 ? "1 registro" : `${res.novos} registros`}.`);
    };
    const ch = await get(`/api/cofre/pacientes/${p.id}/chaves?leitura_id=${leituraId}`);
    // "Minha chave de RT": a calculada da minha privada aberta, ou a do servidor SÓ se bater com a do RT fixada no build.
    const minha = cripto.cofre.publica ? cripto.b64(cripto.cofre.publica) : (await certs.cifraDoRt(ch.eu.publica) ? ch.eu.publica : null);
    if (minha) acoes.append(botao(`Para a minha chave de RT (${await cc.impressao(minha)})`, () => reemb(ch.eu.id, minha, "você")));
    else acoes.append(h("p", { class: "pequeno", text: "Sua chave de RT não está aberta e a do servidor não confere com a do pacote do site: abra sua chave para repassar para você." }));
    if (ch.responsavel && ch.responsavel.id !== ch.eu.id) {
      acoes.append(botao(`Para ${ch.responsavel.nome}`, async () => {
        const pub = await certs.publicaCertificada(ch.responsavel);
        await confirmarImpressao(zonaConfirma, ch.responsavel.nome, pub, (x) => reemb(ch.responsavel.id, x, ch.responsavel.nome));
      }, "btn ghost"));
    }
    acoes.append(zonaConfirma);
    const pront = h("div");
    trocar(zona, pront, acoes);
    await montarProntuario(pront, { paciente: { id: p.id, associado_id: p.associado_id }, usuario: ctx.usuario, admin: true, mestra, leituraId });
  }

  async function carregarEnvelopesMestra(pid, leituraId) {
    return get(`/api/cofre/pacientes/${pid}/prontuario?via=mestra&leitura_id=${leituraId}&mestra_versao=${mestra.versao}`);
  }
}

// ---------------------------------------------------------------- descarte

async function descarte(el, ctx) {
  const lista = await get("/api/cofre/descarte");
  const elegiveis = lista.filter((x) => x.elegivel);
  trocar(el, h("h1", { text: "Descarte por destruição das chaves" }),
    h("div", { class: "card pilha" },
      h("p", { class: "pequeno", text: "Rotina: 1) conferir que não há processo, sindicância ou pedido do(a) titular em curso; 2) conferir que passaram 5 anos do último atendimento e o(a) paciente está encerrado(a) ou cancelado(a); 3) digitar o P-código, o motivo e o código do app autenticador." }),
      // M1 (d): o texto não promete o que não acontece.
      h("p", { class: "pequeno", text: "No banco vivo, o servidor apaga o texto protegido e todos os acessos a ele (inclusive o da chave-mestra) e registra o descarte; depois disso o prontuário não aceita registro novo. As cópias continuam nos backups até a retenção apagá-los (diários: 35 dias; mensais: 5 anos e 30 dias, apagados à mão na conta separada do backup). A eliminação só se completa quando o último backup com o registro for apagado." })),
    h("h2", { text: `Elegíveis agora (${elegiveis.length})` }),
    elegiveis.length ? elegiveis.map((x) => {
      const cod = entrada({ name: "cod", autocomplete: "off", maxlength: "12" });
      const motivo = entrada({ name: "motivo", maxlength: "500", ...SEM_CORRETOR });
      const semProc = h("input", { type: "checkbox" });
      const totp = entrada({ name: "totp", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7" });
      return h("div", { class: "card" }, h("div", { class: "linha" }, h("b", { text: x.codigo }), pill(`${x.registros} registros`, "w")),
        h("p", { class: "pequeno", text: `Último atendimento ${dataBR(x.ultimo_atendimento)} · guarda até ${dataBR(x.elegivel_em)} · ${x.status}` }),
        formulario(async () => {
          const r = await post(`/api/cofre/descarte/${x.paciente_id}`, { confirmacao_codigo: cod.value.trim(), motivo: motivo.value.trim(),
            sem_processo_em_curso: semProc.checked, totp: totp.value.replace(/\D/g, "") });
          aviso(`Descartado: ${r.blocos_zerados} blocos zerados.`);
          ctx.recarregar();
        }, campo("Digite o P-código para confirmar", cod), campo("Motivo", motivo),
        h("label", { class: "marcar" }, semProc, "Não há processo, sindicância nem pedido do(a) titular em curso."),
        campo("Código do app autenticador", totp), h("button", { type: "submit", class: "btn perigo", text: "Destruir as chaves" })));
    }) : vazio("Nenhum prontuário com guarda vencida."),
    h("h2", { text: "Todos os prontuários" }),
    lista.length ? lista.map((x) => h("div", { class: "mcard linha" }, h("span", { text: `${x.codigo} · último atendimento ${dataBR(x.ultimo_atendimento)}` }),
      pill(x.descartado_em ? "descartado" : `guarda até ${dataBR(x.elegivel_em)}`, x.descartado_em ? "cinza" : ""))) : vazio("Nenhum prontuário."));
}

// ---------------------------------------------------------------- reembrulho da transferência (cartão do admin)

export function reembrulharTransferencia(el, { transferencia: t, recarregar }) {
  const passo = t.passos.find((p) => p.passo === "reembrulhar_chaves");
  if (!passo || passo.feito_em) return;
  const zona = h("div");
  const box = h("div", { class: "caixa-cifrada" }, h("div", { class: "linha" }, h("b", { text: "Acesso ao prontuário" }), pill("no seu navegador", "k")),
    h("p", { class: "pequeno", text: `Repassa o acesso a cada registro para ${t.para_nome}, só se a chave dele(a) estiver conferida por você e a impressão bater com a da pessoa. O texto não é aberto no servidor. Fica registrado com o motivo.` }), zona);
  const preparar = async () => {
    if (!cripto.cofre.privada) { trocar(zona, formAbrirChave(preparar)); return; }
    certs.exigirRaiz();
    const l = await post("/api/admin/leituras", { paciente_id: t.paciente_id, motivo: `Repasse do acesso ao prontuário na transferência ${t.codigo}`, recurso: "reembrulho" });
    const ch = await get(`/api/cofre/pacientes/${t.paciente_id}/chaves?leitura_id=${l.leitura_id}`);
    if (!ch.responsavel || ch.responsavel.id !== t.para_associado_id) throw new Error("O(a) responsável atual não é quem recebe esta transferência.");
    // A2: só pública CERTIFICADA pelo RT; impressão mostrada ANTES, para conferir com a pessoa.
    const pub = await certs.publicaCertificada(ch.responsavel);
    await confirmarImpressao(zona, t.para_nome, pub, async (destino) => {
      const doc = await get(`/api/cofre/pacientes/${t.paciente_id}/prontuario?leitura_id=${l.leitura_id}`);
      const envelopes = [];
      let semChave = 0;
      for (const r of doc.registros) {
        if (r.descartado) continue;
        if (!r.envelope) { semChave++; continue; }
        envelopes.push({ registro_id: r.id, envelope: await cc.reembrulhar(r.envelope, cripto.cofre.publica, cripto.cofre.privada, destino) });
      }
      const res = await post(`/api/cofre/pacientes/${t.paciente_id}/envelopes`, { usuario_id: t.para_associado_id, leitura_id: l.leitura_id,
        origem: "transferencia", transferencia_id: t.id, envelopes });
      aviso(`Acesso repassado a ${t.para_nome} (${res.novos === 1 ? "1 registro" : `${res.novos} registros`}).`);
      if (semChave || res.faltando) aviso(`${(semChave || res.faltando) === 1 ? "1 registro não abriu" : `${semChave || res.faltando} registros não abriram`} com a sua chave: use Cofre > Abrir com a chave-mestra.`, "erro");
      recarregar();
    });
  };
  zona.append(botao(`Preparar o repasse para ${t.para_nome}`, preparar, "btn mini"));
  el.append(box);
}
