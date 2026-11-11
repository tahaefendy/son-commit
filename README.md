# SON COMMIT — İşten Atılmadan Önce

HAT Yazılım ve Geliştirme Limited Şirketi'nde geçen, animasyonlu ve hikâye tabanlı bir sunum oyunu.
Katılımcılar telefonlarından oy verir; üç patron (Kerim, Harun, Taha) sırayla görev verir. Çoğunluğun seçtiği cevap uygulanır, yanlış kararlar ortak sinir göstergesini yükseltir.
Konu: **Node.js ve Express ile REST API**. Uygulamanın tamamı Türkçedir.

## Kurulum

```bash
npm install
npm start
```

Terminalde iki adres görünür:

| Adres | Kim kullanır |
| --- | --- |
| `http://localhost:3000/` | Sunum bilgisayarı (projeksiyon + yönetici paneli) |
| `http://<yerel-ip>:3000/join` | Telefonlar (QR kod bu adresi içerir) |

Sunum bilgisayarı ve telefonlar **aynı Wi-Fi ağında** olmalıdır. QR kod, bilgisayarın yerel IP adresiyle otomatik üretilir.
Gerekirse portu değiştirin: `PORT=8080 npm start`.

## Sunumda kullanım

1. `/` sayfasını projeksiyona yansıtın, **F** ile tam ekrana geçin (16:9 sahne otomatik ölçeklenir).
2. **OYUNU BAŞLAT**'a basın. Açılış, şirket tanıtımı ve hikâye kendiliğinden ilerler.
3. Kerim sahneye gelince ekrana QR kod gelir. Katılımcılar okutup adını yazar. Herkes bağlanınca **Boşluk** ile ilk görevi başlatın.
4. Gerisi otomatiktir: anlatım → oylama → sonuç → patron tepkisi → sonraki görev. Patron geçişleri ve finaller sinematik sahnelerle gelir.
5. Fareyi oynattığınızda alttaki **yönetici paneli** görünür (3,5 sn hareketsizlikte gizlenir; **H** ile aç/kapat).

### Yönetici paneli ve kısayollar

| Düğme | Kısayol | Ne yapar |
| --- | --- | --- |
| Oyunu Başlat | Boşluk | Açılıştan oyunu başlatır |
| Duraklat / Devam Ettir | P | Tüm süreleri dondurur; duraklatma sırasında oy kabul edilmez |
| Sonraki Adım | Boşluk / Enter | Geçerli sahneyi atlar (oylamada oyları kilitler) |
| Oyları Kilitle | L | Oylamayı hemen durdurur |
| Sonuçları Göster | R | Kilitli oylamanın sonucunu açıklar |
| Sonraki Soru | N | Soruyu sonuçlandırmadan atlar (onay ister) |
| Soruyu Yeniden Başlat | — | Sinir/maaş etkisini geri alıp soruyu yeniden açar |
| QR Kod | Q | QR kodu büyük gösterir |
| Ses: Açık/Kapalı | M | Sesleri açar/kapatır (tercih hatırlanır) |
| Tam Ekran | F | Tam ekran |
| Sıfırla | — | **Onay ister.** Oyunu başa sarar, katılımcılar bağlı kalır |

Panelde ayrıca katılımcı sayısı, aktif patron, sinir seviyesi, maaş ve faz bilgisi görünür.
Tarayıcı ses kuralı gereği sayfaya **bir kez tıklamanız** gerekir (sağ üstte uyarı çıkar).

## Oyun kuralları

* **12 soru**: Kerim 1–4, Harun 5–8, Taha 9–12. Kolaydan kritiğe ilerler ve sunumdaki (PDF) konulara yayılır: HTTP metotları ve CRUD, durum kodları, Node.js olay döngüsü, `req.params`, `express.json()`, middleware ve `next()`, `.env`, hata middleware'i, katmanlı yapı.
* Sinir %0'dan başlar, 0–100 arasında kalır ve **bütün oyun boyunca tektir** (patron değişince sıfırlanmaz).
* Yanlış karar: kolay +12, orta +15, zor +18, kritik +22. Süre bitimi (hiç oy yok) +12. Doğru karar −3.
* Bölgeler: %0–14 Sakin · %15–34 Şüpheci · %35–54 Sinirli · %55–74 Maaş kesintisi · %75–100 İşten çıkarılma. (Değerler `server/data.js` içindeki `ZONES` ve `NERVE` alanlarından değiştirilir.)
* %55'e **ilk kez** ulaşılınca maaş %20 kesilir (45.000 → 36.000 TL). Sinir %75'e ulaşınca oyun anında biter; o an sahnedeki patron kovar.
* Finaller: Ayın Çalışanı (%0–14) · Son Bir Şans (%15–54) · Maaş Kesintisi (%55–74) · Kovuldun (%75+). Kararı Taha açıklar.
* **Ayın çalışanı** olunursa ekibin verdiği her doğru karar için maaşa **900 TL zam** yapılır (12/12 → 55.800 TL). Değer `COMPANY.perCorrectRaise`.
* Maaş kesilmiş ama oyun sonunda sinir %55'in altına inmişse (Final 2), Taha kesintiyi geri alır ve **%10 zam** yapar (49.500 TL).

### Oylama kuralları

* Her telefon bir soruda **yalnızca bir oy** kullanır. Kimlik sunucunun verdiği gizli jetonla doğrulanır; oy yalnızca sunucudaki soket oturumundan sayılır.
* En çok oyu alan seçenek uygulanır. Süre bitince sunucu oylamayı kapatır; geç gelen oy reddedilir.
* **Erken kilit**: bağlı katılımcıların hepsi oy verdiyse kalan süre beklenmez, oylar hemen kilitlenir (bağlantısı kopanlar beklenmez).
* **Eşitlik**: eşit çıkan seçeneklerden biri doğruysa doğru seçenek uygulanır. Hepsi yanlışsa rastgele biri seçilir (sonuç zaten aynı: yanlış karar).
* Hiç oy yoksa süre bitimi sayılır (+10 sinir).
* Doğru cevap, oylama kapanmadan telefonlara ve ekrana **gönderilmez**.
* Telefon bağlantısı koparsa aynı adres açıkken otomatik yeniden bağlanır, oyu korunur. Yönetici sayfası yenilenirse oyun kaldığı yerden devam eder.

## Proje yapısı

```
server/
  index.js      Express + Socket.IO sunucusu, /api/info (QR kod)
  game.js       Oyun motoru: faz makinesi, zamanlayıcılar, oy çözümleme (tek gerçek kaynak)
  data.js       Hikâye, patron konuşmaları, 12 soru, finaller, sinir kuralları
  voice.js      Seslendirme kataloğu (satır → ses dosyası ve süre)
  nerve.js      Sinir / maaş kuralları (saf fonksiyonlar)
  voting.js     Tek oy kuralı, sayım, eşitlik tespiti
  players.js    Katılımcı kaydı, yeniden bağlanma
  sockets.js    Socket.IO olayları, hız sınırlama, yönetici yetkisi
public/
  shared/       events.js (olay adları), audio.js (üretilmiş sesler)
  host/         Sunum ekranı: portreler, sahneler, yönetici paneli
  player/       Telefon: join.html (/join), play.html (/play)
test/e2e.js     Uçtan uca test (npm test)
static-src/     Statik sürümün tarayıcı katmanı (P2P merkezi, oyuncu bağlantısı)
docs/           GitHub Pages için üretilmiş statik sürüm (npm run build:static)
scripts/bots.js Sahte telefonlar (deneme için)
scripts/generate-voice.py  Yapay zekâ ile seslendirme üretimi (npm run voice)
```

Socket.IO olayları `public/shared/events.js` içinde toplanmıştır: `host:*`, `player:*`, `state:*`, `votes:update`.

## Deneme ve test

```bash
npm test                              # tüm akışı hızlandırılmış zamanla doğrular
npm run bots -- --count 25            # sahte telefonlarla gerçek ekranı deneyin
npm run bots -- --count 25 --bias 0.8 # botlar daha çok aynı seçeneğe yönelsin
```

`npm test` şunları doğrular: patron sırası ve soru dağılımı, sinir kuralları, %70 kesinti, %85 kovulma, dört final,
patron geçişleri, tek oy, süre bitimi, çoğunluk, eşitlik, erken kilit, seslendirme, duraklat/devam, yeniden bağlanma, yönetici yetkisi.

## GitHub Pages ile oynama (sunucusuz)

Oyun `docs/` klasöründe **statik sürüm** olarak da yayınlanır; sunucu gerekmez. Bu sürümde oyun motoru yönetici sayfasının içinde çalışır, telefonlar WebRTC (PeerJS) ile yönetici sayfasına bağlanır.

1. Yayın adresini açın (GitHub Pages): **https://tahaefendy.github.io/son-commit/** — bu sayfa sunum ekranıdır.
2. QR kod otomatik oluşur; telefonlar QR'ı okutup `join.html?r=<oda>` adresine girer.
3. Oda kodu yönetici tarayıcısında saklanır, sayfa yenilenirse QR aynı kalır.

Sınırlar:
* **Yönetici sekmesini kapatmayın / yenilemeyin ve ön planda tutun**: oyun durumu o sekmede yaşar (kapanırsa oyun sıfırlanır; sekme kapatılırken uyarı çıkar).
* WebRTC bağlantısı için telefon ve bilgisayarın internete erişmesi gerekir (ilk el sıkışma PeerJS'in ücretsiz genel sunucusundan geçer). Okul/kurum Wi-Fi'ında cihazlar arası izolasyon veya sıkı güvenlik duvarı varsa bazı telefonlar bağlanamayabilir; o durumda telefonlar mobil veriyle katılabilir.
* Statik sürümde cevaplar tarayıcıya inen kodda bulunur (isteyen kaynağı okuyabilir). Gizli tutmak gerekiyorsa Node sunucu sürümünü kullanın.

Güncelleme: kodu değiştirdikten sonra `npm run build:static` ile `docs/` klasörünü yenileyip `git push` yapın; Pages kendiliğinden günceller.

## Node sunucusuyla internete taşıma (isteğe bağlı)

```bash
PORT=3000 PUBLIC_URL=https://oyun.ornek.com ADMIN_KEY=gizli-bir-anahtar npm start
```

| Değişken | Anlamı |
| --- | --- |
| `PORT` | Dinlenen port (varsayılan 3000) |
| `PUBLIC_URL` | QR koddaki adres tabanı (ters vekil/alan adı arkasında gerekir) |
| `ADMIN_KEY` | Ayarlanırsa yönetici ekranı `https://oyun.ornek.com/?key=gizli-bir-anahtar` ile açılır; anahtarsız bağlantılar yönetemez |
| `TIME_SCALE` | Yalnızca test için süre çarpanı (varsayılan 1) |

Ters vekil (Nginx vb.) kullanıyorsanız WebSocket yükseltmesine izin verin (`Upgrade` / `Connection` başlıkları).
Oyun durumu bellekte tutulur; tek süreç yeterlidir.

## Ses ve seslendirme

* **Seslendirme (yapay zekâ)**: Tüm diyaloglar nöral sesle (Microsoft Edge TTS) önceden üretilip `public/audio/voice/` içine konmuştur; oyun sırasında internet gerekmez. Kerim, Harun, Taha ve anlatıcının sesleri `scripts/voice-cast.json` içinde tanımlıdır.
* **Yazı–ses senkronu**: Her satırın kelime zamanları kaydedilir; ekrandaki yazı, çalan sesin gerçek konumuna göre kelime kelime ilerler (duraklatınca ikisi de durur).
* **Ses seçimi**: Aday sesleri `http://localhost:3000/s/voices.html` sayfasından dinleyin, beğendiklerinizi `voice-cast.json` içine yazın ve yeniden üretin (internet ve `pip install edge-tts mutagen` gerekir):

```bash
npm run voice -- --force
```

* Ses dosyası bulunmayan satırlar yalnızca yazıyla ve konuşma tıkırtısıyla oynar.
* Diğer sesler Web Audio ile üretilir (telif sorunu yok): açılış ambiyansı (konuşurken kısılır), ofis sesleri, geri sayım, doğru/yanlış sesleri, maaş kesintisi, final müzikleri.
* Hepsi panelden veya **M** ile kapatılabilir.
