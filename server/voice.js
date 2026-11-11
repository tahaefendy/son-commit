'use strict';
/*
 * Önceden üretilmiş (yapay zekâ ses sentezi) seslendirme dosyalarının kataloğu.
 * Üretim: `npm run voice` (scripts/generate-voice.py). Dosya yoksa oyun yalnızca yazıyla çalışır.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'audio', 'voice');
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')); } catch (e) { manifest = {}; }

const keyOf = (who, text) => crypto.createHash('sha1').update(`${who}|${text}`).digest('hex').slice(0, 16);

/** @returns {{audio:string, ms:number, words:number[][]|null}|null} */
function lookup(who, text) {
  const e = manifest[keyOf(who, text)];
  return e && e.file ? { audio: `/s/audio/voice/${e.file}`, ms: e.ms, words: e.w || null } : null;
}

module.exports = { keyOf, lookup, DIR };
