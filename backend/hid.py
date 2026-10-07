# -*- coding: utf-8 -*-
"""Akses HID langsung ke mouse EWEADN GS02 Pro (tanpa software resmi).

Protokol direverse dari web driver resmi. Report ID 0xF0, payload 63 byte.

  Baca config : [14,165,11,46,1,1,1,0,0]
  Tulis config: [15,174,10,47,1,1,1,0, light, rr+1, dpi_count, dpi_index+1,
                 dpi1_lo, dpi1_hi, ... dpi6_lo, dpi6_hi, ..., scroll, lod,
                 sensor, key_respond, sleep_light, highspeed, wakeup<<4|movelight]
  Baca tombol : [8,165,11,44,0,0,0,0,0]
  Tulis tombol: [9,165,34,44,0,0,0, static(32B), 5 x (type,c1,c2,c3)]
  Baterai     : [48,165,11,46,1,1,1,0,0]
  Versi       : [4]

Hardware hanya mengekspos report ID 0xF0, jadi penyimpanan makro di chip
(report ID 6) tidak bisa diakses -> makro dijalankan di PC.
"""
import re
import time

try:
    import hid
except ImportError:  # pragma: no cover
    hid = None

VENDOR_IDS = (0xA8A4, 0xA8A5)
PRODUCT_ID = 0x2255
USAGE_PAGE = 0xFF01
USAGE = 16
REPORT_ID = 0xF0

# ---- Spesifikasi resmi EWEADN GS02 Pro (sumber: situs resmi + buku manual) ----
DEVICE_SPECS = {
    "name": "EWEADN GS02 Pro",
    "sensor": "PixArt PAW3311",
    "max_dpi": 24000,
    "native_dpi": 12000,
    "ips": 300,
    "acceleration": "35G",
    "polling_max": 1000,
    "weight": "65 g",
    "dimensions": "118 x 67 x 41 mm",
    "battery": "500 mAh (3.7V, NTC)",
    "battery_life": "s/d 120 jam",
    "switches_lr": "Huano 20 juta klik",
    "switches_mid": "Huano 3 juta klik",
    "encoder": "FSWITCH 30.000 siklus",
    "mcu": "Furuikun 2012C",
    "connectivity": "Tri-mode (Type-C / 2.4G / Bluetooth)",
    "coating": "Nano-Skin anti keringat",
    "skates": "PTFE murni",
    "features": ["PAW3311", "24K DPI", "1000Hz", "65g", "Tri-Mode"],
}

# DPI dapat diatur 200-24000 (hardware mengizinkan hingga 24.000 via driver).
DPI_MIN, DPI_MAX = 200, 24000

# Preset bawaan hardware: nilai + warna indikator LED (dari buku manual resmi).
DPI_PRESETS = [
    (400, "#e74c3c", "Merah"),
    (800, "#38a169", "Hijau (default)"),
    (1200, "#3498db", "Biru"),
    (1600, "#38a169", "Hijau"),
    (2400, "#d69e2e", "Kuning"),
    (3200, "#9b59b6", "Ungu"),
]

REPORT_RATES = [("125 Hz", 0, "8 ms"), ("250 Hz", 1, "4 ms"),
                ("500 Hz", 2, "2 ms"), ("1000 Hz", 3, "1 ms")]

# GS02 Pro HANYA punya 7 efek bawaan (nilai 0..6); tidak ada warna solid.
LIGHT_MODES = [
    ("Mati total (Off)", 6),
    ("Gelombang (Wave)", 0),
    ("Neon (warna-warni)", 1),
    ("Touring Flash (kedip berkeliling)", 2),
    ("Yoyo Ball", 3),
    ("Kedip Searah (Unidirectional)", 4),
    ("Bernapas (Breathing)", 5),
]

# Warna indikator DPI per stage (urut stage 1..6), sesuai preset hardware.
DPI_COLORS = [p[1] for p in DPI_PRESETS]
DPI_COLOR_NAMES = [p[2] for p in DPI_PRESETS]
DPI_PRESET_VALUES = [p[0] for p in DPI_PRESETS]

DEFAULT_KEYS = [(32, 1, 0, 0), (32, 2, 0, 0), (32, 4, 0, 0),
                (32, 8, 0, 0), (32, 16, 0, 0)]


DEFAULT_CFG = {
    "light_mode": 0, "report_rate": 3, "dpi_count": 6, "dpi_index": 1,
    "dpi": [400, 800, 1200, 1600, 2400, 3200],
    "scroll_flag": 0, "lod": 1, "sensor_flag": 0, "key_respond": 8,
    "sleep_light": 10, "highspeed": 0, "wakeup": 1, "move_light": 0,
}


class MouseNotFound(RuntimeError):
    pass


class GS02:
    """Pembungkus perangkat HID GS02 Pro."""

    def __init__(self):
        self.dev = None
        self.vid = None

    # ------------------------------------------------------------------ koneksi
    def open(self):
        if hid is None:
            raise RuntimeError("Modul 'hidapi' belum terpasang "
                               "(pip install hidapi).")
        info = None
        for d in hid.enumerate():
            if (d["vendor_id"] in VENDOR_IDS and d["product_id"] == PRODUCT_ID
                    and d.get("usage_page") == USAGE_PAGE
                    and d.get("usage") == USAGE):
                info = d
                break
        if not info:
            raise MouseNotFound(
                "Mouse GS02 Pro tidak ditemukan.\n"
                "Sambungkan lewat kabel Type-C atau dongle 2.4G "
                "(mode Bluetooth tidak didukung).")
        self.vid = info["vendor_id"]
        self.dev = hid.device()
        self.dev.open_path(info["path"])
        self.dev.set_nonblocking(1)
        return True

    def close(self):
        try:
            if self.dev:
                self.dev.close()
        except Exception:
            pass
        self.dev = None

    def mode(self):
        return "Kabel (wired)" if self.vid == 0xA8A4 else "Wireless 2.4G"

    @property
    def connected(self):
        return self.dev is not None

    # ------------------------------------------------------------------ I/O
    def _raw_read(self):
        """Baca 64 byte. Kembalikan [] bila kosong.

        hidapi kadang melempar OSError('read error') sesaat pada dongle 2.4G;
        itu BUKAN berarti mouse terputus, jadi kita telan dan lanjutkan.
        """
        try:
            return self.dev.read(64) or []
        except OSError:
            return []

    def _drain(self):
        for _ in range(64):
            if not self._raw_read():
                break

    def _send(self, payload, expect=None, wait=60, delay=0.02):
        self._drain()
        buf = [0] * 64
        buf[0] = REPORT_ID
        for i, b in enumerate(payload[:63]):
            buf[1 + i] = b
        try:
            self.dev.write(buf)
        except OSError as e:
            raise RuntimeError("Gagal mengirim data ke mouse (%s)." % e)
        for _ in range(wait):
            r = self._raw_read()
            if r:
                t = r[1:] if r[0] == REPORT_ID else r
                if expect is None or (t and t[0] == expect):
                    return t
            time.sleep(delay)
        return None

    def _send_retry(self, payload, expect=None, tries=3):
        """Kirim dengan percobaan ulang + buka ulang handle bila gagal."""
        for i in range(tries):
            t = self._send(payload, expect=expect)
            if t is not None:
                return t
            if i < tries - 1:
                self.reconnect()
        return None

    def reconnect(self):
        """Tutup lalu buka ulang handle hidapi (pulihkan dari error sesaat)."""
        self.close()
        try:
            self.open()
            return True
        except Exception:
            return False

    def read_config(self):
        t = self._send_retry([14, 165, 11, 46, 1, 1, 1, 0, 0], expect=14)
        if not t or t[0] != 14:
            raise RuntimeError("Mouse tidak merespons (gagal membaca config).")
        if t[13] == 0 and t[14] == 0 and t[15] == 0:
            return dict(DEFAULT_CFG)
        dpi = [t[12 + 2 * i] | (t[13 + 2 * i] << 8) for i in range(6)]
        return {
            "light_mode": t[8], "report_rate": t[9] - 1, "dpi_count": t[10],
            "dpi_index": (t[11] - 1) if (t[11] - 1) > 0 else 0, "dpi": dpi,
            "scroll_flag": t[47], "lod": t[48], "sensor_flag": t[49],
            "key_respond": t[50], "sleep_light": t[51], "highspeed": t[52],
            "wakeup": (t[53] >> 4) & 15, "move_light": t[53] & 15,
        }

    def is_alive(self):
        """True bila MOUSE benar-benar aktif (bukan sekadar dongle terpasang).

        Pada mode 2.4G, dongle tetap ada walau mouse dimatikan, jadi 'device
        ada' BUKAN berarti mouse hidup. Saat mouse mati, dongle membalas
        perintah config dengan data KOSONG (semua nol) -> aplikasi dulu
        menganggapnya 'terhubung' dengan setelan default. Kita deteksi itu:
        timeout ATAU payload kosong = mouse mati.
        """
        try:
            t = self._send([14, 165, 11, 46, 1, 1, 1, 0, 0], expect=14,
                           wait=30, delay=0.02)
        except Exception:
            return False
        if not t or t[0] != 14:
            return False
        # Payload setelah header (byte 8..53) semuanya nol = tidak ada data
        # nyata dari mouse (mouse mati / di luar jangkauan).
        return any(b != 0 for b in t[8:54])

    def write_config(self, cfg):
        t = [0] * 64
        t[0] = REPORT_ID
        t[1] = 15; t[2] = 174; t[3] = 10; t[4] = 47; t[5] = 1; t[6] = 1; t[7] = 1
        t[9] = cfg["light_mode"]; t[10] = cfg["report_rate"] + 1
        t[11] = cfg["dpi_count"]; t[12] = cfg["dpi_index"] + 1
        for i in range(6):
            v = max(DPI_MIN, min(DPI_MAX, int(cfg["dpi"][i])))
            t[13 + 2 * i] = v & 0xFF
            t[14 + 2 * i] = (v >> 8) & 0xFF
        t[48] = cfg["scroll_flag"]; t[49] = cfg["lod"]; t[50] = cfg["sensor_flag"]
        t[51] = cfg["key_respond"]; t[52] = cfg["sleep_light"]; t[53] = cfg["highspeed"]
        t[54] = (cfg["wakeup"] << 4) | cfg["move_light"]
        self._drain()
        try:
            self.dev.write(t)
        except OSError as e:
            raise RuntimeError("Gagal menyimpan ke mouse (%s)." % e)
        time.sleep(0.25); self._drain()

    def read_keys(self):
        t = self._send_retry([8, 165, 11, 44, 0, 0, 0, 0, 0], expect=8)
        if not t or t[0] != 8:
            return [list(k) for k in DEFAULT_KEYS]
        o = t[7:]
        return [[o[4 * i], o[4 * i + 1], o[4 * i + 2], o[4 * i + 3]]
                for i in range(5)]

    def write_keys(self, keys):
        buf = [0] * 64
        buf[0] = REPORT_ID; buf[1] = 9; buf[2] = 165; buf[3] = 34; buf[4] = 44
        static = [32, 1, 0, 0, 32, 2, 0, 0, 32, 4, 0, 0, 32, 8, 0, 0,
                  32, 16, 0, 0, 33, 85, 0, 0, 33, 56, 1, 0, 33, 56, 255, 0]
        for i, v in enumerate(static):
            buf[8 + i] = v
        for o in range(5):
            k = keys[o]
            buf[8 + 4 * o] = k[0] & 0xFF
            buf[9 + 4 * o] = k[1] & 0xFF
            buf[10 + 4 * o] = k[2] & 0xFF
            buf[11 + 4 * o] = k[3] & 0xFF
        self._drain()
        try:
            self.dev.write(buf)
        except OSError as e:
            raise RuntimeError("Gagal menyimpan tombol ke mouse (%s)." % e)
        time.sleep(0.4); self._drain()

    def read_battery(self):
        t = self._send_retry([48, 165, 11, 46, 1, 1, 1, 0, 0], expect=48)
        if t and t[0] == 48:
            return t[7], t[8]
        return None, None

    def read_version(self):
        t = self._send_retry([4], expect=4)
        if not t or t[0] != 4:
            return ""
        raw = [c for c in t[8:40] if 32 <= c < 127]
        # Firmware mengirim 2 byte per karakter: byte genap = 0x2E '.' (pengisi),
        # byte ganjil = karakter asli -> ambil byte ganjil.
        if len(raw) >= 6 and raw[0::2].count(0x2E) >= len(raw[0::2]) * 0.8:
            raw = raw[1::2]
        return "".join(chr(c) for c in raw).strip(". ")
