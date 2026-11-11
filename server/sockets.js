'use strict';
const { C, S } = require('../public/shared/events');

/** Basit jeton kovası sınırlayıcı. */
function makeLimiter(ratePerSec, burst) {
  let tokens = burst;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * ratePerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function safeEqual(a, b) {
  const x = String(a); const y = String(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

const isLoopback = (addr) => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1|local)$/.test(String(addr || ''));

function attachSockets(io, game, registry, { adminKey = '', getInfo, trustProxy = false } = {}) {
  const joinHits = new Map(); // ip -> [timestamps]

  const joinAllowed = (ip) => {
    const now = Date.now();
    const arr = (joinHits.get(ip) || []).filter((t) => now - t < 60000);
    arr.push(now);
    joinHits.set(ip, arr);
    return arr.length <= 400;
  };

  const broadcastAll = () => {
    io.to('host').emit(S.STATE_HOST, game.hostView());
    for (const p of registry.all()) {
      if (p.socketId) io.to(p.socketId).emit(S.STATE_PLAYER, game.playerView(p.id));
    }
  };
  game.onChange = broadcastAll;

  let votesTimer = null;
  let votesDirty = false;
  game.onVotes = () => {
    votesDirty = true;
    if (votesTimer) return;
    votesTimer = setTimeout(() => {
      votesTimer = null;
      if (votesDirty) { votesDirty = false; io.to('host').emit(S.VOTES, game.votingInfo()); }
    }, 90);
  };

  const emitPresence = () => io.to('host').emit(S.PRESENCE, game.presence());

  io.on('connection', (socket) => {
    const xff = socket.handshake.headers && socket.handshake.headers['x-forwarded-for'];
    const ip = (trustProxy && xff ? xff.split(',').pop().trim() : '') || socket.handshake.address;
    const voteLimit = makeLimiter(6, 8);

    /* ---------------- Yönetici ---------------- */
    socket.on(C.HOST_HELLO, (payload, ack) => {
      const key = payload && typeof payload.key === 'string' ? payload.key : '';
      // Anahtar yoksa yalnızca doğrudan (vekilsiz) localhost bağlantısı yönetebilir
      const h = socket.handshake.headers || {};
      const proxied = trustProxy || h['x-forwarded-for'] || h['x-real-ip'] || h.forwarded;
      // Başka bir web sayfasından (CSWSH) gelen bağlantıyı engelle: Origin, sunucunun kendi adresiyle aynı olmalı
      let sameOrigin = true;
      if (h.origin) { try { sameOrigin = new URL(h.origin).host === h.host; } catch (e) { sameOrigin = false; } }
      // DNS yeniden bağlama (rebinding) koruması: Host başlığı da yalnızca localhost adlarından biri olmalı
      const hostOk = !h.host || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h.host);
      const allowed = adminKey ? safeEqual(key, adminKey) : (!proxied && sameOrigin && hostOk && isLoopback(socket.handshake.address));
      if (!allowed) {
        socket.emit(S.HOST_DENIED, { message: adminKey
          ? 'Yönetici anahtarı gerekli veya hatalı. Adresin sonuna ?key=ANAHTAR ekleyin.'
          : 'Yönetim yalnızca sunucunun çalıştığı bilgisayardan açılabilir. Başka cihazdan yönetmek için ADMIN_KEY ayarlayın ve adresin sonuna ?key=ANAHTAR ekleyin.' });
        return;
      }
      socket.data.isHost = true;
      socket.join('host');
      const info = getInfo ? getInfo(socket.handshake) : {};
      socket.emit(S.HOST_READY, { meta: game.meta(), state: game.hostView(), info });
      if (typeof ack === 'function') ack({ ok: true });
    });

    const hostActions = {
      [C.HOST_START]: () => game.start(),
      [C.HOST_PAUSE]: () => game.pause(),
      [C.HOST_RESUME]: () => game.resume(),
      [C.HOST_RESET]: () => game.reset(),
      [C.HOST_NEXT]: () => game.next(),
      [C.HOST_NEXT_QUESTION]: () => game.nextQuestion(),
      [C.HOST_RESTART_QUESTION]: () => game.restartQuestion(),
      [C.HOST_LOCK]: () => game.lockVotes(),
      [C.HOST_SHOW_RESULTS]: () => game.showResults(),
    };
    for (const [ev, fn] of Object.entries(hostActions)) {
      socket.on(ev, () => {
        if (!socket.data.isHost) { socket.emit(S.NOTICE, { message: 'Bu işlem için yönetici yetkisi gerekli.' }); return; }
        try { fn(); } catch (err) {
          console.error('[host eylemi hatası]', ev, err);
          socket.emit(S.NOTICE, { message: 'İşlem sırasında bir hata oluştu.' });
        }
      });
    }

    /* ---------------- Katılımcı ---------------- */
    socket.on(C.PLAYER_JOIN, (payload) => {
      if (!joinAllowed(ip)) { socket.emit(S.JOIN_ERROR, { message: 'Çok fazla deneme yapıldı. Lütfen biraz bekleyin.' }); return; }
      const p = payload && typeof payload === 'object' ? payload : {};
      const r = registry.join({
        name: typeof p.name === 'string' ? p.name : '',
        pid: typeof p.pid === 'string' ? p.pid : '',
        token: typeof p.token === 'string' ? p.token : '',
      }, socket.id);
      if (!r.ok) { socket.emit(S.JOIN_ERROR, { message: r.error }); return; }
      socket.emit(S.JOINED, { pid: r.player.id, token: r.player.token, name: r.player.name, resumed: r.resumed });
      socket.emit(S.STATE_PLAYER, game.playerView(r.player.id));
      emitPresence();
    });

    socket.on(C.PLAYER_VOTE, (payload) => {
      const p = registry.ofSocket(socket.id);
      if (!p) { socket.emit(S.VOTE_REJECTED, { message: 'Önce oyuna katılmalısınız.' }); return; }
      if (!voteLimit()) { socket.emit(S.VOTE_REJECTED, { message: 'Çok hızlı işlem yapıyorsunuz.' }); return; }
      const option = payload && typeof payload === 'object' ? payload.option : undefined;
      const r = game.castVote(p.id, option);
      if (r.ok) socket.emit(S.VOTE_ACK, { option });
      else socket.emit(S.VOTE_REJECTED, { message: r.reason });
    });

    socket.on('disconnect', () => {
      if (registry.disconnect(socket.id)) { emitPresence(); game.checkEarlyLock(); }
    });
  });
}

module.exports = { attachSockets };
