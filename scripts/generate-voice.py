#!/usr/bin/env python3
"""Yapay zekâ (nöral) sesle tüm diyalogları mp3'e çevirir; kelime zamanlarıyla birlikte
public/audio/voice/manifest.json yazar. Oyun, yazıyı bu kelime zamanlarına göre seslendirmeyle eş zamanlı yazar.

Gereksinim: pip install edge-tts mutagen   (üretim sırasında internet gerekir; oyun sırasında gerekmez)
Kullanım:   npm run voice            (yalnızca yeni/değişen satırlar)
            npm run voice -- --force (hepsini yeniden üret)
Konuşmacı sesleri: scripts/voice-cast.json
"""
import asyncio, hashlib, json, os, subprocess, sys
import edge_tts
from mutagen.mp3 import MP3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'audio', 'voice')
os.makedirs(OUT, exist_ok=True)

cast = json.load(open(os.path.join(ROOT, 'scripts', 'voice-cast.json')))
cast_sig = hashlib.sha1(json.dumps(cast, sort_keys=True).encode()).hexdigest()[:12]
force = '--force' in sys.argv

items = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'scripts', 'voice-texts.js')]))
mpath = os.path.join(OUT, 'manifest.json')
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
if force or manifest.get('__cast') != cast_sig:
    manifest = {}  # ses kadrosu değiştiyse hepsi yeniden üretilir
manifest['__cast'] = cast_sig

PUNCT = ',.!?;:…"\'’”)»'

def map_words(text, events):
    out, cur = [], 0
    for t, w in events:
        i = text.find(w, cur)
        if i < 0:
            continue
        end = i + len(w)
        while end < len(text) and text[end] in PUNCT:
            end += 1
        out.append([t, i, end])
        cur = end
    if out:
        out[-1][2] = len(text)
    return out

async def synth(text, v):
    c = edge_tts.Communicate(text, v['voice'], rate=v['rate'], pitch=v['pitch'], volume=v.get('volume', '+0%'), boundary='WordBoundary')
    audio, events = bytearray(), []
    async for ch in c.stream():
        if ch['type'] == 'audio':
            audio += ch['data']
        elif ch['type'] == 'WordBoundary':
            events.append((ch['offset'] // 10000, ch['text']))
    return bytes(audio), events

async def one(it, sem):
    key = it['key']
    f = f'{key}.mp3'
    path = os.path.join(OUT, f)
    if key in manifest and os.path.exists(path):
        return
    v = cast[it['who']]
    async with sem:
        for attempt in range(4):
            try:
                audio, events = await synth(it['text'], v)
                if not audio:
                    raise RuntimeError('boş ses')
                open(path, 'wb').write(audio)
                break
            except Exception as e:
                if attempt == 3:
                    print('HATA', it['text'][:40], e); return
                await asyncio.sleep(1.5)
    ms = int(MP3(path).info.length * 1000)
    manifest[key] = {'file': f, 'ms': ms, 'who': it['who'], 'w': map_words(it['text'], events)}
    print(f"{it['who']:9s} {ms:6d} ms  {len(manifest[key]['w']):3d} kelime  {it['text'][:50]}")

async def main():
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(one(it, sem) for it in items))
    live = {it['key'] for it in items} | {'__cast'}
    for k in list(manifest):
        if k not in live:
            try: os.unlink(os.path.join(OUT, manifest[k]['file']))
            except OSError: pass
            del manifest[k]
    json.dump(manifest, open(mpath, 'w'), ensure_ascii=False)
    print(f'{len(manifest) - 1} ses dosyası hazır.')

asyncio.run(main())
