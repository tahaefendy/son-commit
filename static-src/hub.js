// Socket.IO "sunucu" arayüzünü taklit eden küçük merkez. Oyun motoru (server/sockets.js) olduğu gibi çalışır.
let nextId = 1;

class ServerSocket {
  constructor(hub, send, address) {
    this.hub = hub;
    this.id = `s${nextId++}`;
    this.send = send;
    this.handlers = new Map();
    this.rooms = new Set();
    this.data = {};
    this.handshake = { headers: {}, address };
  }
  on(ev, fn) { if (!this.handlers.has(ev)) this.handlers.set(ev, []); this.handlers.get(ev).push(fn); return this; }
  emit(ev, data) { this.send(ev, data); }
  join(room) { this.rooms.add(room); }
  _receive(ev, data, ack) { for (const fn of this.handlers.get(ev) || []) { try { fn(data, ack); } catch (e) { console.error(e); } } }
  _close() { this._receive('disconnect'); this.hub.sockets.delete(this.id); }
}

export class Hub {
  constructor() { this.sockets = new Map(); this.connHandlers = []; }
  on(ev, fn) { if (ev === 'connection') this.connHandlers.push(fn); }
  to(target) {
    return {
      emit: (ev, data) => {
        for (const s of this.sockets.values()) if (s.id === target || s.rooms.has(target)) s.emit(ev, data);
      },
    };
  }
  add(send, address) {
    const s = new ServerSocket(this, send, address);
    this.sockets.set(s.id, s);
    for (const fn of this.connHandlers) fn(s);
    return s;
  }
}

/** Aynı sayfadaki yönetici arayüzü için bellek içi "socket" (istemci tarafı). */
export class LocalClient {
  constructor() { this.handlers = new Map(); this.server = null; this.queue = []; this.connected = false; this.id = 'local'; }
  on(ev, fn) { if (!this.handlers.has(ev)) this.handlers.set(ev, []); this.handlers.get(ev).push(fn); return this; }
  off(ev, fn) { const a = this.handlers.get(ev) || []; const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); return this; }
  once(ev, fn) { const w = (d) => { this.off(ev, w); fn(d); }; return this.on(ev, w); }
  _fire(ev, d) { for (const fn of [...(this.handlers.get(ev) || [])]) { try { fn(d); } catch (e) { console.error(e); } } }
  emit(ev, data, ack) {
    const d = data === undefined ? data : JSON.parse(JSON.stringify(data));
    if (this.server) queueMicrotask(() => this.server._receive(ev, this.inject ? this.inject(ev, d) : d, ack));
    else this.queue.push([ev, d, ack]);
  }
  attach(hub, inject) {
    this.inject = inject;
    this.server = hub.add((ev, d) => { const c = d === undefined ? d : JSON.parse(JSON.stringify(d)); queueMicrotask(() => this._fire(ev, c)); }, 'local');
    this.connected = true;
    this._fire('connect');
    for (const [ev, d, ack] of this.queue.splice(0)) this.emit(ev, d, ack);
  }
}
