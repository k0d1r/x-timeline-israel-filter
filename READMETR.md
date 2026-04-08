# X Anahtar Kelime Filtresi

Chrome ve Brave ile uyumlu Manifest V3 eklentisi. [X.com](https://x.com) / [twitter.com](https://twitter.com) sayfalarında tweet ve profil metinlerini tarar; tanımladığınız ifadelerle eşleşen içerikleri önce zaman çizelgesinden gizler, ardından mümkünse **Engelle** akışını DOM üzerinden dener.

## İsrail ile ilgili varsayılan hedefler

Bu proje, X akışında **İsrail’i doğrudan ima eden veya gösteren metin/emoji** geçen içerikleri kullanıcı tarafından belirlenecek kurallara göre gizlemek veya engellemek üzere kurgulanmıştır. `content.js` içindeki **`BLOCK_TERMS`** ile liste genişletilebilir veya değiştirilebilir.

**Şu anki varsayılan eşleşmeler:**

| Tür | Örnek |
|-----|--------|
| Emoji | İsrail bayrağı (`🇮🇱`) — `substrings` |
| Kelime | `Israel` ve `israel` (harf büyüklüğü ayrı ayrı) — `wholeWords` |
| İfade | `Flag of Israel` — `phrases` |

İsrail ile ilişkili başka ifadeleri (ör. belirli İngilizce/Türkçe kalıplar, başka emoji) yine **`BLOCK_TERMS`** altında uygun listeye ekleyerek kullanabilirsiniz. Yanlış pozitif riskine dikkat edin; `wholeWords` ve `phrases` genelde `substrings` kadar agresif değildir.

## Kurulum — Google Chrome

1. Bu klasörde `manifest.json` ve `content.js` dosyalarının birlikte durduğundan emin olun.
2. Adres çubuğuna **`chrome://extensions`** yazıp Enter’a basın.
3. Sağ üstten **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** (Load unpacked) → `merhaba` klasörünü seçin.
5. Listede **X Anahtar Kelime Filtresi** görünmeli; kırmızı hata varsa `manifest.json` yolunu kontrol edin.

## Kurulum — Brave

Brave da Chromium tabanlıdır; adımlar aynıdır, yalnızca eklenti sayfasının adresi farklıdır.

1. Adres çubuğuna **`brave://extensions`** yazıp Enter’a basın.
2. **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** ile bu proje klasörünü (`manifest.json`’ın olduğu klasör) seçin.
4. X’te bir sorun görürseniz (içerik betiği hiç çalışmıyorsa) geçici olarak `x.com` için **Brave Shields**’i sadece o site için hafifletmeyi deneyebilirsiniz; çoğu kurulumda gerekmez.

## Günlük kullanım (Chrome ve Brave)

- Ek bir düğmeye basmanız gerekmez: X veya Twitter sekmesinde otomatik çalışır.
- **Ana sayfa, liste, arama** gibi tweet’lerin listelendiği sayfalarda eşleşen gönderiler gizlenir; mümkünse engelleme menüsü de denenir.
- **Profil sayfasında** biyografi/isim eşleşirse profil üzerinden engelleme akışı tetiklenebilir.
- Kelime listesini `content.js` içindeki **`BLOCK_TERMS`** ile değiştirdikten sonra:
  1. `chrome://extensions` veya `brave://extensions` sayfasını açın,
  2. Bu eklentinin kartında **yenile (↻)** simgesine tıklayın,
  3. Açık X sekmelerini **yenileyin** (F5 veya Cmd+R / Ctrl+R).

## Geliştirme / güncelleme

`content.js` veya `manifest.json` her değiştiğinde: eklentiler sayfasında eklentiyi **yenileyin**, ardından X sekmesini yenileyin.

## Çalışma modu: sadece gizleme vs. otomatik engelleme

`content.js` içinde **`CONFIG.autoBlock`** kullanılır:

| Değer | Davranış |
|--------|-----------|
| **`true`** (varsayılan) | Eşleşen tweet gizlendikten sonra **Engelle** akışı denenir (`caret`, menü, onay). Profilde eşleşen biyografi/isimde profil menüsünden engel denenir. |
| **`false`** | Yalnızca **gizleme**: zaman çizelgesinde tweet’ler sessizce gizlenir; menü açılmaz, programatik tıklama yok, profilden otomatik engel yok. |

Sadece gizlemek için `autoBlock: false` yapmanız yeterlidir; `queueBlockTask` satırını silmenize gerek kalmaz.

## Kelime / ifade ekleme

`content.js` dosyasının başındaki **`BLOCK_TERMS`** nesnesini düzenleyin:

| Alan | Ne zaman kullanılır |
|------|----------------------|
| `substrings` | Metnin herhangi bir yerinde geçmesi yeterli (emoji, kısa parça). Büyük/küçük harf **birebir** eşleşir. |
| `wholeWords` | Yalnızca **tam kelime** (kelime sınırı). Harfler birebir (`Israel` ile `israel` farklı satırlarda olabilir). |
| `phrases` | Birden fazla kelimelik ifade; kelimeler arasında boşluk sayısı esnektir. Harfler birebir. |

Dosyadaki yorum satırlarında da kısa örnekler vardır.

## Nasıl çalışır (özet)

- **Tarama:** Tweet’te `User-Name` ve `tweetText`; profilde açıklama ve isim alanları (`data-testid` ile).
- **DOM:** `MutationObserver` + kısa gecikme ile birleştirilmiş tarama; işlenmiş tweet’ler `WeakSet` ile tekrar taranmaz.
- **Gizleme:** Eşleşmede tweet hemen gizlenir (`ui-state-collapsed`, `data-view-state="hidden"` ve satır içi stil). Bu isimler `content.js` içinde `HIDDEN_CLASS` / `VIEW_STATE_ATTR` sabitleriyle tek yerden değiştirilebilir. Engelle menüsü kırılsa bile gönderi akışta görünmez kalır.
- **Engelleme:** `caret` → menüde “engelle” eylemi (birçok dilde `block` / `bloquear` / `blockieren` vb. ve `@` içeren satırlarda ek kökler; `aria-label` / `title` da okunur) → onay diyaloğu; profil sayfasında benzer akış. Yine de X metinleri değişirse `content.js` içindeki `BLOCK_UI_*` listelerine yeni dil kalıbı eklenebilir.

## Dosya yapısı

```
merhaba/
├── manifest.json   # MV3 tanımı, host izinleri (x.com, twitter.com)
├── content.js      # Tüm mantık ve BLOCK_TERMS
└── README.md
```

`background.js` yoktur; işlemler içerik betiğinde yapılır.

## Uyarılar ve teknik sınırlar

### X’in DOM (arayüz) değişiklikleri

X, React tabanlı dinamik bir arayüz kullanır; `data-testid` (ör. `confirmationSheetConfirm`), `role="menu"` ve benzeri yapılar **önemsiz bir güncellemede bile değişebilir**. Bu durumda otomatik **Engelle** adımı çalışmayı durdurabilir; **gizleme** tarafı DOM’da `article` bulunduğu sürece genelde daha dayanıklı kalır.

### Programatik tıklama ve `isTrusted`

Tarayıcıda `.click()` veya sentezlenmiş `MouseEvent` ile yapılan tıklamalarda `event.isTrusted` genelde **false** olur. X veya tarayıcı ileride yalnızca “gerçek” kullanıcı etkileşimine izin veren ek kontroller getirirse menü hiç açılmayabilir. Bu riski **istemiyorsanız** `CONFIG.autoBlock: false` ile yalnızca gizleme modunu kullanın.

### Diğer

- Otomatik etkileşim X kullanım koşullarına aykırı sayılabilir veya hesabın otomasyon olarak değerlendirilmesine yol açabilecek kalıplar oluşturabilir; risk size aittir.
- Bu depo yalnızca yerel yükleme içindir; Chrome Web Mağazası yayını yapılmamıştır.

## Lisans

Belirtilmemiştir; kişisel kullanım için projeyi istediğiniz gibi düzenleyebilirsiniz.
