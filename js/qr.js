// Gerador de QR Code (ISO/IEC 18004), modo byte, correção de erro M. Escrito aqui para não depender de biblioteca de fora
// nem de rede na cerimônia. É codificação pública, não cripto. Conferido contra o segno (Python) em test_cofre_js.py.
// Segue a descrição do padrão como na implementação de referência de Nayuki (MIT).

const ECL_M = { ordinal: 1, formato: 0 };
const ECC_POR_BLOCO = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCOS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35,
  37, 38, 40, 43, 45, 47, 49];

function modulosBrutos(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function codewordsDados(ver) {
  return Math.floor(modulosBrutos(ver) / 8) - ECC_POR_BLOCO[ver] * BLOCOS[ver];
}

function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisor(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mul(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = mul(raiz, 0x02);
  }
  return r;
}

function resto(dados, div) {
  const r = new Array(div.length).fill(0);
  for (const b of dados) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= mul(c, f); });
  }
  return r;
}

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function posicoesAlinhamento(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const passo = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = ver * 4 + 17 - 7; r.length < n; pos -= passo) r.splice(1, 0, pos);
  return r;
}

// Devolve a matriz (linhas de booleanos, true = escuro), sem margem. `mascara` forçada serve aos testes.
export function codificar(texto, mascara = -1) {
  const bytes = typeof texto === "string" ? new TextEncoder().encode(texto) : texto;
  let ver = 1;
  for (; ver <= 40; ver++) {
    const bitsContagem = ver <= 9 ? 8 : 16;
    if (4 + bitsContagem + bytes.length * 8 <= codewordsDados(ver) * 8) break;
  }
  if (ver > 40) throw new Error("texto grande demais para QR");
  const bb = [];
  const por = (v, n) => { for (let i = n - 1; i >= 0; i--) bb.push((v >>> i) & 1); };
  por(4, 4);
  por(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) por(b, 8);
  const capacidade = codewordsDados(ver) * 8;
  por(0, Math.min(4, capacidade - bb.length));
  por(0, (8 - (bb.length % 8)) % 8);
  for (let p = 0xec; bb.length < capacidade; p ^= 0xec ^ 0x11) por(p, 8);
  const dados = [];
  for (let i = 0; i < bb.length; i += 8) dados.push(bb.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // blocos e correção de erro (Reed-Solomon), intercalados
  const nBlocos = BLOCOS[ver], eccLen = ECC_POR_BLOCO[ver];
  const brutos = Math.floor(modulosBrutos(ver) / 8);
  const nCurtos = nBlocos - (brutos % nBlocos), curto = Math.floor(brutos / nBlocos);
  const div = divisor(eccLen);
  const blocos = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const dat = dados.slice(k, k + curto - eccLen + (i < nCurtos ? 0 : 1));
    k += dat.length;
    const ecc = resto(dat, div);
    if (i < nCurtos) dat.push(0);
    blocos.push(dat.concat(ecc));
  }
  const final = [];
  for (let i = 0; i < blocos[0].length; i++) {
    blocos.forEach((b, j) => { if (i !== curto - eccLen || j >= nCurtos) final.push(b[i]); });
  }

  const tam = ver * 4 + 17;
  const m = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fun = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const pos = (x, y, escuro) => { m[y][x] = escuro; fun[y][x] = true; };
  for (let i = 0; i < tam; i++) { pos(6, i, i % 2 === 0); pos(i, 6, i % 2 === 0); }
  const localizador = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < tam && yy >= 0 && yy < tam) pos(xx, yy, d !== 2 && d !== 4);
    }
  };
  localizador(3, 3); localizador(tam - 4, 3); localizador(3, tam - 4);
  const al = posicoesAlinhamento(ver), na = al.length;
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) pos(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formato = (masc) => {
    const d = (ECL_M.formato << 3) | masc;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) pos(8, i, bit(bits, i));
    pos(8, 7, bit(bits, 6)); pos(8, 8, bit(bits, 7)); pos(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) pos(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) pos(tam - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) pos(8, tam - 15 + i, bit(bits, i));
    pos(8, tam - 8, true);
  };
  formato(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = tam - 11 + (i % 3), b = Math.floor(i / 3);
      pos(a, b, bit(bits, i)); pos(b, a, bit(bits, i));
    }
  }
  // dados em zigue-zague
  let i = 0;
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let v = 0; v < tam; v++) for (let j = 0; j < 2; j++) {
      const x = dir - j, sobe = ((dir + 1) & 2) === 0, y = sobe ? tam - 1 - v : v;
      if (!fun[y][x] && i < final.length * 8) { m[y][x] = bit(final[i >>> 3], 7 - (i & 7)); i++; }
    }
  }
  const aplicar = (masc) => {
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
      let inv;
      switch (masc) {
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (!fun[y][x] && inv) m[y][x] = !m[y][x];
    }
  };
  let melhor = mascara;
  if (melhor < 0) {
    let menor = Infinity;
    for (let k = 0; k < 8; k++) {
      aplicar(k); formato(k);
      const p = penalidade(m, tam);
      if (p < menor) { menor = p; melhor = k; }
      aplicar(k);
    }
  }
  aplicar(melhor); formato(melhor);
  return { versao: ver, mascara: melhor, matriz: m };
}

function penalidade(m, tam) {
  let r = 0;
  const hist = (corr, h) => { if (h[0] === 0) corr += tam; h.pop(); h.unshift(corr); };
  const conta = (h) => {
    const n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const termina = (cor, corr, h) => { if (cor) { hist(corr, h); corr = 0; } corr += tam; hist(corr, h); return conta(h); };
  for (const eixo of [0, 1]) {
    for (let a = 0; a < tam; a++) {
      let cor = false, corr = 0;
      const h = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < tam; b++) {
        const v = eixo === 0 ? m[a][b] : m[b][a];
        if (v === cor) { corr++; if (corr === 5) r += 3; else if (corr > 5) r++; } else {
          hist(corr, h);
          if (!cor) r += conta(h) * 40;
          cor = v; corr = 1;
        }
      }
      r += termina(cor, corr, h) * 40;
    }
  }
  for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r += 3;
  }
  let escuros = 0;
  for (const linha of m) for (const v of linha) if (v) escuros++;
  const total = tam * tam;
  r += (Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1) * 10;
  return r;
}

// SVG montado só com createElementNS (sem innerHTML). Margem de 4 módulos, como pede o padrão.
export function desenharQR(texto, rotulo = "QR Code") {
  const { matriz } = codificar(texto);
  const tam = matriz.length, borda = 4, lado = tam + borda * 2;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${lado} ${lado}`);
  svg.setAttribute("class", "qr-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", rotulo);
  svg.setAttribute("shape-rendering", "crispEdges");
  const fundo = document.createElementNS(NS, "rect");
  fundo.setAttribute("width", String(lado)); fundo.setAttribute("height", String(lado)); fundo.setAttribute("fill", "#fff");
  const partes = [];
  matriz.forEach((linha, y) => linha.forEach((v, x) => { if (v) partes.push(`M${x + borda} ${y + borda}h1v1h-1z`); }));
  const caminho = document.createElementNS(NS, "path");
  caminho.setAttribute("d", partes.join(""));
  caminho.setAttribute("fill", "#000");
  svg.append(fundo, caminho);
  return svg;
}
