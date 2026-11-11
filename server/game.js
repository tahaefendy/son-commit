'use strict';
/*
 * SON COMMIT — oyun motoru.
 * Oyun durumunun tek sahibi sunucudur. Tüm zamanlayıcılar burada çalışır;
 * istemciler yalnızca durumu çizer ve (oyuncular) oy gönderir.
 */
const D = require('./data');
const voice = require('./voice');
const { zoneOf, applyOutcome, cutAmount, raiseAmount } = require('./nerve');
const { VoteBox, leaders, percents } = require('./voting');

const { COMPANY, BOSSES, QUESTIONS, TIEBREAKS, FINALS, CAMEOS, VERDICT_LINES, STORY_LINES, ZONES } = D;

const TYPE_MS = 30; // yazı yazma hızı (ms/karakter) — istemciyle paylaşılır
const HOLD_MS = 900; // satır sonu bekleme
const LETTERS = ['A', 'B', 'C', 'D'];
const VOTE_PHASES = ['voting', 'tie_vote', 'tie_question'];
const QUESTION_PHASES = ['q_intro', 'voting', 'locked', 'tie_vote', 'tie_question', 'tie_result', 'reveal', 'reaction', 'salary'];
const UNRESOLVED = ['q_intro', 'voting', 'locked', 'tie_vote', 'tie_question', 'tie_result'];

const speechMs = (lines) => lines.reduce((a, l) => a + (l.ms || l.text.length * TYPE_MS) + HOLD_MS, 0);
const mkSpeech = (lines, cinematic = false) => ({ typeMs: TYPE_MS, holdMs: HOLD_MS, cinematic, lines });
// Seslendirme varsa satıra ses dosyası ve süresi eklenir; yazı, konuşma süresine göre yazılır.
const say = (who, text) => {
  const v = voice.lookup(who, text);
  return v ? { who, text, audio: v.audio, ms: v.ms + 150, w: v.words } : { who, text };
};

class Game {
  constructor({ registry, timeScale = 1, onChange = () => {}, onVotes = () => {} }) {
    this.registry = registry;
    this.timeScale = timeScale;
    this.onChange = onChange;
    this.onVotes = onVotes;
    this.timer = null;
    this.seq = 0;
    this.reset();
  }

  /* ------------------------------------------------------------------ */
  /* Durum                                                               */
  /* ------------------------------------------------------------------ */
  reset() {
    this._clearTimer();
    this.phase = 'title';
    this.paused = false;
    this.pausedAt = null;
    this.phaseStart = Date.now();
    this.deadline = null;
    this.duration = null;
    this.onEnd = null;
    this.stageBoss = null;
    this.speech = null;
    this.ext = {};
    this.qIndex = -1;
    this.qSnap = null;
    this.nerve = 0;
    this.salary = COMPANY.baseSalary;
    this.salaryCut = false;
    this.salaryRestored = false;
    this.voteBox = null;
    this.mainBox = null;
    this.revoteBox = null;
    this.round = 'main';
    this.tie = null;
    this.tbIndex = 0;
    this.outcome = null;
    this.history = [];
    this.final = null;
    this.ended = false;
    this.endReason = null;
    this.firedBy = null;
    this.projectDone = false;
    this.seq++;
    this.onChange();
  }

  _q() { return QUESTIONS[this.qIndex]; }
  _sc(ms) { return Math.max(20, Math.round(ms * this.timeScale)); }
  _now() { return this.paused ? this.pausedAt : Date.now(); }
  _elapsed() { return Math.max(0, this._now() - this.phaseStart); }
  _remaining() { return this.deadline == null ? null : Math.max(0, this.deadline - this._now()); }
  _clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  _arm() {
    this._clearTimer();
    if (this.paused || this.deadline == null || !this.onEnd) return;
    this.timer = setTimeout(() => this._fire(), Math.max(0, this.deadline - Date.now()));
  }

  _fire() {
    this.timer = null;
    const fn = this.onEnd;
    this.onEnd = null;
    if (fn) fn();
  }

  /** Yeni bir faza geçer. Süre ve bitişte çalışacak işlev sunucuda tutulur. */
  _enter(phase, { duration = null, boss = null, speech = null, onEnd = null, ext = {} } = {}) {
    this._clearTimer();
    this.phase = phase;
    this.seq++;
    this.phaseStart = Date.now();
    if (this.paused) this.pausedAt = this.phaseStart;
    this.duration = duration == null ? null : this._sc(duration);
    this.deadline = this.duration == null ? null : this.phaseStart + this.duration;
    this.onEnd = onEnd;
    this.stageBoss = boss;
    this.speech = speech;
    this.ext = ext;
    this._arm();
    this.onChange();
  }

  /* ------------------------------------------------------------------ */
  /* Yönetici eylemleri                                                  */
  /* ------------------------------------------------------------------ */
  start() {
    if (this.phase !== 'title') return;
    this._enter('company', { duration: 11000, onEnd: () => this._story() });
  }

  pause() {
    if (this.paused || ['title', 'results'].includes(this.phase)) return;
    this.paused = true;
    this.pausedAt = Date.now();
    this._clearTimer();
    this.onChange();
  }

  resume() {
    if (!this.paused) return;
    const gap = Date.now() - this.pausedAt;
    this.phaseStart += gap;
    if (this.deadline != null) this.deadline += gap;
    this.paused = false;
    this.pausedAt = null;
    this._arm();
    this.onChange();
    this.checkEarlyLock();
  }

  /** Geçerli adımı atla / bir sonraki adıma geç. */
  next() {
    switch (this.phase) {
      case 'title': return this.start();
      case 'lobby': return this._beginQuestion(0);
      case 'voting': case 'tie_vote': case 'tie_question': return this._lock('manual');
      case 'locked': return this.showResults();
      case 'results': return undefined;
      default: return this.skip();
    }
  }

  skip() {
    if (!this.onEnd) return;
    this._clearTimer();
    const fn = this.onEnd;
    this.onEnd = null;
    fn();
  }

  lockVotes() {
    if (VOTE_PHASES.includes(this.phase)) this._lock('manual');
  }

  showResults() {
    if (VOTE_PHASES.includes(this.phase)) this._lock('manual');
    if (this.phase === 'locked') {
      this._clearTimer();
      this.onEnd = null;
      this._resolve();
    }
  }

  restartQuestion() {
    const ok = QUESTION_PHASES.includes(this.phase) || this.phase === 'fire';
    if (!ok || this.qIndex < 0) return false;
    this._restoreSnapshot();
    this._openVoting();
    return true;
  }

  nextQuestion() {
    if (!QUESTION_PHASES.includes(this.phase) || this.qIndex < 0) return false;
    if (UNRESOLVED.includes(this.phase)) {
      // Çözülmemiş soru: sonuç uygulanmadan atlanır.
      this._restoreSnapshot();
      this.history.push({ qid: this._q().id, kind: 'skipped', winner: null, correct: false, playerCorrect: {}, nerveBefore: this.nerve, nerveAfter: this.nerve });
      this._advance();
      return true;
    }
    const startQ = this.qIndex;
    let guard = 0;
    while (this.qIndex === startQ && QUESTION_PHASES.includes(this.phase) && guard++ < 8) this.skip();
    return true;
  }

  _restoreSnapshot() {
    this._clearTimer();
    const s = this.qSnap;
    if (!s) return;
    this.nerve = s.nerve;
    this.salary = s.salary;
    this.salaryCut = s.salaryCut;
    this.salaryRestored = s.salaryRestored;
    this.history.length = s.historyLen;
    this.ended = false;
    this.endReason = null;
    this.firedBy = null;
    this.outcome = null;
    this.tie = null;
    this.final = null;
  }

  /* ------------------------------------------------------------------ */
  /* Hikâye akışı                                                        */
  /* ------------------------------------------------------------------ */
  _story() {
    const lines = STORY_LINES.map((t) => say('narrator', t));
    this._enter('story', { duration: speechMs(lines) + 1500, speech: mkSpeech(lines, true), onEnd: () => this._bossEnter('kerim', () => this._lobby()) });
  }

  _bossEnter(bossId, then) {
    const lines = BOSSES[bossId].enter.map((t) => say(bossId, t));
    this._enter('boss_enter', { duration: speechMs(lines) + 2800, boss: bossId, speech: mkSpeech(lines), onEnd: then });
  }

  _lobby() {
    const lines = [say('kerim', BOSSES.kerim.lobby)];
    this._enter('lobby', { boss: 'kerim', speech: mkSpeech(lines) });
  }

  _beginQuestion(i) {
    const q = QUESTIONS[i];
    this.qIndex = i;
    this.qSnap = { nerve: this.nerve, salary: this.salary, salaryCut: this.salaryCut, salaryRestored: this.salaryRestored, historyLen: this.history.length };
    this.outcome = null;
    this.tie = null;
    this.voteBox = null;
    this.mainBox = null;
    this.revoteBox = null;
    this.round = 'main';
    const lines = [...q.narration.map((t) => say('narrator', t)), say(q.boss, q.ask)];
    const extra = q.code || q.folders ? 3200 : 1500;
    this._enter('q_intro', { duration: speechMs(lines) + extra, boss: q.boss, speech: mkSpeech(lines), onEnd: () => this._openVoting() });
  }

  /* ------------------------------------------------------------------ */
  /* Oylama                                                              */
  /* ------------------------------------------------------------------ */
  _openVoting() {
    const q = this._q();
    this.round = 'main';
    this.tie = null;
    this.revoteBox = null;
    this.outcome = null;
    this.voteBox = new VoteBox('main', [0, 1, 2, 3]);
    this.mainBox = this.voteBox;
    this._enter('voting', { duration: q.time * 1000, boss: q.boss, onEnd: () => this._lock('auto') });
  }

  _lock(by) {
    if (!VOTE_PHASES.includes(this.phase)) return;
    this._enter('locked', {
      duration: by !== 'manual' ? 1700 : null,
      boss: this.stageBoss,
      ext: { by, round: this.round },
      onEnd: by !== 'manual' ? () => this._resolve() : null,
    });
  }

  castVote(playerId, option) {
    if (!VOTE_PHASES.includes(this.phase)) return { ok: false, reason: 'Şu anda oylama açık değil.' };
    if (this.paused) return { ok: false, reason: 'Oyun duraklatıldı.' };
    if (this.deadline != null && Date.now() > this.deadline) return { ok: false, reason: 'Süre doldu, oylama kapandı.' };
    const r = this.voteBox.cast(playerId, option);
    if (r.ok) { this.onVotes(); this.checkEarlyLock(); }
    return r;
  }

  /** Bağlı herkes oy verdiyse kalan süreyi beklemeden oylamayı kilitle. */
  checkEarlyLock() {
    if (this.phase !== 'voting' || this.paused || !this.voteBox || this._earlyPending) return;
    const connected = this.registry.connectedCount();
    if (connected < 1 || this.voteBox.total() < connected) return;
    this._earlyPending = true;
    const seq = this.seq;
    setTimeout(() => {
      this._earlyPending = false;
      if (this.seq === seq && this.phase === 'voting' && !this.paused) this._lock('early');
    }, this._sc(900));
  }

  _resolve() {
    const counts = this.voteBox.counts();
    const { top, tied } = leaders(counts, [0, 1, 2, 3]);
    if (top === 0) return this._reveal({ winner: null, timeout: true });
    if (tied.length === 1) return this._reveal({ winner: tied[0] });
    // Eşitlik: eşit seçeneklerden biri doğruysa o seçilir; hepsi yanlışsa rastgele biri (sonuç aynı).
    const q = this._q();
    const hasCorrect = tied.includes(q.correct);
    const winner = hasCorrect ? q.correct : tied[Math.floor(Math.random() * tied.length)];
    this.tie = { options: tied, mainCounts: counts, stage: 'done', revoteCounts: null, question: null, scores: null, method: hasCorrect ? 'correct' : 'random', winner };
    return this._reveal({ winner });
  }

  /* ------------------------------------------------------------------ */
  /* Sonuç, tepki, maaş kesintisi, kovulma                               */
  /* ------------------------------------------------------------------ */
  _reveal({ winner, timeout = false }) {
    const q = this._q();
    const correct = !timeout && winner === q.correct;
    const kind = timeout ? 'timeout' : correct ? 'correct' : 'wrong';
    const res = applyOutcome({ nerve: this.nerve, salaryCut: this.salaryCut }, kind, q.difficulty);
    const mainCounts = this.mainBox.counts();
    const finalBox = this.tie && this.revoteBox && this.revoteBox.total() > 0 ? this.revoteBox : this.mainBox;
    const playerCorrect = {};
    for (const [pid, opt] of finalBox.votes) playerCorrect[pid] = opt === q.correct;

    this.nerve = res.after;
    this.history.push({ qid: q.id, kind, winner, correct, playerCorrect, nerveBefore: res.before, nerveAfter: res.after });
    this.outcome = {
      kind, winner, correct, correctIndex: q.correct,
      counts: mainCounts, percents: percents(mainCounts), total: this.mainBox.total(),
      delta: res.delta, before: res.before, after: res.after,
      fired: res.fired, cutNow: res.cutNow,
      explanation: q.explanation, explanationList: q.explanationList || null,
      tie: this.tie ? this._tiePublic() : null,
    };
    this._enter('reveal', {
      duration: 8200, boss: this.stageBoss,
      onEnd: () => (res.fired ? this._dismiss() : this._reaction()),
    });
  }

  _reaction() {
    const boss = BOSSES[this.stageBoss];
    const o = this.outcome;
    const zone = Math.min(zoneOf(this.nerve), 3);
    const lines = [];
    if (o.kind === 'correct') {
      lines.push(boss.correct);
      if (boss.correctZone[zone]) lines.push(boss.correctZone[zone]);
    } else {
      lines.push(o.kind === 'timeout' ? boss.timeout : boss.wrong);
      if (!o.cutNow) lines.push(boss.wrongZone[zone]);
    }
    const sp = lines.map((t) => say(boss.id, t));
    this._enter('reaction', {
      duration: speechMs(sp) + 6500, boss: boss.id, speech: mkSpeech(sp),
      onEnd: () => (o.cutNow ? this._salary() : this._advance()),
    });
  }

  _salary() {
    const boss = BOSSES[this.stageBoss];
    const before = this.salary;
    this.salary = COMPANY.baseSalary - cutAmount();
    this.salaryCut = true;
    const sp = [say(boss.id, boss.cut)];
    this._enter('salary', {
      duration: speechMs(sp) + 6500, boss: boss.id, speech: mkSpeech(sp),
      ext: { salaryBefore: before, salaryAfter: this.salary, cut: cutAmount() },
      onEnd: () => this._advance(),
    });
  }

  _dismiss() {
    const boss = BOSSES[this.stageBoss];
    this.ended = true;
    this.endReason = 'fired';
    this.firedBy = boss.id;
    const sp = [say(boss.id, boss.fire)];
    this._enter('fire', { duration: speechMs(sp) + 6500, boss: boss.id, speech: mkSpeech(sp), onEnd: () => this._finalFired() });
  }

  _finalFired() {
    const f = FINALS[4];
    this.salary = 0;
    this.final = this._finalPublic(f, { salary: 0, cut: 0, restored: false, speech: null });
    this._enter('final', { duration: 20000, boss: this.firedBy, onEnd: () => this._results() });
  }

  /* ------------------------------------------------------------------ */
  /* İlerleme                                                            */
  /* ------------------------------------------------------------------ */
  _advance() {
    const next = this.qIndex + 1;
    if (next >= QUESTIONS.length) return this._verdict();
    if (QUESTIONS[next].boss !== QUESTIONS[this.qIndex].boss) return this._bossTransition(next);
    return this._beginQuestion(next);
  }

  _bossTransition(next) {
    const fromId = QUESTIONS[this.qIndex].boss;
    const toId = QUESTIONS[next].boss;
    const sp = [say(fromId, BOSSES[fromId].exit)];
    const captions = { harun: ['Toplantı odası', 'Teknik değerlendirme'], taha: ['Yönetim katı', 'Nihai karar'] };
    this._enter('boss_exit', {
      duration: speechMs(sp) + 2200, boss: fromId, speech: mkSpeech(sp),
      onEnd: () => this._enter('blackout', {
        duration: 4200, boss: null, ext: { caption: captions[toId] || ['', ''], to: toId },
        onEnd: () => this._bossEnter(toId, () => this._beginQuestion(next)),
      }),
    });
  }

  _verdict() {
    const sections = ['kerim', 'harun'].map((b) => {
      const qs = QUESTIONS.map((q, i) => ({ q, i })).filter(({ q }) => q.boss === b);
      const done = qs.filter(({ i }) => this.history[i]);
      const ok = done.filter(({ i }) => this.history[i].correct).length;
      return { boss: b, correct: ok, total: qs.length };
    });
    const sp = VERDICT_LINES.map((t) => say('taha', t));
    this._enter('verdict', { duration: speechMs(sp) + 5200, boss: 'taha', speech: mkSpeech(sp), ext: { sections }, onEnd: () => this._finalNormal() });
  }

  _finalNormal() {
    const z = zoneOf(this.nerve);
    const id = z === 0 ? 1 : z <= 2 ? 2 : 3;
    const f = FINALS[id];
    const lines = [f.speech];
    const correctN = this.history.filter((h) => h.correct).length;
    const before = this.salary;
    let restored = false;
    let raise = 0;
    if (id === 1) {
      // Ayın çalışanı: her doğru karar için zam (önceden kesinti varsa o da geri alınır)
      raise = correctN * COMPANY.perCorrectRaise;
      if (this.salaryCut) { restored = true; lines.push(f.restoreLine); }
      if (raise > 0) lines.push(f.raiseLine);
      this.salary = COMPANY.baseSalary + raise;
    } else if (id === 2 && this.salaryCut) {
      // Kesinti yedikten sonra toparlayan çalışana kesinti iadesi + %10 zam
      restored = true;
      raise = raiseAmount();
      this.salary = COMPANY.baseSalary + raise;
      lines.push(f.restoreLine);
    }
    this.salaryRestored = restored;
    this.projectDone = true;
    const sp = lines.map((t) => say('taha', t));
    this.final = this._finalPublic(f, { salary: this.salary, cut: id === 3 ? cutAmount() : 0, restored, raise, correctN, speech: sp });
    this._enter('final', {
      duration: speechMs(sp) + 16000, boss: 'taha', speech: mkSpeech(sp),
      ext: { salaryBefore: before },
      onEnd: () => this._results(),
    });
  }

  _results() {
    this._enter('results', { boss: this.ended ? this.firedBy : 'taha' });
  }

  /* ------------------------------------------------------------------ */
  /* Görünümler (istemcilere gidenler)                                   */
  /* ------------------------------------------------------------------ */
  _finalPublic(f, { salary, cut, restored, raise = 0, correctN = 0 }) {
    return {
      id: f.id, key: f.key, title: f.title, status: f.status, badge: f.badge, tone: f.tone,
      salary, normalSalary: COMPANY.baseSalary, cut, restored, raise, correctN, perCorrect: COMPANY.perCorrectRaise,
      project: f.id === 4 ? 'Başarısız' : 'Tamamlandı',
      game: f.id === 4 ? 'Erken sonlandırıldı' : 'Tamamlandı',
      cameos: f.id < 4 ? { kerim: CAMEOS.kerim[f.id], harun: CAMEOS.harun[f.id] } : null,
    };
  }

  _tiePublic() {
    const t = this.tie;
    return {
      options: t.options, stage: t.stage, mainCounts: t.mainCounts, revoteCounts: t.revoteCounts,
      scores: t.scores, method: t.method, winner: t.winner == null ? null : t.winner,
      question: t.question ? { id: t.question.id, title: t.question.title, ask: t.question.ask, options: t.question.options, time: t.question.time } : null,
      correctIndex: t.stage === 'done' && t.question ? t.question.correct : null,
      explanation: t.stage === 'done' && t.question ? t.question.explanation : null,
      tbCounts: t.tbCounts || null,
    };
  }

  _publicQuestion(q) {
    if (!q) return null;
    return {
      id: q.id, no: QUESTIONS.indexOf(q) + 1, title: q.title, difficulty: q.difficulty,
      diffLabel: D.DIFFICULTY_LABEL[q.difficulty], time: q.time, boss: q.boss,
      narration: q.narration, code: q.code || null, folders: q.folders || null,
      ask: q.ask, options: q.options,
    };
  }

  _score(pid) {
    let n = 0;
    for (const h of this.history) if (h.playerCorrect && h.playerCorrect[pid]) n++;
    return n;
  }

  _status() {
    const z = zoneOf(this.nerve);
    let project = 'Henüz başlamadı';
    if (this.projectDone) project = 'Tamamlandı';
    else if (this.endReason === 'fired') project = 'Başarısız';
    else if (this.qIndex >= 0) project = 'Devam ediyor';
    return { zone: z, job: this.endReason === 'fired' ? ZONES[4].job : ZONES[z].job, project };
  }

  _resultsPublic() {
    const board = this.registry.all().map((p) => ({ name: p.name, score: this._score(p.id) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'tr')).slice(0, 8);
    return {
      teamCorrect: this.history.filter((h) => h.correct).length,
      answered: this.history.filter((h) => h.kind !== 'skipped').length,
      strip: QUESTIONS.map((q, i) => {
        const h = this.history[i];
        return { no: q.id, kind: h ? h.kind : 'none' };
      }),
      board,
    };
  }

  controls() {
    const p = this.phase;
    const inQ = QUESTION_PHASES.includes(p) && this.qIndex >= 0;
    return {
      canStart: p === 'title',
      canPause: !this.paused && !['title', 'results'].includes(p),
      canResume: this.paused,
      canNext: !['title', 'results'].includes(p),
      canNextQuestion: inQ,
      canRestart: inQ || p === 'fire',
      canLock: VOTE_PHASES.includes(p),
      canShowResults: p === 'locked' || VOTE_PHASES.includes(p),
      canReset: p !== 'title',
    };
  }

  meta() {
    return {
      company: { name: COMPANY.name, short: COMPANY.short, position: COMPANY.position, baseSalary: COMPANY.baseSalary, project: COMPANY.project, taskCount: COMPANY.taskCount },
      bosses: Object.values(BOSSES).map((b) => ({ id: b.id, name: b.name, tag: b.tag, traits: b.traits, order: b.order, voice: b.voice })),
      questions: QUESTIONS.map((q) => ({ no: q.id, title: q.title, boss: q.boss, difficulty: q.difficulty, diffLabel: D.DIFFICULTY_LABEL[q.difficulty] })),
      zones: ZONES,
      letters: LETTERS,
    };
  }

  _common() {
    const st = this._status();
    return {
      phase: this.phase, seq: this.seq, paused: this.paused,
      elapsed: this._elapsed(), remaining: this._remaining(), duration: this.duration,
      stageBoss: this.stageBoss, speech: this.speech, ext: this.ext,
      qIndex: this.qIndex, qTotal: QUESTIONS.length,
      nerve: this.nerve, zone: st.zone, job: st.job, project: st.project,
      salary: this.salary, baseSalary: COMPANY.baseSalary, salaryCut: this.salaryCut, salaryRestored: this.salaryRestored,
      ended: this.ended, endReason: this.endReason, firedBy: this.firedBy,
      strip: QUESTIONS.map((q, i) => (this.history[i] ? this.history[i].kind : 'none')),
    };
  }

  votingInfo() {
    const box = this.voteBox;
    if (!box) return null;
    return { kind: box.kind, allowed: [...box.allowed], counts: box.counts(), total: box.total() };
  }

  hostView() {
    const q = this.qIndex >= 0 ? QUESTIONS[this.qIndex] : null;
    const inFinal = ['final', 'results'].includes(this.phase);
    return {
      ...this._common(),
      question: this._publicQuestion(q),
      voting: this.votingInfo(),
      tie: this.tie ? this._tiePublic() : null,
      outcome: this.outcome,
      final: this.final,
      results: inFinal ? this._resultsPublic() : null,
      players: this.presence(),
      controls: this.controls(),
    };
  }

  presence() {
    return { total: this.registry.total(), connected: this.registry.connectedCount(), recent: this.registry.recentNames(10) };
  }

  playerView(pid) {
    const p = this.registry.byId(pid);
    const base = this._common();
    const view = {
      phase: base.phase, seq: base.seq, paused: base.paused, elapsed: base.elapsed, remaining: base.remaining, duration: base.duration,
      nerve: base.nerve, zone: base.zone, salary: base.salary, job: base.job, project: base.project,
      qNo: this.qIndex + 1, qTotal: QUESTIONS.length,
      boss: this.stageBoss ? BOSSES[this.stageBoss].name : null,
      name: p ? p.name : '', score: p ? this._score(p.id) : 0,
      ended: base.ended, endReason: base.endReason,
    };
    if (VOTE_PHASES.includes(this.phase) || this.phase === 'locked') {
      const q = this._q();
      const tbq = this.round === 'tieq' && this.tie ? this.tie.question : null;
      const src = tbq || q;
      view.vote = {
        kind: this.round, title: tbq ? tbq.title : q.title, ask: src.ask, options: src.options,
        allowed: this.voteBox ? [...this.voteBox.allowed] : [], mine: this.voteBox && p ? this.voteBox.voteOf(p.id) : null,
        open: VOTE_PHASES.includes(this.phase),
      };
    }
    if (this.outcome && ['reveal', 'reaction', 'salary', 'tie_result'].includes(this.phase) && this.phase !== 'tie_result') {
      const o = this.outcome;
      const finalBox = this.tie && this.revoteBox && this.revoteBox.total() > 0 ? this.revoteBox : this.mainBox;
      const mine = finalBox && p ? finalBox.voteOf(p.id) : null;
      view.result = {
        kind: o.kind, winner: o.winner, correct: o.correct, correctIndex: o.correctIndex,
        mine, mineCorrect: mine === null ? null : mine === o.correctIndex,
        options: this._q().options, delta: o.delta,
      };
    }
    if (this.phase === 'tie_result' && this.tie) view.tie = { method: this.tie.method, winner: this.tie.winner, options: this.tie.options };
    if (['final', 'results'].includes(this.phase) && this.final) view.final = this.final;
    return view;
  }
}

module.exports = { Game, TYPE_MS, HOLD_MS, speechMs, LETTERS };
