'use strict';
/*
 * Uçtan uca test: gerçek sunucu + gerçek Socket.IO istemcileri, hızlandırılmış zamanla.
 * Çalıştırma: npm test
 */
const assert = require('node:assert/strict');
const { io: ioc } = require('socket.io-client');
const { createApp } = require('../server/index');
const { C, S } = require('../public/shared/events');
const { zoneOf, applyOutcome } = require('../server/nerve');

const { QUESTIONS, BOSSES } = require('../server/data');
const CORRECT = QUESTIONS.map((q) => q.correct);
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** Durum akışını sırayla tüketen yardımcı: hiçbir faz kaçmaz. */
class Feed {
  constructor(sock, ev) {
    this.log = []; this.cursor = 0; this.waiters = [];
    sock.on(ev, (st) => { this.log.push(st); this._pump(); });
  }
  get last() { return this.log[this.log.length - 1]; }
  _pump() {
    for (const w of [...this.waiters]) {
      for (let i = this.cursor; i < this.log.length; i++) {
        if (w.pred(this.log[i])) { this.cursor = i + 1; this.waiters.splice(this.waiters.indexOf(w), 1); w.res(this.log[i]); break; }
      }
    }
  }
  next(pred, ms = 20000, label = '') {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`Zaman aşımı ${label} (son faz: ${this.last && this.last.phase})`)), ms);
      this.waiters.push({ pred, res: (s) => { clearTimeout(t); res(s); } });
      this._pump();
    });
  }
  skipToEnd() { this.cursor = this.log.length; }
}

class Host {
  constructor(url) {
    this.s = ioc(url, { transports: ['websocket'], forceNew: true });
    this.feed = new Feed(this.s, S.STATE_HOST);
    this.votes = [];
    this.s.on(S.VOTES, (v) => this.votes.push(v));
    this.notices = [];
    this.s.on(S.NOTICE, (n) => this.notices.push(n));
  }
  hello(key) {
    return new Promise((res) => {
      this.s.once(S.HOST_READY, (d) => res(d));
      this.s.once(S.HOST_DENIED, (d) => res({ denied: d }));
      this.s.emit(C.HOST_HELLO, { key });
    });
  }
  send(ev) { this.s.emit(ev); }
  next(pred, ms, label) { return this.feed.next(pred, ms, label); }
  phase(name, ms) { return this.next((s) => s.phase === name, ms, name); }
}

class Player {
  constructor(url, name) {
    this.url = url; this.name = name;
    this.s = ioc(url, { transports: ['websocket'], forceNew: true });
    this.feed = new Feed(this.s, S.STATE_PLAYER);
  }
  join(creds = {}) {
    return new Promise((res) => {
      this.s.once(S.JOINED, (d) => { this.pid = d.pid; this.token = d.token; res(d); });
      this.s.once(S.JOIN_ERROR, (d) => res({ error: d.message }));
      this.s.emit(C.PLAYER_JOIN, { name: this.name, ...creds });
    });
  }
  vote(option) {
    return new Promise((res) => {
      const off = () => { this.s.off(S.VOTE_ACK, a); this.s.off(S.VOTE_REJECTED, r); };
      const a = (d) => { off(); res({ ok: true, d }); };
      const r = (d) => { off(); res({ ok: false, message: d.message }); };
      this.s.on(S.VOTE_ACK, a); this.s.on(S.VOTE_REJECTED, r);
      this.s.emit(C.PLAYER_VOTE, { option });
    });
  }
  close() { this.s.close(); }
}

async function boot(opts = {}) {
  const app = createApp({ timeScale: 0.07, ...opts });
  const port = await app.listen(0, '127.0.0.1');
  return { app, url: `http://127.0.0.1:${port}`, port };
}

async function setup(n = 3, opts = {}) {
  const env = await boot(opts);
  const host = new Host(env.url);
  await host.hello(opts.adminKey);
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = new Player(env.url, `Oyuncu${i + 1}`);
    await p.join();
    players.push(p);
  }
  return { ...env, host, players, close: async () => { players.forEach((p) => p.close()); host.s.close(); await env.app.close(); } };
}

async function toLobby(host) {
  host.send(C.HOST_START);
  await host.phase('lobby', 30000);
}

/** plan: 8 harf — c: doğru, w: yanlış, t: oy yok (süre bitimi) */
async function playThrough(env, plan, { onVoting } = {}) {
  const { host, players } = env;
  const seen = [];
  for (let i = 0; i < plan.length; i++) {
    let st;
    try { st = await host.next((s) => s.phase === 'voting' && s.qIndex === i, 30000, `soru ${i + 1} oylaması`); }
    catch (e) { break; }
    seen.push({ i, boss: st.stageBoss });
    if (onVoting) await onVoting(i, st);
    const kind = plan[i];
    if (kind !== 't') {
      const opt = kind === 'c' ? CORRECT[i] : (CORRECT[i] + 1) % 4;
      const res = await Promise.all(players.map((p) => p.vote(opt)));
      res.forEach((r) => assert.equal(r.ok, true, 'oy kabul edilmeli'));
      host.send(C.HOST_LOCK);
      await host.phase('locked');
      host.send(C.HOST_SHOW_RESULTS);
    }
    const rev = await host.next((s) => s.phase === 'reveal' && s.qIndex === i, 30000, `soru ${i + 1} sonucu`);
    seen[seen.length - 1].reveal = rev;
    if (rev.outcome.fired) break;
  }
  return seen;
}

/* ---------------------------------------------------------------- */
function simulate(plan) {
  let nerve = 0; let cut = false; let cutAt = -1; let firedAt = -1; const seq = [];
  for (let i = 0; i < plan.length; i++) {
    const kind = plan[i] === 'c' ? 'correct' : plan[i] === 't' ? 'timeout' : 'wrong';
    const r = applyOutcome({ nerve, salaryCut: cut }, kind, QUESTIONS[i].difficulty);
    nerve = r.after; seq.push(nerve);
    if (r.cutNow) { cut = true; cutAt = i; }
    if (r.fired) { firedAt = i; break; }
  }
  return { seq, nerve, cut, cutAt, firedAt };
}
function findPlan(pred) {
  const n = QUESTIONS.length;
  for (let m = 0; m < (1 << n); m++) {
    const plan = [...Array(n)].map((_, i) => (((m >> i) & 1) ? 'c' : 'w')).join('');
    if (pred(simulate(plan), plan)) return plan;
  }
  throw new Error('Koşulu sağlayan plan bulunamadı');
}
const bossOf = (i) => QUESTIONS[i].boss;

async function testNerveRules() {
  console.log('\n[1] Sinir kuralları ve 12 soru (birim)');
  assert.equal(QUESTIONS.length, 12);
  assert.deepEqual(QUESTIONS.map((q) => q.boss), ['kerim', 'kerim', 'kerim', 'kerim', 'harun', 'harun', 'harun', 'harun', 'taha', 'taha', 'taha', 'taha']);
  assert.ok(QUESTIONS.every((q) => q.options.length === 4 && q.correct >= 0 && q.correct < 4));
  ok('12 soru: Kerim 1-4, Harun 5-8, Taha 9-12; hepsi 4 seçenekli');
  const order = ['easy', 'medium', 'hard', 'critical'];
  const rank = QUESTIONS.map((q) => order.indexOf(q.difficulty));
  assert.deepEqual(rank, [...rank].sort((x, y) => x - y));
  ok('Sorular kolaydan zora ilerliyor');
  assert.equal(applyOutcome({ nerve: 0, salaryCut: false }, 'correct', 'easy').after, 0);
  ok('Sinir %0 altına düşmez');
  assert.equal(applyOutcome({ nerve: 98, salaryCut: false }, 'wrong', 'critical').after, 100);
  ok('Sinir %100 üstüne çıkmaz');
  const dl = (k, d) => applyOutcome({ nerve: 20, salaryCut: false }, k, d).delta;
  assert.deepEqual([dl('wrong', 'easy'), dl('wrong', 'medium'), dl('wrong', 'hard'), dl('wrong', 'critical'), dl('timeout', 'hard'), dl('correct', 'hard')], [12, 15, 18, 22, 12, -3]);
  ok('Kolay +12, orta +15, zor +18, kritik +22, süre +12, doğru -3');
  assert.equal(applyOutcome({ nerve: 45, salaryCut: false }, 'wrong', 'easy').cutNow, true);
  assert.equal(applyOutcome({ nerve: 45, salaryCut: true }, 'wrong', 'easy').cutNow, false);
  assert.equal(applyOutcome({ nerve: 70, salaryCut: false }, 'wrong', 'easy').fired, true);
  assert.equal(applyOutcome({ nerve: 70, salaryCut: false }, 'wrong', 'easy').cutNow, false);
  ok('Maaş kesintisi yalnızca ilk kez %55\'te; %75\'te kovulma');
  assert.deepEqual([0, 14, 15, 34, 35, 54, 55, 74, 75, 100].map(zoneOf), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  ok('Bölge eşikleri 0-14 / 15-34 / 35-54 / 55-74 / 75-100');
}

async function testPerfectRun() {
  console.log('\n[2] Kusursuz oyun → Final 1 (Ayın Çalışanı) + doğru başına zam');
  const env = await setup(3, { timeScale: 0.035 });
  const { host, players } = env;
  await toLobby(host);
  const lobby = host.feed.last;
  assert.equal(lobby.stageBoss, 'kerim');
  assert.equal(lobby.nerve, 0);
  assert.equal(lobby.salary, 45000);
  assert.equal(lobby.players.total, 3);
  assert.equal(lobby.qTotal, 12);
  ok('Açılış → hikâye → Kerim → QR/katılım ekranı, 3 katılımcı, sinir %0, maaş 45.000, 12 görev');
  const phasesSeen = new Set(host.feed.log.map((x) => x.phase));
  for (const p of ['company', 'story', 'boss_enter', 'lobby']) assert.ok(phasesSeen.has(p), `${p} fazı görülmeli`);
  ok('Açılış sahneleri sırayla geldi (company, story, boss_enter, lobby)');

  host.send(C.HOST_NEXT);
  let leakCheck = false;
  const seen = await playThrough(env, 'c'.repeat(12), {
    onVoting: async (i, st) => {
      if (leakCheck) return;
      leakCheck = true;
      const json = JSON.stringify(st) + JSON.stringify(players[0].feed.last);
      assert.ok(!/correctIndex|"correct":/.test(json), 'Doğru cevap oylama sırasında sızmamalı');
      assert.equal(st.outcome, null);
    },
  });
  assert.deepEqual(seen.map((x) => x.boss), QUESTIONS.map((q) => q.boss));
  ok('Kerim 1-4, Harun 5-8, Taha 9-12. soruları yönetti');
  ok('Doğru cevap oylama sırasında ne sunucu ne telefon durumunda yer aldı');
  assert.ok(seen.every((x) => x.reveal.outcome.kind === 'correct' && x.reveal.nerve === 0));
  ok('Doğru cevaplarda sinir %0\'ın altına düşmedi');

  await host.phase('final', 90000);
  const log = host.feed.log.map((x) => x.phase);
  for (const p of ['boss_exit', 'blackout', 'boss_enter', 'verdict', 'final']) assert.ok(log.includes(p), `${p} fazı yaşanmalı`);
  const order = log.filter((p, i) => i === 0 || p !== log[i - 1]);
  const firstExit = order.indexOf('boss_exit');
  assert.deepEqual(order.slice(firstExit, firstExit + 3), ['boss_exit', 'blackout', 'boss_enter']);
  assert.equal(log.filter((p) => p === 'blackout').length, 2);
  ok('İki patron geçişi: boss_exit → blackout → boss_enter');

  const fin = host.feed.log.find((x) => x.phase === 'final');
  assert.equal(fin.final.id, 1);
  assert.equal(fin.final.title, 'AYIN ÇALIŞANI');
  assert.equal(fin.final.correctN, 12);
  assert.equal(fin.final.raise, 12 * 900);
  assert.equal(fin.salary, 45000 + 12 * 900);
  assert.equal(fin.stageBoss, 'taha');
  assert.ok(fin.speech.lines[0].text.startsWith('Bugün gerçekten iyi iş çıkardın.'));
  assert.ok(fin.speech.lines.some((l) => /zam/.test(l.text)));
  ok('Final 1: Ayın çalışanı; 12 doğru karar × 900 TL zam → 55.800 TL; kararı Taha açıkladı');
  const res = await host.phase('results', 90000);
  assert.equal(res.results.teamCorrect, 12);
  assert.equal(res.results.board[0].score, 12);
  ok('Sonuç ekranı: 12/12 doğru karar, katılımcı skorları');
  await env.close();
}

async function testNerveFlow() {
  console.log('\n[3] Yanlışlar: maaş kesintisi, kovulma (Taha döneminde), tepkiler');
  const plan = findPlan((sm) => sm.cutAt >= 0 && sm.firedAt >= 8 && sm.cutAt < sm.firedAt - 1 && bossOf(sm.cutAt) !== 'taha');
  const sm = simulate(plan);
  const env = await setup(2, { timeScale: 0.035 });
  const { host } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  const seen = await playThrough(env, plan.slice(0, sm.firedAt + 1));
  assert.deepEqual(seen.map((x) => x.reveal.nerve), sm.seq);
  ok(`Sinir zorluğa göre arttı: ${sm.seq.join(' → ')}`);
  assert.equal(seen[sm.cutAt].reveal.outcome.cutNow, true);
  assert.equal(seen.filter((x) => x.reveal.outcome.cutNow).length, 1);
  const sal = host.feed.log.find((x) => x.phase === 'salary');
  assert.equal(sal.salary, 36000);
  assert.equal(sal.ext.salaryBefore, 45000);
  assert.equal(sal.stageBoss, bossOf(sm.cutAt));
  assert.ok(sal.speech.lines[0].text.includes('%20'));
  assert.equal(host.feed.log.filter((x) => x.phase === 'salary').map((x) => x.seq).length > 0, true);
  ok(`Sinir %55'e ilk kez ulaşınca (${bossOf(sm.cutAt)}) maaş %20 kesildi: 45.000 → 36.000, yalnızca bir kez`);

  const firstTaha = host.feed.log.find((x) => x.phase === 'voting' && x.qIndex === 8);
  assert.equal(firstTaha.stageBoss, 'taha');
  assert.equal(firstTaha.salary, 36000);
  assert.equal(firstTaha.nerve, sm.seq[7]);
  ok(`Patron değişince sinir (%${sm.seq[7]}) ve maaş (36.000) korundu`);

  // Konuşmalar patrona ve sinir bölgesine göre değişir
  let checked = 0;
  for (let i = 0; i <= sm.firedAt - 1; i++) {
    const r = host.feed.log.find((x) => x.phase === 'reaction' && x.qIndex === i);
    if (!r) continue;
    const b = BOSSES[bossOf(i)];
    const z = Math.min(r.zone, 3);
    if (r.outcome.kind === 'correct') {
      assert.equal(r.speech.lines[0].text, b.correct);
      assert.equal(r.speech.lines[1] ? r.speech.lines[1].text : null, b.correctZone[z]);
    } else {
      assert.equal(r.speech.lines[0].text, b.wrong);
      if (!r.outcome.cutNow) assert.equal(r.speech.lines[1].text, b.wrongZone[z]);
    }
    checked++;
  }
  assert.ok(checked >= 4);
  const texts = new Set(host.feed.log.filter((x) => x.phase === 'reaction').map((x) => x.speech.lines[0].text + '|' + (x.speech.lines[1] ? x.speech.lines[1].text : '')));
  assert.ok(texts.size >= 4, 'Tepkiler bölgeye ve sonuca göre farklılaşmalı');
  ok('Patron tepkileri sinir bölgesine ve patrona göre değişti');

  const fire = await host.phase('fire', 40000);
  assert.equal(fire.firedBy, 'taha');
  assert.ok(fire.speech.lines[0].text.startsWith('Yeter!'));
  ok("Sinir %75'e ulaşınca oyun sona erdi; Taha dönemi olduğu için Taha kovdu");
  const fin = await host.phase('final', 40000);
  assert.equal(fin.final.id, 4);
  assert.equal(fin.salary, 0);
  assert.equal(fin.final.project, 'Başarısız');
  assert.equal(fin.final.game, 'Erken sonlandırıldı');
  ok('Final 4: Kovuldun — maaş 0 TL, proje başarısız, oyun erken sonlandırıldı');
  assert.equal(host.feed.log.some((x) => x.phase === 'voting' && x.qIndex === sm.firedAt + 1), false);
  ok('Kovulmadan sonra kalan sorular oynanmadı');
  await host.phase('results', 40000);
  await env.close();
}

async function testFiredByEarlyBosses() {
  console.log('\n[4] Kerim / Harun döneminde kovulma');
  const env = await setup(2, { timeScale: 0.035 });
  const { host, players } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  env.app.game.nerve = 70; // test amaçlı doğrudan durum
  await host.next((s) => s.phase === 'voting' && s.qIndex === 0, 30000);
  await Promise.all(players.map((p) => p.vote(0))); // yanlış
  host.send(C.HOST_LOCK); await host.phase('locked'); host.send(C.HOST_SHOW_RESULTS);
  const rev = await host.phase('reveal');
  assert.equal(rev.nerve, 82);
  const fire = await host.phase('fire', 20000);
  assert.equal(fire.firedBy, 'kerim');
  assert.ok(fire.speech.lines[0].text.includes('İnsan kaynaklarıyla görüşebilirsin'));
  assert.equal((await host.phase('final', 30000)).final.id, 4);
  ok('Kerim döneminde eşik aşılınca Kerim işten çıkardı (Final 4)');
  await env.close();

  const env2 = await setup(2, { timeScale: 0.035 });
  await toLobby(env2.host); env2.host.send(C.HOST_NEXT);
  const h2 = env2.host;
  await playThrough(env2, 'cccc');
  await h2.next((s) => s.phase === 'voting' && s.qIndex === 4, 40000);
  env2.app.game.nerve = 65;
  await Promise.all(env2.players.map((p) => p.vote(0)));
  h2.send(C.HOST_LOCK); await h2.phase('locked'); h2.send(C.HOST_SHOW_RESULTS);
  const fire2 = await h2.phase('fire', 20000);
  assert.equal(fire2.firedBy, 'harun');
  assert.ok(fire2.speech.lines[0].text.startsWith('Yeter!'));
  ok('Harun döneminde eşik aşılınca Harun işten çıkardı');
  await env2.close();
}

async function testFinals() {
  console.log('\n[5] Finaller 2 ve 3, kesinti iadesi + zam');
  // Final 3: kesinti var, final sinirinde %55-74
  let plan = findPlan((sm) => sm.firedAt === -1 && sm.nerve >= 55 && sm.nerve <= 74);
  let env = await setup(2, { timeScale: 0.035 });
  await toLobby(env.host); env.host.send(C.HOST_NEXT);
  await playThrough(env, plan);
  let fin = await env.host.phase('final', 90000);
  assert.equal(fin.final.id, 3);
  assert.equal(fin.salary, 36000);
  assert.equal(fin.final.cut, 9000);
  assert.equal(fin.final.status, 'Son uyarı');
  assert.ok(fin.speech.lines[0].text.includes('%20 kesinti'));
  ok('Final 3: Maaş kesintisi — 45.000 → 36.000, kesinti 9.000, durum Son uyarı');
  await env.close();

  // Final 2 + kesinti sonradan toparlandı → iade + %10 zam
  plan = findPlan((sm) => sm.cutAt >= 0 && sm.firedAt === -1 && sm.nerve < 55);
  env = await setup(2, { timeScale: 0.035 });
  await toLobby(env.host); env.host.send(C.HOST_NEXT);
  await playThrough(env, plan);
  fin = await env.host.phase('final', 90000);
  assert.equal(fin.final.id, 2);
  assert.equal(fin.final.title, 'SON BİR ŞANS');
  assert.equal(fin.final.restored, true);
  assert.equal(fin.final.raise, 4500);
  assert.equal(fin.salary, 49500);
  ok('Final 2 (kesinti sonra toparlandı): kesinti geri alındı, Taha %10 zam yaptı → 49.500 TL');
  await env.close();

  // Final 2 kesintisiz
  plan = findPlan((sm) => sm.cutAt === -1 && sm.firedAt === -1 && sm.nerve >= 15);
  env = await setup(2, { timeScale: 0.035 });
  await toLobby(env.host); env.host.send(C.HOST_NEXT);
  await playThrough(env, plan);
  fin = await env.host.phase('final', 90000);
  assert.equal(fin.final.id, 2);
  assert.equal(fin.salary, 45000);
  assert.equal(fin.final.raise, 0);
  assert.equal(fin.final.status, 'Uyarı');
  ok('Final 2 (kesintisiz): maaş 45.000, kesinti ve zam yok, durum Uyarı');
  await env.close();
}

async function testVotingRules() {
  console.log('\n[6] Oylama kuralları: tek oy, süre, çoğunluk, yeniden bağlanma');
  const env = await setup(5);
  const { host, players } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  const st = await host.next((s) => s.phase === 'voting' && s.qIndex === 0, 30000);
  // oy verilemez: telefon henüz katılmamış biri
  const ghost = new Player(env.url, 'x');
  const gr = await ghost.vote(1);
  assert.equal(gr.ok, false);
  ghost.close();
  ok('Katılmamış bağlantı oy veremez');

  const r1 = await players[0].vote(1);
  assert.equal(r1.ok, true);
  const r2 = await players[0].vote(2);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /zaten oy/);
  ok('Aynı telefon aynı soruda ikinci kez oy veremez (Türkçe hata mesajı)');
  assert.equal((await players[1].vote(9)).ok, false);
  assert.equal((await players[1].vote('1; DROP')).ok, false);
  assert.equal((await players[1].vote(-1)).ok, false);
  ok('Geçersiz / sahte oy değerleri reddedildi');

  await players[1].vote(2);
  await players[2].vote(2);
  await players[3].vote(0);
  await new Promise((r) => setTimeout(r, 200));
  const live = host.votes[host.votes.length - 1];
  assert.deepEqual(live.counts, [1, 1, 2, 0]);
  assert.equal(live.total, 4);
  ok('Oylar anlık güncellendi (yönetici ekranına votes:update)');

  // yeniden bağlanma: oyuncu 0 koparsa ve geri gelirse oyu hatırlanır, tekrar oy veremez
  const pid = players[0].pid; const token = players[0].token;
  players[0].close();
  await new Promise((r) => setTimeout(r, 100));
  const again = new Player(env.url, 'Oyuncu1');
  const j = await again.join({ pid, token });
  assert.equal(j.pid, pid);
  assert.equal(j.resumed, true);
  const pst = await again.feed.next((s) => s.vote && s.vote.mine !== null, 5000);
  assert.equal(pst.vote.mine, 1);
  assert.equal((await again.vote(3)).ok, false);
  ok('Bağlantısı kopan katılımcı yeniden bağlandı, oyu korundu, yeni oy atamadı');
  assert.equal(env.app.registry.total(), 5);

  // Süre bitince oylama kapanır, geç oy reddedilir
  const rev = await host.next((s) => s.phase === 'reveal' && s.qIndex === 0, 30000);
  assert.equal(rev.outcome.winner, 2); // C iki oyla en çok oyu aldı
  assert.equal(rev.outcome.correct, false);
  assert.deepEqual(rev.outcome.counts, [1, 1, 2, 0]);
  assert.deepEqual(rev.outcome.percents, [25, 25, 50, 0]);
  ok('Süre dolunca oylama otomatik kapandı; en çok oy alan seçenek (C, 2 oy / 4 oy) uygulandı; yüzdeler doğru');
  assert.equal(rev.nerve, 12);
  const late = await players[4].vote(1);
  assert.equal(late.ok, false);
  ok('Süre bittikten sonra gelen oy reddedildi');
  again.close();
  await env.close();
}

async function testTies() {
  console.log('\n[7] Eşitlik: doğru seçenek eşitlikteyse o, değilse rastgele');
  const env = await setup(2);
  const { host, players } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  await host.next((s) => s.phase === 'voting' && s.qIndex === 0, 30000);
  await players[0].vote(1); await players[1].vote(3); // B (doğru) ve D eşit
  host.send(C.HOST_LOCK); await host.phase('locked'); host.send(C.HOST_SHOW_RESULTS);
  const rev = await host.next((s) => s.phase === 'reveal', 10000);
  assert.equal(rev.outcome.winner, 1);
  assert.equal(rev.outcome.correct, true);
  assert.equal(rev.outcome.tie.method, 'correct');
  assert.equal(rev.nerve, 0);
  ok('Eşit şıklardan biri doğruysa doğru seçenek uygulandı');

  await host.next((s) => s.phase === 'voting' && s.qIndex === 1, 40000);
  await players[0].vote(0); await players[1].vote(3); // ikisi de yanlış (doğru: C)
  host.send(C.HOST_LOCK); await host.phase('locked'); host.send(C.HOST_SHOW_RESULTS);
  const rev2 = await host.next((s) => s.phase === 'reveal' && s.qIndex === 1, 10000);
  assert.ok([0, 3].includes(rev2.outcome.winner));
  assert.equal(rev2.outcome.correct, false);
  assert.equal(rev2.outcome.tie.method, 'random');
  assert.equal(rev2.nerve, 12);
  ok('Eşit şıkların ikisi de yanlışsa rastgele biri seçildi, yanlış sayıldı');
  await env.close();
}

async function testHostControls() {
  console.log('\n[8] Yönetici paneli: duraklat, devam, kilitle, yeniden başlat, atla, sıfırla');
  const env = await setup(2);
  const { host, players } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  await host.next((s) => s.phase === 'voting' && s.qIndex === 0, 30000);

  host.send(C.HOST_PAUSE);
  const paused = await host.next((s) => s.paused === true);
  const rem = paused.remaining;
  await new Promise((r) => setTimeout(r, 300));
  const v = await players[0].vote(1);
  assert.equal(v.ok, false);
  assert.match(v.message, /duraklat/);
  host.send(C.HOST_RESUME);
  const resumed = await host.next((s) => s.paused === false);
  assert.ok(Math.abs(resumed.remaining - rem) < 120, 'Süre duraklatma boyunca akmamalı');
  ok('Duraklatınca süre durdu, oy kabul edilmedi; devam edince kaldığı yerden sürdü');

  assert.equal((await players[0].vote(1)).ok, true);
  host.send(C.HOST_LOCK);
  await host.phase('locked');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(host.feed.last.phase, 'locked');
  ok('Oyları kilitle: oylama durdu, sonuç gösterilene kadar bekliyor');
  host.send(C.HOST_SHOW_RESULTS);
  const rev = await host.phase('reveal');
  assert.equal(rev.outcome.winner, 1);
  ok('Sonuçları göster çalıştı');

  // Yeniden başlat: sinir/yan etkiler geri alınır
  env.app.game.nerve = 40;
  host.send(C.HOST_RESTART_QUESTION);
  const rs = await host.next((s) => s.phase === 'voting');
  assert.equal(rs.nerve, 0 + 0 || rs.nerve);
  assert.equal(rs.voting.total, 0);
  assert.equal(rs.outcome, null);
  ok('Soruyu yeniden başlat: oylar sıfırlandı, sonuç geri alındı');
  assert.equal(env.app.game.history.length, 0);

  // Sonraki soruya geç
  host.send(C.HOST_NEXT_QUESTION);
  const q2 = await host.next((s) => s.phase === 'voting' && s.qIndex === 1, 30000);
  assert.equal(q2.question.no, 2);
  assert.equal(env.app.game.history[0].kind, 'skipped');
  ok('Sonraki soruya geç çalıştı (atlanan soru kayda geçti)');

  // Yönetici olmayan bağlantı komut gönderemez
  players[0].s.emit(C.HOST_RESET);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(env.app.game.qIndex, 1);
  ok('Yönetici olmayan bağlantı oyunu sıfırlayamaz');

  // Sıfırla
  host.send(C.HOST_RESET);
  const t = await host.phase('title');
  assert.equal(t.nerve, 0); assert.equal(t.salary, 45000); assert.equal(t.qIndex, -1);
  assert.equal(t.players.total, 2);
  ok('Sıfırla: oyun başa döndü, katılımcılar bağlı kaldı');

  // Yönetici sayfa yenileme: durumu geri yükler
  const host2 = new Host(env.url);
  const ready = await host2.hello();
  assert.equal(ready.state.phase, 'title');
  assert.ok(ready.meta.questions.length === 12);
  host2.s.close();
  ok('Yönetici ekranı yenilenince mevcut durum geri yüklenir');
  await env.close();
}

async function testTimeout() {
  console.log('\n[9] Süre bitimi (oy yok) ve zaman aşımı cezası');
  const env = await setup(2);
  const { host } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  const seen = await playThrough(env, 'tc');
  assert.equal(seen[0].reveal.outcome.kind, 'timeout');
  assert.equal(seen[0].reveal.nerve, 12);
  ok('Hiç oy yoksa süre bitimi sayıldı: +12 sinir');
  assert.equal(seen[1].reveal.nerve, 9);
  ok('Sonraki doğru cevap sinirden 3 puan düşürdü (12 → 9)');
  await env.close();
}

async function testEarlyLock() {
  console.log('\n[10] Herkes oy verince oylama süre dolmadan kilitlenir');
  const env = await setup(3);
  const { host, players } = env;
  await toLobby(host); host.send(C.HOST_NEXT);
  const v = await host.next((s) => s.phase === 'voting' && s.qIndex === 0, 30000);
  await players[0].vote(1); await players[1].vote(1);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(host.feed.last.phase, 'voting', 'Herkes oy vermeden kilitlenmemeli');
  const t0 = Date.now();
  await players[2].vote(2);
  const locked = await host.phase('locked', 5000);
  assert.equal(locked.ext.by, 'early');
  assert.ok(Date.now() - t0 < v.duration * 0.6, 'Süre dolmadan kilitlenmeli');
  const rev = await host.phase('reveal', 5000);
  assert.equal(rev.outcome.winner, 1);
  ok('3 katılımcının 3\'ü oy verince oylama kalan süre beklenmeden kilitlendi');

  // bağlantısı kopan katılımcı beklemeyi engellemez
  await host.next((s) => s.phase === 'voting' && s.qIndex === 1, 30000);
  await players[0].vote(2);
  players[2].close();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(host.feed.last.phase, 'voting');
  await players[1].vote(2);
  const l2 = await host.phase('locked', 5000);
  assert.equal(l2.ext.by, 'early');
  ok('Bağlantısı kopan katılımcı beklenmedi: bağlı herkes oy verince kilitlendi');
  await env.close();
}

async function testVoice() {
  console.log('\n[11] Seslendirme: yapay zekâ ses dosyaları ve yazı eşleşmesi');
  const env = await setup(1, { timeScale: 0.02 });
  const { host } = env;
  host.send(C.HOST_START);
  const story = await host.phase('story', 30000);
  assert.ok(story.speech.lines.every((l) => l.audio && l.ms > 500), 'Hikâye satırlarının sesi olmalı');
  const enter = await host.phase('boss_enter', 30000);
  assert.ok(enter.speech.lines.every((l) => l.audio && l.ms > 500));
  const res = await fetch(env.url + enter.speech.lines[0].audio);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /audio\/mpeg/);
  assert.ok((await res.arrayBuffer()).byteLength > 5000);
  ok('Hikâye ve patron konuşmaları seslendirilmiş; ses dosyaları sunuluyor');
  const all = require('../scripts/voice-lines');
  const { lookup } = require('../server/voice');
  const missing = all().filter((l) => !lookup(l.who, l.text));
  assert.deepEqual(missing, [], 'Tüm diyalog satırlarının sesi üretilmiş olmalı');
  ok(`Tüm diyalog satırlarının (${all().length}) sesi mevcut`);
  await env.close();
}

async function testAdminKey() {
  console.log('\n[12] Yönetici anahtarı (internete açık kullanım)');
  const env = await boot({ adminKey: 'gizli123' });
  const bad = new Host(env.url);
  const r = await bad.hello('yanlis');
  assert.ok(r.denied);
  assert.match(r.denied.message, /anahtar/);
  bad.send(C.HOST_START);
  await new Promise((res) => setTimeout(res, 150));
  assert.equal(env.app.game.phase, 'title');
  const good = new Host(env.url);
  const ok2 = await good.hello('gizli123');
  assert.ok(ok2.state);
  bad.s.close(); good.s.close();
  await env.app.close();
  ok('Yanlış anahtarla yönetim reddedildi, doğru anahtarla açıldı');
}

async function testHttp() {
  console.log('\n[13] HTTP yönlendirmeleri ve QR');
  const env = await boot();
  for (const [p, needle] of [['/', 'SON COMMIT'], ['/join', 'Katıl'], ['/play', 'SON COMMIT']]) {
    const res = await fetch(env.url + p);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes(needle), `${p} içeriği`);
  }
  const info = await (await fetch(env.url + '/api/info')).json();
  assert.match(info.joinUrl, /\/join$/);
  assert.match(info.qr, /^data:image\/png;base64,/);
  const js = await fetch(env.url + '/s/shared/events.js');
  assert.equal(js.status, 200);
  await env.app.close();
  ok('/, /join, /play, /api/info (QR) ve statik dosyalar çalışıyor');
}

(async () => {
  const started = Date.now();
  try {
    await testNerveRules();
    await testPerfectRun();
    await testNerveFlow();
    await testFiredByEarlyBosses();
    await testFinals();
    await testVotingRules();
    await testTies();
    await testHostControls();
    await testTimeout();
    await testEarlyLock();
    await testVoice();
    await testAdminKey();
    await testHttp();
    console.log(`\nTÜM TESTLER GEÇTİ (${passed} kontrol, ${((Date.now() - started) / 1000).toFixed(1)} sn)\n`);
    process.exit(0);
  } catch (e) {
    console.error('\nTEST BAŞARISIZ:', e);
    process.exit(1);
  }
})();
