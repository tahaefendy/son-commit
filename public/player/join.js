(function () {
  'use strict';
  const { C, S } = window.EV;
  const KEY = 'sc_player';
  const $ = (s) => document.querySelector(s);

  // Bu telefon zaten katıldıysa doğrudan oyuna dön (çift kimliği önler).
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.pid && saved.token) { location.replace(window.SC_PLAY || '/play'); return; }
  } catch (e) { /* yoksay */ }

  const socket = window.io({ transports: ['websocket', 'polling'] });
  const go = $('#go'); const err = $('#err'); const input = $('#name');
  let connected = false;

  const refresh = () => { go.disabled = !connected || input.value.trim().length < 2; };
  const showErr = (m) => { err.textContent = m; err.hidden = false; };

  socket.on('connect', () => { connected = true; $('#conn').classList.remove('off'); $('#connText').textContent = 'Bağlı'; refresh(); });
  socket.on('disconnect', () => { connected = false; $('#conn').classList.add('off'); $('#connText').textContent = 'Bağlantı koptu'; refresh(); });
  socket.on('connect_error', () => { $('#connText').textContent = 'Sunucuya ulaşılamıyor'; });
  input.addEventListener('input', () => { err.hidden = true; refresh(); });

  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (go.disabled) return;
    go.disabled = true; err.hidden = true;
    socket.emit(C.PLAYER_JOIN, { name: input.value });
  });

  socket.on(S.JOIN_ERROR, (d) => { showErr(d.message || 'Katılım başarısız.'); refresh(); });
  socket.on(S.JOINED, (d) => {
    try { localStorage.setItem(KEY, JSON.stringify({ pid: d.pid, token: d.token, name: d.name })); } catch (e) { /* yoksay */ }
    location.replace(window.SC_PLAY || '/play');
  });
})();
