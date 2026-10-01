// Ícones SVG simples, desenhados aqui (sem CDN, sem innerHTML): createElementNS + atributo "d".
// Rodada 3 (persona associada A12): a barra inferior tinha letras soltas ("P", "S", "+") que pareciam avatar.
const NS = "http://www.w3.org/2000/svg";

const CAMINHOS = {
  casa: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h5v-6h4v6h5V9.5"],
  pessoas: ["M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19", "M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5",
    "M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35", "M15.5 4.2a3.25 3.25 0 0 1 0 6.1"],
  mais: ["M12 5v14", "M5 12h14"],
  calendario: ["M4 6.5h16V20H4z", "M4 10.5h16", "M8.5 4v4", "M15.5 4v4"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  moeda: ["M12 3v18", "M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3"],
  lista: ["M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01", "M4.5 12h.01", "M4.5 18h.01"],
  envelope: ["M3.5 6h17v12h-17z", "M3.5 6.5 12 13l8.5-6.5"],
  setas: ["M7 7h13", "M16 3l4 4-4 4", "M17 17H4", "M8 13l-4 4 4 4"],
  alerta: ["M12 3 2.5 20h19z", "M12 10v4.5", "M12 17.5h.01"],
  olho: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6"],
  cadeado: ["M5.5 11h13v9.5h-13z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  disco: ["M4 5h16v14H4z", "M4 15h16", "M8 18h.01"],
  usuario: ["M19 20v-1.5A3.5 3.5 0 0 0 15.5 15h-7A3.5 3.5 0 0 0 5 18.5V20", "M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  documento: ["M6 3h8l4 4v14H6z", "M14 3v4h4", "M9 12h6", "M9 16h6"],
  balanca: ["M12 4v16", "M7 20h10", "M5 8h14", "M5 8l-2.5 6a2.5 2.5 0 0 0 5 0z", "M19 8l-2.5 6a2.5 2.5 0 0 0 5 0z"],
  escudo: ["M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"],
};

export function icone(nome, rotulo = null) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ic-svg");
  if (rotulo) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", rotulo); } else svg.setAttribute("aria-hidden", "true");
  for (const d of CAMINHOS[nome] || CAMINHOS.menu) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
