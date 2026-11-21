/*
 * Shadows of the Citadel - mission card art.
 * The four missions with paintings use those. Every other mission gets a generated, animated SVG
 * illustration in the same dark gold-framed style, so every mission has a proper card panel.
 * Pure string builders: no DOM access, no external files.
 */
(function (root) {
  'use strict';

  function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Greedy word wrap into at most `max` lines of about `width` characters.
  function wrap(text, width, max) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    words.forEach(w => {
      if ((cur + ' ' + w).trim().length > width && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines.slice(0, max);
  }

  // ---------- shared pieces ----------
  const flame = (x, y, s, delay) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><g class="flame" style="animation-delay:${delay || 0}s">` +
    '<path d="M0 0C-9 -8 -10 -20 -3 -32C-2 -24 2 -22 3 -28C10 -18 9 -6 0 0Z" fill="#ff8a1f"/>' +
    '<path d="M0 0C-5 -5 -5 -12 0 -19C5 -12 5 -5 0 0Z" fill="#ffd36b"/></g></g>';
  const glow = (x, y, r, c) =>
    `<circle class="glow-pulse" cx="${x}" cy="${y}" r="${r}" fill="url(#g-${c})"/>`;
  const embers = (x, y, n, spread) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const dx = ((i * 37) % spread) - spread / 2;
      s += `<circle class="rise" cx="${x + dx}" cy="${y}" r="${1 + (i % 2)}" fill="#ffb347" style="animation-delay:-${(i * 0.7).toFixed(1)}s;animation-duration:${(2.4 + (i % 3) * 0.6).toFixed(1)}s"/>`;
    }
    return s;
  };
  const stars = n => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 40 + (i * 89) % 320, y = 120 + (i * 53) % 110;
      s += `<circle class="twinkle" cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.6 : 1}" fill="#fff" style="animation-delay:-${(i * 0.5).toFixed(1)}s"/>`;
    }
    return s;
  };

  const DEFS = `<defs>
    <radialGradient id="g-warm"><stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-cold"><stop offset="0" stop-color="#9bd0ff" stop-opacity=".55"/><stop offset="1" stop-color="#9bd0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-red"><stop offset="0" stop-color="#ff5a3c" stop-opacity=".8"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></radialGradient>
    <linearGradient id="sk-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1a24"/><stop offset=".55" stop-color="#274456"/><stop offset="1" stop-color="#3b5b6b"/></linearGradient>
    <linearGradient id="sk-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15121f"/><stop offset=".6" stop-color="#4a2f3a"/><stop offset="1" stop-color="#b0623a"/></linearGradient>
    <linearGradient id="sk-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="#1a2338"/></linearGradient>
    <linearGradient id="sk-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1830"/><stop offset=".6" stop-color="#7a4a52"/><stop offset="1" stop-color="#e0a060"/></linearGradient>
    <linearGradient id="sk-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2326"/><stop offset="1" stop-color="#4b5a58"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c3a4a"/><stop offset="1" stop-color="#07131b"/></linearGradient>
    <linearGradient id="fade-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></linearGradient>
  </defs>`;

  // ---------- scenes: each draws inside the art window x 28..372, y 112..432 ----------
  const SCENES = {
    sea() {
      const ship = (x, y, s, d) =>
        `<g class="bob" style="animation-delay:-${d}s" transform="translate(${x} ${y}) scale(${s})">` +
        '<path d="M-26 0H26L18 9H-18Z" fill="#0b0f14"/><path d="M0 0V-44" stroke="#0b0f14" stroke-width="2.5"/>' +
        '<path d="M2 -42L24 -10H2Z" fill="#161c24"/><path d="M-2 -36L-18 -8H-2Z" fill="#12171e"/></g>';
      return `<rect x="28" y="112" width="344" height="320" fill="url(#sk-storm)"/>` +
        '<ellipse cx="110" cy="150" rx="110" ry="30" fill="#0c1620" opacity=".85"/><ellipse cx="300" cy="140" rx="120" ry="28" fill="#0f1b27" opacity=".9"/>' +
        '<ellipse cx="210" cy="190" rx="150" ry="22" fill="#1a2e3c" opacity=".8"/>' +
        '<polyline class="flash" points="262,150 248,196 262,196 244,244" fill="none" stroke="#e6f3ff" stroke-width="3"/>' +
        '<rect x="28" y="244" width="344" height="188" fill="url(#sea)"/>' +
        ship(120, 292, 0.9, 0) + ship(262, 280, 0.7, 1.4) + ship(200, 318, 1.15, 2.2) + ship(318, 330, 0.8, 0.8) +
        '<g class="wave"><path d="M-40 300q30-14 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#6f9db3" stroke-width="2" opacity=".5"/></g>' +
        '<g class="wave slow"><path d="M-70 340q30-14 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#8fb7cb" stroke-width="2.4" opacity=".45"/></g>' +
        '<g class="wave"><path d="M-20 384q30-16 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#a9cfe0" stroke-width="3" opacity=".4"/></g>' +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".5"/>';
    },
    mountains() {
      return `<rect x="28" y="112" width="344" height="320" fill="url(#sk-dusk)"/>` +
        stars(10) +
        '<polygon points="28,300 90,226 130,262 190,190 250,262 300,232 372,300 372,432 28,432" fill="#2a2433"/>' +
        '<polygon points="28,360 80,290 140,340 205,214 270,330 330,280 372,340 372,432 28,432" fill="#1a1722"/>' +
        '<polygon points="205,214 190,244 200,238 207,254 215,240 224,246" fill="#e9eef5" opacity=".9"/>' +
        '<polygon points="80,290 66,314 76,308 84,320 94,304" fill="#cfd8e4" opacity=".7"/>' +
        glow(205, 206, 44, 'warm') + flame(205, 212, 0.9, 0) + embers(205, 196, 7, 40) +
        '<g class="drift-slow"><ellipse cx="120" cy="330" rx="90" ry="9" fill="#d8b49a" opacity=".16"/><ellipse cx="300" cy="352" rx="100" ry="10" fill="#d8b49a" opacity=".14"/></g>' +
        '<polygon points="28,400 120,372 210,404 300,368 372,396 372,432 28,432" fill="#0e0c14"/>';
    },
    beacons() {
      const hill = (x, y, w) => `<path d="M${x - w} 432Q${x - w / 2} ${y + 16} ${x} ${y}Q${x + w / 2} ${y + 16} ${x + w} 432Z" fill="#0b0f18"/>`;
      const bea = (x, y, s, d) => glow(x, y - 12 * s, 38 * s, 'warm') + flame(x, y, s, d) + `<rect x="${x - 6 * s}" y="${y}" width="${12 * s}" height="${8 * s}" fill="#2a2018"/>`;
      return `<rect x="28" y="112" width="344" height="320" fill="url(#sk-night)"/>` + stars(22) +
        '<circle cx="320" cy="160" r="20" fill="#e8edf5" opacity=".9"/><circle cx="328" cy="156" r="18" fill="#05070f" opacity=".55"/>' +
        hill(100, 340, 130) + hill(280, 310, 120) + hill(200, 270, 100) + hill(200, 398, 220) +
        bea(200, 262, 0.8, 0) + bea(100, 332, 1.0, -0.4) + bea(280, 302, 0.9, -0.7) +
        '<polygon class="beam" points="200,252 150,150 250,150" fill="#ffd9a0" opacity=".14"/>' +
        embers(100, 318, 5, 30) + embers(280, 288, 5, 30);
    },
    archives() {
      let shelves = '';
      for (let r = 0; r < 4; r++) {
        shelves += `<rect x="52" y="${140 + r * 70}" width="296" height="6" fill="#3a2a1a"/>`;
        for (let i = 0; i < 17; i++) {
          const h = 28 + ((i * 7 + r * 5) % 18), c = ['#5a2a2a', '#2a3f5a', '#4a3a1e', '#35304a', '#2d4a3a'][(i + r) % 5];
          shelves += `<rect x="${56 + i * 17}" y="${140 + r * 70 - h}" width="14" height="${h}" fill="${c}"/>`;
        }
      }
      return `<rect x="28" y="112" width="344" height="320" fill="#120c08"/>` + shelves +
        '<rect x="28" y="112" width="344" height="320" fill="url(#g-red)" opacity="0"/>' +
        `<g class="fireglow"><rect x="28" y="300" width="344" height="132" fill="url(#g-red)"/></g>` +
        flame(90, 424, 1.6, 0) + flame(150, 428, 1.3, -.3) + flame(250, 426, 1.5, -.6) + flame(312, 424, 1.2, -.2) +
        embers(120, 400, 9, 220) + embers(280, 400, 7, 160) +
        '<rect class="paper" x="170" y="260" width="12" height="16" fill="#e8dcc0" opacity=".85" transform="rotate(14 176 268)"/>' +
        '<rect class="paper" style="animation-delay:-2s" x="230" y="300" width="10" height="14" fill="#e8dcc0" opacity=".8" transform="rotate(-18 235 307)"/>' +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".35"/>';
    },
    gates() {
      let stone = '';
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        const off = r % 2 ? 20 : 0;
        stone += `<rect x="${28 + c * 40 - off}" y="${112 + r * 36}" width="38" height="34" fill="${(r + c) % 3 ? '#2a2c32' : '#32343a'}"/>`;
      }
      let bars = '';
      for (let i = 0; i < 7; i++) bars += `<rect x="${118 + i * 27}" y="170" width="8" height="262" fill="#16181c"/>`;
      return `<rect x="28" y="112" width="344" height="320" fill="#1a1b20"/>` + stone +
        '<path d="M104 432V230Q200 130 296 230V432Z" fill="#05060a"/>' + bars +
        '<rect x="104" y="250" width="192" height="9" fill="#16181c"/><rect x="104" y="320" width="192" height="9" fill="#16181c"/><rect x="104" y="388" width="192" height="9" fill="#16181c"/>' +
        '<polygon points="230,170 262,250 240,260 218,196" fill="#2a2c32"/>' +
        glow(70, 262, 44, 'warm') + flame(70, 272, 1.0, 0) + glow(330, 262, 44, 'warm') + flame(330, 272, 1.0, -.5) +
        '<g class="hammer"><rect x="156" y="276" width="9" height="40" fill="#6a4a2a" transform="rotate(30 160 296)"/><rect x="146" y="268" width="30" height="14" fill="#7d8590" transform="rotate(30 160 296)"/></g>' +
        embers(176, 310, 6, 40).replace(/#ffb347/g, '#ffd36b') +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".4"/>';
    },
    scouts() {
      const pine = (x, y, s) => `<polygon points="${x},${y - 60 * s} ${x - 16 * s},${y} ${x + 16 * s},${y}" fill="#0c1412"/><polygon points="${x},${y - 84 * s} ${x - 12 * s},${y - 34 * s} ${x + 12 * s},${y - 34 * s}" fill="#0c1412"/>`;
      return `<rect x="28" y="112" width="344" height="320" fill="url(#sk-fog)"/>` +
        pine(60, 400, 1.2) + pine(110, 410, 1.0) + pine(310, 404, 1.3) + pine(350, 396, 0.9) +
        '<g transform="translate(176 380)"><path d="M0 0q8-14 18-10l10-8 4 6 8 2-2 8-6 12z" fill="#080c0b"/><circle cx="10" cy="-18" r="5" fill="#080c0b"/></g>' +
        '<g transform="translate(236 392) scale(.8)"><path d="M0 0q8-14 18-10l10-8 4 6 8 2-2 8-6 12z" fill="#080c0b"/><circle cx="10" cy="-18" r="5" fill="#080c0b"/></g>' +
        glow(204, 362, 24, 'warm').replace('glow-pulse', 'glow-pulse lantern') + '<circle cx="204" cy="362" r="3" fill="#ffe3a0"/>' +
        '<g class="drift"><ellipse cx="80" cy="300" rx="110" ry="22" fill="#cfd8d6" opacity=".22"/><ellipse cx="300" cy="340" rx="130" ry="26" fill="#cfd8d6" opacity=".2"/><ellipse cx="200" cy="400" rx="150" ry="24" fill="#cfd8d6" opacity=".24"/></g>' +
        '<g class="drift rev"><ellipse cx="150" cy="260" rx="120" ry="20" fill="#e2e8e6" opacity=".16"/><ellipse cx="330" cy="290" rx="100" ry="18" fill="#e2e8e6" opacity=".16"/></g>';
    },
    forge() {
      return `<rect x="28" y="112" width="344" height="320" fill="#0c0807"/>` +
        '<rect x="52" y="140" width="130" height="150" rx="8" fill="#1d130e"/>' +
        '<g class="fireglow"><rect x="64" y="170" width="106" height="100" rx="6" fill="url(#g-red)"/></g><rect x="74" y="196" width="86" height="56" rx="4" fill="#ff6a2a" opacity=".85" class="glow-pulse"/>' +
        flame(94, 252, 1.4, 0) + flame(118, 254, 1.7, -.3) + flame(142, 252, 1.3, -.6) +
        '<polygon points="196,330 330,330 316,352 270,352 270,388 306,388 306,404 220,404 220,388 256,388 256,352 210,352" fill="#2c2f36"/>' +
        '<g class="hammer big"><rect x="250" y="236" width="12" height="80" fill="#6a4a2a" transform="rotate(25 256 316)"/><rect x="236" y="226" width="40" height="18" fill="#8a93a0" transform="rotate(25 256 316)"/></g>' +
        embers(246, 326, 12, 90) + '<circle class="rise" cx="270" cy="322" r="2" fill="#fff0b0"/>' +
        '<rect x="28" y="400" width="344" height="32" fill="#070504"/>' +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".35"/>';
    },
    oath() {
      const banner = (x, c, d) =>
        `<rect x="${x}" y="190" width="4" height="130" fill="#2a2018"/><g class="sway" style="animation-delay:-${d}s"><path d="M${x + 4} 194h46l-12 22 12 22h-46z" fill="${c}"/></g>`;
      const knight = x => `<g transform="translate(${x} 400)"><circle cx="0" cy="-34" r="7" fill="#0a0c10"/><path d="M-9 0v-26h18v26z" fill="#0a0c10"/><path d="M-9 -22l-8 14M9 -22l8 14" stroke="#0a0c10" stroke-width="5"/></g>`;
      let rays = '';
      for (let a = 0; a < 360; a += 30) {
        const p = d => `${(200 + 230 * Math.cos(d * Math.PI / 180)).toFixed(1)},${(250 + 230 * Math.sin(d * Math.PI / 180)).toFixed(1)}`;
        rays += `<polygon points="200,250 ${p(a - 6)} ${p(a + 6)}"/>`;
      }
      return `<rect x="28" y="112" width="344" height="320" fill="url(#sk-dawn)"/>` +
        `<g class="spin-slow"><g opacity=".2" fill="#ffe3a0">${rays}</g></g>` +
        '<circle cx="200" cy="250" r="70" fill="url(#g-warm)"/>' +
        banner(52, '#8a1f2a', 0) + banner(310, '#1f4a8a', 1.2) +
        '<g class="glow-pulse"><path d="M200 168l7 70h-14z" fill="#e8eef5"/><rect x="178" y="236" width="44" height="8" rx="3" fill="#c9a66b"/><rect x="196" y="244" width="8" height="30" fill="#6a4a2a"/></g>' +
        '<polygon points="28,420 120,396 200,410 290,392 372,414 372,432 28,432" fill="#0a0c10"/>' +
        knight(90) + knight(140) + knight(260) + knight(310) +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".3"/>';
    }
  };

  // Generic fallback so a future quest id can never render blank.
  SCENES.default = SCENES.oath;

  // The gold frame, title and objective panel, drawn over the scene like the painted cards.
  function frame(def) {
    const titleLines = wrap(def.name.toUpperCase(), 14, 2);
    const title = titleLines.map((l, i) => `<tspan x="200" dy="${i === 0 ? 0 : 34}">${esc(l)}</tspan>`).join('');
    const ty = titleLines.length > 1 ? 70 : 92;
    const obj = wrap(def.text, 32, 3).map((l, i) => `<tspan x="200" dy="${i === 0 ? 0 : 20}">${esc(l)}</tspan>`).join('');
    const corner = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0h26M0 0v26M8 8h14M8 8v14" stroke="#b4924f" stroke-width="3" fill="none"/><circle cx="4" cy="4" r="3" fill="#d8b46a"/></g>`;
    return '<rect x="6" y="6" width="388" height="588" rx="14" fill="none" stroke="#8a6f3a" stroke-width="5"/>' +
      '<rect x="14" y="14" width="372" height="572" rx="9" fill="none" stroke="#5a4626" stroke-width="2"/>' +
      '<rect x="14" y="14" width="372" height="98" fill="#0d0a07" opacity=".78"/><rect x="14" y="432" width="372" height="154" fill="#16120d" opacity=".96"/>' +
      '<rect x="28" y="112" width="344" height="320" fill="none" stroke="#6e5730" stroke-width="2"/>' +
      corner(14, 14, 0) + corner(386, 14, 90) + corner(386, 586, 180) + corner(14, 586, 270) +
      `<text x="200" y="${ty}" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" letter-spacing="2" fill="#efe4c8">${title}</text>` +
      '<text x="200" y="462" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="3" fill="#c9a66b">OBJECTIVE</text>' +
      '<path d="M120 470h160" stroke="#6e5730" stroke-width="1.5"/>' +
      `<text x="200" y="496" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#e1d6bd">${obj}</text>`;
  }

  // Full card illustration for one quest definition. `def` comes from Citadel.questDef().
  function art(def, base) {
    if (def.img) {
      return `<img class="mc-img" src="${(base || 'assets/') + def.img}.jpg" alt="${esc(def.name)}" draggable="false">`;
    }
    const scene = (SCENES[def.id] || SCENES.default)();
    return `<svg class="mc-svg" viewBox="0 0 400 600" role="img" aria-label="${esc(def.name)}" xmlns="http://www.w3.org/2000/svg">` +
      DEFS + '<rect width="400" height="600" fill="#0d0a07"/>' +
      '<clipPath id="win"><rect x="28" y="112" width="344" height="320"/></clipPath>' +
      `<g clip-path="url(#win)">${scene}</g>` + frame(def) + '</svg>';
  }

  root.CitadelMissions = { art, SCENES };
})(typeof window !== 'undefined' ? window : globalThis);
