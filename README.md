# EWEADN GS02 Pro Control Hub

Driver kontrol mouse gaming **EWEADN GS02 Pro** untuk Windows — offline, tanpa
software resmi. Dibangun dengan Python + [pywebview](https://pywebview.flowrl.com/)
(UI HTML/CSS/JS) dan berkomunikasi langsung dengan mouse lewat protokol HID
**Report ID `0xF0`**.

> Menggantikan driver web resmi EWEADN dengan aplikasi desktop native yang
> ringan, cepat, dan tanpa perlu koneksi internet.

## ⬇️ Download

**[Download GS02Pro-Control.exe (v3.0.0)](https://github.com/mimuruu/EWEADN-GS02-Pro-Control/releases/latest/download/GS02Pro-Control.exe)**
— standalone, tidak perlu install Python. Butuh Windows 10/11 64-bit.

Atau lihat semua versi di halaman [**Releases**](https://github.com/mimuruu/EWEADN-GS02-Pro-Control/releases).

---

## ✨ Fitur

| Halaman | Fungsi |
|---|---|
| **DPI** | 6 stage sensitivitas (200 – 24.000 DPI), X/Y independent, lift-off distance |
| **Key Remapping** | Ubah fungsi 5 tombol (kiri / kanan / tengah / 2 samping) |
| **Performance** | Polling rate (125/250/500/1000 Hz), debounce, sleep light |
| **Lampu** | 7 efek lampu bawaan |
| **Makro** | Rekam & putar makro (hotkey global **F9** rekam, **F10** putar) |
| **Fire Key** | Klik beruntun otomatis saat tombol pemicu ditahan |

- 🎨 UI tema gelap dengan aksen oranye (`#ff5019`), animasi fade yang halus.
- 🪟 Jendela **borderless** — geser dari area judul, klik-ganda untuk maximize.
- ⌨️ Hotkey **F9/F10 global**: bekerja walau jendela tidak difokuskan.
- 🔋 Status baterai & firmware dibaca langsung dari perangkat.
- 🖥️ Maximize memakai **work area** sehingga taskbar tetap terlihat.

---

## 📋 Spesifikasi Perangkat (EWEADN GS02 Pro)

| | |
|---|---|
| Sensor | PixArt PAW3311 (optical gaming) |
| DPI | 200 – 24.000 DPI |
| Preset DPI | 400 / 800 / 1200 / 1600 / 2400 / 3200 |
| Polling rate | 125 / 250 / 500 / 1000 Hz (receiver 1K) |
| Kecepatan tracking | 300 IPS |
| Akselerasi | 35 G |
| Berat | 65 gram |
| Dimensi | 118 × 67 × 41 mm |
| Baterai | 3,7 V 500 mAh (NTC), hingga ~120 jam |
| Switch L/R | Huano 20 juta klik |
| Switch tengah/sisi | Huano 3 juta klik |
| Encoder | FSWITCH 30.000 siklus |
| Konektivitas | Tri-mode (Type-C / 2.4G / Bluetooth) |
| Coating | Nano-Skin anti keringat |
| Kaki (skates) | PTFE murni |
| Driver resmi | <https://eweadn1.yjx2012.com/> |

---

## 🚀 Cara Pakai

1. Sambungkan mouse lewat kabel Type-C atau dongle 2.4G.
   *(Mode Bluetooth tidak didukung oleh protokol driver ini.)*
2. Jalankan **`GS02Pro-Control.exe`** (atau `Jalankan.bat`).
3. Atur lewat 6 halaman di atas.
4. Klik **"Terapkan Semua"** untuk menyimpan ke memori mouse.

---

## 🛠️ Menjalankan dari Source

```bash
pip install -r requirements.txt
python main.py
```

Butuh Python 3.10+ di Windows.

### Build ulang `.exe`

```bash
pip install pyinstaller
python -m PyInstaller --clean --noconfirm GS02Pro-Control.spec
copy dist\GS02Pro-Control.exe .
```

Log aplikasi: `%LOCALAPPDATA%\GS02Pro-Control\app.log`

---

## ⚠️ Catatan Penting

- Hardware GS02 Pro hanya mengekspos **Report ID `0xF0`**, sehingga:
  - **Makro tidak bisa disimpan di chip mouse** → dijalankan di PC (host-side).
  - **Fire Key** juga dijalankan di PC.
  - Selama aplikasi terbuka, makro & fire key tetap bekerja.
- Mouse hanya punya **7 efek lampu bawaan** (tidak ada warna solid).
- Jendela borderless: tombol minimize/maximize/close digambar di dalam UI,
  geser jendela dengan menahan area judul.

---

## ❓ Tanya-Jawab

**T: Kenapa tombol samping saya jadi Volume +/−?**
J: Itu default pabrik GS02 Pro. Kalau sebelumnya Anda mengubah lewat driver web
resmi, perubahan itu tersimpan di memori mouse dan terbaca kembali oleh aplikasi
ini. Ubah lagi di halaman **Key Remapping** (ada preset "Samping = Maju / Mundur"
atau "Matikan Tombol Samping"), lalu **Terapkan Semua**.

**T: Apakah status baterai akurat?**
J: Ya. Aplikasi membaca register baterai langsung dari mouse (perintah `0x30`),
sama seperti driver resmi EWEADN. Saat mengisi daya, angka bisa tertahan di 100%
walau belum penuh; setelah dicabut akan turun sesuai pemakaian.

**T: Bagaimana cara pakai Fire Key?**
J: Buka halaman **Fire Key** → nyalakan sakelar → pilih Tombol Pemicu (mis.
Samping X2) → atur Delay & Jumlah Klik → klik **Terapkan Fire Key**. Lalu **tahan**
tombol pemicu: mouse otomatis klik kiri beruntun. Ada tombol **Tes Sekarang**
untuk mencoba tanpa menyentuh mouse.

**T: Kalau pakai mode kabel atau Bluetooth, driver ini jalan?**
J: Mode **kabel** (VID `0xA8A4`) & **2.4G** (VID `0xA8A5`): ya. Mode **Bluetooth**:
tidak, karena saat Bluetooth mouse tidak mengekspos interface vendor (`0xFF01`)
yang dipakai driver. Untuk mengubah setting, pakai kabel atau dongle 2.4G.

**T: Kalau teman saya pakai mouse berbeda, apakah tetap nyambung?**
J: Untuk mouse EWEADN lain yang memakai protokol sama (VID `0xA8A4` / `0xA8A5`),
kemungkinan besar ya. Untuk merek lain, tidak. Beberapa fitur khusus GS02 Pro
(mis. jumlah efek lampu) bisa berbeda antar model.

**T: Lampu mouse bisa diset satu warna solid saja?**
J: Tidak bisa. GS02 Pro hanya punya 7 efek bawaan dan tidak menyimpan kode warna
RGB di firmware-nya (hanya ada 1 byte mode, tanpa field warna). Untuk kesan satu
warna statis, gunakan efek "Bernapas" atau "Kedip".

**T: Mouse tidak terdeteksi / setting tidak berubah?**
J: Pastikan kabel/dongle 2.4G terpasang lalu klik **Muat Ulang**. Setting hanya
tersimpan setelah klik **Terapkan Semua**. Mouse "tidur" setelah 10 detik tanpa
gerakan (normal) — gerakkan untuk bangun.

---

## 🧱 Struktur Project

```
GS02Pro-Control/
├── main.py                 # titik masuk aplikasi
├── backend/
│   ├── hid.py              # protokol HID Report ID 0xF0
│   ├── engine.py           # makro & fire key (input hook, lazy)
│   ├── api.py              # jembatan JS <-> Python (pywebview)
│   └── keycodes.py         # 173 pemetaan keycode
├── web/                    # UI (HTML/CSS/JS)
│   ├── index.html
│   ├── css/app.css
│   ├── js/app.js
│   ├── js/icons.js
│   └── fonts/fonts.css
├── icon.ico
├── GS02Pro-Control.spec    # konfigurasi PyInstaller
├── Jalankan.bat            # launcher (exe / python)
└── requirements.txt
```

---

## 🔧 Teknis

- **Protokol HID**: Report ID `0xF0`, payload 63 byte.
  - Baca config: `[14,165,11,46,1,1,1,0,0]`
  - Tulis config: `[15,174,10,47,...]`
  - Baca baterai: `[48,165,11,46,1,1,1,0,0]` (perintah `0x30`)
  - Baca tombol: `[8,165,11,44,0,0,0,0,0]`
- **VID/PID**: `0xA8A4` (kabel) / `0xA8A5` (2.4G), PID `0x2255`,
  usage page `0xFF01`.
- **Anti-hang**: semua atribut objek di kelas `Api` diberi awalan `_` agar
  pywebview tidak memindai atribut publik secara rekursif
  (`maximum recursion depth exceeded` → jendela "Not Responding").
- **UI disajikan via HTTP lokal** (`http_server=True`) untuk menghindari
  layar abu-abu pada WebView2.

---

## 📄 Lisensi

[MIT](LICENSE) — bebas dipakai, dimodifikasi, dan dibagikan.

> Proyek tidak berafiliasi dengan EWEADN. Nama produk dipakai hanya untuk
> menjelaskan kompatibilitas perangkat.
