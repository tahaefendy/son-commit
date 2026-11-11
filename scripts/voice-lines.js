'use strict';
// Seslendirilecek tüm diyalog satırlarını döndürür (voice-texts.js ve testler kullanır).
const D = require('../server/data');
const { keyOf } = require('../server/voice');

module.exports = function allLines() {
  const items = new Map();
  const add = (who, text) => { if (text) items.set(keyOf(who, text), { who, text, key: keyOf(who, text) }); };
  D.STORY_LINES.forEach((t) => add('narrator', t));
  for (const b of Object.values(D.BOSSES)) {
    (b.enter || []).forEach((t) => add(b.id, t));
    ['lobby', 'correct', 'wrong', 'exit', 'timeout', 'cut', 'fire'].forEach((k) => add(b.id, b[k]));
    (b.wrongZone || []).forEach((t) => add(b.id, t));
    (b.correctZone || []).forEach((t) => add(b.id, t));
  }
  for (const q of D.QUESTIONS) { q.narration.forEach((t) => add('narrator', t)); add(q.boss, q.ask); }
  D.VERDICT_LINES.forEach((t) => add('taha', t));
  for (const f of Object.values(D.FINALS)) { add('taha', f.speech); add('taha', f.restoreLine); add('taha', f.raiseLine); }
  return [...items.values()];
};
