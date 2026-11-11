/* Telefon ekranı: oy verme, geri sayım, sonuç. Doğru cevap yalnızca sonuç açıklanınca gelir. */
(function () {
  'use strict';
  const { C, S } = window.EV;
  const KEY = 'sc_player';
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTL = (n) => `${Math.round(n).toLocaleString('tr-TR')} TL`;
  const LET = ['A', 'B', 'C', 'D'];
  const ZONE = ['Sakin', 'Şüpheci', 'Sinirli', 'Maaş kesintisi', 'İşten çıkarma'];

  let creds = null;
  try { creds = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { creds = null; }
  if (!creds || !creds.pid) { location.replace(window.SC_JOIN || '/join'); return; }

  const app = $('#app');
  const socket = window.io({ transports: ['websocket', 'polling'] });
  let st = null; let t0 = 0; let lastSeq = -1; let pending = null; let builtKey = '';
  $('#pname').textContent = creds.name || '';

  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800); };
  const flash = (k) => { const f = $('#flash'); f.className = 'flash'; void f.offsetWidth; f.classList.add(k); };
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* yoksay */ } };

  socket.on('connect', () => {
    $('#conn').classList.remove('off');
    socket.emit(C.PLAYER_JOIN, { name: creds.name, pid: creds.pid, token: creds.token });
  });
  socket.on('disconnect', () => $('#conn').classList.add('off'));
  socket.on(S.JOIN_ERROR, (d) => {
    app.innerHTML = `<div class="card wait"><h2>Katılım yapılamadı</h2><p>${esc(d.message || 'Bir hata oluştu.')}</p><button class="btn" id="back">KATILIM SAYFASINA DÖN</button></div>`;
    $('#back').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) { /* yoksay */ } location.replace(window.SC_JOIN || '/join'); };
  });
  socket.on(S.JOINED, (d) => {
    creds = { pid: d.pid, token: d.token, name: d.name };
    try { localStorage.setItem(KEY, JSON.stringify(creds)); } catch (e) { /* yoksay */ }
    $('#pname').textContent = d.name;
  });
  socket.on(S.STATE_PLAYER, (s) => { st = s; t0 = performance.now(); render(s); });
  socket.on(S.VOTE_ACK, (d) => {
    pending = null;
    if (st && st.vote) { st.vote.mine = d.option; render(st); }
    buzz(40); toast('Oyunuz alındı');
  });
  socket.on(S.VOTE_REJECTED, (d) => {
    pending = null; toast(d.message || 'Oy kabul edilmedi.');
    if (st) render(st);
  });

  const remaining = () => (st && st.remaining != null ? Math.max(0, st.paused ? st.remaining : st.remaining - (performance.now() - t0)) : null);

  function strip(s) {
    return `<div class="strip">
      <div class="cell nerve"><small>PATRONUN SİNİRİ</small><b>%${s.nerve} · ${ZONE[s.zone]}</b><div class="bar"><i style="width:${s.nerve}%"></i></div></div>
      <div class="cell"><small>MAAŞ</small><b>${fmtTL(s.salary)}</b></div>
      <div class="cell"><small>PUANIN</small><b>${s.score}</b></div>
    </div>`;
  }

  function wait(title, text, tag) {
    return `<div class="card wait">${tag ? `<div class="tag">${esc(tag)}</div>` : ''}<div class="pulse"></div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function isMono(list) { return list.some((t) => /[().]/.test(t) || /^[a-z]+$/.test(t)); }

  function renderVote(s) {
    const v = s.vote;
    const key = `${s.seq}`;
    const mono = isMono(v.options);
    const voted = v.mine !== null && v.mine !== undefined;
    const banner = v.kind === 'revote' ? `<div class="banner">EŞİTLİK! Yalnızca ${v.allowed.map((i) => LET[i]).join(' ve ')} arasında yeniden oy ver.</div>`
      : v.kind === 'tieq' ? '<div class="banner">Eşitlik sürüyor! Hakem soruyu doğru bil, seçeneğini kazandır.</div>' : '';
    const opts = v.options.map((t, i) => {
      const allowed = v.allowed.includes(i);
      const cls = ['opt', voted && v.mine === i ? 'mine' : '', !allowed ? 'dim' : '', voted && v.mine !== i ? 'dim' : ''].join(' ');
      return `<button class="${cls}" data-i="${i}" ${!v.open || voted || !allowed || pending !== null ? 'disabled' : ''}><span class="k">${LET[i]}</span><span class="t${mono ? ' mono' : ''}">${esc(t)}</span></button>`;
    }).join('');
    const sent = voted ? `<div class="sent">Oyunuz alındı: ${LET[v.mine]} — ${esc(v.options[v.mine])}<small>${v.open ? 'Süre bitince ekibin kararı sunum ekranında açıklanacak.' : 'Oylar kilitlendi. Sonuç birazdan ekranda.'}</small></div>`
      : !v.open ? '<div class="paused" style="color:#ffc864">OYLAR KİLİTLENDİ</div>' : '';
    const head = v.kind === 'tieq' ? 'HAKEM SORU' : `GÖREV ${s.qNo} / ${s.qTotal}`;
    return `${s.paused ? '<div class="paused">OYUN DURAKLATILDI</div>' : ''}
      <div class="card"><div class="timer" id="timer"><div class="num" id="tnum">–</div><div class="track"><i id="tbar"></i></div></div></div>
      <div class="card"><div class="qtitle"><small>${head}</small><h2>${esc(v.title)}</h2></div><p class="ask" style="margin-top:12px">${esc(v.ask)}</p></div>
      ${banner}${sent}<div class="opts" id="opts">${opts}</div>`;
  }

  function renderResult(s) {
    const r = s.result;
    let cls = 'good'; let title = 'DOĞRU KARAR'; let text = '';
    if (r.kind === 'wrong') { cls = 'badr'; title = 'YANLIŞ KARAR'; }
    else if (r.kind === 'timeout') { cls = 'warnr'; title = 'SÜRE DOLDU'; }
    if (r.kind === 'timeout') text = 'Ekip zamanında karar veremedi. Patronun sinirleri yükseldi.';
    else text = `Ekibin kararı: <b>${LET[r.winner]} — ${esc(r.options[r.winner])}</b>`;
    const correct = r.kind === 'wrong' ? `<p>Doğru cevap: <b>${LET[r.correctIndex]} — ${esc(r.options[r.correctIndex])}</b></p>` : '';
    let mine = '';
    if (r.mine !== null && r.mine !== undefined) mine = `<div class="mine-line">Senin oyun: ${LET[r.mine]} — ${esc(r.options[r.mine])} · ${r.mineCorrect ? 'doğru bildin' : 'yanlış'}</div>`;
    else mine = '<div class="mine-line">Bu soruda oy kullanmadın.</div>';
    return `<div class="result ${cls}"><h2>${title}</h2><p>${text}</p>${correct}${mine}</div>`;
  }

  function renderFinal(s) {
    const f = s.final;
    if (!f) return wait('Oyun bitti', 'Sonuçlar sunum ekranında.', 'SONUÇ');
    const rows = f.id === 4 ? [['Maaş', fmtTL(0)], ['Durum', f.status], ['Proje', f.project]]
      : f.id === 3 ? [['Normal maaş', fmtTL(f.normalSalary)], ['Kesinti', fmtTL(f.cut)], ['Yeni maaş', fmtTL(f.salary)], ['Durum', f.status]]
        : [['Maaş', fmtTL(f.salary)], f.raise ? ['Zam', '+' + fmtTL(f.raise)] : ['Kesinti', 'Yok'], ['Durum', f.status]];
    return `<div class="final ${f.tone}"><div class="tag">FİNAL ${f.id}</div><h2>${esc(f.title)}</h2>
      <div class="rows">${rows.map((r) => `<div><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}<div><span>Senin puanın</span><b>${s.score} doğru oy</b></div></div></div>`;
  }

  function render(s) {
    document.body.dataset.zone = s.zone;
    let body = '';
    const ph = s.phase;
    if (ph === 'voting' || ph === 'tie_vote' || ph === 'tie_question' || ph === 'locked') {
      body = s.vote ? renderVote(s) : wait('Oylama', 'Sunum ekranına bakın.', 'OYLAMA');
    } else if (['reveal', 'reaction', 'salary'].includes(ph)) {
      body = (s.result ? renderResult(s) : wait('Sonuç', 'Sunum ekranına bakın.', 'SONUÇ'))
        + (ph === 'salary' ? '<div class="card wait"><h2>Maaş kesintisi</h2><p>Maaşın %20 azaldı. Sunum ekranını takip et.</p></div>' : '');
    } else if (ph === 'tie_result') {
      body = wait('Eşitlik bozuldu', s.tie ? `Uygulanacak seçenek: ${LET[s.tie.winner]}. Sonuç birazdan ekranda.` : 'Sonuç birazdan ekranda.', 'EŞİTLİK');
    } else if (ph === 'q_intro') {
      body = wait(`Görev ${s.qNo} / ${s.qTotal}`, `${s.boss || 'Patron'} görevi anlatıyor. Ekrana bakın; oylama birazdan açılacak.`, 'GÖREV');
    } else if (ph === 'boss_exit' || ph === 'blackout' || ph === 'verdict') {
      body = wait('Patron değişiyor', 'Sunum ekranını takip edin.', 'GEÇİŞ');
    } else if (ph === 'fire') {
      body = `<div class="final fire"><div class="tag">İŞTEN ÇIKARMA</div><h2>İşine son verildi</h2><p style="color:#c4c8d0">${esc(s.boss || 'Patron')} kararını verdi. Sunum ekranına bakın.</p></div>`;
    } else if (ph === 'final' || ph === 'results') {
      body = renderFinal(s) + (ph === 'results' ? '<div class="hint">Oynadığın için teşekkürler! Yeni oyun başlarsa bu sayfa otomatik güncellenir.</div>' : '');
    } else if (ph === 'lobby') {
      body = wait(`Hoş geldin, ${s.name}`, 'Ekip toplanıyor. İlk görev birazdan başlayacak. Bu sayfayı açık tut.', 'BAĞLANDIN');
    } else {
      body = wait(`Hoş geldin, ${s.name}`, 'Oyun başlamak üzere. Sunum ekranını takip et ve bu sayfayı açık tut.', 'BAĞLANDIN');
    }

    // Sayfa yapısı: üstte durum şeridi, altta faz içeriği
    app.innerHTML = strip(s) + body;

    // yeni faz geçişi → titreşim / efekt
    if (s.seq !== lastSeq) {
      lastSeq = s.seq;
      if (ph === 'voting' || ph === 'tie_vote' || ph === 'tie_question') buzz([60, 40, 60]);
      if (ph === 'reveal' && s.result) setTimeout(() => { flash(s.result.kind === 'correct' ? 'good' : 'bad'); buzz(s.result.kind === 'correct' ? 80 : [120, 60, 120]); }, 3300);
    }
    bindOpts();
  }

  function bindOpts() {
    document.querySelectorAll('#opts .opt').forEach((b) => {
      b.addEventListener('click', () => {
        if (!st || !st.vote || !st.vote.open || (st.vote.mine !== null && st.vote.mine !== undefined) || pending !== null) return;
        const i = Number(b.dataset.i);
        pending = i;
        document.querySelectorAll('#opts .opt').forEach((x) => { x.disabled = true; });
        b.classList.add('mine');
        socket.emit(C.PLAYER_VOTE, { option: i });
      });
    });
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!st) return;
    const num = $('#tnum'); const bar = $('#tbar'); const timer = $('#timer');
    if (!num) return;
    if (!st.vote || !st.vote.open) { num.textContent = '0'; bar.style.transform = 'scaleX(0)'; return; }
    const rem = remaining();
    const sec = Math.ceil(rem / 1000);
    num.textContent = sec;
    bar.style.transform = `scaleX(${st.duration ? Math.max(0, Math.min(1, rem / st.duration)) : 0})`;
    timer.classList.toggle('danger', sec <= 5);
  }
  requestAnimationFrame(tick);
})();
