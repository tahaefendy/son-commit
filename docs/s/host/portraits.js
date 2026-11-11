/*
 * Patron portreleri ve ofis arka planları (tamamı üretilmiş SVG, harici görsel yok).
 * Yüz ifadesi `data-lvl` (0..4) ile değişir: 0 sakin, 1 şüpheci, 2 sinirli, 3 öfkeli, 4 çılgın.
 */
(function (root) {
  'use strict';

  const mirrorX = (x) => 420 - x;
  const mirrorPath = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${mirrorX(+x)} ${y}`);

  /* ---------------- Boss tanımları ---------------- */
  const BOSS = {
    kerim: {
      skin: '#d9a681', skinShade: '#b98563', hair: '#2a2420', brow: '#2a2420', eye: '#4a3426',
      suit: '#2b3445', suitHi: '#3a4559', shirt: '#e9edf2', tie: '#3d5a80', accent: '#8fa6c4',
      head: 'M128 175 C128 118 165 88 210 88 C255 88 292 118 292 175 L292 215 C292 268 255 308 210 308 C165 308 128 268 128 215 Z',
      browW: 7, neckW: 0,
    },
    harun: {
      skin: '#c08a63', skinShade: '#9c6a48', hair: '#1d1b19', brow: '#1d1b19', eye: '#2b2118',
      suit: '#2c382e', suitHi: '#3b4a3d', shirt: '#4b4f55', tie: '#e0701a', accent: '#e0701a',
      head: 'M118 180 C118 118 160 88 210 88 C260 88 302 118 302 180 L302 226 C302 282 262 316 210 316 C158 316 118 282 118 226 Z',
      browW: 10, neckW: 14,
    },
    taha: {
      skin: '#e0b896', skinShade: '#b99371', hair: '#cfd3da', brow: '#8e949d', eye: '#6f8aa3',
      suit: '#101114', suitHi: '#1d1f24', shirt: '#f2f2f2', tie: '#8c1c1c', accent: '#c0392b',
      head: 'M138 170 C138 112 170 86 210 86 C252 86 282 112 282 170 L282 220 C282 278 250 322 210 332 C170 322 138 278 138 220 Z',
      browW: 7, neckW: -6,
    },
  };

  const BROWS = [
    'M142 160 Q168 148 196 156',
    'M142 158 Q170 150 196 163',
    'M142 152 L196 171',
    'M140 147 L198 179',
    'M137 141 L200 185',
  ];
  const EYE_RY = [11, 9, 7, 6, 12];
  const PUPIL_R = [3.6, 3.6, 3.4, 3.2, 2.4];

  const lvClass = (levels) => 'lv ' + levels.map((l) => 'l' + l).join(' ');

  function eyes(b) {
    let out = '';
    for (let lv = 0; lv < 5; lv++) {
      for (const cx of [168, 252]) {
        const ry = EYE_RY[lv];
        const lid = lv === 0 ? '' : `<path d="M${cx - 19} ${188 - ry - 1} Q${cx} ${188 - ry - 7} ${cx + 19} ${188 - ry - 1} L${cx + 19} ${188 - ry + (lv >= 2 ? 3 : 1)} Q${cx} ${188 - ry - 2} ${cx - 19} ${188 - ry + (lv >= 2 ? 3 : 1)} Z" fill="${b.skinShade}" opacity=".9"/>`;
        out += `<g class="${lvClass([lv])}">
          <ellipse cx="${cx}" cy="188" rx="17" ry="${ry}" fill="#f4f1ea"/>
          <circle cx="${cx}" cy="189" r="${lv === 4 ? 8.4 : 7.4}" fill="${b.eye}"/>
          <circle cx="${cx}" cy="189" r="${PUPIL_R[lv]}" fill="#0b0b0c"/>
          <circle cx="${cx + 2.4}" cy="186" r="1.8" fill="#fff" opacity=".85"/>
          ${lv === 4 ? `<path d="M${cx - 14} 188 l5 1 M${cx + 14} 188 l-5 1 M${cx} ${188 - ry} l0 4" stroke="#b33" stroke-width="1.3" opacity=".8"/>` : ''}
          ${lid}
          <path d="M${cx - 18} ${188 + ry + 3} Q${cx} ${188 + ry + 9} ${cx + 18} ${188 + ry + 3}" stroke="${b.skinShade}" stroke-width="2.4" fill="none" opacity="${lv >= 2 ? 0.7 : 0.35}"/>
        </g>`;
      }
    }
    return out;
  }

  function brows(b) {
    let out = '';
    BROWS.forEach((d, lv) => {
      const w = b.browW + (lv >= 3 ? 2 : 0);
      out += `<g class="${lvClass([lv])}" stroke="${b.brow}" stroke-width="${w}" stroke-linecap="round" fill="none"><path d="${d}"/><path d="${mirrorPath(d)}"/></g>`;
    });
    return out;
  }

  function mouths(id) {
    const lip = '#7a3a33';
    const teeth = '#f3efe6';
    const dark = '#3a0d10';
    const beard = id === 'harun';
    const stroke = beard ? '#d7a98e' : lip;
    return `
      <g class="${lvClass([0])}"><path d="${id === 'kerim' ? 'M186 262 Q210 272 234 261' : id === 'taha' ? 'M190 264 L230 264' : 'M188 263 Q210 267 232 263'}" stroke="${stroke}" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>
      <g class="${lvClass([1])}"><path d="M188 265 L232 265" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round"/></g>
      <g class="${lvClass([2])}"><path d="M188 271 Q210 259 232 271" stroke="${stroke}" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>
      <g class="${lvClass([3])}">
        <rect x="190" y="262" width="40" height="11" rx="3" fill="${teeth}"/>
        <path d="M200 262 v11 M210 262 v11 M220 262 v11" stroke="#b9b3a6" stroke-width="1.2"/>
        <path d="M186 273 Q210 252 234 273" stroke="${stroke}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M188 262 Q210 270 232 262" stroke="${stroke}" stroke-width="3" fill="none"/>
      </g>
      <g class="${lvClass([4])}">
        <path d="M186 258 Q210 312 234 258 Q210 250 186 258 Z" fill="${dark}"/>
        <path d="M190 259 Q210 266 230 259 L228 268 Q210 272 192 268 Z" fill="${teeth}"/>
        <ellipse cx="210" cy="288" rx="13" ry="7" fill="#a8343b"/>
        <path d="M186 258 Q210 250 234 258" stroke="${stroke}" stroke-width="4" fill="none" stroke-linecap="round"/>
      </g>
      <ellipse class="mouth-talk" cx="210" cy="268" rx="15" ry="9" fill="${dark}"/>`;
  }

  /* ---------------- Boss'a özel parçalar ---------------- */
  function extras(id, b) {
    if (id === 'kerim') {
      return {
        hair: `<path d="M124 192 C110 118 150 66 212 66 C276 66 314 116 296 192 C292 162 282 142 262 130 C240 138 190 138 160 118 C140 134 130 160 124 192 Z" fill="${b.hair}"/>
               <path d="M164 118 C190 128 232 130 262 128" stroke="#4a3f36" stroke-width="2" fill="none" opacity=".7"/>`,
        face: `<g fill="none" stroke="#1b1f27" stroke-width="4" stroke-linejoin="round">
                 <rect x="137" y="166" width="62" height="42" rx="11"/><rect x="221" y="166" width="62" height="42" rx="11"/>
                 <path d="M199 184 Q210 178 221 184"/><path d="M137 180 L124 176 M283 180 L296 176"/></g>
               <path d="M143 172 L170 168 M227 172 L254 168" stroke="#fff" stroke-width="2.4" opacity=".16"/>`,
        beard: '',
        clothes: `<path d="M150 380 L210 446 L270 380 L250 372 L210 412 L170 372Z" fill="${b.shirt}"/>
                  <path d="M198 414 L222 414 L228 436 L216 540 L204 540 L192 436Z" fill="${b.tie}"/>
                  <path d="M196 408 L224 408 L226 420 L194 420Z" fill="${b.tie}" opacity=".9"/>
                  <path d="M132 382 L205 448 L168 560 L96 560Z M288 382 L215 448 L252 560 L324 560Z" fill="${b.suitHi}" opacity=".85"/>`,
        cheek: '',
      };
    }
    if (id === 'harun') {
      return {
        hair: `<path d="M118 172 C122 108 160 78 210 78 C262 78 298 108 302 172 C288 142 252 124 210 124 C168 124 132 142 118 172 Z" fill="${b.hair}"/>
               <path d="M140 140 C170 120 250 120 280 140" stroke="#3a3632" stroke-width="2" fill="none" opacity=".6"/>`,
        face: `<path d="M118 222 C118 292 160 328 210 328 C260 328 302 292 302 222 C290 252 270 266 248 270 Q210 250 172 270 C150 266 130 252 118 222 Z" fill="#2a2420"/>
               <path d="M176 248 Q210 238 244 248" stroke="#2a2420" stroke-width="9" fill="none" stroke-linecap="round"/>
               <path d="M150 200 l6 3 M268 204 l6 -3 M165 230 l5 2 M250 232 l5 -2" stroke="#3a2d26" stroke-width="2" opacity=".55"/>`,
        beard: '',
        clothes: `<path d="M138 380 L210 450 L282 380 L262 372 L210 420 L158 372Z" fill="${b.shirt}"/>
                  <path d="M170 372 L196 520 M250 372 L224 520" stroke="${b.tie}" stroke-width="9" opacity=".95"/>
                  <rect x="190" y="492" width="40" height="52" rx="5" fill="#e9e6df"/><rect x="194" y="496" width="32" height="20" fill="${b.tie}"/>
                  <path d="M116 384 L194 452 L150 560 L70 560Z M304 384 L226 452 L270 560 L350 560Z" fill="${b.suitHi}" opacity=".9"/>`,
        cheek: '',
      };
    }
    return {
      hair: `<path d="M132 190 C116 108 160 58 214 58 C270 58 306 108 290 190 C288 152 272 124 250 112 C230 122 190 120 170 110 C150 126 136 152 132 190 Z" fill="${b.hair}"/>
             <path d="M170 106 C196 96 236 96 262 106 M160 124 C190 112 240 112 272 124" stroke="#a9aeb8" stroke-width="2.4" fill="none" opacity=".8"/>`,
      face: `<path d="M150 232 Q160 262 182 288 M270 232 Q260 262 238 288" stroke="#000" stroke-opacity=".18" stroke-width="3" fill="none"/>
             <path d="M176 128 Q210 122 244 128 M180 138 Q210 133 240 138" stroke="#000" stroke-opacity=".12" stroke-width="2" fill="none"/>
             <path d="M205 196 L200 238 Q210 244 222 238" stroke="#000" stroke-opacity=".22" stroke-width="2.4" fill="none"/>`,
      beard: '',
      clothes: `<path d="M152 380 L210 450 L268 380 L248 372 L210 414 L172 372Z" fill="${b.shirt}"/>
                <path d="M198 414 L222 414 L228 436 L214 540 L206 540 L192 436Z" fill="${b.tie}"/>
                <path d="M196 408 L224 408 L226 421 L194 421Z" fill="${b.tie}"/>
                <path d="M130 382 L205 452 L166 560 L92 560Z M290 382 L215 452 L254 560 L328 560Z" fill="${b.suitHi}" opacity=".9"/>
                <circle cx="272" cy="446" r="4" fill="#b08d3c"/>
                <path d="M262 478 l14 -4 l2 10 l-14 3z" fill="#e9e9e9" opacity=".9"/>`,
      cheek: '',
    };
  }

  const cache = {};
  function portraitSvg(id, viewBox) {
    const key = id + '|' + (viewBox || '');
    if (cache[key]) return cache[key];
    const b = BOSS[id];
    const x = extras(id, b);
    const eid = `p-${id}-${(viewBox || 'f').replace(/\W/g, '')}`;
    const earY = id === 'taha' ? 210 : 200;
    const earX = id === 'harun' ? 114 : id === 'taha' ? 134 : 126;
    const svg = `
<svg class="portrait-svg" viewBox="${viewBox || '0 0 420 560'}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${eid}-suit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.suitHi}"/><stop offset="1" stop-color="${b.suit}"/></linearGradient>
    <linearGradient id="${eid}-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b.skin}"/><stop offset="1" stop-color="${b.skinShade}"/></linearGradient>
    <radialGradient id="${eid}-rim" cx=".85" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <clipPath id="${eid}-head"><path d="${b.head}"/></clipPath>
  </defs>
  <g class="body">
    <path d="M0 560 L0 478 C0 424 62 396 132 380 L288 380 C358 396 420 424 420 478 L420 560 Z" fill="url(#${eid}-suit)"/>
    <path d="M${170 - b.neckW} 285 L${170 - b.neckW} 388 Q210 414 ${250 + b.neckW} 388 L${250 + b.neckW} 285 Z" fill="${b.skinShade}"/>
    <path d="M${170 - b.neckW} 330 Q210 350 ${250 + b.neckW} 330 L${250 + b.neckW} 388 Q210 414 ${170 - b.neckW} 388 Z" fill="#000" opacity=".16"/>
    ${x.clothes}
  </g>
  <g class="head">
    <ellipse cx="${earX}" cy="${earY}" rx="12" ry="22" fill="${b.skinShade}"/><ellipse cx="${420 - earX}" cy="${earY}" rx="12" ry="22" fill="${b.skinShade}"/>
    <path d="${b.head}" fill="url(#${eid}-skin)"/>
    <g clip-path="url(#${eid}-head)">
      <path d="${b.head}" fill="#d1281b" class="flush"/>
      <rect x="100" y="60" width="240" height="300" fill="url(#${eid}-rim)"/>
    </g>
    <g class="face">
      ${x.face}
      ${eyes(b)}
      ${brows(b)}
      <path d="M205 198 Q198 232 206 240 Q213 243 220 240" stroke="#000" stroke-opacity=".28" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      ${mouths(id)}
      <g class="${lvClass([3, 4])}" stroke="#9c1f16" stroke-width="3" stroke-linecap="round" fill="none"><path d="M270 138 l9 -7 M270 138 l11 5 M270 138 l1 -13"/></g>
      <g class="${lvClass([2, 3])}"><path d="M296 150 q-7 13 0 18 q7 -5 0 -18z" fill="#bfe3ff" opacity=".7"/></g>
    </g>
    ${x.hair}
  </g>
</svg>`;
    cache[key] = svg;
    return svg;
  }

  /* ---------------- Arka planlar (1920x1080) ---------------- */
  function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

  function skyline(x0, y0, w, h, seed, lit) {
    const r = lcg(seed);
    let out = '';
    let x = x0;
    while (x < x0 + w) {
      const bw = 40 + r() * 70;
      const bh = 60 + r() * (h - 70);
      out += `<rect x="${x}" y="${y0 + h - bh}" width="${Math.min(bw, x0 + w - x)}" height="${bh}" fill="#10131a"/>`;
      for (let wy = y0 + h - bh + 12; wy < y0 + h - 8; wy += 18) {
        for (let wx = x + 8; wx < x + bw - 10 && wx < x0 + w - 8; wx += 14) {
          if (r() < lit) out += `<rect x="${wx}" y="${wy}" width="5" height="8" fill="#ffc77d" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`;
        }
      }
      x += bw + 4;
    }
    return out;
  }

  function codeLines(x, y, w, h, seed, color) {
    const r = lcg(seed);
    let out = '';
    for (let ly = y + 12; ly < y + h - 8; ly += 11) {
      const ind = Math.floor(r() * 3) * 14;
      out += `<rect x="${x + 10 + ind}" y="${ly}" width="${20 + r() * (w - 40 - ind)}" height="4" rx="2" fill="${color}" opacity="${(0.25 + r() * 0.45).toFixed(2)}"/>`;
    }
    return out;
  }

  const BG = {
    neutral() {
      let grid = '';
      for (let i = 0; i <= 1920; i += 96) grid += `<path d="M${i} 0 V1080" />`;
      for (let j = 0; j <= 1080; j += 96) grid += `<path d="M0 ${j} H1920" />`;
      return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><defs>
        <radialGradient id="n1" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#1c2028"/><stop offset="1" stop-color="#07080a"/></radialGradient></defs>
        <rect width="1920" height="1080" fill="url(#n1)"/><g stroke="#fff" stroke-opacity=".035" stroke-width="1">${grid}</g></svg>`;
    },
    kerim() {
      return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><defs>
        <linearGradient id="k-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b212b"/><stop offset="1" stop-color="#0d1015"/></linearGradient>
        <linearGradient id="k-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2a3d"/><stop offset=".7" stop-color="#4a3b3a"/><stop offset="1" stop-color="#6a4a37"/></linearGradient>
        <linearGradient id="k-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15161a"/><stop offset="1" stop-color="#070708"/></linearGradient>
        <radialGradient id="k-light" cx=".55" cy="0" r=".9"><stop offset="0" stop-color="#cfd9ea" stop-opacity=".16"/><stop offset="1" stop-color="#cfd9ea" stop-opacity="0"/></radialGradient></defs>
        <rect width="1920" height="1080" fill="url(#k-wall)"/>
        <rect x="900" y="150" width="860" height="560" fill="url(#k-sky)"/>
        <clipPath id="k-win"><rect x="900" y="150" width="860" height="560"/></clipPath>
        <g clip-path="url(#k-win)">${skyline(900, 330, 860, 380, 11, 0.5)}</g>
        <g stroke="#0a0c10" stroke-width="12"><path d="M900 150 V710 M1186 150 V710 M1473 150 V710 M1760 150 V710 M900 150 H1760 M900 430 H1760 M900 710 H1760"/></g>
        <rect x="100" y="210" width="190" height="130" fill="#0c0e12" stroke="#2a303a" stroke-width="5"/><rect x="330" y="210" width="190" height="130" fill="#0c0e12" stroke="#2a303a" stroke-width="5"/>
        <path d="M120 240 H270 M120 262 H250 M120 284 H260 M350 240 H500 M350 262 H480" stroke="#3b4350" stroke-width="5"/>
        <rect x="0" y="760" width="1920" height="320" fill="url(#k-floor)"/>
        <path d="M0 770 H1920" stroke="#2b3039" stroke-width="3"/>
        <rect x="860" y="780" width="1000" height="22" rx="4" fill="#0b0c0f" opacity=".7"/>
        <rect width="1920" height="1080" fill="url(#k-light)"/></svg>`;
    },
    harun() {
      let monitors = '';
      const r = lcg(7);
      for (let i = 0; i < 5; i++) {
        const x = 780 + i * 220;
        const col = i % 2 ? '#e0701a' : '#6fb7c9';
        monitors += `<g><rect x="${x}" y="360" width="190" height="124" rx="6" fill="#0b0d10" stroke="#262b33" stroke-width="5"/>
          <rect x="${x + 6}" y="366" width="178" height="112" fill="#10151b"/>${codeLines(x + 6, 366, 178, 112, 31 + i, col)}
          <rect x="${x + 88}" y="484" width="14" height="40" fill="#1a1e24"/><rect x="${x + 60}" y="522" width="70" height="8" rx="3" fill="#1a1e24"/></g>`;
      }
      return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><defs>
        <linearGradient id="h-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1714"/><stop offset="1" stop-color="#0b0a09"/></linearGradient>
        <radialGradient id="h-lamp" cx=".7" cy=".1" r=".8"><stop offset="0" stop-color="#e0701a" stop-opacity=".22"/><stop offset="1" stop-color="#e0701a" stop-opacity="0"/></radialGradient></defs>
        <rect width="1920" height="1080" fill="url(#h-wall)"/>
        <rect x="820" y="90" width="900" height="8" fill="#26211c"/><rect x="900" y="90" width="4" height="90" fill="#26211c"/><rect x="1600" y="90" width="4" height="90" fill="#26211c"/>
        ${monitors}
        <rect x="740" y="532" width="1060" height="16" fill="#26221d"/><rect x="760" y="548" width="12" height="260" fill="#1b1815"/><rect x="1770" y="548" width="12" height="260" fill="#1b1815"/>
        <rect x="1590" y="150" width="270" height="170" fill="#d9d6cf" opacity=".08" stroke="#4a443b" stroke-width="5"/>
        <path d="M1620 190 h70 M1620 220 h120 M1620 250 h90 M1760 190 l40 0 M1720 280 h110" stroke="#9c9486" stroke-width="5" opacity=".35"/>
        <rect x="0" y="800" width="1920" height="280" fill="#080706"/>
        <rect width="1920" height="1080" fill="url(#h-lamp)"/></svg>`;
    },
    taha() {
      return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><defs>
        <linearGradient id="t-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17161a"/><stop offset="1" stop-color="#08080a"/></linearGradient>
        <radialGradient id="t-spot" cx=".42" cy=".08" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".2"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
        <radialGradient id="t-red" cx=".95" cy=".6" r=".6"><stop offset="0" stop-color="#8c1c1c" stop-opacity=".28"/><stop offset="1" stop-color="#8c1c1c" stop-opacity="0"/></radialGradient></defs>
        <rect width="1920" height="1080" fill="url(#t-wall)"/>
        <g fill="#0d0d10" stroke="#26262c" stroke-width="3">${[0, 1, 2, 3, 4].map((i) => `<rect x="${860 + i * 210}" y="130" width="150" height="560"/>`).join('')}</g>
        <text x="1300" y="330" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="280" fill="#fff" opacity=".035" letter-spacing="30">HAT</text>
        <path d="M720 830 L1920 760 L1920 1080 L560 1080 Z" fill="#050506"/>
        <path d="M700 842 L1920 770" stroke="#33333b" stroke-width="4"/>
        <g fill="#0f0f12" stroke="#222228" stroke-width="3"><rect x="900" y="720" width="120" height="110" rx="14"/><rect x="1120" y="712" width="120" height="110" rx="14"/><rect x="1340" y="704" width="120" height="110" rx="14"/><rect x="1560" y="696" width="120" height="110" rx="14"/></g>
        <rect width="1920" height="1080" fill="url(#t-spot)"/><rect width="1920" height="1080" fill="url(#t-red)"/></svg>`;
    },
  };

  root.Portraits = { portraitSvg, BG, BOSS };
})(window);
