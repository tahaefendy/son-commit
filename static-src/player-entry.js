// Statik (GitHub Pages) telefon sayfaları: oda numarasıyla yöneticiye WebRTC üzerinden bağlanır.
import Peer from 'peerjs';

function roomId() {
  const q = new URLSearchParams(location.search).get('r');
  try {
    if (q) { localStorage.setItem('sc_room', q); return q; }
    return localStorage.getItem('sc_room');
  } catch (e) { return q; }
}

class PeerSocket {
  constructor(room) {
    this.room = room; this.handlers = new Map(); this.connected = false; this.id = null; this.dead = false;
    queueMicrotask(() => this._peer());
  }
  on(ev, fn) { if (!this.handlers.has(ev)) this.handlers.set(ev, []); this.handlers.get(ev).push(fn); return this; }
  off(ev, fn) { const a = this.handlers.get(ev) || []; const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); return this; }
  once(ev, fn) { const w = (d) => { this.off(ev, w); fn(d); }; return this.on(ev, w); }
  _fire(ev, d) { for (const fn of [...(this.handlers.get(ev) || [])]) { try { fn(d); } catch (e) { console.error(e); } } }
  emit(ev, data) { if (this.conn && this.connected) { try { this.conn.send({ ev, d: data }); } catch (e) { /* yoksay */ } } }
  close() { this.dead = true; try { this.peer && this.peer.destroy(); } catch (e) { /* yoksay */ } }
  _retry(ms = 2000) { if (!this.dead) setTimeout(() => this._connect(), ms); }
  _peer() {
    if (!this.room) { this._fire('connect_error', new Error('oda yok')); return; }
    this.peer = new Peer(undefined, { debug: 0 });
    this.peer.on('open', () => this._connect());
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* yoksay */ } });
    this.peer.on('error', (err) => {
      this._fire('connect_error', err);
      if (err.type === 'peer-unavailable') this._retry(2500);
      else if (['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id'].includes(err.type)) { try { this.peer.destroy(); } catch (e) { /* yoksay */ } if (!this.dead) setTimeout(() => this._peer(), 3000); }
    });
  }
  _connect() {
    if (this.dead || this.connected || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (e) { /* yoksay */ } }
    const c = this.peer.connect(this.room, { reliable: true });
    this.conn = c;
    let opened = false;
    c.on('open', () => { opened = true; this.connected = true; this._fire('connect'); });
    c.on('data', (m) => { if (m && typeof m.ev === 'string') this._fire(m.ev, m.d); });
    const closed = () => { if (this.conn !== c) return; this.conn = null; const was = this.connected; this.connected = false; if (was) this._fire('disconnect'); this._retry(2000); };
    c.on('close', closed); c.on('error', closed);
    setTimeout(() => { if (!opened && this.conn === c && !this.dead) { try { c.close(); } catch (e) { /* yoksay */ } closed(); } }, 8000);
  }
}

window.SC_JOIN = 'join.html';
window.SC_PLAY = 'play.html';
window.io = () => new PeerSocket(roomId());
