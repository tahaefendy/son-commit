/* Sunum ekranı denetleyicisi: Socket.IO bağlantısı, yönetici paneli, klavye kısayolları. */
(function () {
  'use strict';
  const { C, S } = window.EV;
  const $ = (s, r = document) => r.querySelector(s);
  const fmtTL = (n) => `${Math.round(n).toLocaleString('tr-TR')} TL`;

  const audio = new window.SoundEngine();
  audio.ensure();
  const key = new URLSearchParams(location.search).get('key') || '';
  const socket = window.io({ transports: ['websocket', 'polling'] });

  let state = null;
  let meta = null;
  let info = null;
  let infoPromise = null;

  const PHASE_LABEL = {
    title: 'Açılış', company: 'Şirket tanıtımı', story: 'Hikâye', boss_enter: 'Patron girişi', lobby: 'Katılım (QR)',
    q_intro: 'Görev anlatımı', voting: 'Oylama', locked: 'Oylar kilitli', tie_vote: 'Eşitlik ek oylaması',
    tie_question: 'Hakem soru', tie_result: 'Eşitlik sonucu', reveal: 'Sonuç', reaction: 'Patron tepkisi',
    salary: 'Maaş kesintisi', boss_exit: 'Patron ayrılıyor', blackout: 'Geçiş', verdict: 'Değerlendirme',
    fire: 'İşten çıkarma', final: 'Final', results: 'Sonuç ekranı',
  };

  window.Stage.init({ audio, onReset: () => doReset() });

  /* ---------------- Bağlantı ---------------- */
  const conn = $('#d-conn');
  const setConn = (ok, text) => { conn.textContent = text; conn.classList.toggle('ok', ok); conn.classList.toggle('bad', !ok); };

  socket.on('connect', () => { setConn(true, 'Bağlı'); socket.emit(C.HOST_HELLO, { key }); });
  socket.on('disconnect', () => setConn(false, 'Bağlantı koptu · yeniden bağlanılıyor…'));
  socket.on('connect_error', () => setConn(false, 'Sunucuya ulaşılamıyor…'));

  socket.on(S.HOST_DENIED, (d) => { $('#denied-text').textContent = d.message; $('#denied').hidden = false; });
  socket.on(S.HOST_READY, (d) => {
    meta = d.meta; state = d.state;
    window.Stage.setMeta(meta);
    window.Stage.receive(state);
    updateDock(state);
    loadInfo();
  });
  socket.on(S.STATE_HOST, (st) => { state = st; if (!meta) return; window.Stage.receive(st); updateDock(st); });
  socket.on(S.VOTES, (v) => { window.Stage.votes(v); if (state) { state.voting = v; $('#d-votes') && ($('#d-votes').textContent = v.total); } });
  socket.on(S.PRESENCE, (p) => { window.Stage.presence(p); $('#d-players').textContent = `${p.total} (bağlı ${p.connected})`; });
  socket.on(S.NOTICE, (n) => toast(n.message));

  function loadInfo() {
    if (info) return Promise.resolve(info);
    if (!infoPromise) {
      infoPromise = (window.__scStatic ? window.__scStatic.info() : fetch('/api/info').then((r) => r.json())).then((i) => { info = i; window.Stage.setInfo(i); return i; }).catch(() => { infoPromise = null; return null; });
    }
    return infoPromise;
  }

  /* ---------------- Yönetici paneli ---------------- */
  function updateDock(st) {
    const c = st.controls;
    $('#b-start').disabled = !c.canStart;
    const pb = $('#b-pause');
    pb.textContent = st.paused ? 'Devam Ettir' : 'Duraklat';
    pb.disabled = st.paused ? !c.canResume : !c.canPause;
    $('#b-next').disabled = !c.canNext;
    $('#b-lock').disabled = !c.canLock;
    $('#b-results').disabled = !c.canShowResults;
    $('#b-nextq').disabled = !c.canNextQuestion;
    $('#b-restart').disabled = !c.canRestart;
    $('#b-reset').disabled = !c.canReset;
    $('#d-players').textContent = `${st.players.total} (bağlı ${st.players.connected})`;
    const b = st.stageBoss && meta ? meta.bosses.find((x) => x.id === st.stageBoss) : null;
    $('#d-boss').textContent = b ? b.name : '—';
    $('#d-nerve').textContent = `%${st.nerve}`;
    $('#d-salary').textContent = fmtTL(st.salary);
    $('#d-phase').textContent = (PHASE_LABEL[st.phase] || st.phase) + (st.paused ? ' · duraklatıldı' : '');
  }

  const send = (ev) => socket.emit(ev);
  const unlock = () => { audio.resume().then(refreshGate); };

  $('#b-start').onclick = () => { unlock(); send(C.HOST_START); };
  $('#title-start').onclick = () => { unlock(); send(C.HOST_START); };
  $('#b-pause').onclick = () => togglePause();
  $('#b-next').onclick = () => doNext();
  $('#b-lock').onclick = () => send(C.HOST_LOCK);
  $('#b-results').onclick = () => send(C.HOST_SHOW_RESULTS);
  $('#b-nextq').onclick = () => doNextQuestion();
  $('#b-restart').onclick = () => send(C.HOST_RESTART_QUESTION);
  $('#b-qr').onclick = () => toggleQr();
  $('#b-sound').onclick = () => toggleSound();
  $('#b-full').onclick = () => toggleFull();
  $('#b-reset').onclick = () => doReset();

  function doNext() { unlock(); send(C.HOST_NEXT); }
  function togglePause() { send(state && state.paused ? C.HOST_RESUME : C.HOST_PAUSE); }

  async function doNextQuestion() {
    if (!state || !state.controls.canNextQuestion) return;
    const unresolved = ['q_intro', 'voting', 'locked', 'tie_vote', 'tie_question', 'tie_result'].includes(state.phase);
    if (unresolved) {
      const ok = await ask('Sonraki soruya geç', 'Bu soru sonuçlandırılmadan atlanacak. Sinir ve maaş değişmez. Devam edilsin mi?', 'Evet, atla');
      if (!ok) return;
    }
    send(C.HOST_NEXT_QUESTION);
  }

  async function doReset() {
    const ok = await ask('Oyunu sıfırla', 'Tüm ilerleme (sinir, maaş, oylar ve puanlar) silinir ve oyun açılış ekranına döner. Katılımcılar bağlı kalır. Emin misiniz?', 'Evet, sıfırla');
    if (ok) send(C.HOST_RESET);
  }

  function toggleSound() {
    audio.setEnabled(!audio.enabled);
    $('#b-sound').textContent = `Ses: ${audio.enabled ? 'Açık' : 'Kapalı'}`;
    if (audio.enabled) unlock();
  }
  $('#b-sound').textContent = `Ses: ${audio.enabled ? 'Açık' : 'Kapalı'}`;

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('Tam ekran moduna geçilemedi.'));
  }

  async function toggleQr() {
    const m = $('#qrmodal');
    if (!m.hidden) { m.hidden = true; return; }
    const i = await loadInfo();
    if (!i) { toast('QR kod oluşturulamadı.'); return; }
    $('#qr-big').src = i.qr; $('#qr-url').textContent = i.joinUrl;
    m.hidden = false;
  }

  /* ---------------- Onay penceresi ---------------- */
  function ask(title, text, okLabel = 'Evet') {
    return new Promise((resolve) => {
      const m = $('#confirm');
      $('#confirm-title').textContent = title; $('#confirm-text').textContent = text;
      $('[data-ok]', m).textContent = okLabel;
      m.hidden = false;
      const done = (v) => { m.hidden = true; $('[data-ok]', m).onclick = $('[data-cancel]', m).onclick = null; resolve(v); };
      $('[data-ok]', m).onclick = () => done(true);
      $('[data-cancel]', m).onclick = () => done(false);
      m._cancel = () => done(false);
    });
  }
  $$all('[data-close]').forEach((b) => { b.onclick = () => { $('#qrmodal').hidden = true; }; });
  $('#qrmodal').addEventListener('click', (e) => { if (e.target.id === 'qrmodal') $('#qrmodal').hidden = true; });
  function $$all(s) { return [...document.querySelectorAll(s)]; }

  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // Tıklanan düğme odakta kalmasın: Boşluk/Enter yanlışlıkla düğmeyi tetiklemesin.
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });

  /* ---------------- Klavye ---------------- */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const modalOpen = !$('#confirm').hidden || !$('#qrmodal').hidden;
    if (e.key === 'Escape') {
      if (!$('#confirm').hidden && $('#confirm')._cancel) $('#confirm')._cancel();
      $('#qrmodal').hidden = true; return;
    }
    if (modalOpen) return;
    switch (e.key.toLowerCase()) {
      case ' ': case 'enter': e.preventDefault(); doNext(); break;
      case 'p': togglePause(); break;
      case 'l': send(C.HOST_LOCK); break;
      case 'r': send(C.HOST_SHOW_RESULTS); break;
      case 'n': doNextQuestion(); break;
      case 'q': toggleQr(); break;
      case 'm': toggleSound(); break;
      case 'f': toggleFull(); break;
      case 'h': dock.classList.toggle('show'); break;
      default: break;
    }
  });

  /* ---------------- Panelin otomatik gizlenmesi ---------------- */
  const dock = $('#dock');
  let hideT = null;
  const showDock = () => {
    dock.classList.add('show'); document.body.style.cursor = '';
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!dock.matches(':hover')) { dock.classList.remove('show'); document.body.style.cursor = 'none'; } }, 3500);
  };
  window.addEventListener('mousemove', showDock);
  window.addEventListener('touchstart', showDock, { passive: true });
  showDock();

  /* ---------------- Ses kapısı (tarayıcı otomatik oynatma kuralı) ---------------- */
  const gate = $('#soundgate');
  function refreshGate() { gate.hidden = !(audio.enabled && audio.suspended); }
  gate.onclick = unlock;
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { audio.resume().then(refreshGate); }, { capture: true }));
  setInterval(refreshGate, 1000);
})();
