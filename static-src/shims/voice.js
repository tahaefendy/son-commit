// Tarayıcı sürümü: seslendirme kataloğu ağdan (manifest.json) yüklenir.
import { createHash } from './crypto.js';
let manifest = {};
export const setManifest = (m) => { manifest = m || {}; };
export const keyOf = (who, text) => createHash('sha1').update(`${who}|${text}`).digest().slice(0, 16);
export function lookup(who, text) {
  const e = manifest[keyOf(who, text)];
  return e && e.file ? { audio: `s/audio/voice/${e.file}`, ms: e.ms, words: e.w || null } : null;
}
