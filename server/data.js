'use strict';
/*
 * Oyunun tüm içeriği (hikâye, patronlar, sorular, finaller).
 * Doğru cevaplar yalnızca burada, sunucuda durur; istemcilere oylama bitmeden gönderilmez.
 */

const COMPANY = {
  name: 'HAT Yazılım ve Geliştirme Limited Şirketi',
  short: 'HAT Yazılım',
  position: 'Junior Backend Developer',
  baseSalary: 45000,
  cutRate: 0.2,
  project: 'Node.js ve Express ile kitap yönetim REST API\'si',
  taskCount: 12,
  perCorrectRaise: 900, // Ayın çalışanı finalinde her doğru karar için maaşa eklenen zam (TL)
  order: ['kerim', 'harun', 'taha'],
};

// Sinir kuralları
const NERVE = {
  max: 100,
  correct: -3,
  timeout: 12,
  byDifficulty: { easy: 12, medium: 15, hard: 18, critical: 22 },
  cutAt: 55,
  fireAt: 75,
};

const DIFFICULTY_LABEL = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', critical: 'Kritik' };

// Sinir bölgeleri: 0 Sakin, 1 Şüpheci, 2 Sinirli, 3 Maaş kesintisi, 4 İşten çıkarılma
const ZONES = [
  { id: 0, from: 0, to: 14, name: 'Sakin', job: 'Güvende' },
  { id: 1, from: 15, to: 34, name: 'Şüpheci', job: 'Gözetim altında' },
  { id: 2, from: 35, to: 54, name: 'Sinirli', job: 'Tehlikede' },
  { id: 3, from: 55, to: 74, name: 'Maaş kesintisi', job: 'Son uyarı' },
  { id: 4, from: 75, to: 100, name: 'İşten çıkarılma', job: 'Sona erdi' },
];

// Açılış anlatımı (sinematik)
const STORY_LINES = [
  'Yıl 2026.',
  'HAT Yazılım ve Geliştirme Limited Şirketi\'nde ilk iş gününüz.',
  'Üniversitede öğrendiğiniz teorik bilgileri artık gerçek bir projede kullanma zamanı.',
  'Şirketin önemli müşterilerinden biri yeni bir REST API talep etti.',
  'Projenin teslim edilmesine yalnızca birkaç dakika kaldı.',
  'Ancak şirketin üç patronu da hata yapılmasına pek tahammül edemiyor.',
  'Bugün vereceğiniz kararlar yalnızca projenin geleceğini değil, şirketteki geleceğinizi de belirleyecek.',
];

const BOSSES = {
  kerim: {
    id: 'kerim',
    name: 'Kerim',
    order: 1,
    tag: '1. PATRON · TEMEL DEĞERLENDİRME',
    traits: 'Ciddi, disiplinli, ilk izlenime önem verir.',
    voice: { base: 190, wave: 'square', gain: 0.035 },
    enter: [
      'Merhaba. HAT Yazılım ve Geliştirme Limited Şirketi\'ne hoş geldin.',
      'Bugün burada bizimle çalışmaya başladın. Önünde önemli bir proje var.',
      'Öncelikle temel bilgilerini ve nasıl düşündüğünü görmek istiyorum. Sana birkaç görev vereceğim.',
      'Umarım işe alım sürecinde yanılmamışımdır. Başlayalım.',
    ],
    lobby: 'Ekibin tamamı bağlandığında ilk görevi vereceğim. Telefonunuzdan QR kodu okutun.',
    correct: 'Güzel. Beklediğim gibi. Böyle devam et.',
    wrong: 'Bu kadar basit bir konuda hata yapmanı beklemiyordum. Biraz daha dikkatli olmanı tavsiye ederim.',
    exit: 'Benim değerlendirmem şimdilik bu kadar. Teknik konularda Harun\'un seni değerlendirmesi gerekiyor. Bundan sonrası onun sorumluluğunda.',
    wrongZone: [
      'Neyse, daha ilk günlerdesin. Toparlanacağını umuyorum.',
      'Biraz daha dikkatli olmanı beklerdim. Sonuçta bu temel konular.',
      'Son zamanlarda kendinde değilsin. Bu kadar basit bir kararı bile veremiyor musun?',
      'Maaş kesintisi sana ders olmalıydı. Bir hata daha kaldırmam.',
    ],
    correctZone: [
      null,
      'Doğru. Ama biraz önceki hatayı unutmuş değilim.',
      'Doğru cevap. Fakat güvenimi geri kazanmak için daha çok çalışman gerek.',
      'Doğru. Ama kesintiyi geri almam için bu yeterli değil.',
    ],
    timeout: 'Süre doldu ve karar çıkmadı. Bu bir toplantı değil, bir proje; beklemeye vaktimiz yok.',
    cut: 'Bu performansla tam maaş almayı beklemiyorsun herhâlde. Maaşından %20 kesinti yapıyorum.',
    fire: 'Yeter. Bu projeyi sana emanet ederek hata yapmışız. İnsan kaynaklarıyla görüşebilirsin. İşine son verildi.',
  },
  harun: {
    id: 'harun',
    name: 'Harun',
    order: 2,
    tag: '2. PATRON · TEKNİK DEĞERLENDİRME',
    traits: 'Titiz, sabırsız, hataları kolay kabul etmez.',
    voice: { base: 125, wave: 'sawtooth', gain: 0.03 },
    enter: [
      'Kerim\'in değerlendirmesini gördüm.',
      'Umarım temel bilgilerin dışında biraz da teknik bilgin vardır.',
      'Benim için önemli olan konuşmak değil, sorun çözmek.',
      'Şimdi gerçek işin nasıl yürüdüğünü göreceğiz. Hadi bakalım.',
    ],
    correct: 'İyi. Sorunu doğru tespit ettin. Devam edebiliriz.',
    wrong: 'Bu kadar basit bir teknik problemi çözemiyorsan müşterinin karşısına nasıl çıkacaksın?',
    exit: 'Teknik değerlendirmem tamamlandı. Ancak projenin son kararlarını Taha verecek. Umarım buraya kadar yaptığın hataları son aşamada tekrarlamazsın.',
    wrongZone: [
      'Bir daha olmasın. Zamanımız yok.',
      'Dikkat et. Bu hızla giderse müşteri bizi bırakır.',
      'Bu hatalar kabul edilebilir değil. Hâlâ aynı yerdeyiz.',
      'Maaşın zaten kesildi. Hâlâ hata yapmaya devam mı ediyorsun?',
    ],
    correctZone: [
      null,
      'Doğru. Ama önceki hatalar yüzünden zaman kaybettik.',
      'Doğru. Ama bunu en başından yapman gerekiyordu.',
      'Bu seferlik doğru. Kesinti yerinde duruyor.',
    ],
    timeout: 'Süre bitti, karar yok. Üretimde bu kadar beklersek sunucu da biz de çökeriz.',
    cut: 'Bu hatalar maaşına yansıyacak. Maaşından %20 kesinti yapıyorum.',
    fire: 'Yeter! Teknik hatalar kabul edilemez. Proje durduruldu, sen de işten çıkarıldın. İnsan kaynaklarıyla görüşebilirsin.',
  },
  taha: {
    id: 'taha',
    name: 'Taha',
    order: 3,
    tag: '3. PATRON · NİHAİ KARAR',
    traits: 'Otoriter, mükemmeliyetçi, son kararı verir.',
    voice: { base: 88, wave: 'triangle', gain: 0.06 },
    enter: [
      'Kerim ve Harun\'un değerlendirmelerini inceledim.',
      'Artık projenin son aşamasındayız.',
      'Buraya kadar geldiysen hâlâ bir şansın var demektir.',
      'Ancak son kararları ben vereceğim. Bu projeyi tamamlayabilecek misin, şimdi göreceğiz.',
    ],
    correct: 'Güzel. Beklediğim performans buydu. Projeyi tamamlayabiliriz.',
    wrong: 'Bu aşamaya kadar geldikten sonra böyle bir hata yapmanı beklemiyordum. Son kararımı vermek zorundayım.',
    wrongZone: [
      'Kabul edilebilir değil.',
      'Hata sayısı artıyor.',
      'Bu seviyenin altına inmeni beklemiyordum.',
      'Son uyarı. Bir hata daha olmayacak.',
    ],
    correctZone: [
      null,
      'Doğru. Ama yeterli değil.',
      'Doğru. Hataları unutmadım.',
      'Doğru. Yine de kesinti geçerli.',
    ],
    timeout: 'Süre doldu. Karar vermeyen bir ekip, proje teslim edemez.',
    cut: 'Bu performans tam maaşı hak etmiyor. Maaşından %20 kesinti yapıyorum.',
    fire: 'Yeter! Bu projeyi sana emanet etmek benim hatamdı. Mükemmel olmayan hiçbir şeye tahammülüm yok. İnsan kaynaklarına git. İşine son verildi!',
  },
};

const QUESTIONS = [
  {
    id: 1, boss: 'kerim', title: 'İlk İzlenim', difficulty: 'easy', time: 20,
    topic: 'HTTP metotları · CRUD (oku)',
    narration: ['Kerim masanıza yaklaşır.'],
    ask: 'Öncelikle kitapları listeleyebileceğimiz bir endpoint hazırlamanı istiyorum. Kullanıcılar bütün kitapları görüntüleyebilmeli. Hangi HTTP metodunu kullanacağız?',
    options: ['POST', 'GET', 'DELETE', 'PUT'],
    correct: 1,
    explanation: 'GET, kaynakları okumak ve listelemek için kullanılır.',
  },
  {
    id: 2, boss: 'kerim', title: 'Kayıp Kitap', difficulty: 'easy', time: 20,
    topic: 'HTTP metotları · CRUD (oluştur)',
    narration: ['Müşteri yeni bir talepte bulunur. Dune kitabı sistemde bulunmamaktadır. Kerim sizden bu kitabı sisteme eklemenizi ister.'],
    ask: 'Kitabı sisteme ekleyeceğiz. Hangi metotla yeni kayıt oluşturmalıyız?',
    options: ['GET', 'PUT', 'POST', 'DELETE'],
    correct: 2,
    explanation: 'POST, yeni kayıt oluşturmak için kullanılır.',
  },
  {
    id: 3, boss: 'kerim', title: 'Müşteriye Ne Cevap Vereceğiz?', difficulty: 'medium', time: 25,
    topic: 'HTTP durum kodları (2xx)',
    narration: ['Kitap başarıyla veritabanına eklendi. Müşteri, işlemin sonucunu API üzerinden öğrenmek istiyor.'],
    ask: 'Yeni bir kitap başarıyla oluşturulduğunda hangi HTTP durum kodunu döndürmemiz gerekiyor?',
    options: ['200 OK', '201 Created', '404 Not Found', '500 Internal Server Error'],
    correct: 1,
    explanation: 'Yeni bir kaynak oluşturulduğunda 201 Created uygun başarı yanıtıdır.',
  },
  {
    id: 4, boss: 'kerim', title: 'Yüzlerce İstek, Tek Parça', difficulty: 'medium', time: 25,
    topic: 'Node.js çalışma zamanı · olay döngüsü',
    narration: ['Müşteri sunucunun dayanıklılığını soruyor: aynı anda yüzlerce istek gelecek, oysa Node.js tek iş parçacığıyla çalışıyor.'],
    ask: 'Node.js bu kadar isteği tek iş parçacığıyla nasıl yönetebiliyor?',
    options: ['Olay döngüsü ve bloklamayan G/Ç sayesinde', 'Her istek için yeni bir sunucu açarak', 'İstekleri tek tek sıraya koyup bekleyerek', 'İşleri tarayıcıya devrederek'],
    correct: 0,
    explanation: 'Node.js olay tabanlıdır: uzun işler arka plana (libuv) verilir, bitince geri çağrı kuyruğa girer ve sırası gelince çalışır. Engelleyen readFileSync() yerine engellemeyen readFile() tercih edilir.',
  },
  {
    id: 5, boss: 'harun', title: 'Kitap Bilgileri Değişiyor', difficulty: 'medium', time: 25,
    topic: 'HTTP metotları · CRUD (güncelle)',
    narration: ['Müşteri Dune kitabının adını değiştirmek istiyor. Kitabın ID değeri 2.'],
    ask: 'Mevcut kitabı güncelleyeceğiz. Kaynak adresimiz /api/kitaplar/2. Hangi HTTP metodunu kullanmalıyız?',
    options: ['GET', 'POST', 'PUT', 'DELETE'],
    correct: 2,
    explanation: 'Sunumdaki CRUD örneğinde PUT, mevcut kaydı güncellemek için kullanılır.',
  },
  {
    id: 6, boss: 'harun', title: 'Yolun İçindeki Numara', difficulty: 'medium', time: 25,
    topic: 'Yönlendirme · req.params, req.query, req.body',
    narration: ['Müşteri tek bir kitabı getirmek istiyor: GET /api/kitaplar/7. Kitabın numarası adresin içinde duruyor.'],
    ask: 'Express\'te yol üzerindeki bu 7 değerine hangi nesne üzerinden erişiriz?',
    options: ['req.params.id', 'req.body.id', 'req.query.id', 'res.params.id'],
    correct: 0,
    explanation: '/api/kitaplar/:id yolundaki değişken req.params ile okunur. req.query sorgu dizesini (?sayfa=2), req.body ise istek gövdesindeki JSON\'u verir.',
  },
  {
    id: 7, boss: 'harun', title: 'API Neden Veri Alamıyor?', difficulty: 'medium', time: 25,
    topic: 'Express · gövde okuma (express.json)',
    narration: ['POST isteği gönderiliyor fakat sunucu gönderilen JSON verisini okuyamıyor. Harun sorunun Express yapılandırmasında olduğunu düşünüyor.'],
    ask: 'İstek gövdesindeki JSON verilerini Express içerisinde okuyabilmek için hangi middleware\'i kullanmalıyız?',
    options: ['express.json()', 'express.listen()', 'app.delete()', 'res.send()'],
    correct: 0,
    explanation: 'express.json() gelen JSON istek gövdesini ayrıştırır ve req.body üzerinden erişilebilir hâle getirir.',
  },
  {
    id: 8, boss: 'harun', title: 'Sunucu Cevap Vermiyor!', difficulty: 'hard', time: 30,
    topic: 'Middleware zinciri · next()',
    narration: ['API\'ye gelen istekler bir middleware\'den geçiyor. Ancak istekler sonraki katmana ulaşmıyor.'],
    code: 'app.use((req, res, next) => {\n    console.log(req.method, req.url);\n});',
    ask: 'İstek burada takılı kalıyor. Sonraki katmana geçmesi için ne yapmamız gerekiyor?',
    options: ['next()', 'res.json()', 'app.listen()', 'require()'],
    correct: 0,
    explanation: 'Middleware zincirinde next() çağrısı isteği sıradaki middleware veya route işleyicisine aktarır.',
  },
  {
    id: 9, boss: 'taha', title: 'Kayıp Kitap mı, Çöken Sunucu mu?', difficulty: 'hard', time: 30,
    topic: 'HTTP durum kodları (4xx / 5xx)',
    narration: ['Müşteri GET /api/kitaplar/999 isteğini gönderiyor. Ancak bu ID\'ye sahip bir kitap bulunmuyor.'],
    ask: 'Sunucu çalışıyor, istek doğru şekilde işlendi ama istenen kitap mevcut değil. Hangi durum kodunu döndürmeliyiz?',
    options: ['200 OK', '201 Created', '404 Not Found', '500 Internal Server Error'],
    correct: 2,
    explanation: 'İstenen kaynak bulunamadığında 404 kullanılır. 500 ise sunucu tarafında beklenmeyen bir hata meydana geldiğini ifade eder.',
  },
  {
    id: 10, boss: 'taha', title: 'Şifre Koda Yazılmaz', difficulty: 'hard', time: 30,
    topic: 'Ortam değişkenleri · .env',
    narration: ['Proje canlı sunucuya taşınacak. Taha, veritabanı şifresinin ve API anahtarının koda gömülmesini kesinlikle istemiyor.'],
    ask: 'Port ve gizli anahtar gibi ayarları koddan ayırmak için hangi yapıyı kullanırız, Node.js bunları nasıl okur?',
    options: ['.env dosyası ve process.env', 'package.json içindeki scripts', 'node_modules klasörü', 'app.listen() parametreleri'],
    correct: 0,
    explanation: '.env dosyasındaki değişkenler process.env ile okunur. Gizli bilgiler koda yazılmaz, geliştirme ve üretim ayarları ayrılır, .env dosyası Git\'e eklenmez (.gitignore).',
  },
  {
    id: 11, boss: 'taha', title: 'Hatalar Tek Yerde Yakalanmalı', difficulty: 'critical', time: 30,
    topic: 'Hata yönetimi · hata middleware\'i',
    narration: ['Bir istek işlenirken beklenmeyen bir hata oluşuyor ve müşteri ham hata çıktısını görüyor. Taha bütün hataların tek bir noktada yakalanmasını istiyor.'],
    code: 'app.use((err, req, res, next) => {\n    res.status(500).json({ hata: err.message });\n});',
    ask: 'Express bu fonksiyonu hata yakalayan middleware olarak neye bakarak tanır?',
    options: ['Dört parametre almasına', 'Adının error olmasına', 'app.error ile tanımlanmasına', 'İçinde console.log bulunmasına'],
    correct: 0,
    explanation: 'Dört parametreli (err, req, res, next) middleware hata yakalayıcıdır. Zincirin sonuna konur ve tüm hataları tek yerde ele alır; Express 5\'te async işleyicilerdeki reddedilmiş Promise hataları da buraya düşer.',
  },
  {
    id: 12, boss: 'taha', title: 'Son Karar: Projenin Mimarisi', difficulty: 'critical', time: 30,
    topic: 'Katmanlı proje yapısı',
    narration: ['Proje büyüyor. Taha kodların tek bir dosyada toplanmasını istemiyor. Her bölümün kendi sorumluluğunun olmasını talep ediyor.'],
    folders: ['routes', 'controllers', 'services', 'data'],
    ask: 'Artık projenin son aşamasındayız. Bana söyleyin, iş mantığının bulunduğu katman hangisi?',
    options: ['routes', 'controllers', 'services', 'data'],
    correct: 2,
    explanation: 'İş mantığı services katmanında yürütülür.',
    explanationList: [
      ['routes', 'Yolları tanımlar.'],
      ['controllers', 'İstek ve yanıtı yönetir.'],
      ['services', 'İş mantığını yürütür.'],
      ['data', 'Veri erişiminden sorumludur.'],
    ],
  },
];

// Eşitlik bozmak için ek sorular (sırayla kullanılır)
const TIEBREAKS = [
  {
    id: 't1', title: 'Hakem Soru', time: 15,
    ask: 'Bir kaynağı silmek için hangi HTTP metodu kullanılır?',
    options: ['GET', 'POST', 'DELETE', 'PUT'],
    correct: 2,
    explanation: 'DELETE, var olan bir kaydı silmek için kullanılır.',
  },
  {
    id: 't2', title: 'Hakem Soru', time: 15,
    ask: 'Express uygulamasının belirli bir portu dinlemeye başlaması için hangi metot çağrılır?',
    options: ['app.get()', 'app.listen()', 'app.use()', 'res.send()'],
    correct: 1,
    explanation: 'app.listen(), sunucuyu verilen portta dinlemeye başlatır.',
  },
  {
    id: 't3', title: 'Hakem Soru', time: 15,
    ask: 'Başarılı bir GET isteğine genellikle hangi durum koduyla yanıt verilir?',
    options: ['200 OK', '404 Not Found', '500 Internal Server Error', '201 Created'],
    correct: 0,
    explanation: 'Okuma isteği başarılı olduğunda 200 OK döndürülür.',
  },
  {
    id: 't4', title: 'Hakem Soru', time: 15,
    ask: 'Node.js projesine bir paket yüklemek için hangi komut kullanılır?',
    options: ['npm install', 'node install', 'express install', 'git install'],
    correct: 0,
    explanation: 'Paketler npm install komutuyla yüklenir.',
  },
];

// Finaller
const FINALS = {
  1: {
    id: 1,
    key: 'employee',
    title: 'AYIN ÇALIŞANI',
    status: 'Başarılı',
    badge: 'Ayın çalışanı',
    tone: 'good',
    speech: 'Bugün gerçekten iyi iş çıkardın. Kerim ve Harun\'un değerlendirmelerini de inceledim. Başta senden emin değildim ama beni yanılttın. Projeyi başarıyla tamamladık. Seni tebrik ediyorum.',
    restoreLine: 'Daha önce uyguladığım maaş kesintisini de geri alıyorum.',
    raiseLine: 'Verdiğin her doğru karar için maaşına zam yapıyorum. Bunu hak ettin.',
  },
  2: {
    id: 2,
    key: 'last-chance',
    title: 'SON BİR ŞANS',
    status: 'Uyarı',
    badge: 'Uyarı',
    tone: 'warn',
    speech: 'Projeyi tamamladık ama açıkçası beklediğim performansı göremedim. Kerim ve Harun da bazı hatalar yaptığını belirtti. Sana bir şans daha vereceğim. Bir sonraki projede bu hataları görmek istemiyorum.',
    restoreLine: 'Maaş kesintisini geri alıyorum. Toparlanma çabanın karşılığında maaşına %10 zam yapıyorum; ama bunu bir daha göremeyeceksin.',
  },
  3: {
    id: 3,
    key: 'salary-cut',
    title: 'MAAŞ KESİNTİSİ',
    status: 'Son uyarı',
    badge: 'Son uyarı',
    tone: 'bad',
    speech: 'Projeyi bitirmiş olmanız, iyi iş çıkardığınız anlamına gelmiyor. Bu performansın karşılığı tam maaş değil. Bir sonraki ay maaşından %20 kesinti yapılacak.',
  },
  4: {
    id: 4,
    key: 'fired',
    title: 'KOVULDUN!',
    status: 'İşten çıkarıldı',
    badge: 'İşten çıkarıldı',
    tone: 'fire',
    speech: null, // konuşmayı o anki patron yapar (BOSSES[x].fire)
  },
};

// Final sahnesinde Kerim ve Harun'un kısa görüntüleri
const CAMEOS = {
  kerim: { 1: 'Temel konularda sağlam bir başlangıç yaptı.', 2: 'Basit konularda bile dikkatsizlik gördüm.', 3: 'İlk izlenimim doğru çıktı. Bu performans yetmez.' },
  harun: { 1: 'Teknik sorunları hızlı ve doğru çözdü.', 2: 'Bazı teknik hatalar yaptı ama toparladı.', 3: 'Teknik hatalar kabul edilebilir düzeyde değil.' },
};

const VERDICT_LINES = [
  'Kerim ve Harun\'un değerlendirme notları masama ulaştı.',
  'Şimdi nihai kararı vereceğim.',
];

module.exports = {
  COMPANY, NERVE, DIFFICULTY_LABEL, ZONES, STORY_LINES, BOSSES,
  QUESTIONS, TIEBREAKS, FINALS, CAMEOS, VERDICT_LINES,
};
