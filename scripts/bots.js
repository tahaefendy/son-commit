'use strict';
/*
 * Test botları: sahte telefonlar ekleyip rastgele oy verir.
 * Kullanım:  npm run bots -- --url http://localhost:3000 --count 25 --bias 0.6
 *   --bias : botların "çoğunluk" seçeneğine yönelme oranı (0..1). 1 → hepsi aynı seçeneği seçer.
 */
const { io } = require('socket.io-client');
const { C, S } = require('../public/shared/events');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; };
const url = arg('url', 'http://localhost:3000');
const count = Number(arg('count', 20));
const bias = Number(arg('bias', 0.55));
const names = ['Ayşe', 'Mehmet', 'Elif', 'Can', 'Zeynep', 'Burak', 'Deniz', 'Selin', 'Emre', 'Ceren', 'Kaan', 'Derya', 'Mert', 'İpek', 'Onur', 'Gizem', 'Barış', 'Naz', 'Tolga', 'Melis'];

let favourite = 0;
const bots = [];
for (let i = 0; i < count; i++) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  const name = `${names[i % names.length]}${i >= names.length ? ' ' + Math.floor(i / names.length + 1) : ''}`;
  const bot = { s, name, last: -1 };
  s.on('connect', () => s.emit(C.PLAYER_JOIN, { name, pid: bot.pid, token: bot.token }));
  s.on(S.JOINED, (d) => { bot.pid = d.pid; bot.token = d.token; });
  s.on(S.STATE_PLAYER, (st) => {
    if (st.seq === bot.last) return;
    bot.last = st.seq;
    if (['voting', 'tie_vote', 'tie_question'].includes(st.phase) && st.vote && st.vote.open) {
      if (st.phase === 'voting' && bot.id === 0) favourite = Math.floor(Math.random() * 4);
      const allowed = st.vote.allowed;
      const delay = 400 + Math.random() * Math.min(9000, (st.remaining || 8000) * 0.6);
      setTimeout(() => {
        const pick = Math.random() < bias && allowed.includes(favourite) ? favourite : allowed[Math.floor(Math.random() * allowed.length)];
        s.emit(C.PLAYER_VOTE, { option: pick });
      }, delay);
    }
  });
  bot.id = i;
  bots.push(bot);
}
console.log(`${count} bot ${url} adresine bağlanıyor. Çıkmak için Ctrl+C.`);
