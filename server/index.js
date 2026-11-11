'use strict';
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const { PlayerRegistry } = require('./players');
const { Game } = require('./game');
const { attachSockets } = require('./sockets');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  // 192.168.x.x ve 10.x.x.x adreslerini öne al
  return out.sort((a, b) => Number(/^(192\.168|10\.)/.test(b)) - Number(/^(192\.168|10\.)/.test(a)));
}

function createApp(opts = {}) {
  const publicUrl = (opts.publicUrl ?? process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
  const adminKey = opts.adminKey ?? process.env.ADMIN_KEY ?? '';
  const timeScale = Number(opts.timeScale ?? process.env.TIME_SCALE ?? 1) || 1;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false }, pingInterval: 10000, pingTimeout: 12000, maxHttpBufferSize: 2e4 });

  const registry = new PlayerRegistry();
  const game = new Game({ registry, timeScale });

  const qrCache = new Map();
  const baseUrlFor = (req) => {
    if (publicUrl) return publicUrl;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const port = server.address() ? server.address().port : 3000;
    let hostHeader = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
    const hostname = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      const ip = lanAddresses()[0];
      if (ip) hostHeader = `${ip}:${port}`;
    }
    return `${proto}://${hostHeader}`;
  };

  const securityHeaders = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  };
  app.use(securityHeaders);

  const page = (file) => (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, file));
  };
  app.get('/', page('host/index.html'));
  app.get('/join', page('player/join.html'));
  app.get('/play', page('player/play.html'));
  app.use('/s', express.static(PUBLIC_DIR, { maxAge: 0, etag: true }));

  app.get('/health', (req, res) => res.json({ ok: true, phase: game.phase, players: registry.total() }));

  const info = async (req) => {
    const joinUrl = `${baseUrlFor(req)}/join`;
    if (!qrCache.has(joinUrl)) {
      qrCache.set(joinUrl, await QRCode.toDataURL(joinUrl, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#0b0c0f', light: '#ffffff' } }));
    }
    return { joinUrl, qr: qrCache.get(joinUrl) };
  };
  app.get('/api/info', async (req, res) => {
    try { res.json(await info(req)); } catch (e) { res.status(500).json({ error: 'QR kod oluşturulamadı.' }); }
  });

  app.use((req, res) => res.status(404).type('text').send('Sayfa bulunamadı.'));

  attachSockets(io, game, registry, { adminKey });

  const listen = (port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0') =>
    new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));

  const close = () => new Promise((resolve) => {
    game.reset();
    game._clearTimer();
    io.close(() => resolve());
  });

  return { app, server, io, game, registry, listen, close, lanAddresses };
}

module.exports = { createApp, lanAddresses };

if (require.main === module) {
  const a = createApp();
  a.listen().then((port) => {
    const ips = lanAddresses();
    const base = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : `http://${ips[0] || 'localhost'}:${port}`;
    console.log('\n  SON COMMIT — İşten Atılmadan Önce');
    console.log('  ---------------------------------');
    console.log(`  Sunum ekranı (yönetici) : http://localhost:${port}/${process.env.ADMIN_KEY ? '?key=ANAHTAR' : ''}`);
    console.log(`  Katılım adresi (telefon): ${base}/join`);
    if (ips.length > 1) console.log(`  Diğer ağ adresleri      : ${ips.slice(1).map((i) => `http://${i}:${port}/join`).join('  ')}`);
    console.log('  Not: Telefonlar ve sunum bilgisayarı aynı Wi-Fi ağında olmalıdır.\n');
  });
}
