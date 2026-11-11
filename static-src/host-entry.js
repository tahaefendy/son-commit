// Statik (GitHub Pages) yönetici sayfası: oyun motoru bu sayfada çalışır, telefonlar WebRTC ile bağlanır.
import Peer from 'peerjs';
import QRCode from 'qrcode';
import { PlayerRegistry } from '../server/players';
import { Game } from '../server/game';
import { attachSockets } from '../server/sockets';
import { setManifest } from './shims/voice.js';
import { Hub, LocalClient } from './hub.js';

const local = new LocalClient();
const secret = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

let room;
try { room = localStorage.getItem('sc_host_room'); } catch (e) { room = null; }
if (!room) {
  room = 'sc-' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');
  try { localStorage.setItem('sc_host_room', room); } catch (e) { /* yoksay */ }
}
const joinUrl = new URL(`join.html?r=${encodeURIComponent(room)}`, location.href).href;
let qrPromise = null;

window.io = () => local;
window.__scStatic = {
  room,
  info: () => {
    if (!qrPromise) qrPromise = QRCode.toDataURL(joinUrl, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#0b0c0f', light: '#ffffff' } }).then((qr) => ({ joinUrl, qr }));
    return qrPromise;
  },
};

async function boot() {
  try { setManifest(await (await fetch('s/audio/voice/manifest.json')).json()); } catch (e) { console.warn('Seslendirme kataloğu yüklenemedi', e); }
  const hub = new Hub();
  const registry = new PlayerRegistry();
  const game = new Game({ registry, timeScale: 1 });
  attachSockets(hub, game, registry, { adminKey: secret });
  local.attach(hub, (ev, d) => (ev === 'host:hello' ? { key: secret } : d));

  // Telefonlar: PeerJS (WebRTC) bağlantıları
  const status = { peer: 'bağlanıyor' };
  window.__scStatic.status = status;
  const open = () => {
    const peer = new Peer(room, { debug: 0 });
    peer.on('open', () => { status.peer = 'hazır'; });
    peer.on('connection', (conn) => {
      let sock = null;
      conn.on('open', () => {
        sock = hub.add((ev, d) => { try { conn.send({ ev, d }); } catch (e) { /* bağlantı kopmuş */ } }, conn.peer);
      });
      conn.on('data', (m) => { if (sock && m && typeof m.ev === 'string') sock._receive(m.ev, m.d); });
      const gone = () => { if (sock) { const s = sock; sock = null; s._close(); } };
      conn.on('close', gone); conn.on('error', gone);
    });
    peer.on('disconnected', () => { status.peer = 'yeniden bağlanıyor'; try { peer.reconnect(); } catch (e) { /* yoksay */ } });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') { // önceki oturum henüz kapanmadı; tekrar dene
        status.peer = 'oda kullanımda, yeniden deneniyor'; peer.destroy(); setTimeout(open, 3000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        status.peer = 'ağ hatası, yeniden deneniyor'; peer.destroy(); setTimeout(open, 4000);
      }
    });
  };
  open();
  window.addEventListener('beforeunload', (e) => { if (game.phase !== 'title' && game.phase !== 'results') { e.preventDefault(); e.returnValue = ''; } });
}
boot();
