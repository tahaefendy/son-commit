#!/usr/bin/env python3
"""Aday sesleri dinlemek için örnekler üretir: public/audio/samples/*.mp3 ve public/voices.html
Oyun çalışırken http://localhost:3000/s/voices.html adresinden dinlenir."""
import asyncio, html, os
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'audio', 'samples')
os.makedirs(OUT, exist_ok=True)

TEXT = 'Bu kadar basit bir konuda hata yapmanı beklemiyordum. Biraz daha dikkatli olmanı tavsiye ederim.'
CANDS = [
    ('erkek', 'tr-TR-AhmetNeural', 'Ahmet (Türkçe, önceki ses)', '+0%', '+0Hz'),
    ('erkek', 'en-US-AndrewMultilingualNeural', 'Andrew (çok dilli, sıcak ve kendinden emin)', '+0%', '+0Hz'),
    ('erkek', 'en-US-BrianMultilingualNeural', 'Brian (çok dilli, rahat)', '+0%', '+0Hz'),
    ('erkek', 'fr-FR-RemyMultilingualNeural', 'Rémy (çok dilli, Fransız aksanlı)', '+0%', '+0Hz'),
    ('erkek', 'de-DE-FlorianMultilingualNeural', 'Florian (çok dilli, Alman aksanlı)', '+0%', '+0Hz'),
    ('erkek', 'it-IT-GiuseppeMultilingualNeural', 'Giuseppe (çok dilli, İtalyan aksanlı)', '+0%', '+0Hz'),
    ('erkek', 'en-AU-WilliamMultilingualNeural', 'William (çok dilli, Avustralya aksanlı)', '+0%', '+0Hz'),
    ('erkek', 'ko-KR-HyunsuMultilingualNeural', 'Hyunsu (çok dilli, Kore aksanlı)', '+0%', '+0Hz'),
    ('kadın', 'tr-TR-EmelNeural', 'Emel (Türkçe, önceki ses)', '+0%', '+0Hz'),
    ('kadın', 'en-US-AvaMultilingualNeural', 'Ava (çok dilli, ifadeli)', '+0%', '+0Hz'),
    ('kadın', 'en-US-EmmaMultilingualNeural', 'Emma (çok dilli, neşeli ve net)', '+0%', '+0Hz'),
    ('kadın', 'fr-FR-VivienneMultilingualNeural', 'Vivienne (çok dilli, Fransız aksanlı)', '+0%', '+0Hz'),
    ('kadın', 'de-DE-SeraphinaMultilingualNeural', 'Seraphina (çok dilli, Alman aksanlı)', '+0%', '+0Hz'),
    ('kadın', 'pt-BR-ThalitaMultilingualNeural', 'Thalita (çok dilli, Brezilya aksanlı)', '+0%', '+0Hz'),
]

async def one(c, sem):
    f = f'{c[1]}.mp3'
    async with sem:
        for _ in range(3):
            try:
                await edge_tts.Communicate(TEXT, c[1], rate=c[3], pitch=c[4]).save(os.path.join(OUT, f)); return
            except Exception:
                await asyncio.sleep(1)

async def main():
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(one(c, sem) for c in CANDS))
    rows = ''.join(f'<div class="r"><b>{html.escape(c[2])}</b><code>{c[1]}</code><audio controls preload="none" src="/s/audio/samples/{c[1]}.mp3"></audio></div>' for c in CANDS)
    page = f'''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ses seçimi — SON COMMIT</title>
<style>body{{margin:0;padding:24px;background:#0b0c0f;color:#f2f3f5;font:16px system-ui}}h1{{font-size:22px}}p{{color:#9aa0ab}}
.r{{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #2a2e38}}.r b{{min-width:340px}}code{{color:#ff9a2a;min-width:300px}}</style>
<h1>Aday sesler</h1><p>Örnek cümle: “{html.escape(TEXT)}”<br>Beğendiğiniz sesleri Kerim, Harun, Taha ve anlatıcı için seçin; <code>scripts/voice-cast.json</code> dosyasına yazılır, <code>npm run voice</code> ile üretilir.</p>
{rows}</html>'''
    open(os.path.join(ROOT, 'public', 'voices.html'), 'w').write(page)
    print('örnekler hazır')

asyncio.run(main())
