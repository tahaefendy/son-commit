/*
 * Sunum sahnesi çizicisi. Sunucudan gelen durumu (state:host) sinematik sahneye dönüştürür.
 * Tüm zaman çizelgeleri sunucunun gönderdiği `elapsed` değerinden hesaplanır; bu yüzden
 * sayfa yenilense bile sahne doğru yerden devam eder.
 */
(function (root) {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LET = ['A', 'B', 'C', 'D'];
  const fmtTL = (n) => `${Math.round(n).toLocaleString('tr-TR')} TL`;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const VOTE_PHASES = ['voting', 'tie_vote', 'tie_question'];

  const stage = $('#stage');
  const E = {
    scenes: { title: $('#sc-title'), company: $('#sc-company'), story: $('#sc-story'), office: $('#sc-office'), blackout: $('#sc-blackout'), final: $('#sc-final'), results: $('#sc-results') },
    portrait: $('#portrait'), svgwrap: $('#portrait .svgwrap'),
    taskbar: $('#taskbar'), narr: $('#narr'), narrP: $('#narr p'), aux: $('#aux'), bubble: $('#bubble'), bubbleWho: $('#bubble .who'), bubbleP: $('#bubble p'),
    qcard: $('#qcard'), timer: $('#qcard .timer'), timerBar: $('#qcard .timer .bar'), timerNum: $('#qcard .timer b'), qvotes: $('#qcard .qvotes b'),
    qno: $('#qcard .qtitle small'), qtitle: $('#qcard .qtitle h2'), qask: $('#qcard .qask'), tie: $('#qcard .tie-banner'), opts: $('#qcard .opts'), verdict: $('#qcard .verdict-line'),
    lobby: $('#lobbyp'), lobbyImg: $('#lobby-qr-img'), lobbyUrl: $('#lobby-url'), lobbyCount: $('#lobby-count'), lobbyNames: $('#lobby-names'),
    explain: $('#explain'), salaryp: $('#salaryp'), dossier: $('#dossier'), lockov: $('#lockov'), nervepop: $('#nervepop'),
    storyLine: $('#sc-story .story-line'), storyText: $('#story-text'),
    bo: $('#sc-blackout'), boSmall: $('#sc-blackout small'), boH: $('#sc-blackout h2'),
    finalPortrait: $('#final-portrait'), finalCard: $('#final-card'), finalCameos: $('#final-cameos'), finalBubble: $('#final-bubble'), finalBubbleWho: $('#final-bubble .who'), finalBubbleP: $('#final-bubble p'),
    results: $('#results-wrap'),
    hudTasks: $('#hud-tasks'), hudSalary: $('#hud-salary'), hudJob: $('#hud-job'), hudProj: $('#hud-proj'), salaryStat: $('.stat.salary'),
    nerveFill: $('#nerve-fill'), nerveVal: $('#nerve-val'), nerveZone: $('#nerve-zone'),
    fadeout: $('#fadeout'), fxFlash: $('.fx-flash'), fxRing: $('.fx-ring'),
  };

  const ctx = {
    S: null, t0: 0, meta: null, info: null, audio: null, onReset: null,
    curSeq: -1, flags: {}, first: true, resume: false,
    portraitBoss: null, lastChars: 0, shownNerve: 0, lastZone: -1, lastSec: null, stripKey: '', lastNames: '',
    optsKey: '', lastCounts: null,
  };
  const A = () => ctx.audio;
  const bossMeta = (id) => (ctx.meta && ctx.meta.bosses.find((b) => b.id === id)) || { name: '', voice: null };

  /* ------------------------------------------------------------------ */
  /* Kurulum                                                              */
  /* ------------------------------------------------------------------ */
  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.setProperty('--s', s.toFixed(4));
  }

  function makeNoise() {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'); const d = g.createImageData(160, 160);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    stage.style.setProperty('--noise', `url(${c.toDataURL()})`);
  }

  function buildBg() {
    const bg = $('#bg');
    for (const k of ['neutral', 'kerim', 'harun', 'taha']) {
      const d = document.createElement('div'); d.dataset.k = k; d.innerHTML = root.Portraits.BG[k](); bg.appendChild(d);
    }
  }

  function setBg(key) {
    $$('#bg > div').forEach((d) => d.classList.toggle('on', d.dataset.k === key));
  }

  function replay(node) {
    const all = node.querySelectorAll('*');
    all.forEach((n) => { n.style.animation = 'none'; });
    void node.offsetWidth;
    all.forEach((n) => { n.style.animation = ''; });
  }

  function init({ audio, onReset }) {
    ctx.audio = audio; ctx.onReset = onReset;
    fit(); window.addEventListener('resize', fit);
    makeNoise(); buildBg();
    requestAnimationFrame(frame);
  }

  function setMeta(m) {
    ctx.meta = m;
    // Sinir göstergesi: eşikler ve bölge adları sunucudaki bölgelerden üretilir
    const tr = $('.nerve-track');
    $$('i', tr).forEach((n) => n.parentNode.removeChild(n));
    $('.nerve-marks').innerHTML = m.zones.map((z) => `<span style="left:${(z.from + z.to + 1) / 2}%">${esc(z.name.toUpperCase())}</span>`).join('');
    m.zones.slice(1).forEach((z, i) => { const t = document.createElement('i'); t.style.left = z.from + '%'; if (i === 2) t.className = 'cut'; if (i === 3) t.className = 'fire'; tr.insertBefore(t, $('.nerve-marks')); });
    // HUD görev şeridi
    const groups = {};
    m.questions.forEach((q) => { (groups[q.boss] = groups[q.boss] || []).push(q); });
    E.hudTasks.innerHTML = Object.keys(groups).map((b) => `<div class="tgrp" data-boss="${b}"><div class="tl">${esc(bossMeta(b).name.toUpperCase())}</div><div class="tpips">${groups[b].map((q) => `<div class="pip" data-i="${q.no - 1}">${q.no}</div>`).join('')}</div></div>`).join('');
  }

  function setInfo(i) {
    ctx.info = i;
    if (i && i.qr) { E.lobbyImg.src = i.qr; E.lobbyUrl.textContent = i.joinUrl; }
  }

  /* ------------------------------------------------------------------ */
  /* Yardımcılar                                                          */
  /* ------------------------------------------------------------------ */
  const elapsed = () => (ctx.S.paused ? ctx.S.elapsed : ctx.S.elapsed + (performance.now() - ctx.t0));
  const remaining = () => (ctx.S.remaining == null ? null : Math.max(0, ctx.S.paused ? ctx.S.remaining : ctx.S.remaining - (performance.now() - ctx.t0)));
  const zoneOfN = (n) => { const z = ctx.meta.zones; for (let i = z.length - 1; i > 0; i--) if (n >= z[i].from) return i; return 0; };
  const QT = () => ctx.meta.questions.length;
  const zoneName = (z) => ctx.meta.zones[z].name;

  function modeFor(phase) {
    return ({
      boss_enter: 'dialog', boss_exit: 'dialog', fire: 'dialog', lobby: 'lobby', q_intro: 'intro',
      voting: 'vote', locked: 'vote', tie_vote: 'vote', tie_question: 'vote', tie_result: 'vote',
      reveal: 'reveal', reaction: 'react', salary: 'salary', verdict: 'verdict',
    })[phase] || 'dialog';
  }
  const sceneOf = (phase) => (({ title: 'title', company: 'company', story: 'story', blackout: 'blackout', final: 'final', results: 'results' })[phase] || 'office');

  function toggleScenes(name) {
    for (const [k, node] of Object.entries(E.scenes)) node.classList.toggle('on', k === name);
  }

  /** Ekranda gösterilen sinir değeri (sonuç açıklanana kadar eski değer). */
  function shownNerveTarget(S) {
    if (S.phase === 'reveal' && S.outcome) return S.outcome.before;
    return S.nerve;
  }

  function displaySalary(S, e) {
    if (S.phase === 'salary' && S.ext && S.ext.salaryBefore != null) {
      const k = ease((e - 2600) / 2400);
      return S.ext.salaryBefore + (S.ext.salaryAfter - S.ext.salaryBefore) * k;
    }
    if (S.phase === 'final' && S.final && S.final.id !== 4 && S.ext && S.ext.salaryBefore != null && S.ext.salaryBefore !== S.salary) {
      const k = ease((e - 3000) / 2400);
      return S.ext.salaryBefore + (S.salary - S.ext.salaryBefore) * k;
    }
    if (S.phase === 'final' && S.final && S.final.id === 4) return 0;
    if (S.phase === 'results' && S.final) return S.salary;
    if (['reveal', 'reaction'].includes(S.phase) && S.outcome && S.outcome.cutNow) return S.baseSalary;
    return S.salary;
  }

  /* ------------------------------------------------------------------ */
  /* Portre                                                               */
  /* ------------------------------------------------------------------ */
  function syncPortrait(S) {
    const want = sceneOf(S.phase) === 'office' ? S.stageBoss : null;
    const p = E.portrait;
    if (want === ctx.portraitBoss) return;
    if (ctx.portraitBoss && !want) {
      const old = ctx.portraitBoss;
      p.classList.remove('enter-' + old); p.classList.add('exit-' + old);
      setTimeout(() => { if (!ctx.portraitBoss) { p.classList.remove('show', 'exit-' + old); } }, 1300);
    } else if (want) {
      p.className = '';
      E.svgwrap.innerHTML = root.Portraits.portraitSvg(want);
      void p.offsetWidth;
      p.classList.add('show', 'enter-' + want);
      if (S.paused || ctx.resume) p.classList.remove('enter-' + want);
      if (!ctx.resume) {
        if (want === 'kerim') { A().footsteps(4); A().door(); }
        else if (want === 'harun') { A().door(); A().thud(); }
        else { A().boom(); }
      }
    }
    ctx.portraitBoss = want;
  }

  function setSpeaking(on) {
    E.portrait.classList.toggle('speaking', on);
    E.finalPortrait.classList.toggle('speaking', on);
  }

  /* ------------------------------------------------------------------ */
  /* Konuşma yazma                                                        */
  /* ------------------------------------------------------------------ */
  function layoutSpeech(sp) {
    let t = 0;
    return sp.lines.map((l, i) => { const o = { idx: i, who: l.who, text: l.text, audio: l.audio || null, len: l.text.length, start: t }; o.dur = l.ms || o.len * sp.typeMs; o.words = l.w || null; t += o.dur + sp.holdMs; o.end = t; return o; });
  }

  function speechTotalMs(S) {
    if (!S.speech) return 0;
    const L = S._lay || (S._lay = layoutSpeech(S.speech));
    return L.length ? L[L.length - 1].end : 0;
  }

  function setText(node, txt) { if (node._t !== txt) { node._t = txt; node.textContent = txt; } }


  /* ---------------- Seslendirme (önceden üretilmiş yapay zekâ sesi) ---------------- */
  const voiceEl = new Audio();
  voiceEl.preload = 'auto';
  ctx.voiceKey = null;
  function syncVoice(S, e, cur) {
    const l = cur && cur.l;
    const live = l && l.audio && e < l.start + l.dur + 80;
    const key = live ? `${S.seq}:${l.idx}` : null;
    voiceEl.muted = !A().enabled;
    if (!key) {
      if (ctx.voiceKey !== null) { voiceEl.pause(); ctx.voiceKey = null; A().duck(false); }
      return;
    }
    if (key !== ctx.voiceKey) {
      ctx.voiceKey = key;
      voiceEl.src = l.audio;
      const off = (e - l.start) / 1000;
      const go = () => { if (off > 0.35 && off < voiceEl.duration) voiceEl.currentTime = off; if (!S.paused) voiceEl.play().then(() => { ctx.voiceBlocked = false; }).catch(() => { ctx.voiceBlocked = true; }); };
      voiceEl.onloadedmetadata = go;
      voiceEl.load();
      A().duck(true);
    } else if (S.paused && !voiceEl.paused) voiceEl.pause();
    else if (!S.paused && voiceEl.paused && !voiceEl.ended && voiceEl.readyState >= 2) voiceEl.play().catch(() => { ctx.voiceBlocked = true; });
  }


  /** Satırdaki kelime zamanlarına göre (ms) o ana kadar okunmuş karakter sayısı. */
  function charsAt(l, t) {
    const w = l.words;
    if (!w || !w.length) return clamp(Math.floor((t / l.dur) * l.len), 0, l.len);
    let i = -1;
    for (let k = 0; k < w.length; k++) { if (w[k][0] <= t) i = k; else break; }
    if (i < 0) return 0;
    const [ts, cs, ce] = w[i];
    const next = w[i + 1];
    const wordMs = Math.max(120, (next ? next[0] : l.dur - 150) - ts);
    const frac = clamp((t - ts) / Math.min(wordMs, 90 * Math.max(1, ce - cs)), 0, 1);
    return Math.round(cs + (ce - cs) * frac);
  }

  /** Yazılan karakter sayısı: ses çalıyorsa sesin gerçek konumuna (currentTime) bağlıdır. */
  function typedChars(l, e, S, isLast) {
    const el = e - l.start;
    if (!l.audio) return clamp(Math.floor((el / l.dur) * l.len), 0, l.len);
    if (!isLast) return l.len;
    const mine = ctx.voiceKey === `${S.seq}:${l.idx}`;
    let t;
    if (mine && voiceEl.readyState >= 2 && (!voiceEl.paused || voiceEl.ended || S.paused)) t = voiceEl.currentTime * 1000;
    else if (el < 1000 && !ctx.voiceBlocked) return 0; // ses yükleniyor: yazı sesi bekler
    else t = el; // ses çalamadıysa (otomatik oynatma engeli) zamanlayıcıya göre ilerle
    return charsAt(l, t);
  }

  function updateSpeech(S, e) {
    const sp = S.speech;
    if (!sp) { setSpeaking(false); return; }
    const L = S._lay || (S._lay = layoutSpeech(S.speech));
    const narr = []; const boss = [];
    let cur = null; let total = 0;
    for (let li = 0; li < L.length; li++) {
      const l = L[li];
      if (e < l.start) break;
      const isLast = li === L.length - 1 || e < L[li + 1].start;
      const n = typedChars(l, e, S, isLast);
      (l.who === 'narrator' ? narr : boss).push(l.text.slice(0, n));
      total += n; cur = { l, n };
    }
    const typing = !!cur && cur.n < cur.l.len;
    const bossTyping = typing && cur.l.who !== 'narrator';

    if (sp.cinematic) {
      const txt = cur ? cur.l.text.slice(0, cur.n) : '';
      setText(E.storyText, txt);
      const out = cur && e > cur.l.end - 450 && !typing;
      E.storyLine.classList.toggle('out', !!out);
      E.storyText.classList.toggle('typing', typing);
    } else {
      const who = (cur && cur.l.who !== 'narrator') ? cur.l.who : S.stageBoss;
      const name = who ? bossMeta(who).name.toUpperCase() : '';
      if (S.phase === 'final') {
        setText(E.finalBubbleWho, name); setText(E.finalBubbleP, boss.join('\n'));
        E.finalBubbleP.classList.toggle('typing', bossTyping);
      } else {
        setText(E.bubbleWho, name); setText(E.bubbleP, boss.join('\n'));
        E.bubble.classList.toggle('empty', boss.length === 0 || !boss.join(''));
        setText(E.narrP, narr.join(' '));
        E.bubbleP.classList.toggle('typing', bossTyping);
        E.narrP.classList.toggle('typing', typing && cur.l.who === 'narrator');
      }
    }
    setSpeaking(bossTyping);
    syncVoice(S, e, cur);
    if (bossTyping && !cur.l.audio && total - ctx.lastChars >= 2) { A().blip(bossMeta(cur.l.who).voice); ctx.lastChars = total; }
    if (!bossTyping) ctx.lastChars = total;
  }

  /* ------------------------------------------------------------------ */
  /* Efektler                                                             */
  /* ------------------------------------------------------------------ */
  function flash(kind) {
    E.fxFlash.className = 'fx-flash'; void E.fxFlash.offsetWidth; E.fxFlash.classList.add(kind);
    E.fxRing.className = 'fx-ring'; void E.fxRing.offsetWidth; E.fxRing.classList.add('go'); if (kind !== 'good') E.fxRing.classList.add('bad');
  }
  function shake() { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); setTimeout(() => stage.classList.remove('shake'), 600); }
  function sparks(n, colors) {
    const host = $('#fx');
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div'); d.className = 'spark'; d.style.background = colors[i % colors.length];
      host.appendChild(d);
      const a = Math.random() * Math.PI * 2; const dist = 260 + Math.random() * 620;
      d.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist - 120}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1100 + Math.random() * 700, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => d.remove();
    }
  }
  const quiet = () => ctx.resume;

  /* ------------------------------------------------------------------ */
  /* Faz girişleri                                                        */
  /* ------------------------------------------------------------------ */
  function buildOpts(list) {
    const mono = list.some((t) => /[().]/.test(t) || /^[a-z]+$/.test(t));
    E.opts.innerHTML = list.map((t, i) => `<div class="opt" data-i="${i}"><div class="fill"></div><div class="top"><div class="key">${LET[i]}</div><div class="txt${mono ? ' mono' : ''}">${esc(t)}</div></div><div class="cnt"><b>0</b><span>%0</span></div></div>`).join('');
    ctx.optsKey = list.join('|'); ctx.lastCounts = null;
  }

  function applyCounts(counts, total) {
    if (!counts) return;
    const key = counts.join(',') + '/' + total;
    if (ctx.lastCounts === key) return;
    ctx.lastCounts = key;
    $$('.opt', E.opts).forEach((o, i) => {
      const c = counts[i] || 0; const pct = total ? Math.round((c / total) * 100) : 0;
      $('.fill', o).style.width = (total ? (c / total) * 100 : 0) + '%';
      $('.cnt b', o).textContent = c; $('.cnt span', o).textContent = `%${pct}`;
    });
    E.qvotes.textContent = total;
  }

  function fillQHead(q, tieQ) {
    if (tieQ) { E.qno.textContent = 'EŞİTLİK · HAKEM SORU'; E.qtitle.textContent = tieQ.title; E.qask.textContent = tieQ.ask; }
    else { E.qno.textContent = `GÖREV ${q.no} / ${QT()} · ${q.diffLabel.toUpperCase()}`; E.qtitle.textContent = q.title; E.qask.textContent = q.ask; }
  }

  const PH = {};

  PH.title = (S) => {
    replay(E.scenes.title);
    A().stopMusic(); A().startAmbience('title'); A().setTension(0);
  };

  PH.company = (S) => {
    const m = ctx.meta.company;
    const rows = [
      ['Şirket', m.name, 'wide'], ['Pozisyon', m.position, 'wide'],
      ['Başlangıç maaşı', fmtTL(m.baseSalary), ''], ['Patronun siniri', '%0', ''], ['İş güvencesi', 'Güvende', ''], ['Proje durumu', 'Henüz başlamadı', ''],
      ['Görev sayısı', String(m.taskCount), ''], ['Patron sırası', 'Kerim  →  Harun  →  Taha', 'w3'],
    ];
    $('#company-card').innerHTML = rows.map((r, i) => `<div class="crow ${r[2]}" style="--i:${i}"><small>${esc(r[0])}</small><b>${esc(r[1])}</b></div>`).join('');
    replay(E.scenes.company);
    A().startAmbience('title');
  };

  PH.story = () => { E.storyText.textContent = ''; E.storyText._t = ''; A().startAmbience('title'); };

  PH.boss_enter = () => { A().startAmbience('office'); };
  PH.lobby = () => { renderLobby(); };

  PH.q_intro = (S) => {
    const q = S.question;
    E.taskbar.innerHTML = `<span class="tk-no">GÖREV ${q.no} / ${QT()}</span><span class="tk-title">${esc(q.title)}</span><span class="chip ${q.difficulty}">${esc(q.diffLabel)}</span><span class="tk-boss">${esc(bossMeta(q.boss).name.toUpperCase())}</span>`;
    E.aux.classList.remove('show'); E.aux.innerHTML = '';
    if (q.code) {
      const code = esc(q.code).replace(/\b(app|req|res|next)\b/g, '$1').replace(/(app\.use|console\.log)/g, '<span class="fn">$1</span>').replace(/(=&gt;)/g, '<span class="kw">$1</span>');
      E.aux.innerHTML = `<div class="codebox"><div class="bar"><i></i><i></i><i></i><span>server.js</span></div><pre>${code}</pre></div>`;
    } else if (q.folders) {
      const ico = '<svg width="64" height="52" viewBox="0 0 64 52"><path d="M4 8a4 4 0 0 1 4-4h16l6 7h26a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="none" stroke="currentColor" stroke-width="3.5"/></svg>';
      E.aux.innerHTML = `<div class="folders">${q.folders.map((f, i) => `<div class="folder" style="--i:${i}">${ico}${esc(f)}</div>`).join('')}</div>`;
    }
    if (q.code || q.folders) E.aux.classList.add('show');
    A().slide();
  };

  function enterVote(S) {
    const tieQ = S.phase === 'tie_question' || (S.phase === 'locked' && S.tie && S.tie.stage === 'question') ? (S.tie && S.tie.question) : null;
    const q = S.question;
    const list = tieQ ? tieQ.options : q.options;
    fillQHead(q, tieQ);
    if (ctx.optsKey !== list.join('|') || S.phase === 'voting') buildOpts(list);
    E.qcard.classList.remove('enter'); void E.qcard.offsetWidth;
    if (S.phase === 'voting') { E.qcard.classList.add('enter'); A().slide(); }
    E.lockov.classList.remove('show');
    E.verdict.className = 'verdict-line';
    ctx.lastSec = null;
    applyVoteState(S);
  }

  function applyVoteState(S) {
    const v = S.voting;
    const tie = S.tie;
    E.tie.classList.remove('show');
    $$('.opt', E.opts).forEach((o) => o.classList.remove('dim', 'win', 'ok', 'bad'));
    if (S.phase === 'tie_vote' || (S.phase === 'locked' && S.ext && S.ext.round === 'revote')) {
      const names = tie.options.map((i) => LET[i]).join(' ve ');
      E.tie.textContent = `EŞİTLİK! Yalnızca ${names} seçenekleri arasında 5 saniyelik ek oylama.`;
      E.tie.classList.add('show');
      $$('.opt', E.opts).forEach((o, i) => o.classList.toggle('dim', !tie.options.includes(i)));
    } else if (S.phase === 'tie_question' || (S.phase === 'locked' && S.ext && S.ext.round === 'tieq')) {
      E.tie.textContent = 'EŞİTLİK SÜRÜYOR! Hakem soruyu doğru bilen tarafın seçeneği kazanır.';
      E.tie.classList.add('show');
    }
    if (v) applyCounts(v.counts, v.total);
  }

  PH.voting = (S) => { enterVote(S); };
  PH.tie_vote = (S) => { enterVote(S); A().whoosh(0.5, 0.1); };
  PH.tie_question = (S) => { enterVote(S); A().whoosh(0.5, 0.1); };
  PH.locked = (S) => { enterVote(S); E.lockov.textContent = S.ext && S.ext.by === 'early' ? 'TÜM OYLAR ALINDI' : 'OYLAR KİLİTLENDİ'; E.lockov.classList.add('show'); A().lock(); };

  PH.tie_result = (S) => {
    enterVote(S);
    const t = S.tie;
    E.lockov.classList.remove('show');
    const name = LET[t.winner];
    const sc = t.options.map((i) => `${LET[i]}: ${t.scores ? t.scores[i] : 0} doğru`).join('  ·  ');
    E.tie.textContent = t.method === 'coin' ? `Hâlâ eşit (${sc}). Yazı tura sonucu: seçenek ${name} uygulanacak.` : `Hakem soruyu doğru bilen taraf kazandı (${sc}). Uygulanacak seçenek: ${name}.`;
    E.tie.classList.add('show');
    $$('.opt', E.opts).forEach((o, i) => { o.classList.toggle('ok', t.correctIndex === i); });
    E.verdict.className = 'verdict-line show pending';
    E.verdict.textContent = t.explanation ? `Hakem sorunun cevabı: ${LET[t.correctIndex]} — ${t.explanation}` : '';
  };

  PH.reveal = (S) => {
    const q = S.question; const o = S.outcome;
    fillQHead(q, null);
    buildOpts(q.options);
    E.qcard.classList.remove('enter');
    E.lockov.classList.remove('show'); E.tie.classList.remove('show');
    E.verdict.className = 'verdict-line';
    if (o.tie) { E.tie.textContent = `EŞİTLİK! ${o.tie.options.map((i) => LET[i]).join(' ve ')} eşit oy aldı. ${o.tie.method === 'correct' ? 'Doğru seçenek uygulandı' : 'Her ikisi de yanlış; rastgele biri uygulandı'}: ${LET[o.winner]}.`; E.tie.classList.add('show'); }
    ctx.lastCounts = null; applyCounts(o.counts, o.total);
    E.timerNum.textContent = '0';
    E.timerBar.style.strokeDashoffset = '276.46';
    E.timer.classList.remove('danger');
  };

  PH.reaction = (S) => {
    const o = S.outcome;
    E.explain.classList.remove('show', 'wrong');
    const ok = o.kind === 'correct';
    const right = S.question.options[o.correctIndex];
    let html = `<div class="eh">NEDEN?</div><div class="ea">Doğru cevap: <em>${LET[o.correctIndex]} — ${esc(right)}</em></div><div class="et">${esc(o.explanation)}</div>`;
    if (o.explanationList) html += `<ul>${o.explanationList.map(([a, b], i) => `<li class="${i === o.correctIndex ? 'ok' : ''}"><b>${esc(a)}</b>${esc(b)}</li>`).join('')}</ul>`;
    E.explain.innerHTML = html;
    E.explain.classList.toggle('wrong', !ok);
    E.nervepop.className = ''; void E.nervepop.offsetWidth;
    const d = o.delta;
    E.nervepop.textContent = d > 0 ? `+${d} SİNİR` : d < 0 ? `${d} SİNİR` : 'SİNİR DEĞİŞMEDİ';
    E.nervepop.classList.add('go', d > 0 ? 'up' : 'down');
    E.taskbar.innerHTML = `<span class="tk-no">GÖREV ${S.question.no} / ${QT()}</span><span class="tk-title">${esc(S.question.title)}</span><span class="tk-boss">${esc(bossMeta(S.question.boss).name.toUpperCase())}</span>`;
  };

  PH.salary = (S) => {
    E.salaryp.classList.remove('show');
    E.salaryp.innerHTML = `<div class="sh">MAAŞ KESİNTİSİ · %20</div><div class="sv" id="sal-val">${fmtTL(S.ext.salaryBefore)}</div><div class="sd" id="sal-delta"></div><div class="sn">Normal maaş ${fmtTL(S.baseSalary)} · Kesinti ${fmtTL(S.ext.cut)}</div>`;
    A().salaryCut();
  };

  PH.boss_exit = () => {};
  PH.blackout = (S) => {
    const cap = (S.ext && S.ext.caption) || ['', ''];
    E.boSmall.textContent = cap[0]; E.boH.textContent = cap[1];
    replay(E.bo);
    A().whoosh(1.4, 0.15);
  };

  PH.verdict = (S) => {
    const secs = S.ext.sections || [];
    E.dossier.innerHTML = secs.map((s, i) => `<div class="dcard" style="--i:${i};--c:${s.boss === 'kerim' ? '#8fa6c4' : '#e0701a'}"><small>${esc(bossMeta(s.boss).name.toUpperCase())}'İN DEĞERLENDİRMESİ</small><h4>${s.boss === 'kerim' ? 'Temel bilgiler' : 'Teknik problemler'}</h4><b>${s.correct}<span> / ${s.total} doğru karar</span></b></div>`).join('');
    E.dossier.classList.add('show');
  };

  PH.fire = (S) => {
    stage.classList.add('fire-fx');
    E.fadeout.classList.remove('on');
    $('.stamp', E.fadeout) || (E.fadeout.innerHTML = '<div class="stamp">İŞİNE SON VERİLDİ</div>');
    if (!quiet()) { A().stopMusic(); A().glitch(); A().boom(); shake(); flash('bad'); }
  };

  PH.final = (S) => {
    const f = S.final;
    stage.classList.remove('fire-fx');
    const portraitBoss = S.stageBoss || 'taha';
    E.finalPortrait.innerHTML = root.Portraits.portraitSvg(portraitBoss);
    E.finalPortrait.dataset.lvl = f.id === 4 ? 4 : zoneOfN(S.nerve);
    E.finalPortrait.classList.add('show');
    E.scenes.final.classList.toggle('fired', f.id === 4);
    let rows;
    if (f.id === 1) rows = [['Maaş', fmtTL(f.salary), 'green'], f.raise ? ['Zam', `+${fmtTL(f.raise)} · ${f.correctN} doğru karar`, 'green'] : ['Kesinti', 'Yok', ''], ['Durum', f.status, 'green'], ['Ödül', f.badge, 'gold']];
    else if (f.id === 2) rows = [['Maaş', fmtTL(f.salary), ''], f.raise ? ['Zam', `+${fmtTL(f.raise)} · kesinti geri alındı`, 'green'] : ['Kesinti', 'Yok', ''], ['Durum', f.status, 'gold'], ['Proje', f.project, '']];
    else if (f.id === 3) rows = [['Normal maaş', fmtTL(f.normalSalary), ''], ['Kesinti', fmtTL(f.cut), 'red'], ['Yeni maaş', fmtTL(f.salary), 'red'], ['Durum', f.status, 'red']];
    else rows = [['Maaş', fmtTL(0), 'red'], ['Durum', f.status, 'red'], ['Proje', f.project, 'red'], ['Oyun', f.game, 'red']];
    E.finalCard.dataset.tone = f.tone;
    E.finalCard.innerHTML = `<div class="final-tag">FİNAL ${f.id}</div><div class="final-title">${esc(f.title)}</div><div class="final-rows">${rows.map((r) => `<div class="frow ${r[2]}"><small>${esc(r[0].toUpperCase())}</small><b>${esc(r[1])}</b></div>`).join('')}</div>`;
    if (f.cameos) {
      E.finalCameos.innerHTML = ['kerim', 'harun'].map((b, i) => `<div class="cameo" style="--i:${i};--c:${b === 'kerim' ? '#8fa6c4' : '#e0701a'}"><div class="av" data-lvl="${f.id === 1 ? 0 : f.id === 2 ? 1 : 2}">${root.Portraits.portraitSvg(b, '110 70 200 220')}</div><div><small>${esc(bossMeta(b).name.toUpperCase())}</small><p>“${esc(f.cameos[b])}”</p></div></div>`).join('');
    } else E.finalCameos.innerHTML = '';
    replay(E.finalCard); replay(E.finalCameos);
    if (!quiet()) {
      A().startAmbience('office');
      A().music(f.id === 1 ? 'good' : f.id === 2 ? 'warn' : f.id === 3 ? 'bad' : 'fire');
      if (f.id === 1) sparks(40, ['#f0b429', '#ffffff', '#ff7a1a', '#9be7b8']);
      if (f.id === 4) { A().stamp(); }
    } else {
      A().music(f.id === 1 ? 'good' : f.id === 2 ? 'warn' : f.id === 3 ? 'bad' : 'fire');
    }
    setTimeout(() => E.fadeout.classList.remove('on'), 500);
  };

  PH.results = (S) => {
    const f = S.final; const r = S.results;
    E.finalPortrait.classList.remove('show');
    const strip = r.strip.map((s) => `<div class="${s.kind}">${s.kind === 'correct' ? '✓' : s.kind === 'none' || s.kind === 'skipped' ? '–' : '✗'}<small>Görev ${s.no}</small></div>`).join('');
    const board = r.board.length ? r.board.map((b) => `<li><span>${esc(b.name)}</span><b>${b.score}</b></li>`).join('') : '<li><span>Katılımcı yok</span><b>–</b></li>';
    E.results.innerHTML = `
      <div class="res-head"><small>OYUN SONUCU · FİNAL ${f.id}</small><h2 class="${f.tone}">${esc(f.title)}</h2></div>
      <div class="res-grid">
        <div class="res-cell" style="--i:0"><small>MAAŞ</small><b>${fmtTL(S.salary)}</b></div>
        <div class="res-cell" style="--i:1"><small>PATRONUN SİNİRİ</small><b>%${S.nerve}</b></div>
        <div class="res-cell" style="--i:2"><small>DURUM</small><b>${esc(f.status)}</b></div>
        <div class="res-cell" style="--i:3"><small>EKİBİN DOĞRU KARARI</small><b>${r.teamCorrect} / ${QT()}</b></div>
      </div>
      <div class="res-cols">
        <div class="res-box"><h3>GÖREV GÖREV KARARLAR</h3><div class="strip">${strip}</div><p style="margin:18px 0 0;color:#9aa0ab;font-size:22px;line-height:1.4">Proje: ${esc(f.project)} · Oyun: ${esc(f.game)}</p></div>
        <div class="res-box"><h3>EN İYİ ÇALIŞANLAR (BİREYSEL DOĞRU OY)</h3><ol class="board">${board}</ol></div>
      </div>
      <div class="res-actions"><button type="button" id="res-again">YENİDEN OYNA</button></div>`;
    $('#res-again').onclick = () => ctx.onReset && ctx.onReset();
    replay(E.results);
  };

  function renderLobby() {
    const p = ctx.S ? ctx.S.players : null;
    if (!p) return;
    E.lobbyCount.textContent = p.total;
    const key = p.recent.join('|');
    if (key !== ctx.lastNames) {
      ctx.lastNames = key;
      E.lobbyNames.innerHTML = p.recent.map((n) => `<span>${esc(n)}</span>`).join('');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Durum alma                                                           */
  /* ------------------------------------------------------------------ */
  function receive(S) {
    const prev = ctx.S;
    ctx.S = S; ctx.t0 = performance.now();
    if (ctx.first) { ctx.resume = S.elapsed > 1800; }
    if (S.seq !== ctx.curSeq) {
      ctx.curSeq = S.seq; ctx.flags = {}; S._lay = null;
      enter(S, prev);
      ctx.first = false; setTimeout(() => { ctx.resume = false; }, 50);
    } else {
      sync(S);
    }
  }

  function enter(S, prev) {
    // Önceki fazdan kalan geçici efektleri temizle
    if (S.phase !== 'fire') stage.classList.remove('fire-fx');
    if (!['fire', 'final'].includes(S.phase)) E.fadeout.classList.remove('on');
    stage.dataset.phase = S.phase;
    stage.dataset.paused = S.paused ? '1' : '0';
    stage.dataset.boss = S.stageBoss || (ctx.portraitBoss || '');
    const sc = sceneOf(S.phase);
    toggleScenes(sc);
    stage.dataset.hud = ['title', 'company', 'story', 'blackout'].includes(S.phase) ? '0' : '1';
    stage.dataset.lb = ['story', 'blackout', 'fire'].includes(S.phase) ? '1' : '0';
    stage.dataset.hurry = '0';

    // Arka plan
    let bg = 'neutral';
    if (S.stageBoss && ['office', 'final'].includes(sc)) bg = S.stageBoss;
    else if (S.phase === 'results') bg = S.firedBy || 'taha';
    setBg(S.phase === 'blackout' ? 'none' : bg);

    // Ofis sahnesi kipi
    if (sc === 'office') {
      E.scenes.office.dataset.mode = modeFor(S.phase);
      E.aux.classList.toggle('show', false);
      E.explain.classList.remove('show'); E.salaryp.classList.remove('show'); E.dossier.classList.remove('show');
      E.lockov.classList.remove('show');
      E.nervepop.className = '';
      if (!['q_intro'].includes(S.phase)) E.narrP.textContent = '', E.narrP._t = '';
    }
    ctx.lastChars = 0;
    syncPortrait(S);
    if (PH[S.phase]) PH[S.phase](S, prev);
    if (S.phase === 'story') { E.storyLine.classList.remove('out'); }
    if (S.paused) stage.dataset.paused = '1';
    hudSync(S);
  }

  function sync(S) {
    stage.dataset.paused = S.paused ? '1' : '0';
    if (S.phase === 'lobby') renderLobby();
    if (VOTE_PHASES.includes(S.phase) || S.phase === 'locked') applyVoteState(S);
    hudSync(S);
  }

  function presence(p) {
    if (!ctx.S) return;
    ctx.S.players = p;
    if (ctx.S.phase === 'lobby') renderLobby();
  }

  function votes(v) {
    if (!ctx.S || !v) return;
    ctx.S.voting = v;
    if (VOTE_PHASES.includes(ctx.S.phase) || ctx.S.phase === 'locked') applyCounts(v.counts, v.total);
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                  */
  /* ------------------------------------------------------------------ */
  function hudSync(S) {
    const target = shownNerveTarget(S);
    const z = zoneOfN(S.phase === 'final' && S.final && S.final.id === 4 ? 100 : target);
    E.nerveFill.style.width = clamp(target, 0, 100) + '%';
    stage.dataset.zone = z;
    E.portrait.dataset.lvl = z;
    if (z !== ctx.lastZone) { ctx.lastZone = z; A().setTension(S.phase === 'title' ? 0 : z); }
    E.nerveZone.textContent = zoneName(z).toUpperCase();
    E.hudJob.textContent = S.endReason === 'fired' && ['final', 'results'].includes(S.phase) ? 'Sona erdi' : ctx.meta.zones[z].job;
    E.hudProj.textContent = S.project;
  }

  function pips(S, e) {
    let kinds = S.strip.slice();
    if (S.phase === 'reveal' && S.qIndex >= 0 && e < 3400) kinds[S.qIndex] = 'none';
    const key = kinds.join(',') + '/' + S.qIndex + '/' + S.phase;
    if (key === ctx.stripKey) return;
    ctx.stripKey = key;
    $$('.pip', E.hudTasks).forEach((p) => {
      const i = +p.dataset.i; const k = kinds[i];
      p.className = 'pip' + (k && k !== 'none' ? ' ' + k : '') + (i === S.qIndex && (!k || k === 'none') && !['final', 'results', 'verdict'].includes(S.phase) ? ' cur' : '');
    });
    $$('.tgrp', E.hudTasks).forEach((g) => g.classList.toggle('cur', g.dataset.boss === S.stageBoss));
  }

  /* ------------------------------------------------------------------ */
  /* Kare döngüsü                                                         */
  /* ------------------------------------------------------------------ */
  function frame() {
    requestAnimationFrame(frame);
    const S = ctx.S;
    if (!S || !ctx.meta) return;
    const e = elapsed();

    updateSpeech(S, e);
    pips(S, e);

    // sinir sayacı
    const target = shownNerveTarget(S);
    ctx.shownNerve += (target - ctx.shownNerve) * 0.06;
    if (Math.abs(target - ctx.shownNerve) < 0.2) ctx.shownNerve = target;
    E.nerveVal.textContent = Math.round(ctx.shownNerve);

    // maaş
    const sal = displaySalary(S, e);
    const txt = fmtTL(sal);
    if (E.hudSalary.textContent !== txt) E.hudSalary.textContent = txt;
    E.salaryStat.classList.toggle('cut', sal < S.baseSalary - 1);
    $('#sal-val') && ($('#sal-val').textContent = txt);

    // Geri sayım
    if (VOTE_PHASES.includes(S.phase)) {
      const rem = remaining();
      const sec = Math.ceil(rem / 1000);
      E.timerNum.textContent = sec;
      E.timerBar.style.strokeDashoffset = (276.46 * (1 - rem / S.duration)).toFixed(2);
      const danger = sec <= 5 && S.phase !== 'tie_vote' || (S.phase === 'tie_vote' && sec <= 2);
      E.timer.classList.toggle('danger', danger);
      stage.dataset.hurry = danger && !S.paused ? '1' : '0';
      if (sec !== ctx.lastSec) {
        if (ctx.lastSec !== null && sec > 0 && sec <= 10 && !S.paused) A().tick(sec <= 5);
        ctx.lastSec = sec;
      }
    } else if (S.phase === 'locked') {
      stage.dataset.hurry = '0'; E.timerNum.textContent = '0'; E.timer.classList.remove('danger');
    } else if (stage.dataset.hurry !== '0') stage.dataset.hurry = '0';

    // faz zaman çizelgeleri
    const fr = FR[S.phase];
    if (fr) fr(S, e);
  }

  const FR = {};

  FR.q_intro = (S, e) => {
    // anlatım bitince aux (kod/klasör) hazır
  };

  FR.reveal = (S, e) => {
    const o = S.outcome; const f = ctx.flags;
    const opts = $$('.opt', E.opts);
    if (e >= 1100 && !f.win) {
      f.win = true;
      if (o.winner != null) {
        opts[o.winner].classList.add('win');
        E.verdict.textContent = `Ekibin kararı: ${LET[o.winner]} — ${S.question.options[o.winner]}`;
      } else E.verdict.textContent = 'Süre doldu. Ekip bir karar veremedi.';
      E.verdict.className = 'verdict-line show pending';
    }
    if (e >= 3200 && !f.res) {
      f.res = true;
      opts[o.correctIndex].classList.add('ok');
      if (o.winner != null && !o.correct) opts[o.winner].classList.add('bad');
      E.verdict.className = 'verdict-line show ' + o.kind;
      E.verdict.textContent = o.kind === 'correct' ? 'DOĞRU KARAR' : o.kind === 'timeout' ? 'SÜRE DOLDU · KARAR YOK' : 'YANLIŞ KARAR';
      if (!quiet()) {
        if (o.kind === 'correct') { flash('good'); sparks(26, ['#2fbf71', '#9be7b8', '#ffffff']); A().correct(); }
        else { flash(o.kind === 'timeout' ? 'timeout' : 'bad'); shake(); o.kind === 'timeout' ? A().timeout() : A().wrong(); }
      }
    }
  };

  FR.reaction = (S, e) => {
    const f = ctx.flags; const end = speechTotalMs(S);
    if (e >= end - 700 && !f.exp) { f.exp = true; E.explain.classList.add('show'); A().slide(); }
    if (e >= 500 && !f.pop && S.outcome) { f.pop = true; }
  };

  FR.salary = (S, e) => {
    const f = ctx.flags;
    if (e >= 1400 && !f.show) { f.show = true; E.salaryp.classList.add('show'); A().slide(); }
    if (e >= 2600 && !f.cnt) { f.cnt = true; f.last = -1; $('#sal-val') && $('#sal-val').classList.add('red'); }
    if (f.cnt && e < 5200 && !quiet()) {
      const step = Math.floor((e - 2600) / 180);
      if (step !== f.last) { f.last = step; A().cash(1); }
    }
    if (e >= 5100 && !f.done) {
      f.done = true;
      const d = $('#sal-delta'); if (d) d.textContent = `− ${fmtTL(S.ext.cut)}`;
      if (!quiet()) { A().stamp(); shake(); }
    }
  };

  FR.fire = (S, e) => {
    const f = ctx.flags;
    const start = (S.duration || 0) - 2800;
    if (e >= start && !f.dark) {
      f.dark = true;
      E.fadeout.classList.add('on');
      if (!quiet()) { A().stamp(); A().glitch(); }
    }
  };

  FR.final = () => {};

  Object.assign(root, {
    Stage: { init, receive, setMeta, setInfo, presence, votes, fit, replay, voiceEl },
  });
})(window);
