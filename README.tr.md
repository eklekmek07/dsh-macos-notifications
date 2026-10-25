# DSH macOS Bildirimleri

DeepSeek Harness için sohbet başlığı, süre ve olay türü bazında ayarlanabilen bildirimler; uygulama içinde kalıcı bir dikkat listesi.

[English](README.md) · [MIT lisansı](LICENSE)

> **Tamamen AI / vibecode ile geliştirilmiştir.** İnsan gereksinimlerinden yola çıkarak kodu, arayüzü ve testleri AI ajanları hazırladı; ek AI incelemesi yapıldı. Bağımsız insan güvenlik denetimi veya her Mac'te doğrulanmış teslim garantisi yoktur. Deneyseldir ve resmî DeepSeek ürünü değildir.

## Hangi problemi çözüyor?

“DeepSeek Harness tamamlandı” demek hangi sohbetin bittiğini söylemiyor. Script tabanlı göndericiler DSH yerine yardımcı uygulamanın kimliğiyle görünebiliyor. Normal tamamlanma ile cevap/onay bekleyen durum için tek bir kalıcılık tercihi yeterli olmuyor.

Bu eklenti imzalı DSH uygulamasını değiştirmeden, bildirimi gerçek macOS DSH Electron penceresinden gönderir. DSH içinde **Ayarlar → macOS Bildirimleri** ve **Plugins → eklenti yapılandırması** bölümleri ekler.

## Ayarlar

- Başlık: **sohbet başlığı** veya **olay adı**.
- Geçen süreyi göster/gizle; süre yoksa uydurulmaz.
- Mesaj önizlemesi: isteğe bağlı, varsayılan **kapalı**.
- **Basit genel bildirim:** sohbet başlığı, süre ve mesaj içeriği göstermez.
- Yalnız ilgili sohbet görünümde değilken native bildirim gönder.
- Tamamlanma, hata, durdurulma, engel, token sınırı, araç izni, soru ve plan incelemesi için ayrı aç/kapat ve davranış seçimi.
- Açık **Kaydet**, varsayılana sıfırlama, izin ve kayıtlı ayarlarla test düğmeleri.

Normal tamamlanma/hata varsayılan olarak işletim sistemine bırakılır. Araç izni ve sorular **DSH dikkat listesinde tutulur**; diğer olay türleri ve plan incelemesi başlangıçta kapalıdır. Dikkat listesi en fazla 50 kayıt tutar.

## macOS kalıcılık sınırı

**Olay türüne göre kalıcı native şerit zorlamak mümkün değildir.** Şerit/uyarı seçimi macOS'ta kullanıcıya ve uygulama düzeyi sistem ayarına aittir. `requireInteraction` tek başına macOS'ta kalıcılık sağlamaz.

- **İşletim sistemi denetimli:** eklenti kapatma zamanlayıcısı kurmaz.
- **DSH dikkat listesinde tut:** gerçekten kalıcı olan, yerel metadata listesidir; native pencerenin ekranda kalması garanti edilmez.
- **N saniye sonra otomatik kaldır:** 1–3600 saniye sonunda `Notification.close()` çağrılır. **Bu, Bildirim Merkezi kaydını da kaldırır; yalnızca ekrandaki şeridin süresi değildir.** Uyku ve arka plan kısıtları zamanlayıcıyı geciktirebilir.

Görüldü olarak işaretlemek araçlara izin vermez, soruyu cevaplamaz ve planı kabul etmez. Native bildirime tıklamak yalnızca DSH'yi öne getirir; sohbeti otomatik seçmez.

Uygulama adı/simgesi **DeepSeek Harness** olarak kalır; sohbet başlığı ayrı bir bildirim alanıdır. Haricî Chrome/Safari'de veya macOS dışı arayüzde DSH adına native gönderim yapılmaz.

## Kurulum ve geliştirme

Hedef, kurulu DSH **0.2.1-rc.3** sözleşmeleridir. Node.js 22+ ve pnpm gerekir. DSH kaynak deposuna kardeş dizin bağlantısı gerekmez.

```sh
git clone https://github.com/eklekmek07/dsh-macos-notifications.git
cd dsh-macos-notifications
# İncelenmiş uygulama commit'ini veya PR branch'ini seçin.
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
dsh plugin --profile desktop add /absolute/path/to/dsh-macos-notifications
```

İlk PR birleşene kadar `main` yalnız başlangıç belgelerini içerebilir. Kurulum için gözden geçirilmiş implementation commit'i kullanılmalıdır. Diğer bildirim eklentilerini önce kapatın/kaldırın; `dsh-notification` adıyla farklı yayıncıların paketleri vardır. Bu paketin adı **dsh-macos-notifications**.

DSH'yi tamamen kapatıp yeniden açın. Kendi masaüstü penceresinde ayarlar panelinden izin ve test adımlarını uygulayın. Model promptu, araç listesi ve session logu değiştirilmez. Kurulum betiği çalıştırmak gerekmez; oluşturulmuş Host/Client modülleri pakete dahildir.

## Gizlilik ve sınırlar

- Webhook, telemetri, uzak push, shell komutu, gizli IPC veya otomatik onay yok.
- Önizleme kapalı olsa da Host, sınırlı yanıt özetini kimlik doğrulanmış arayüze projection olarak taşır. Bu yeni bir erişim denetimi sınırı değildir.
- Sohbet başlığı ve isteğe bağlı önizleme kilit ekranında görünebilir. Hassas işler için basit modu ve macOS önizleme ayarlarını kullanın.
- Yerel ayarlar ve dikkat listesi `localStorage` kullanır; listede başlık/session kimliği/olay/zaman tutulur, yanıt özeti veya araç argümanı tutulmaz. Şifreleme ve cihazlar arası eşitleme yok.
- Arayüz kapalıyken yeni bildirim üretilemez. Uyku/Focus/izinler görünür teslimi etkileyebilir.
- Açılış/yeniden bağlantıda eski native bildirimler oynatılmaz. Başlangıçta hâlihazırda çalışan bir görevin ilk isteği yalnız dikkat listesinde görünebilir. Henüz yüklenmemiş durum kayıtları silinmez; devam eden istekler yeniden bağlantıda görüldü işaretinden sonra tekrar listelenebilir.
- Birden fazla açık DSH penceresinde yinelenen native bildirimler olabilir; tek arayüz penceresi varsayılmıştır.

Otomatik testler native API'yi taklit eder; gerçek macOS teslimini kanıtlamaz. SSR arayüz testleri vardır. İlk geliştirmede izole etkileşimli tarayıcı kullanılamadı; gerçek DSH görsel entegrasyonu, native simge/şerit ve çoklu pencere davranışları henüz manuel doğrulanmış sayılmamalıdır.

Ayrıntılı ayar/teknik sınırlar ve birincil platform kaynakları [İngilizce README'de](README.md), kaynak atıfları [lisans bildirimlerinde](THIRD_PARTY_NOTICES.md) bulunur.
