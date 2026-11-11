'use strict';
// Seslendirilecek tüm satırları JSON olarak yazdırır (generate-voice.py kullanır).
console.log(JSON.stringify(require('./voice-lines')()));
