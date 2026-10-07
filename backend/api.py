# -*- coding: utf-8 -*-
"""Jembatan antara UI (HTML/JS via pywebview) dan backend HID + engine.

Setiap method PUBLIK di kelas Api bisa dipanggil dari JS lewat
`window.pywebview.api.<nama>(...)`. pywebview menjalankannya di thread
terpisah, jadi panggilan HID yang lambat TIDAK memblokir UI.

PENTING (anti-hang):
  pywebview memindai SEMUA atribut publik objek js_api secara REKURSIF
  (webview.util.get_functions). Bila objek kompleks (Window, device HID,
  engine) disimpan sebagai atribut PUBLIK, pywebview masuk ke dalamnya
  tanpa henti -> 'maximum recursion depth exceeded' di thread UI ->
  jendela jadi "(Not Responding)".
  Karena itu SEMUA atribut objek diberi awalan '_' (diabaikan pywebview)
  dan kelas ini ditandai `_serializable = False` sebagai pengaman ganda.
"""
import ctypes
import json
import os
import sys
import threading
import time

from . import hid as hidmod
from . import engine as engine_mod
from .keycodes import KEYCODES, GROUP_ORDER

APP_NAME = "EWEADN GS02 Pro Control Hub"
APP_VERSION = "3.1.0"
# Repo GitHub untuk cek pembaruan (lihat Api.check_update).
GITHUB_REPO = "mimuruu/EWEADN-GS02-Pro-Control"
GITHUB_RELEASES_URL = "https://github.com/%s/releases" % GITHUB_REPO
UPDATE_API_URL = "https://api.github.com/repos/%s/releases/latest" % GITHUB_REPO

# --- Kontrol jendela borderless (Win32) ---
user32 = ctypes.windll.user32
dwmapi = ctypes.windll.dwmapi
WM_NCLBUTTONDOWN = 0x00A1
WM_NCHITTEST = 0x0084
HTCAPTION = 2
HTCLIENT = 1
SW_MINIMIZE = 6
SW_MAXIMIZE = 3
SW_RESTORE = 9
# Kode area resize non-client (tepi/sudut jendela)
HTLEFT, HTRIGHT, HTTOP, HTBOTTOM = 10, 11, 12, 15
HTTOPLEFT, HTTOPRIGHT, HTBOTTOMLEFT, HTBOTTOMRIGHT = 13, 14, 16, 17
EDGE_CODES = {
    "l": HTLEFT, "r": HTRIGHT, "t": HTTOP, "b": HTBOTTOM,
    "tl": HTTOPLEFT, "tr": HTTOPRIGHT, "bl": HTBOTTOMLEFT, "br": HTBOTTOMRIGHT,
}
GWLP_WNDPROC = -4
# Pesan untuk menghapus border non-client (WS_THICKFRAME) & tangani klik taskbar.
WM_NCCALCSIZE = 0x0083
WM_SYSCOMMAND = 0x0112
SC_MINIMIZE = 0xF020
SC_RESTORE = 0xF120
# Tipe callback WndProc (64-bit aman).
WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_longlong, ctypes.wintypes.HWND,
                             ctypes.c_uint, ctypes.c_ulonglong,
                             ctypes.c_longlong)


def _ver_tuple(v):
    """Ubah 'v3.1.0' / '3.1.0' -> (3,1,0) untuk membandingkan versi."""
    s = str(v).strip().lstrip("vV")
    out = []
    for part in s.split("."):
        num = ""
        for ch in part:
            if ch.isdigit():
                num += ch
            else:
                break
        out.append(int(num) if num else 0)
    return tuple(out) or (0,)


def base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


SETTINGS_FILE = os.path.join(base_dir(), "gs02_settings.json")

DEFAULT_MACRO_LIB = {
    "CS2_Fast_Smoke": [{"k": "d", "dt": 0, "vk": 0x34},
                       {"k": "u", "dt": 40, "vk": 0x34},
                       {"k": "d", "dt": 120, "vk": 0x01},
                       {"k": "u", "dt": 200, "vk": 0x01}],
    "Apex_Armor_Swap": [{"k": "d", "dt": 0, "vk": 0x32},
                        {"k": "u", "dt": 30, "vk": 0x32},
                        {"k": "d", "dt": 90, "vk": 0x33},
                        {"k": "u", "dt": 60, "vk": 0x33}],
    "Dota2_Combo_Invoker": [{"k": "d", "dt": 0, "vk": 0x51},
                            {"k": "u", "dt": 80, "vk": 0x51},
                            {"k": "d", "dt": 180, "vk": 0x57},
                            {"k": "u", "dt": 120, "vk": 0x57},
                            {"k": "d", "dt": 160, "vk": 0x45},
                            {"k": "u", "dt": 80, "vk": 0x45}],
}


def _key_label(key):
    sig = tuple(key)
    for k in KEYCODES:
        if (k[2], k[3], k[4], k[5]) == sig:
            return k[1], k[0].strip("[]")
    return "Kustom (%d,%d,%d,%d)" % sig, "Kustom"


class Api:
    # pywebview: jangan pernah telusuri atribut non-callable kelas ini.
    _serializable = False

    def __init__(self, window=None):
        # SEMUA atribut objek pakai awalan '_' (lihat catatan anti-hang).
        self._window = window
        self._mouse = hidmod.GS02()
        self._cfg = dict(hidmod.DEFAULT_CFG)
        self._keys = [list(k) for k in hidmod.DEFAULT_KEYS]
        self._macro_events = []
        self._macro_lib = {}
        self._macro_name = "CS2_Fast_Smoke"
        self._firekey = {"enabled": False, "trigger": ["mouse", "X2"],
                         "delay": 20, "times": 0}
        self._profile_name = "Esports-Default"
        self._macro_speed = 1.0
        self._macro_repeat = 1
        self._maximized = False
        self._restore_rect = None
        self._hid_lock = threading.RLock()
        self._events = []
        self._evlock = threading.Lock()
        self._fk_clicks = 0
        self._connected = False
        self._last_ping = 0.0
        self._load_settings()

        self._engine = engine_mod.InputEngine(
            on_toggle_record=self._hotkey_toggle_record,
            on_play=self._hotkey_play,
            on_firekey_state=lambda on: self._emit("firekey-state",
                                                   {"active": bool(on)}),
            on_fire_click=self._on_fire_click,
        )
        self._engine.set_firekey(self._firekey["enabled"],
                                 tuple(self._firekey["trigger"]),
                                 self._firekey["delay"], self._firekey["times"])
        self._engine.start()

    def set_window(self, window):
        """Dipanggil main.py setelah window dibuat (bukan atribut publik)."""
        self._window = window

    # ----------------------------------------------- kontrol jendela (native)
    # Jendela memakai title bar NATIVE Windows (frameless=False), jadi drag,
    # resize, Aero Snap, minimize/maximize/close, dan klik taskbar SEMUA
    # ditangani Windows sendiri. Method di bawah hanya untuk tombol window
    # custom di UI (opsional) dan cek status maximize.
    def _hwnd(self):
        try:
            h = self._window.native.Handle
            return h.ToInt32() if hasattr(h, "ToInt32") else int(h)
        except Exception:
            return None

    def win_minimize(self):
        try:
            hwnd = self._hwnd()
            if hwnd:
                self._run_on_ui(lambda: user32.ShowWindow(hwnd, SW_MINIMIZE))
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def win_toggle_maximize(self):
        """Maximize/restore NATIVE (Windows urus ukuran & taskbar)."""
        try:
            hwnd = self._hwnd()
            if not hwnd:
                return {"ok": False, "message": "HWND tidak tersedia"}
            if user32.IsZoomed(hwnd):
                self._run_on_ui(lambda: user32.ShowWindow(hwnd, SW_RESTORE))
                return {"ok": True, "maximized": False}
            self._run_on_ui(lambda: user32.ShowWindow(hwnd, SW_MAXIMIZE))
            return {"ok": True, "maximized": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def win_is_maximized(self):
        """Status maximize SINKRON dengan Windows (termasuk Aero Snap Win+Up)."""
        try:
            hwnd = self._hwnd()
            return {"maximized": bool(hwnd and user32.IsZoomed(hwnd))}
        except Exception:
            return {"maximized": False}

    def win_close(self):
        try:
            self._window.destroy()
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def _run_on_ui(self, fn):
        """Jalankan fn() di thread UI WinForms (kalau bisa), else langsung."""
        form = getattr(self._window, "native", None)
        if form is None:
            fn()
            return
        try:
            import clr  # noqa: F401  (pythonnet, dipakai pywebview WinForms)
            from System import Action
            form.BeginInvoke(Action(fn))
        except Exception:
            fn()

    # --------------------------------------------------------- event ke UI
    def _emit(self, event, payload):
        with self._evlock:
            self._events.append({"event": event, "data": payload})
            if len(self._events) > 500:
                self._events = self._events[-500:]

    def _on_fire_click(self):
        self._fk_clicks += 1
        if self._fk_clicks % 5 == 0:
            self._emit("firekey-clicks", {"clicks": self._fk_clicks})

    # --------------------------------------------------- hotkey F9/F10 (langsung)
    # PENTING: hotkey ditangani DI SINI (thread hook), bukan lewat UI. UI
    # hanya polling ~1x/detik, jadi kalau rekaman di-toggle oleh UI, F9 akan
    # terasa lambat dan aksi awal bisa hilang. Engine langsung mengubah state
    # lalu memberi tahu UI lewat antrian event.
    def _hotkey_toggle_record(self):
        if self._engine.recording:
            evs = self._engine.record_stop()
            self._macro_events = evs
            self._emit("record-stopped", {
                "count": len(evs),
                "events": self._fmt_events(evs),
                "duration": self._duration(evs),
            })
        else:
            self._engine.record_start()
            self._emit("record-started", {})

    def _hotkey_play(self):
        evs = self._engine.record_snapshot() or self._macro_events
        if not evs:
            self._emit("play-empty", {})
            return
        self._engine.play(evs, speed=self._macro_speed,
                          repeat=self._macro_repeat,
                          on_done=lambda: self._emit("play-done", {}))
        self._emit("play-started", {"count": len(evs)})

    def poll_events(self):
        """Dipanggil UI berkala; mengembalikan event engine terbaru.

        Sekaligus mengecek koneksi mouse secara BERKALA (di-throttle ~2 detik)
        supaya status "Terhubung/Terputus" di UI ikut berubah saat mouse
        dimatikan/dinyalakan — tanpa perlu polling HID berat tiap 1 detik.
        """
        with self._evlock:
            evs = self._events
            self._events = []
        out = {"events": evs, "recording": self._engine.recording,
               "fk_clicks": self._fk_clicks}
        if self._engine.recording:
            snap = self._engine.record_snapshot()
            out["events_snapshot"] = self._fmt_events(snap)
            out["count"] = len(snap)
            out["duration"] = self._duration(snap)
        # Cek status koneksi berkala (throttle 2 detik).
        now = time.time()
        if now - getattr(self, "_last_ping", 0.0) >= 2.0:
            self._last_ping = now
            out["conn"] = self._ping()
        return out

    def _ping(self):
        """Cek cepat apakah mouse masih terhubung (tanpa mengubah state).

        Kirim perintah baca-config; kalau tidak ada balasan -> terputus.
        Mengembalikan {connected, mode} seperlunya.
        """
        try:
            with self._hid_lock:
                if not self._mouse.connected:
                    try:
                        self._mouse.open()
                    except Exception:
                        # Device belum ada di sistem (mis. dongle baru dicolok,
                        # Windows belum selesai enumerate) -> coba lagi nanti.
                        self._connected = False
                        return {"connected": False}
                ok = self._mouse.is_alive()
                if not ok:
                    self._mouse.close()
                    self._connected = False
                    return {"connected": False}
                self._connected = True
                return {"connected": True, "mode": self._mouse.mode()}
        except Exception:
            try:
                self._mouse.close()
            except Exception:
                pass
            self._connected = False
            return {"connected": False}

    def ui_heartbeat(self, info):
        """UI melapor bahwa render pertama berhasil (bukti bukan layar abu-abu)."""
        try:
            base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
            p = os.path.join(base, "GS02Pro-Control", "app.log")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "a", encoding="utf-8") as f:
                f.write("%s  UI-READY %s\n" % (
                    time.strftime("%H:%M:%S"),
                    json.dumps(info, ensure_ascii=False)))
        except Exception:
            pass
        return {"ok": True}

    # ------------------------------------------------------------------ info
    def app_info(self):
        return {"name": APP_NAME, "version": APP_VERSION,
                "profile": self._profile_name}

    def check_update(self):
        """Cek versi terbaru di GitHub Releases (READ-ONLY, tanpa unduh/install).

        Aman dari sudut antivirus: hanya SATU permintaan HTTPS ke GitHub API
        dan TIDAK mengunduh/menjalankan apa pun — aplikasi hanya menampilkan
        notifikasi bila ada versi lebih baru. Pembaruan tetap diunduh & dipasang
        manual oleh pengguna (transparan).
        """
        result = {"ok": False, "current": APP_VERSION, "latest": None,
                  "update_available": False, "url": GITHUB_RELEASES_URL,
                  "name": None, "published": None}
        try:
            import urllib.request
            req = urllib.request.Request(
                UPDATE_API_URL,
                headers={"User-Agent": "EWEADN-GS02-Pro-Control/%s" % APP_VERSION,
                         "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8", "replace"))
            tag = str(data.get("tag_name") or "").strip()
            latest = tag.lstrip("vV")
            result["latest"] = latest or None
            result["name"] = data.get("name") or tag or None
            result["published"] = data.get("published_at") or None
            result["url"] = data.get("html_url") or GITHUB_RELEASES_URL
            result["ok"] = True
            result["update_available"] = bool(
                latest and _ver_tuple(latest) > _ver_tuple(APP_VERSION))
        except Exception as e:
            result["message"] = str(e)
        return result

    def open_url(self, url):
        """Buka URL di browser default (dipakai tombol 'Buka di GitHub')."""
        try:
            url = str(url)
            if not (url.startswith("http://") or url.startswith("https://")):
                return {"ok": False, "message": "URL tidak valid"}
            os.startfile(url)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def get_catalog(self):
        out = []
        for g, name, t, c1, c2, c3 in KEYCODES:
            out.append({"group": g.strip("[]"), "name": name, "type": t,
                        "c1": c1, "c2": c2, "c3": c3})
        return {"items": out, "groups": [g.strip("[]") for g in GROUP_ORDER]}

    def get_constants(self):
        return {
            "report_rates": [{"label": r[0], "value": r[1], "ms": r[2]}
                             for r in hidmod.REPORT_RATES],
            "light_modes": [{"label": m[0], "value": m[1]}
                            for m in hidmod.LIGHT_MODES],
            "dpi_min": hidmod.DPI_MIN, "dpi_max": hidmod.DPI_MAX,
            "dpi_colors": hidmod.DPI_COLORS,
            "dpi_color_names": hidmod.DPI_COLOR_NAMES,
            "triggers": [{"label": n, "value": list(v)}
                         for n, v in engine_mod.TRIGGER_CHOICES],
            # Indeks mengikuti SLOT FIRMWARE (0-based):
            #   0,1,2 = Kiri, Kanan, Tengah
            #   3 (slot 4) = samping BELAKANG
            #   4 (slot 5) = samping DEPAN
            # (slot 5 = tombol paling depan — dibuktikan baca tombol dari
            #  perangkat: slot 5 default = Maju/Forward.)
            "button_labels": ["Tombol Kiri", "Tombol Kanan", "Scroll (Tengah)",
                              "Samping Bawah (Belakang)", "Samping Atas (Depan)"],
            "hotkeys": {"record": "F9", "play": "F10"},
            "device": hidmod.DEVICE_SPECS,
            "dpi_presets": [{"value": p[0], "color": p[1], "name": p[2]}
                            for p in hidmod.DPI_PRESETS],
        }

    # --------------------------------------------------------------- koneksi
    def connect(self):
        try:
            return self.read_all()
        except Exception as e:
            return {"connected": False, "error": str(e),
                    "config": self._cfg, "keys": self._keys}

    def read_all(self):
        with self._hid_lock:
            try:
                if not self._mouse.connected:
                    self._mouse.open()
                self._cfg = self._mouse.read_config()
                self._keys = self._mouse.read_keys()
                # Baterai & versi firmware bersifat opsional: bila gagal
                # (mis. mouse baru bangun dari tidur), jangan sampai seluruh
                # pembacaan dianggap 'read error'.
                try:
                    batt, _ = self._mouse.read_battery()
                except Exception:
                    batt = None
                try:
                    fw = self._mouse.read_version()
                except Exception:
                    fw = ""
                return self._state(connected=True, battery=batt, firmware=fw)
            except Exception as e:
                return self._state(connected=False, error=str(e))

    def _state(self, connected=True, battery=None, firmware=None, error=None):
        keys = []
        for k in self._keys:
            label, group = _key_label(k)
            keys.append({"raw": list(k), "label": label, "group": group})
        return {
            "connected": connected,
            "mode": self._mouse.mode() if connected else "Tidak terhubung",
            "battery": battery, "firmware": firmware or "",
            "config": self._cfg, "keys": keys,
            "profile": self._profile_name,
            "firekey": self._firekey,
            "error": error,
        }

    # ------------------------------------------------------------------ tulis
    def apply_all(self, payload):
        """payload: {config:{...}, keys:[[t,c1,c2,c3] x5]}"""
        with self._hid_lock:
            try:
                if not self._mouse.connected:
                    self._mouse.open()
                cfg = dict(self._cfg)
                cfg.update(payload.get("config", {}))
                keys = payload.get("keys") or self._keys
                self._mouse.write_config(cfg)
                self._mouse.write_keys([list(k) for k in keys])
                self._cfg = cfg
                self._keys = [list(k) for k in keys]
                return {"ok": True, "message": "Tersimpan ke mouse \u2713"}
            except Exception as e:
                return {"ok": False, "message": str(e)}

    def reset_keys(self):
        with self._hid_lock:
            try:
                self._mouse.write_keys([list(k) for k in hidmod.DEFAULT_KEYS])
                self._keys = [list(k) for k in hidmod.DEFAULT_KEYS]
                return {"ok": True, "keys": self._keys,
                        "message": "Tombol default dipulihkan \u2713"}
            except Exception as e:
                return {"ok": False, "message": str(e)}

    # ------------------------------------------------------------------ makro
    def macro_start(self):
        self._engine.record_start()
        self._macro_events = []
        return {"recording": True}

    def macro_stop(self):
        evs = self._engine.record_stop()
        self._macro_events = evs
        return {"recording": False, "events": self._fmt_events(evs),
                "count": len(evs), "duration": self._duration(evs)}

    def macro_state(self):
        snap = self._engine.record_snapshot()
        return {"recording": self._engine.recording,
                "events": self._fmt_events(snap),
                "count": len(snap), "duration": self._duration(snap)}

    def macro_play(self, speed=1.0, repeat=1):
        self._macro_speed = float(speed) if speed else 1.0
        self._macro_repeat = max(1, int(repeat))
        evs = self._engine.record_snapshot() or self._macro_events
        if not evs:
            return {"ok": False, "message": "Belum ada aksi terekam."}
        self._engine.play(evs, speed=self._macro_speed,
                          repeat=self._macro_repeat,
                          on_done=lambda: self._emit("play-done", {}))
        return {"ok": True}

    def macro_clear(self):
        self._engine.record_start()
        self._engine.record_stop()
        self._macro_events = []
        return {"ok": True}

    def macro_delete_step(self, index):
        evs = list(self._engine.record_snapshot())
        if 0 <= index < len(evs):
            evs.pop(index)
        self._set_recording_events(evs)
        return {"ok": True, "events": self._fmt_events(evs),
                "duration": self._duration(evs)}

    def _set_recording_events(self, evs):
        with self._engine._lock:
            self._engine._rec_events = list(evs)
            self._engine._rec_last = time.perf_counter()

    def macro_save_file(self):
        path = self._dialog(save=True, filename="macro.json")
        if not path:
            return {"ok": False, "cancelled": True}
        evs = self._engine.record_snapshot() or self._macro_events
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"name": os.path.splitext(os.path.basename(path))[0],
                       "events": evs}, f, indent=1)
        return {"ok": True, "message": "Makro disimpan \u2713"}

    def macro_load_file(self):
        path = self._dialog(save=False)
        if not path:
            return {"ok": False, "cancelled": True}
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        evs = data.get("events", data if isinstance(data, list) else [])
        self._set_recording_events(evs)
        self._macro_events = evs
        return {"ok": True, "events": self._fmt_events(evs),
                "duration": self._duration(evs),
                "message": "Makro dimuat \u2713"}

    # pustaka makro (di PC)
    def macro_lib_list(self):
        items = []
        for name, evs in self._macro_lib.items():
            items.append({"name": name, "steps": len(evs),
                          "delay": self._duration(evs),
                          "active": name == self._macro_name})
        return {"items": items, "active": self._macro_name}

    def macro_lib_save(self, name):
        name = (name or "").strip() or "Makro %d" % (len(self._macro_lib) + 1)
        evs = self._engine.record_snapshot() or self._macro_events
        self._macro_lib[name] = evs
        self._macro_name = name
        self._save_settings()
        return {"ok": True, "message": "Makro '%s' disimpan ke pustaka" % name,
                "lib": self.macro_lib_list()}

    def macro_lib_load(self, name):
        evs = self._macro_lib.get(name)
        if evs is None:
            return {"ok": False, "message": "Makro tidak ditemukan."}
        self._macro_name = name
        self._set_recording_events(evs)
        self._macro_events = evs
        return {"ok": True, "events": self._fmt_events(evs),
                "duration": self._duration(evs),
                "lib": self.macro_lib_list(),
                "message": "Makro '%s' dimuat" % name}

    def macro_lib_delete(self, name):
        self._macro_lib.pop(name, None)
        self._save_settings()
        return {"ok": True, "lib": self.macro_lib_list()}

    def _fmt_events(self, evs):
        out = []
        for e in evs:
            k = e.get("k")
            if k == "d":
                out.append({"kind": "down", "label": "Key Down",
                            "detail": self._vk_name(e.get("vk")),
                            "dt": e.get("dt", 0)})
            elif k == "u":
                out.append({"kind": "up", "label": "Key Up",
                            "detail": self._vk_name(e.get("vk")),
                            "dt": e.get("dt", 0)})
            elif k == "md":
                out.append({"kind": "down", "label": "Mouse Down",
                            "detail": self._btn_name(e.get("btn")),
                            "dt": e.get("dt", 0)})
            elif k == "mu":
                out.append({"kind": "up", "label": "Mouse Up",
                            "detail": self._btn_name(e.get("btn")),
                            "dt": e.get("dt", 0)})
            elif k == "w":
                out.append({"kind": "wheel", "label": "Scroll",
                            "detail": "%+d" % e.get("d", 0),
                            "dt": e.get("dt", 0)})
        return out

    @staticmethod
    def _duration(evs):
        return sum(int(e.get("dt", 0)) for e in evs)

    @staticmethod
    def _btn_name(b):
        return {"L": "Klik Kiri", "R": "Klik Kanan", "M": "Klik Tengah",
                "X1": "Samping X1", "X2": "Samping X2"}.get(b, str(b))

    @staticmethod
    def _vk_name(vk):
        if vk is None:
            return "-"
        names = {0x01: "Mouse Kiri", 0x02: "Mouse Kanan", 0x04: "Mouse Tengah",
                 0x08: "Mouse X1", 0x10: "Mouse X2", 0x20: "Space",
                 0x0D: "Enter", 0x09: "Tab", 0x1B: "Esc"}
        if vk in names:
            return names[vk]
        if 0x30 <= vk <= 0x39:
            return chr(vk)
        if 0x41 <= vk <= 0x5A:
            return chr(vk)
        if 0x70 <= vk <= 0x7B:
            return "F%d" % (vk - 0x6F)
        return "VK_%02X" % vk

    # --------------------------------------------------------------- fire key
    def firekey_apply(self, enabled, trigger, delay, times):
        self._firekey = {"enabled": bool(enabled), "trigger": list(trigger),
                         "delay": int(delay), "times": int(times)}
        self._engine.set_firekey(self._firekey["enabled"],
                                 tuple(self._firekey["trigger"]),
                                 self._firekey["delay"], self._firekey["times"])
        self._save_settings()
        return {"ok": True, "message": "Fire Key diterapkan \u2713",
                "firekey": self._firekey}

    def firekey_status(self):
        return self._firekey

    def firekey_test(self):
        """Kirim 5 klik kiri cepat sebagai tes (tidak mengubah pengaturan)."""
        try:
            evs = [{"k": "md", "dt": 0, "btn": "L"},
                   {"k": "mu", "dt": 40, "btn": "L"}] * 5
            self._engine.play(evs, speed=1.0, repeat=1)
            return {"ok": True, "message": "Tes: 5 klik kiri terkirim"}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    # ---------------------------------------------------------------- profil
    def profile_save(self):
        path = self._dialog(save=True, filename="gs02_profile.json")
        if not path:
            return {"ok": False, "cancelled": True}
        data = {"config": self._cfg, "keys": self._keys,
                "macro": self._engine.record_snapshot() or self._macro_events,
                "firekey": self._firekey}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
        return {"ok": True, "message": "Profil disimpan \u2713"}

    def profile_load(self):
        path = self._dialog(save=False)
        if not path:
            return {"ok": False, "cancelled": True}
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if "config" in data:
            self._cfg.update(data["config"])
        if "keys" in data:
            self._keys = [list(k) for k in data["keys"]]
        if "macro" in data:
            self._macro_events = data["macro"]
            self._set_recording_events(self._macro_events)
        if "firekey" in data:
            fk = data["firekey"]
            self.firekey_apply(fk.get("enabled", False),
                               fk.get("trigger", ["mouse", "X2"]),
                               fk.get("delay", 20), fk.get("times", 0))
        return {"ok": True, "state": self._state(),
                "macro": self._fmt_events(self._macro_events),
                "message": "Profil dimuat \u2014 klik Terapkan Semua"}

    # ---------------------------------------------------------------- dialog
    def _dialog(self, save=False, filename=None):
        if not self._window:
            return None
        import webview
        try:
            if save:
                res = self._window.create_file_dialog(
                    webview.SAVE_DIALOG, save_filename=filename or "file.json")
                return res if isinstance(res, str) else (res[0] if res else None)
            res = self._window.create_file_dialog(
                webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("JSON (*.json)", "Semua file (*.*)"))
            return res[0] if res else None
        except Exception:
            return None

    # --------------------------------------------------------------- settings
    def _load_settings(self):
        self._macro_lib = dict(DEFAULT_MACRO_LIB)
        try:
            if os.path.exists(SETTINGS_FILE):
                with open(SETTINGS_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                self._macro_lib.update(data.get("macro_lib", {}))
                if data.get("firekey"):
                    self._firekey.update(data["firekey"])
                if data.get("profile"):
                    self._profile_name = data["profile"]
        except Exception:
            pass

    def _save_settings(self):
        try:
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump({"macro_lib": self._macro_lib,
                           "firekey": self._firekey,
                           "profile": self._profile_name}, f, indent=1)
        except Exception:
            pass

    def shutdown(self):
        try:
            self._save_settings()
        except Exception:
            pass
        try:
            self._engine.stop()
        except Exception:
            pass
        try:
            self._mouse.close()
        except Exception:
            pass
