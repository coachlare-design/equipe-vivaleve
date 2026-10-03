// Modelo do prontuário (Res. CFP 01/2009) e documento de exportação. Sem DOM e sem rede: roda no Node (testes).
// O documento é montado como árvore [tag, atributos, ...filhos] e vira texto HTML escapado (arquivo baixado)
// ou DOM (tela de impressão), sempre a partir do conteúdo já decifrado NESTE navegador.

export const TITULOS = {
  identificacao: "Identificação",
  demanda: "Demanda e objetivos",
  evolucao: "Evolução",
  procedimento: "Procedimentos",
  encaminhamento: "Encaminhamento",
  encerramento: "Encerramento",
  termo: "Termo do(a) paciente (Res. CFP 09/2024)",
  anotacao_rt: "Anotação do responsável técnico",
  retificacao: "Retificação",
  documento: "Documentos emitidos",
  instrumento: "Instrumentos de avaliação",
};

// Rodada 3 (conformidade A2): espécies de documento da Res. CFP 06/2019 e o relatório de transferência (cl. 17.3 c).
export const ESPECIES_DOCUMENTO = [["declaracao", "Declaração (ex.: comparecimento, para o plano de saúde)"], ["atestado", "Atestado psicológico"],
  ["relatorio", "Relatório psicológico"], ["relatorio_multi", "Relatório multiprofissional"], ["laudo", "Laudo psicológico"],
  ["parecer", "Parecer psicológico"], ["relatorio_transferencia", "Relatório de transferência"]];

// [campo, rótulo, tipo de entrada, obrigatório, opções]
// Tipos: texto, data, area, opcoes (lista), marca (sim ou não).
// Rodada 3 (conformidade M1): contato de emergência, endereço (opcional) e marca de menor de idade, todos cifrados como
// o resto da ficha. Menor de idade exige o(a) responsável legal.
export const CAMPOS = {
  identificacao: [["nome", "Nome completo", "texto", true], ["nome_social", "Nome social", "texto"], ["nascimento", "Data de nascimento", "data"],
    ["contato", "Contato (telefone ou e-mail)", "texto"],
    ["emergencia_nome", "Contato de emergência: nome", "texto"], ["emergencia_vinculo", "Contato de emergência: vínculo (ex.: irmã)", "texto"],
    ["emergencia_telefone", "Contato de emergência: telefone", "texto"],
    ["endereco", "Cidade, UF e endereço (onde a pessoa costuma estar nas sessões)", "area"],
    ["menor_idade", "Menor de idade", "marca"], ["responsavel_legal", "Responsável legal (obrigatório se menor de idade)", "texto"],
    ["observacoes", "Outras informações de identificação", "area"]],
  demanda: [["demanda", "Demanda (o que trouxe a pessoa)", "area", true], ["objetivos", "Objetivos do trabalho", "area", true]],
  evolucao: [["texto", "Evolução da sessão", "area", true]],
  procedimento: [["texto", "Procedimento, técnica ou instrumento adotado", "area", true]],
  encaminhamento: [["destino", "Encaminhado(a) para", "texto", true], ["texto", "Motivo e orientações", "area", true]],
  encerramento: [["data", "Data do encerramento", "data", true], ["texto", "Motivo e síntese do encerramento", "area", true]],
  anotacao_rt: [["texto", "Anotação do RT", "area", true]],
  termo: [["data", "Data em que o termo foi assinado", "data", true], ["forma", "Forma", "texto", true],
    ["versao_texto", "Versão do texto", "texto", true]],
  // Res. CFP 01/2009, art. 2º, V: cópia do documento emitido, com data, finalidade e destinatário.
  documento: [["especie", "Tipo de documento", "opcoes", true, ESPECIES_DOCUMENTO], ["data_emissao", "Data de emissão", "data", true],
    ["finalidade", "Finalidade", "texto", true], ["destinatario", "Destinatário (a quem foi entregue)", "texto", true],
    ["texto", "Conteúdo ou resumo do documento", "area", true]],
  // Res. CFP 01/2009, art. 2º, VI: instrumentos de avaliação, de acesso exclusivo do(a) psicólogo(a).
  instrumento: [["nome", "Instrumento ou teste", "texto", true], ["data_aplicacao", "Data da aplicação", "data", true],
    ["resultado", "Resultado e síntese", "area", true], ["observacoes", "Observações", "area"]],
};

// Tipos que aceitam um arquivo anexado (cifrado no aparelho, até 3 MB, só PDF, PNG ou JPEG).
export const COM_ANEXO = new Set(["termo", "documento", "instrumento"]);

// Rodada 3 (persona associada B3): o texto mostrado é o da versão vigente, que vem do servidor. Isto é só o rótulo.
export const ROTULO_TERMO_PROVISORIO = "Texto provisório da clínica, pendente de redação jurídica.";

function dataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// Rodada 3 (persona associada A4): sempre no fuso de São Paulo, nunca no do aparelho ou em UTC.
const FMT_QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false });
function quando(isoUtc) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  return Number.isNaN(d.getTime()) ? "" : FMT_QUANDO.format(d).replace(",", "");
}

// registros decifrados: { id, tipo, autor_id, autor_nome, em, em_cliente, data_ref, sessao_data, retifica_id, refere_a, dados, estado }
// estado: "ok" | "sem_chave" | "descartado" | "erro" | "assinatura_invalida" (bloqueado: não mostra conteúdo)
// Rodada 2 (A1): retificação só vale se o(a) autor(a) dela for o(a) autor(a) do registro original. A de outra pessoa é
// IGNORADA (não vira "versão atual") e listada em `suspeitas` e em `item.ignoradas`, para a tela avisar.
// Rodada 2 (B2): a data usada é a ASSINADA (data_ref); a da sessão no servidor só entra se não houver data assinada.
export function organizar(regs) {
  const rets = new Map();
  const ignoradas = new Map();
  const suspeitas = [];
  const autorDe = new Map(regs.map((r) => [r.id, r.autor_id]));
  for (const r of regs) {
    if (r.tipo === "retificacao" && r.retifica_id) {
      if (autorDe.has(r.retifica_id) && Number(autorDe.get(r.retifica_id)) !== Number(r.autor_id)) {
        suspeitas.push(r);
        if (!ignoradas.has(r.retifica_id)) ignoradas.set(r.retifica_id, []);
        ignoradas.get(r.retifica_id).push(r);
        continue;
      }
      if (!rets.has(r.retifica_id)) rets.set(r.retifica_id, []);
      rets.get(r.retifica_id).push(r);
    }
  }
  const item = (r) => {
    const lista = (rets.get(r.id) || []).slice().sort((a, b) => a.id - b.id);
    const valida = lista.filter((x) => x.dados && x.dados.conteudo);
    return { reg: r, original: r.dados, atual: valida.length ? valida[valida.length - 1].dados.conteudo : r.dados, retificacoes: lista,
      ignoradas: ignoradas.get(r.id) || [] };
  };
  const de = (tipo) => regs.filter((r) => r.tipo === tipo).map(item);
  const dataDe = (it) => it.reg.data_ref || it.reg.sessao_data || String(it.reg.em || "").slice(0, 10);
  const evolucoes = de("evolucao").sort((a, b) => (dataDe(b) + b.reg.id).localeCompare(dataDe(a) + a.reg.id));
  evolucoes.forEach((e, i) => { e.numero = evolucoes.length - i; });
  const ident = de("identificacao");
  const atualIdent = ident.length ? ident[ident.length - 1].atual : null;
  return {
    nome: atualIdent && atualIdent.nome ? atualIdent.nome : null,
    identificacao: ident,
    demanda: de("demanda"),
    procedimentos: de("procedimento"),
    evolucoes,
    anotacoes: de("anotacao_rt"),
    encaminhamentos: de("encaminhamento"),
    encerramentos: de("encerramento"),
    termos: de("termo"),
    documentos: de("documento"),
    instrumentos: de("instrumento"),
    suspeitas,
    total: regs.length,
  };
}

// ---------------------------------------------------------------- anexo do termo (rodada 2, B6)

const TIPOS_ANEXO = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

// Tipo pelo CONTEÚDO (assinatura de arquivo), não pelo que o navegador ou o registro dizem.
export function tipoDoConteudo(bytes) {
  const b = bytes || [];
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

// Nome e tipo do arquivo baixado, definidos pela plataforma: só PDF, PNG ou JPEG; qualquer outra coisa sai como
// application/octet-stream com extensão .bin (o navegador não abre como página). O nome nunca vem do registro.
export function anexoSeguro(arquivo, codigo, data, prefixo = "termo") {
  const tipo = TIPOS_ANEXO[arquivo && arquivo.tipo] ? arquivo.tipo : "application/octet-stream";
  const ext = TIPOS_ANEXO[tipo] || "bin";
  const pre = ["termo", "documento", "instrumento"].includes(prefixo) ? prefixo : "anexo";
  const cod = /^P-\d{1,6}$/.test(String(codigo || "")) ? codigo : "paciente";
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(data || "")) ? data : "sem-data";
  return { tipo, nome: `${pre}-${cod}-${dia}.${ext}` };
}

// ---------------------------------------------------------------- árvore do documento

function campos(tipo, dados) {
  if (!dados) return [["p", { class: "sem" }, "Conteúdo indisponível."]];
  const defs = CAMPOS[tipo] || [["texto", "Texto", "area"]];
  const out = [];
  for (const [k, rot, t, , opcoes] of defs) {
    const v = dados[k];
    if (v === undefined || v === null || v === "" || v === false) continue;
    out.push(["div", { class: "campo" }, ["span", { class: "rot" }, rot], ["div", { class: "val" }, valorLegivel(t, v, opcoes)]]);
  }
  if (dados.arquivo) out.push(["p", { class: "sem" }, "Anexo guardado cifrado no prontuário."]);
  return out.length ? out : [["p", { class: "sem" }, "Sem conteúdo."]];
}

export function valorLegivel(t, v, opcoes) {
  if (t === "data") return dataBR(v);
  if (t === "marca") return v ? "sim" : "não";
  if (t === "opcoes" && opcoes) {
    const o = opcoes.find(([x]) => x === v);
    return o ? o[1] : String(v);
  }
  return String(v);
}

// Rodada 3 (conformidade M2): nome e CRP de quem escreveu (Código de Ética, art. 20 a; Res. CFP 06/2019).
function autoria(r, meta) {
  const info = meta && meta.autores_info ? meta.autores_info[String(r.autor_id)] : null;
  const nome = (info && info.nome) || r.autor_nome || "";
  return info && info.crp ? `${nome}, CRP ${info.crp}` : nome;
}

function blocoItem(it, tipo, cabecalho, meta) {
  const r = it.reg;
  const filhos = [["div", { class: "cab" }, cabecalho, ["span", { class: "autor" }, `${autoria(r, meta)} · registrado em ${quando(r.em)}`]]];
  if (r.estado === "descartado") filhos.push(["p", { class: "sem" }, "Registro descartado por destruição das chaves (fim da guarda de 5 anos)."]);
  else if (r.estado === "assinatura_invalida") filhos.push(["p", { class: "sem" }, "Registro bloqueado: a assinatura de autoria não confere."]);
  else if (r.estado !== "ok") filhos.push(["p", { class: "sem" }, "Sem chave para este registro."]);
  else if (it.retificacoes.length) {
    filhos.push(["div", { class: "original" }, ["span", { class: "rot" }, "Versão original (mantida)"], ["del", {}, ...campos(tipo, it.original)]]);
    for (const x of it.retificacoes) {
      if (!x.dados) continue;
      filhos.push(["div", { class: "retif" }, ["span", { class: "rot" }, `Retificação por ${autoria(x, meta)} em ${quando(x.em)} · motivo: ${x.dados.motivo || ""}`],
        ...campos(tipo, x.dados.conteudo)]);
    }
  } else filhos.push(...campos(tipo, it.original));
  return ["section", { class: `item${it.retificacoes.length ? " retificado" : ""}` }, ...filhos];
}

export function arvoreDocumento(modelo, meta) {
  const secao = (titulo, itens, tipo, cab) => ["section", { class: "secao" }, ["h2", {}, titulo],
    ...(itens.length ? itens.map((it) => blocoItem(it, tipo, cab(it), meta)) : [["p", { class: "sem" }, "Nada registrado."]])];
  const cabData = (it) => ["b", {}, dataBR(it.reg.data_ref || String(it.reg.em || "").slice(0, 10))];
  const c = meta.clinica || {};
  const cabClinica = c.razao_social ? `${c.razao_social}${c.cnpj ? ` · CNPJ ${c.cnpj}` : ""}${c.rt_nome ? ` · Responsável técnico: ${c.rt_nome}${c.rt_crp ? `, CRP ${c.rt_crp}` : ""}` : ""}` : "";
  const destino = meta.finalidade ? ` Finalidade: ${meta.finalidade}${meta.destinatario ? `; destinatário: ${meta.destinatario}` : ""}.` : "";
  return ["article", { class: "doc-prontuario" },
    ["header", {}, ["p", { class: "marca" }, "Conheça-TE Psi · Equipe"],
      cabClinica ? ["p", { class: "meta" }, cabClinica] : "",
      ["h1", {}, `Prontuário psicológico · ${meta.codigo}`],
      ["p", {}, `${modelo.nome || "(identificação não registrada)"} · plano ${meta.plano === "avulsa" ? "avulso" : (meta.plano || "")}`],
      ["p", { class: "meta" }, `Exportação nº ${meta.exportacao_id} registrada no log em ${quando(meta.exportado_em)} por ${meta.por}.${destino} `
        + "Documento gerado no navegador a partir do conteúdo decifrado neste aparelho. Sigiloso (Código de Ética, art. 9º)."]],
    secao("Identificação", modelo.identificacao, "identificacao", () => ["b", {}, "Identificação"]),
    secao("Demanda e objetivos", modelo.demanda, "demanda", () => ["b", {}, "Demanda e objetivos"]),
    secao("Procedimentos", modelo.procedimentos, "procedimento", cabData),
    secao("Evolução (registro de cada sessão)", modelo.evolucoes, "evolucao",
      (it) => ["b", {}, `${dataBR(it.reg.data_ref || it.reg.sessao_data)} · sessão ${it.numero}`]),
    secao("Anotações do RT", modelo.anotacoes, "anotacao_rt", cabData),
    secao("Encaminhamento", modelo.encaminhamentos, "encaminhamento", cabData),
    secao("Encerramento", modelo.encerramentos, "encerramento", cabData),
    secao("Documentos emitidos", modelo.documentos || [], "documento", cabData),
    secao("Instrumentos de avaliação", modelo.instrumentos || [], "instrumento", cabData),
    secao("Termo do(a) paciente (Res. CFP 09/2024)", modelo.termos, "termo", cabData),
    ["footer", {}, ["p", {}, "Registro documental conforme Res. CFP 01/2009. Nada foi apagado: retificações mostram a versão original, a data, "
      + "o(a) autor(a) e o motivo. Guarda mínima de 5 anos contados do último atendimento."]]];
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ESC[c]);

export function paraHtml(no) {
  if (typeof no === "string" || typeof no === "number") return escapar(no);
  const [tag, attrs, ...filhos] = no;
  const a = Object.entries(attrs || {}).map(([k, v]) => ` ${k}="${escapar(v)}"`).join("");
  return `<${tag}${a}>${filhos.map(paraHtml).join("")}</${tag}>`;
}

const ESTILO_EXPORTACAO = "body{font-family:Poppins,system-ui,sans-serif;color:#0E1216;max-width:780px;margin:24px auto;padding:0 16px;line-height:1.55}"
  + "h1{font-size:1.4rem;margin:4px 0}h2{font-size:1.1rem;border-bottom:2px solid #A8DCF0;padding-bottom:4px;margin-top:28px}"
  + ".marca{color:#2E9BD6;font-weight:600;margin:0}.meta{font-size:.85rem;color:#56616B}.item{border:1px solid #DCEAF3;border-radius:10px;padding:10px 12px;margin:10px 0}"
  + ".retificado{border-color:#C98B73}.cab{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:.9rem}.autor{color:#56616B}"
  + ".campo{margin:6px 0}.rot{display:block;font-size:.8rem;color:#56616B}.val{white-space:pre-wrap}del{color:#56616B}.retif{border-left:3px solid #C98B73;padding-left:10px;margin-top:8px}"
  + ".sem{color:#56616B;font-size:.9rem}footer{margin-top:30px;font-size:.8rem;color:#56616B}@media print{body{margin:0}.item{break-inside:avoid}}";

export function documentoHtml(modelo, meta) {
  return "<!doctype html>\n<html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
    + "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'\">"
    + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    + `<title>${escapar(`Prontuário ${meta.codigo}`)}</title><style>${ESTILO_EXPORTACAO}</style></head><body>`
    + paraHtml(arvoreDocumento(modelo, meta)) + "</body></html>\n";
}
