'use strict';
const crypto = require('crypto');

const MAX_PLAYERS = 800;

function cleanName(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

/** Katılımcı kayıt defteri. Kimlik: pid + gizli token (localStorage'da saklanır). */
class PlayerRegistry {
  constructor() {
    this.players = new Map(); // pid -> {id, token, name, socketId, connected, joinedAt}
    this.bySocket = new Map(); // socketId -> pid
  }

  join({ name, pid, token }, socketId) {
    // Yeniden bağlanma
    if (pid && this.players.has(pid)) {
      const p = this.players.get(pid);
      if (token && p.token === token) {
        if (p.socketId) this.bySocket.delete(p.socketId);
        p.socketId = socketId;
        p.connected = true;
        this.bySocket.set(socketId, p.id);
        return { ok: true, player: p, resumed: true };
      }
    }
    const clean = cleanName(name);
    if (clean.length < 2) return { ok: false, error: 'Lütfen en az 2 karakterlik bir isim girin.' };
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'Oyun dolu. Daha fazla katılımcı alınamıyor.' };

    let finalName = clean;
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    for (let n = 2; taken.has(finalName.toLowerCase()); n++) finalName = `${clean.slice(0, 17)} ${n}`;

    const p = {
      id: crypto.randomBytes(8).toString('hex'),
      token: crypto.randomBytes(16).toString('hex'),
      name: finalName,
      socketId,
      connected: true,
      joinedAt: Date.now(),
    };
    this.players.set(p.id, p);
    this.bySocket.set(socketId, p.id);
    return { ok: true, player: p, resumed: false };
  }

  disconnect(socketId) {
    const pid = this.bySocket.get(socketId);
    if (!pid) return null;
    this.bySocket.delete(socketId);
    const p = this.players.get(pid);
    if (p && p.socketId === socketId) {
      p.connected = false;
      p.socketId = null;
    }
    return p || null;
  }

  byId(pid) { return this.players.get(pid) || null; }
  ofSocket(socketId) { const pid = this.bySocket.get(socketId); return pid ? this.players.get(pid) : null; }
  all() { return [...this.players.values()]; }
  total() { return this.players.size; }
  connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }
  recentNames(n = 12) {
    return this.all().sort((a, b) => b.joinedAt - a.joinedAt).slice(0, n).map((p) => p.name);
  }
}

module.exports = { PlayerRegistry, cleanName };
