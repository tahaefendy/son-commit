'use strict';
const { NERVE, ZONES, COMPANY } = require('./data');

const clamp = (n) => Math.max(0, Math.min(NERVE.max, n));

/** Sinir yüzdesine karşılık gelen bölge (0..4). */
function zoneOf(nerve) {
  for (const z of ZONES) if (nerve >= z.from && nerve <= z.to) return z.id;
  return nerve < 0 ? 0 : 4;
}

/** Sonuç türü ve zorluğa göre sinir değişimi: 'correct' | 'wrong' | 'timeout' */
function deltaFor(kind, difficulty) {
  if (kind === 'correct') return NERVE.correct;
  if (kind === 'timeout') return NERVE.timeout;
  return NERVE.byDifficulty[difficulty] || 10;
}

/**
 * Bir sonucu uygular. Saf fonksiyon: durumu değiştirmez.
 * @returns {{before:number, after:number, delta:number, fired:boolean, cutNow:boolean}}
 */
function applyOutcome({ nerve, salaryCut }, kind, difficulty) {
  const delta = deltaFor(kind, difficulty);
  const after = clamp(nerve + delta);
  const fired = after >= NERVE.fireAt;
  // Maaş kesintisi yalnızca ilk kez %70 eşiğine ulaşıldığında uygulanır.
  const cutNow = !salaryCut && !fired && after >= NERVE.cutAt;
  return { before: nerve, after, delta: after - nerve, fired, cutNow };
}

const cutAmount = () => Math.round(COMPANY.baseSalary * COMPANY.cutRate);
// Kesinti yedikten sonra sinir eşiğin altına inerse Taha kesintiyi geri alır ve %10 zam yapar.
const raiseAmount = () => Math.round(COMPANY.baseSalary * 0.1);

module.exports = { clamp, zoneOf, deltaFor, applyOutcome, cutAmount, raiseAmount };
