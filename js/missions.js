/*
 * Shadows of the Citadel - mission card art.
 *
 * The four missions with full painted cards use those images. Every other mission is drawn here as a layered,
 * animated SVG scene (depth haze, bloom, grain, vignette) inside a gold card frame with its title and objective.
 *
 * Painting drop-in (either one, no code changes needed):
 *   assets/art/<mission id>.jpg   an illustration only (no text, no frame), roughly square, e.g. 1024x1024.
 *                                 Shown inside the generated gold frame with the title and objective, with a slow drift.
 *   assets/card/<mission id>.jpg  a complete card (frame and title painted in), 2:3 portrait like the four painted cards.
 *                                 Covers the whole generated card.
 * If a file is missing the generated scene simply shows through. See docs/MISSION_ART.md for ready-made prompts.
 *
 * Pure string builders: no DOM access.
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
    '<path d="M0 0C-10 -8 -11 -22 -3 -36C-2 -26 2 -24 3 -31C11 -20 10 -6 0 0Z" fill="#e8621a"/>' +
    '<path d="M0 0C-7 -6 -7 -16 -1 -26C0 -19 3 -17 4 -21C8 -13 6 -5 0 0Z" fill="#ff9a2e"/>' +
    '<path d="M0 0C-4 -4 -4 -10 0 -17C4 -10 4 -4 0 0Z" fill="#ffe08a"/></g></g>';
  const glow = (x, y, r, c, cls) =>
    `<circle class="${cls || 'glow-pulse'}" cx="${x}" cy="${y}" r="${r}" fill="url(#g-${c})"/>`;
  const embers = (x, y, n, spread, col) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const dx = ((i * 37) % spread) - spread / 2;
      s += `<circle class="rise" cx="${x + dx}" cy="${y}" r="${(0.8 + (i % 3) * 0.5).toFixed(1)}" fill="${col || '#ffb347'}" style="animation-delay:-${(i * 0.7).toFixed(1)}s;animation-duration:${(2.4 + (i % 4) * 0.5).toFixed(1)}s"/>`;
    }
    return s;
  };
  const stars = (n, y0, h) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 32 + (i * 89 + (i * i) % 41) % 336, y = (y0 || 116) + (i * 53 + (i * 7) % 29) % (h || 110);
      s += `<circle class="twinkle" cx="${x}" cy="${y}" r="${i % 5 === 0 ? 1.7 : i % 2 ? 0.8 : 1.1}" fill="#fff" style="animation-delay:-${(i * 0.37).toFixed(1)}s"/>`;
    }
    return s;
  };
  const motes = (n, color) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      s += `<circle class="mote" cx="${40 + (i * 61) % 320}" cy="${150 + (i * 47) % 260}" r="${1 + (i % 3) * 0.6}" fill="${color || '#ffe6b0'}" style="animation-delay:-${(i * 1.3).toFixed(1)}s;animation-duration:${9 + (i % 5) * 2}s"/>`;
    }
    return s;
  };
  // Progress hooks for the live scenes. `pg` is hidden until the mission has reached `at` (0..1) of its progress,
  // `pgx` is shown until then. The UI toggles the "on" class (see update() in live()).
  const pg = (at, inner, cls) => `<g class="pg ${cls || ''}" data-at="${at}">${inner}</g>`;
  const pgx = (at, inner, cls) => `<g class="pgx ${cls || ''}" data-at="${at}">${inner}</g>`;

  // Painted-looking figure silhouettes
  const rider = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c || '#06080a'}">` +
    '<ellipse cx="0" cy="-26" rx="23" ry="11"/><path d="M17 -31L31 -55L42 -50L39 -41L25 -22Z"/><path d="M36 -52L42 -62L46 -50Z"/>' +
    '<path d="M-19 -22L-27 5M-8 -18L-10 5M10 -18L13 5M21 -22L30 3" stroke="' + (c || '#06080a') + '" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M-22 -28q-14 4 -18 16" stroke="' + (c || '#06080a') + '" stroke-width="4" fill="none"/>' +
    '<rect x="-6" y="-62" width="13" height="28" rx="5"/><circle cx="0" cy="-68" r="6.5"/><path d="M-6 -58L-24 -30L-2 -34Z"/></g>';
  const knight = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c || '#06080b'}">` +
    '<circle cx="0" cy="-46" r="7"/><path d="M-12 0L-10 -36Q0 -42 10 -36L12 0Z"/><path d="M-10 -34L-20 -14M10 -34L18 -16" stroke="' + (c || '#06080b') + '" stroke-width="6" stroke-linecap="round" fill="none"/>' +
    '<rect x="-3" y="-30" width="6" height="30" opacity=".0"/></g>';

  const DEFS = `<defs>
    <radialGradient id="g-warm"><stop offset="0" stop-color="#ffb347" stop-opacity=".85"/><stop offset=".45" stop-color="#ff8a2a" stop-opacity=".3"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-cold"><stop offset="0" stop-color="#bfe0ff" stop-opacity=".6"/><stop offset="1" stop-color="#bfe0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-red"><stop offset="0" stop-color="#ff5a3c" stop-opacity=".85"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-white"><stop offset="0" stop-color="#fff6dc" stop-opacity=".95"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx=".5" cy=".48" r=".78"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></radialGradient>
    <linearGradient id="sk-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070d14"/><stop offset=".5" stop-color="#1c3646"/><stop offset="1" stop-color="#47697a"/></linearGradient>
    <linearGradient id="sk-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f0d1a"/><stop offset=".45" stop-color="#3a2a44"/><stop offset=".78" stop-color="#9a5640"/><stop offset="1" stop-color="#e0904c"/></linearGradient>
    <linearGradient id="sk-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050c"/><stop offset=".7" stop-color="#101a30"/><stop offset="1" stop-color="#263a5a"/></linearGradient>
    <linearGradient id="sk-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14122a"/><stop offset=".5" stop-color="#6a3f56"/><stop offset=".85" stop-color="#e0905a"/><stop offset="1" stop-color="#ffd08a"/></linearGradient>
    <linearGradient id="sk-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1618"/><stop offset=".6" stop-color="#34484a"/><stop offset="1" stop-color="#6c8280"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5062"/><stop offset=".5" stop-color="#10303f"/><stop offset="1" stop-color="#040c12"/></linearGradient>
    <linearGradient id="hall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0706"/><stop offset="1" stop-color="#2a1a10"/></linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a98a" stop-opacity="0"/><stop offset="1" stop-color="#c9a98a" stop-opacity=".38"/></linearGradient>
    <linearGradient id="fade-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></linearGradient>
    <linearGradient id="fade-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080605" stop-opacity=".94"/><stop offset=".6" stop-color="#080605" stop-opacity=".55"/><stop offset="1" stop-color="#080605" stop-opacity="0"/></linearGradient>
    <linearGradient id="fade-bot" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#080605" stop-opacity=".96"/><stop offset=".7" stop-color="#080605" stop-opacity=".7"/><stop offset="1" stop-color="#080605" stop-opacity="0"/></linearGradient>
    <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe6b0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></linearGradient>
    <filter id="blur1" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="blur3" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="blur8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .9 -.2"/></filter>
    <filter id="paint" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="3" seed="4" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 -.1"/></filter>
  </defs>`;

  // Film grain, painterly mottling and a vignette, laid over every generated scene.
  const POST = '<rect x="28" y="112" width="344" height="320" filter="url(#paint)" opacity=".5" style="mix-blend-mode:multiply"/>' +
    '<rect x="28" y="112" width="344" height="320" filter="url(#grain)" opacity=".22" style="mix-blend-mode:overlay"/>' +
    '<rect x="28" y="112" width="344" height="320" fill="url(#vig)"/>';

  // ---------- scenes: each draws inside the art window x 28..372, y 112..432 ----------
  const SCENES = {
    sea() {
      const ship = (x, y, s, d, lit, at) =>
        `<g class="spot" data-at="${at}"><circle class="mark" cx="${x}" cy="${y - 30 * s}" r="${18 * s + 8}" fill="none" stroke="#ff6a4a" stroke-width="1.8"/>` +
        `<g class="bob" style="animation-delay:-${d}s" transform="translate(${x} ${y}) scale(${s})">` +
        '<path d="M-30 0Q-26 10 -14 11H16Q28 10 32 0L26 -6H-24Z" fill="#05080c"/>' +
        '<path d="M-4 -6V-62M12 -6V-52M-18 -6V-42" stroke="#05080c" stroke-width="2.2"/>' +
        '<path d="M-3 -58Q18 -44 22 -12H-3Z" fill="#0c1218"/><path d="M13 -50Q28 -38 30 -10H13Z" fill="#0a0f15"/><path d="M-19 -40Q-30 -26 -30 -10H-19Z" fill="#0b1117"/>' +
        '<path d="M-3 -58Q8 -44 6 -12" stroke="#2c4252" stroke-width=".8" fill="none" opacity=".6"/>' +
        (lit ? '<circle cx="-24" cy="-10" r="2.2" fill="#ffc46a"/><circle cx="-24" cy="-10" r="9" fill="url(#g-warm)"/>' : '') + '</g>' +
        `<ellipse cx="${x}" cy="${y + 14 * s}" rx="${24 * s}" ry="${3 * s}" fill="#9bc3d6" opacity=".12" class="wave slow"/></g>`;
      return '<rect x="28" y="112" width="344" height="320" fill="url(#sk-storm)"/>' +
        '<g filter="url(#blur8)"><ellipse cx="90" cy="150" rx="120" ry="30" fill="#05090e"/><ellipse cx="310" cy="140" rx="130" ry="32" fill="#0a131c"/><ellipse cx="200" cy="196" rx="170" ry="22" fill="#27465a" opacity=".7"/></g>' +
        '<circle cx="262" cy="176" r="46" fill="url(#g-cold)" opacity=".7"/><circle cx="262" cy="176" r="15" fill="#e6f0f8" opacity=".9"/>' +
        '<polygon points="262,176 120,432 330,432" fill="url(#shaft)" opacity=".16" class="beam"/>' +
        '<polyline class="flash" points="148,150 134,200 148,200 124,258" fill="none" stroke="#eaf5ff" stroke-width="3.2" stroke-linejoin="round"/>' +
        '<rect class="flash" x="28" y="112" width="344" height="320" fill="#cfe6ff" opacity="0"/>' +
        '<path d="M28 262L70 250L96 258L130 246L170 258L210 252L372 262V280H28Z" fill="#0a1218" filter="url(#blur1)" opacity=".9"/>' +
        '<rect x="28" y="258" width="344" height="174" fill="url(#sea)"/>' +
        '<path d="M262 262V432" stroke="#dfeefa" stroke-width="22" opacity=".12" filter="url(#blur3)"/>' +
        '<polygon class="sweep" points="40,432 40,290 170,300" fill="#cfe6ff" opacity=".13"/>' +
        ship(92, 282, 0.55, 0.4, false, 0.08) + ship(166, 290, 0.7, 1.6, true, 0.24) + ship(300, 288, 0.6, 2.4, false, 0.4) + ship(236, 306, 0.95, 0.9, true, 0.62) + ship(120, 346, 1.35, 2.0, true, 0.82) +
        '<g class="wave"><path d="M-40 304q30-12 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#7eaec4" stroke-width="1.6" opacity=".5"/></g>' +
        '<g class="wave slow"><path d="M-70 334q30-14 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#9cc4d6" stroke-width="2.2" opacity=".45"/></g>' +
        '<g class="wave"><path d="M-20 372q30-16 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#b6d6e4" stroke-width="3" opacity=".42"/></g>' +
        '<g class="wave slow"><path d="M-50 410q30-18 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" fill="none" stroke="#d0e6f0" stroke-width="4" opacity=".35"/></g>' +
        '<g class="spray"><circle cx="70" cy="378" r="1.6" fill="#fff" opacity=".6"/><circle cx="110" cy="396" r="1.3" fill="#fff" opacity=".6"/><circle cx="300" cy="388" r="1.8" fill="#fff" opacity=".6"/></g>' +
        '<rect x="28" y="330" width="344" height="102" fill="url(#fade-b)" opacity=".55"/>' + POST;
    },
    mountains() {
      const tower = '<g><rect x="190" y="204" width="30" height="40" fill="#0b0912"/><rect x="186" y="198" width="38" height="8" fill="#0b0912"/>' +
        '<path d="M186 198h6v-6h6v6h6v-6h6v6h6v-6h6v6h6" fill="#0b0912"/><rect x="199" y="218" width="5" height="10" fill="#ffb347" opacity=".7"/></g>';
      return '<rect x="28" y="112" width="344" height="320" fill="url(#sk-dusk)"/>' + stars(18, 116, 80) +
        '<ellipse cx="300" cy="250" rx="140" ry="24" fill="#f2a45e" opacity=".35" filter="url(#blur8)"/>' +
        '<polygon points="28,292 78,238 110,262 160,214 214,258 262,226 320,262 372,240 372,432 28,432" fill="#6a4a5a" filter="url(#blur1)"/>' +
        '<polygon points="28,320 70,262 118,300 176,232 232,296 290,252 340,300 372,276 372,432 28,432" fill="#3a2a3e"/>' +
        '<polygon points="176,232 164,260 174,256 180,270 188,254 196,262" fill="#f1e3d6" opacity=".55"/>' +
        '<rect x="28" y="290" width="344" height="60" fill="url(#haze)"/>' +
        '<polygon points="28,372 74,300 128,350 206,208 280,344 336,296 372,352 372,432 28,432" fill="#17121e"/>' +
        '<polygon points="206,208 188,248 200,242 208,262 218,240 230,250" fill="#f6ead8" opacity=".92"/>' +
        '<polyline points="206,208 196,232 202,236 190,262 200,258" fill="none" stroke="#ffb870" stroke-width="2" opacity=".7"/>' +
        '<polygon points="74,300 58,330 70,324 78,340 90,320" fill="#dfe4ee" opacity=".55"/>' +
        '<polygon points="336,296 320,326 332,320 340,336 352,316" fill="#dfe4ee" opacity=".5"/>' +
        pg(0.66, glow(336, 286, 40, 'warm') + flame(336, 294, 0.55, -0.3) + embers(336, 280, 4, 16), 'answer') +
        tower + '<g class="firebig"><circle cx="204" cy="202" r="70" fill="url(#g-warm)" class="glow-pulse"/>' +
        flame(204, 198, 1.1, 0) + flame(196, 200, 0.7, -0.4) + flame(212, 200, 0.7, -0.7) + embers(204, 186, 11, 50) + '</g>' +
        '<g class="smoke"><ellipse cx="206" cy="170" rx="9" ry="14" fill="#3a2e3a" opacity=".5" filter="url(#blur3)"/><ellipse cx="214" cy="146" rx="14" ry="18" fill="#2c2330" opacity=".4" filter="url(#blur3)"/></g>' +
        '<g class="drift-slow"><ellipse cx="110" cy="338" rx="100" ry="10" fill="#e7c0a0" opacity=".16" filter="url(#blur3)"/><ellipse cx="300" cy="362" rx="110" ry="11" fill="#e7c0a0" opacity=".14" filter="url(#blur3)"/></g>' +
        '<polygon points="28,404 100,380 170,408 250,376 330,402 372,386 372,432 28,432" fill="#0a0810"/>' +
        '<g transform="translate(88 392)" fill="#04030a"><circle cx="0" cy="-30" r="5"/><path d="M-6 0L-5 -24Q0 -28 5 -24L6 0Z"/><path d="M6 -22L16 -34" stroke="#04030a" stroke-width="3"/></g>' +
        '<circle cx="106" cy="358" r="14" fill="url(#g-warm)" opacity=".6"/>' + flame(105, 366, 0.35, -0.2) + POST;
    },
    beacons() {
      const hill = (x, y, w, c) => `<path d="M${x - w} 432Q${x - w * 0.5} ${y + 14} ${x} ${y}Q${x + w * 0.5} ${y + 14} ${x + w} 432Z" fill="${c}"/>`;
      const bea = (x, y, s, d, haze, at) =>
        `<g opacity="${haze}"><rect x="${x - 7 * s}" y="${y}" width="${14 * s}" height="${9 * s}" fill="#241a14"/><circle cx="${x}" cy="${y - 1}" r="${2.2 * s}" fill="#7a2a14"/>` +
        pg(at, glow(x, y - 14 * s, 46 * s, 'warm') + flame(x, y, s, d), 'lit') + '</g>';
      return '<rect x="28" y="112" width="344" height="320" fill="url(#sk-night)"/>' +
        '<g filter="url(#blur8)"><polygon points="28,200 372,130 372,190 28,260" fill="#7a8ec0" opacity=".28"/></g>' + stars(44, 116, 120) +
        '<circle cx="326" cy="162" r="38" fill="url(#g-cold)"/><circle cx="326" cy="162" r="16" fill="#eef2f8"/><circle cx="334" cy="158" r="14" fill="#0b1224" opacity=".5"/>' +
        hill(250, 300, 150, '#0b1222') + hill(120, 310, 120, '#0a101e') +
        '<rect x="28" y="290" width="344" height="40" fill="#3a4a72" opacity=".18" filter="url(#blur8)"/>' +
        bea(250, 296, 0.5, -0.2, 0.8, 0.54) + bea(120, 306, 0.6, -0.5, 0.85, 0.7) + bea(312, 318, 0.55, -0.8, 0.7, 0.86) +
        hill(300, 350, 130, '#070b16') + hill(80, 360, 120, '#060914') +
        bea(300, 346, 0.85, -0.3, 1, 0.38) + bea(80, 356, 0.95, -0.6, 1, 0.22) +
        hill(200, 392, 230, '#04060d') +
        '<g><rect x="168" y="318" width="64" height="86" fill="#04060c"/><rect x="162" y="310" width="76" height="10" fill="#04060c"/>' +
        '<path d="M162 310h8v-8h8v8h8v-8h8v8h8v-8h8v8h8v-8h8v8h8" fill="#04060c"/><rect x="196" y="336" width="8" height="14" fill="#ffb347" opacity=".75"/></g>' +
        '<rect x="190" y="304" width="20" height="10" fill="#1c1410"/><circle cx="200" cy="303" r="3" fill="#7a2a14"/>' +
        pg(0.08, glow(200, 296, 70, 'warm') + flame(200, 304, 1.25, 0) + embers(200, 290, 10, 50) +
          '<polygon class="beam" points="200,300 120,132 280,132" fill="#ffd9a0" opacity=".12"/>', 'lit') +
        '<g transform="translate(154 404)" fill="#020308"><circle cx="0" cy="-34" r="5.5"/><path d="M-7 0L-5 -27Q0 -31 5 -27L7 0Z"/><path d="M5 -24L16 -40" stroke="#020308" stroke-width="3"/></g>' + POST;
    },
    archives() {
      const shelf = (x0, dir) => {
        let s = '';
        for (let r = 0; r < 5; r++) {
          const y = 140 + r * 58, w = 84;
          s += `<rect x="${x0}" y="${y}" width="${w}" height="5" fill="#2a1d12"/>`;
          for (let i = 0; i < 8; i++) {
            const h = 24 + ((i * 7 + r * 5) % 18), c = ['#5a2626', '#243a54', '#4a3a1a', '#2f2a46', '#26443a', '#6a4a22'][(i + r) % 6];
            s += `<rect x="${x0 + 3 + i * 10}" y="${y - h}" width="8.5" height="${h}" fill="${c}"/><rect x="${x0 + 3 + i * 10}" y="${y - h}" width="2" height="${h}" fill="#fff" opacity=".08"/>`;
          }
        }
        return s;
      };
      return '<rect x="28" y="112" width="344" height="320" fill="url(#hall)"/>' +
        '<path d="M130 432V214Q200 120 270 214V432Z" fill="#1a2a44"/><path d="M130 432V214Q200 120 270 214V432Z" fill="url(#g-cold)" opacity=".6"/>' +
        '<g stroke="#07090f" stroke-width="3" opacity=".9"><path d="M200 128V432M150 190V432M250 190V432M130 262H270M130 322H270"/></g>' +
        '<polygon points="160,214 240,214 300,432 100,432" fill="url(#shaft)" opacity=".4" class="beam"/>' +
        shelf(38, 1) + shelf(278, -1) +
        '<rect x="28" y="392" width="344" height="40" fill="#1a0d08"/><rect x="100" y="392" width="200" height="40" fill="url(#g-red)" opacity=".5"/>' +
        '<g class="blaze"><g class="fireglow"><rect x="28" y="300" width="344" height="132" fill="url(#g-red)"/></g>' +
        flame(70, 428, 1.9, 0) + flame(120, 430, 1.4, -.3) + flame(285, 428, 1.7, -.6) + flame(332, 428, 1.3, -.2) + flame(200, 432, 1.1, -.5) +
        embers(120, 408, 11, 240) + embers(290, 408, 9, 170, '#ffd36b') + '</g>' +
        '<rect x="214" y="398" width="46" height="26" rx="3" fill="#3a2614"/><rect x="214" y="398" width="46" height="7" fill="#5a3a1c"/>' +
        pg(0.18, '<rect x="219" y="388" width="7" height="14" rx="2" fill="#efe3c6" transform="rotate(-8 222 395)"/>', 'scroll') +
        pg(0.36, '<rect x="228" y="385" width="7" height="16" rx="2" fill="#e6d8b4"/>', 'scroll') +
        pg(0.54, '<rect x="237" y="386" width="7" height="15" rx="2" fill="#efe3c6" transform="rotate(6 240 393)"/>', 'scroll') +
        pg(0.72, '<rect x="246" y="388" width="7" height="14" rx="2" fill="#e6d8b4" transform="rotate(12 249 395)"/>', 'scroll') +
        pg(0.9, '<circle cx="237" cy="392" r="22" fill="url(#g-white)" opacity=".5"/>', 'scroll') +
        '<g fill="#050302"><circle cx="164" cy="386" r="6"/><path d="M156 432L158 394Q164 390 170 394L172 432Z"/><path d="M170 398L190 388" stroke="#050302" stroke-width="4"/><rect x="186" y="380" width="18" height="12" fill="#e8dcc0" opacity=".9"/></g>' +
        '<rect class="paper" x="170" y="270" width="12" height="16" fill="#efe3c6" opacity=".9" transform="rotate(14 176 278)"/>' +
        '<rect class="paper" style="animation-delay:-2.3s" x="234" y="310" width="10" height="14" fill="#efe3c6" opacity=".85" transform="rotate(-18 239 317)"/>' +
        '<rect class="paper" style="animation-delay:-4.1s" x="128" y="330" width="9" height="12" fill="#efe3c6" opacity=".8"/>' + motes(14, '#ffd9a0') +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".3"/>' + POST;
    },
    gates() {
      let stone = '';
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const off = r % 2 ? 20 : 0, tone = (r * 7 + c * 13) % 5;
        stone += `<rect x="${28 + c * 38 - off}" y="${112 + r * 34}" width="36" height="32" fill="${['#2a2d34', '#30333b', '#262930', '#353840', '#2c2f37'][tone]}"/>`;
      }
      let bars = '';
      const barAt = [0.38, 0.1, 0.66, 0.24, 0.8, 0.52, 0.92];   // bars are forged back in this order
      for (let i = 0; i < 7; i++) bars += pg(barAt[i], `<rect x="${118 + i * 27}" y="168" width="8" height="264" fill="#101216"/><rect x="${118 + i * 27}" y="168" width="2" height="264" fill="#6c7482" opacity=".35"/>`, 'bar');
      let rain = '';
      for (let i = 0; i < 16; i++) rain += `<line class="rain" x1="${40 + i * 21}" y1="${112 + (i * 37) % 80}" x2="${34 + i * 21}" y2="${132 + (i * 37) % 80}" stroke="#a8c4d8" stroke-width="1" opacity=".35" style="animation-delay:-${(i * 0.17).toFixed(2)}s"/>`;
      return '<rect x="28" y="112" width="344" height="320" fill="#15171c"/>' + stone +
        '<g filter="url(#blur1)" opacity=".5"><path d="M60 140L64 200L58 240" stroke="#0c0d10" stroke-width="3" fill="none"/><path d="M330 300L324 350L334 390" stroke="#0c0d10" stroke-width="3" fill="none"/></g>' +
        '<path d="M100 432V232Q200 124 300 232V432Z" fill="#030407"/><path d="M100 432V232Q200 124 300 232V432Z" fill="none" stroke="#3a3d46" stroke-width="8"/>' + bars +
        pg(0.3, '<rect x="100" y="250" width="200" height="9" fill="#101216"/>', 'bar') + pg(0.55, '<rect x="100" y="320" width="200" height="9" fill="#101216"/>', 'bar') + pg(0.78, '<rect x="100" y="388" width="200" height="9" fill="#101216"/>', 'bar') +
        pgx(0.86, '<polygon points="232,168 266,252 242,264 218,196" fill="#2a2d34"/><polygon points="222,170 240,170 258,250 246,256" fill="#0c0d10" opacity=".6"/>', 'broken') +
        '<rect x="60" y="300" width="14" height="132" fill="#4a3220"/><rect x="326" y="290" width="14" height="142" fill="#4a3220"/>' +
        glow(68, 258, 62, 'warm') + flame(68, 268, 1.2, 0) + glow(332, 258, 62, 'warm') + flame(332, 268, 1.2, -.5) +
        '<g transform="translate(160 400)" fill="#030304"><circle cx="0" cy="-48" r="7"/><path d="M-11 0L-9 -38Q0 -44 9 -38L11 0Z"/><g class="hammer" transform-origin="0 -30"><path d="M9 -34L40 -52" stroke="#030304" stroke-width="4"/><rect x="36" y="-62" width="22" height="13" transform="rotate(-30 47 -55)"/></g></g>' +
        embers(204, 346, 9, 40, '#ffd36b') + rain + '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".4"/>' + POST;
    },
    scouts() {
      const pine = (x, y, s, c) => `<g fill="${c}"><polygon points="${x},${y - 70 * s} ${x - 18 * s},${y - 10 * s} ${x + 18 * s},${y - 10 * s}"/><polygon points="${x},${y - 100 * s} ${x - 13 * s},${y - 44 * s} ${x + 13 * s},${y - 44 * s}"/><polygon points="${x},${y - 124 * s} ${x - 9 * s},${y - 76 * s} ${x + 9 * s},${y - 76 * s}"/><rect x="${x - 3 * s}" y="${y - 10 * s}" width="${6 * s}" height="${10 * s}"/></g>`;
      let flies = '';
      for (let i = 0; i < 9; i++) flies += `<circle class="twinkle" cx="${60 + (i * 83) % 280}" cy="${260 + (i * 41) % 130}" r="1.4" fill="#d8ff9a" style="animation-delay:-${(i * 0.6).toFixed(1)}s"/>`;
      return '<rect x="28" y="112" width="344" height="320" fill="url(#sk-fog)"/>' +
        '<ellipse cx="300" cy="170" rx="60" ry="46" fill="#c7dad6" opacity=".25" filter="url(#blur8)"/>' +
        '<polygon points="270,112 300,112 330,432 190,432" fill="url(#shaft)" opacity=".16" class="beam"/>' +
        '<g filter="url(#blur3)" opacity=".7">' + pine(70, 330, 0.8, '#26373a') + pine(150, 340, 0.7, '#2a3c3f') + pine(250, 334, 0.85, '#243538') + pine(340, 340, 0.75, '#28393c') + '</g>' +
        '<g class="fogvar"><g class="drift"><ellipse cx="80" cy="330" rx="130" ry="26" fill="#cfdcd8" opacity=".28" filter="url(#blur8)"/><ellipse cx="300" cy="350" rx="140" ry="28" fill="#cfdcd8" opacity=".26" filter="url(#blur8)"/></g></g>' +
        '<g filter="url(#blur1)">' + pine(48, 392, 1.1, '#101b1c') + pine(112, 404, 0.95, '#0e1819') + pine(310, 398, 1.15, '#101b1c') + pine(360, 392, 0.9, '#0c1516') + '</g>' +
        '<path d="M28 432Q150 380 372 410V432Z" fill="#0a1112"/><path d="M130 432Q190 396 300 404" stroke="#3a4a44" stroke-width="10" fill="none" opacity=".5"/>' +
        pg(0.74, '<circle cx="338" cy="402" r="30" fill="url(#g-warm)"/><rect x="330" y="394" width="5" height="7" fill="#ffd9a0"/><rect x="340" y="394" width="5" height="7" fill="#ffd9a0"/>', 'home') +
        '<g class="riders">' + rider(170, 398, 0.62) + rider(232, 408, 0.5) + rider(122, 414, 0.48) +
        '<circle cx="205" cy="354" r="34" fill="url(#g-warm)" class="glow-pulse lantern"/><circle cx="205" cy="354" r="3" fill="#ffe3a0"/><path d="M196 360h18l-3 10h-12z" fill="#2a1d12"/></g>' +
        '<g class="fogvar"><g class="drift rev"><ellipse cx="150" cy="268" rx="130" ry="22" fill="#e2ebe8" opacity=".2" filter="url(#blur8)"/><ellipse cx="320" cy="296" rx="110" ry="20" fill="#e2ebe8" opacity=".2" filter="url(#blur8)"/></g>' +
        '<g class="drift"><ellipse cx="200" cy="410" rx="160" ry="22" fill="#d6e2de" opacity=".3" filter="url(#blur8)"/></g></g>' + flies + POST;
    },
    forge() {
      return '<rect x="28" y="112" width="344" height="320" fill="#0a0605"/>' +
        '<path d="M28 432V210Q200 100 372 210V432Z" fill="#150d09"/>' +
        '<g stroke="#2a1b12" stroke-width="2" fill="none" opacity=".7"><path d="M28 250H372M28 300H372M28 350H372M80 210V432M160 190V432M240 190V432M320 210V432"/></g>' +
        '<g fill="#050302" opacity=".9"><rect x="236" y="150" width="4" height="60"/><path d="M230 210h16l-3 14h-10z"/><path d="M200 160l8 40 8-40z"/></g>' +
        '<rect x="284" y="150" width="76" height="8" fill="#2a1b12"/><rect x="284" y="214" width="76" height="6" fill="#2a1b12"/>' +
        [0.12, 0.28, 0.44, 0.6, 0.76, 0.9].map((at, i) => pg(at, `<g transform="translate(${292 + i * 12} 160)"><path d="M0 0v50" stroke="#b6c0ce" stroke-width="2.4"/><path d="M-5 38h10" stroke="#c9a66b" stroke-width="2.4"/><path d="M0 0l-1 -2" stroke="#fff" stroke-width="1"/></g>`, 'blade')).join('') +
        '<rect x="58" y="146" width="150" height="172" rx="10" fill="#2a1a12"/><rect x="52" y="140" width="162" height="14" rx="4" fill="#3a251a"/>' +
        '<rect x="76" y="176" width="114" height="118" rx="6" fill="#1a0d08"/>' +
        '<g class="fireglow"><rect x="48" y="168" width="170" height="150" fill="url(#g-red)"/></g><rect x="84" y="206" width="98" height="78" rx="4" fill="#ff5a1f" opacity=".92" class="glow-pulse"/>' +
        '<rect x="96" y="224" width="74" height="48" rx="3" fill="#ffb347" opacity=".9" class="glow-pulse"/><rect x="112" y="238" width="42" height="22" rx="2" fill="#ffe9a8" opacity=".95"/>' +
        flame(100, 284, 1.7, 0) + flame(134, 288, 2.0, -.3) + flame(168, 284, 1.6, -.6) +
        '<circle cx="134" cy="250" r="90" fill="url(#g-warm)" opacity=".7" class="glow-pulse"/>' +
        '<rect x="28" y="392" width="344" height="40" fill="#0a0504"/><ellipse cx="134" cy="400" rx="120" ry="14" fill="#ff7a2a" opacity=".22" filter="url(#blur3)"/>' +
        '<polygon points="200,338 340,338 326,360 280,360 280,398 318,398 318,414 222,414 222,398 260,398 260,360 214,360" fill="#2f333b"/>' +
        '<polygon points="200,338 340,338 336,344 204,344" fill="#8a929e" opacity=".6"/>' +
        '<rect x="236" y="330" width="62" height="9" rx="2" fill="#ff7a2a"/><rect x="236" y="330" width="62" height="9" rx="2" fill="url(#g-warm)" opacity=".9"/>' +
        '<g transform="translate(330 400)" fill="#040201"><circle cx="0" cy="-60" r="8"/><path d="M-13 0L-11 -48Q0 -55 11 -48L13 0Z"/><g class="hammer big"><path d="M-8 -44L-52 -70" stroke="#040201" stroke-width="5"/><rect x="-76" y="-84" width="30" height="16" transform="rotate(-30 -61 -76)"/></g></g>' +
        embers(262, 332, 14, 100) + '<circle class="rise" cx="270" cy="326" r="2" fill="#fff0b0"/>' +
        '<g class="shimmer"><rect x="60" y="150" width="150" height="160" fill="#ff9a3a" opacity=".06" filter="url(#blur3)"/></g>' +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".3"/>' + POST;
    },
    oath() {
      let rays = '';
      for (let a = 0; a < 360; a += 24) {
        const p = d => `${(200 + 260 * Math.cos(d * Math.PI / 180)).toFixed(1)},${(236 + 260 * Math.sin(d * Math.PI / 180)).toFixed(1)}`;
        rays += `<polygon points="200,236 ${p(a - 5)} ${p(a + 5)}"/>`;
      }
      const banner = (x, c, c2, d) =>
        `<g class="ban"><rect x="${x}" y="150" width="5" height="180" fill="#241a12"/><g class="sway" style="animation-delay:-${d}s"><path d="M${x + 5} 156h50v82l-25 -16l-25 16z" fill="${c}"/><path d="M${x + 22} 176l8 -10l8 10l-8 28z" fill="${c2}" opacity=".85"/></g></g>`;
      let kn = 0;                                           // 14 knights kneel one by one as the oath is renewed
      const row = (y, s, n, x0, gap) => { let g = ''; for (let i = 0; i < n; i++) g += `<g class="kn" data-at="${(0.05 + (kn++) * 0.062).toFixed(2)}">${knight(x0 + i * gap, y, s)}</g>`; return g; };
      return '<rect x="28" y="112" width="344" height="320" fill="url(#sk-dawn)"/>' +
        '<circle cx="200" cy="236" r="120" fill="url(#g-white)" opacity=".55"/>' +
        `<g class="rays"><g class="spin-slow"><g opacity=".16" fill="#ffe3a0">${rays}</g></g></g>` +
        '<path d="M28 432V200Q60 150 100 144V432Z" fill="#120d12"/><path d="M372 432V200Q340 150 300 144V432Z" fill="#120d12"/>' +
        '<path d="M100 144Q200 90 300 144" stroke="#2a2030" stroke-width="10" fill="none"/>' +
        banner(46, '#7a1a26', '#e0b866', 0) + banner(286, '#1a3d7a', '#e0b866', 1.2) +
        '<rect x="150" y="330" width="100" height="10" fill="#241a22"/><rect x="164" y="320" width="72" height="10" fill="#2e2230"/>' +
        '<polygon points="200,150 208,232 192,232" fill="#f4f8ff" class="glow-pulse"/><rect x="170" y="230" width="60" height="9" rx="3" fill="#d6b06a"/><rect x="196" y="239" width="8" height="42" fill="#7a4a22"/><circle cx="200" cy="288" r="5" fill="#d6b06a"/>' +
        '<circle cx="200" cy="200" r="46" fill="url(#g-white)" class="glow-pulse"/>' +
        '<polygon points="28,420 110,400 200,412 290,396 372,416 372,432 28,432" fill="#0a080c"/>' +
        row(398, 0.72, 4, 60, 28) + row(398, 0.72, 4, 238, 28) + row(416, 0.9, 3, 80, 38) + row(416, 0.9, 3, 236, 38) + motes(16, '#ffe9b0') +
        '<rect x="28" y="112" width="344" height="320" fill="url(#fade-b)" opacity=".28"/>' + POST;
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
      '<rect class="f-top" x="14" y="14" width="372" height="98" fill="#0d0a07" opacity=".82"/><rect class="f-bot" x="14" y="432" width="372" height="154" fill="#16120d" opacity=".97"/>' +
      '<rect class="f-win" x="28" y="112" width="344" height="320" fill="none" stroke="#7a6034" stroke-width="2.5"/>' +
      corner(14, 14, 0) + corner(386, 14, 90) + corner(386, 586, 180) + corner(14, 586, 270) +
      `<text x="200" y="${ty}" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" letter-spacing="2" fill="#efe4c8">${title}</text>` +
      '<text x="200" y="462" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="3" fill="#c9a66b">OBJECTIVE</text>' +
      '<path d="M120 470h160" stroke="#6e5730" stroke-width="1.5"/>' +
      `<text x="200" y="496" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#e1d6bd">${obj}</text>`;
  }

  // Full card illustration for one quest definition. `def` comes from Citadel.questDef().
  function art(def, base) {
    const assets = base || 'assets/';
    if (def.img) {
      return `<img class="mc-img" src="${assets + def.img}.jpg" alt="${esc(def.name)}" draggable="false">`;
    }
    const scene = (SCENES[def.id] || SCENES.default)();
    return `<svg class="mc-svg" viewBox="0 0 400 600" role="img" aria-label="${esc(def.name)}" xmlns="http://www.w3.org/2000/svg">` +
      (defsInstalled ? '' : DEFS) + '<rect width="400" height="600" fill="#0d0a07"/>' +
      '<clipPath id="win"><rect x="28" y="112" width="344" height="320"/></clipPath>' +
      `<g clip-path="url(#win)">${scene}<rect class="art-vignette" x="28" y="112" width="344" height="320" fill="url(#vig)" opacity=".6"/></g>` + frame(def) + '</svg>';
  }

  let defsInstalled = false;

  // ---------- painting drop-ins ----------
  // A missing <image> inside an SVG paints the browser's broken-image icon, so a layer is only added once
  // the file is known to load. Results are cached, so each file is requested at most once.
  // Browsers and GitHub Pages cache images (including "not found" and wrong files) for minutes. Painting URLs carry
  // this version, so changing it makes every browser fetch fresh copies. BUMP IT whenever a painting under
  // assets/art, assets/card or assets/cards is added or replaced.
  const ART_VERSION = '4';
  const versioned = u => u + '?v=' + ART_VERSION;

  // A probe resolves to false (no such file) or {w, h} (its pixel size). A bare `true` counts as a square image.
  const probes = {};
  function probe(url) {
    if (!probes[url]) {
      probes[url] = new Promise(resolve => {
        const i = new Image();
        i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight });
        i.onerror = () => resolve(false);
        i.src = url;
      });
    }
    return probes[url];
  }
  // Tall paintings (2:3 and similar) fill the whole card behind the title and objective, like the painted cards.
  const isPortrait = r => !!r && typeof r === 'object' && r.w > 0 && r.h / r.w > 1.15;

  // Call after a card's HTML is in the document. Adds assets/art/<id>.jpg inside the frame and/or
  // assets/card/<id>.jpg over the whole card, when those files exist.
  function attach(host, def, base) {
    if (!host || def.img) return;
    const svg = host.querySelector('svg.mc-svg');
    if (!svg) return;
    const assets = base || 'assets/', NS = 'http://www.w3.org/2000/svg';
    const make = (cls, href, x, y, w, h) => {
      const im = document.createElementNS(NS, 'image');
      im.setAttribute('class', cls); im.setAttribute('href', href);
      im.setAttribute('x', x); im.setAttribute('y', y); im.setAttribute('width', w); im.setAttribute('height', h);
      im.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      return im;
    };
    const artUrl = versioned(assets + 'art/' + def.id + '.jpg'), cardUrl = versioned(assets + 'card/' + def.id + '.jpg');
    probe(artUrl).then(r => {
      if (!r || !svg.isConnected || svg.querySelector('.art-photo, .art-bleed')) return;
      if (isPortrait(r)) {
        // full-bleed: the painting fills the card and the frame's title and objective sit over it
        svg.classList.add('bleed');
        svg.insertBefore(make('art-bleed', artUrl, 0, 0, 400, 600), svg.querySelector('clipPath'));
        return;
      }
      const g = svg.querySelector('g[clip-path]');
      g.insertBefore(make('art-photo', artUrl, 28, 112, 344, 320), g.querySelector('.art-vignette'));
    });
    probe(cardUrl).then(ok => {
      if (!ok || !svg.isConnected || svg.querySelector('.card-photo')) return;
      svg.appendChild(make('card-photo', cardUrl, 0, 0, 400, 600));
    });
  }

  // ---------- live scenes: the board's mission windows and the expedition view ----------
  // Gradients and filters are defined once in the document, so scenes keep rendering even when the
  // first card that happened to carry them is removed.
  function installDefs() {
    if (defsInstalled || !root.document) return;
    const d = root.document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = '<svg width="0" height="0" xmlns="http://www.w3.org/2000/svg">' + DEFS + '</svg>';
    root.document.body.insertBefore(d, root.document.body.firstChild);
    defsInstalled = true;
  }

  // Drives everything that depends on progress: sets --p (0..1) and marks each [data-at] element "on" once the
  // mission has reached that point. Used by the live scenes and by the small mission cards.
  function applyProgress(el, p) {
    if (!el) return;
    el.style.setProperty('--p', p.toFixed(3));
    el.querySelectorAll('[data-at]').forEach(n => n.classList.toggle('on', p + 1e-9 >= parseFloat(n.dataset.at)));
  }

  const GLOW = { pass: 'cold', banner: 'warm', blade: 'warm', walls: 'red' };
  // Weather and spark intensity follows the mission's progress.
  const INTENSITY = {
    beacons: p => 0.5 + 0.6 * p, archives: p => 1.2 - 0.8 * p, forge: p => 0.6 + 0.7 * p,
    mountains: p => 0.7 + 0.5 * p, oath: p => 0.5 + 0.8 * p, blade: p => 0.5 + 0.9 * p
  };

  // Returns { el, update(quest, ctx), flare(), destroy() }. The scene stays in the page and is updated in place
  // (never rebuilt), so animations run continuously while progress changes drive what is lit, mended or kneeling.
  function live(def, opts) {
    opts = opts || {};
    const assets = opts.base || 'assets/';
    const box = root.document.createElement('div');
    box.className = 'lv lv-' + def.id;
    let svg;
    if (def.img) {
      // The painted cards are cropped to their illustration (title and objective panel removed).
      svg = '<svg class="mc-svg lv-svg lv-painted" viewBox="52 326 680 492" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
        `<image href="${assets + def.img}.jpg" width="784" height="1168"/>` +
        `<rect class="pv-glow" x="52" y="326" width="680" height="492" fill="url(#g-${GLOW[def.id] || 'warm'})"/>` +
        '<rect x="52" y="326" width="680" height="492" fill="url(#vig)" opacity=".75"/></svg>';
    } else {
      svg = `<svg class="mc-svg lv-svg" viewBox="28 112 344 320" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(def.name)}" xmlns="http://www.w3.org/2000/svg">` +
        (defsInstalled ? '' : DEFS) + (SCENES[def.id] || SCENES.default)() + '</svg>';
    }
    box.innerHTML = svg + '<canvas class="lv-fx"></canvas><div class="lv-tint"></div>';
    const el = box.querySelector('svg');
    const fx = root.CitadelFx ? root.CitadelFx.create(box.querySelector('canvas'), def.id) : null;

    if (!def.img) {
      // optional painting drop-in (assets/art/<id>.jpg), shown over the generated scene
      const url = versioned(assets + 'art/' + def.id + '.jpg');
      probe(url).then(r => {
        if (!r || !el.isConnected || el.querySelector('.art-photo') || box.querySelector('.lv-art')) return;
        if (isPortrait(r)) {
          // a tall painting: the camera pans slowly down it, with a glow that grows with progress
          const art = root.document.createElement('div');
          art.className = 'lv-art';
          art.style.backgroundImage = `url('${url}')`;
          const glow = root.document.createElement('div');
          glow.className = 'lv-glow';
          box.insertBefore(art, el);
          box.insertBefore(glow, box.querySelector('canvas'));
          box.classList.add('lv-bleed');
          return;
        }
        const NS = 'http://www.w3.org/2000/svg', im = root.document.createElementNS(NS, 'image');
        im.setAttribute('class', 'art-photo'); im.setAttribute('href', url);
        im.setAttribute('x', 28); im.setAttribute('y', 112); im.setAttribute('width', 344); im.setAttribute('height', 320);
        im.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        el.appendChild(im);
        const v = root.document.createElementNS(NS, 'rect');
        v.setAttribute('x', 28); v.setAttribute('y', 112); v.setAttribute('width', 344); v.setAttribute('height', 320);
        v.setAttribute('fill', 'url(#vig)'); v.setAttribute('opacity', '.7');
        el.appendChild(v);
      });
    }

    function update(q, ctx) {
      ctx = ctx || {};
      const p = q ? Math.max(0, Math.min(1, q.progress / q.needed)) : 0;
      applyProgress(el, p);
      box.style.setProperty('--p', p.toFixed(3));
      box.classList.toggle('urgent', !!q && q.timer <= 2);
      if (fx) { fx.k = INTENSITY[def.id] ? INTENSITY[def.id](p) : 1; fx.setStorm(ctx.storm || 0); }
      return p;
    }
    function flare() {
      box.classList.remove('flare'); void box.offsetWidth; box.classList.add('flare');
      setTimeout(() => box.classList.remove('flare'), 1400);
      if (fx) fx.lightning();
    }
    function destroy() { if (fx) fx.destroy(); }
    return { el: box, def, update, flare, destroy, fx };
  }

  root.CitadelMissions = { art, attach, live, installDefs, applyProgress, SCENES, versioned, artVersion: ART_VERSION, _probes: probes };
})(typeof window !== 'undefined' ? window : globalThis);
