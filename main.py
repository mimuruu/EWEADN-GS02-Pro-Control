# -*- coding: utf-8 -*-
"""EWEADN GS02 Pro Control Hub

Aplikasi desktop untuk mengatur mouse EWEADN GS02 Pro (tanpa software resmi).

Arsitektur:
  main.py            - titik masuk; jendela NATIVE (frameless=False) sehingga
                       Windows mengurus title bar, drag, resize, Aero Snap,
                       minimize/maximize/close, dan klik taskbar sendiri.
  backend/hid.py     - protokol HID Report ID 0xF0
  backend/engine.py  - makro & fire key (hook input, lazy)
  backend/api.py     - jembatan JS <-> Python (dipanggil pywebview di thread
                       terpisah, jadi TIDAK memblokir UI)
  web/               - UI (HTML/CSS/JS)

Jalankan:  python main.py
"""
import ctypes
import os
import sys
import time
import traceback

import webview

from backend.api import Api

kernel32 = ctypes.windll.kernel32
user32 = ctypes.windll.user32
ERROR_ALREADY_EXISTS = 183
MUTEX_NAME = "Local\\EWEADN_GS02_Pro_ControlHub_v2"
_mutex_handle = None


def resource_path(*parts):
    """Lokasi file web/ baik sebagai skrip maupun .exe (PyInstaller)."""
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)


def data_dir(*parts):
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "GS02Pro-Control", *parts)
    os.makedirs(d, exist_ok=True)
    return d


def log(msg):
    try:
        with open(os.path.join(data_dir(), "app.log"), "a",
                  encoding="utf-8") as f:
            f.write("%s  %s\n" % (time.strftime("%H:%M:%S"), msg))
    except Exception:
        pass


def already_running():
    """Cegah dua instance (WebView2 tidak bisa pakai folder data yang sama
    dua kali -> jendela kedua tampil abu-abu)."""
    global _mutex_handle
    _mutex_handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    return kernel32.GetLastError() == ERROR_ALREADY_EXISTS


def notify_already_running():
    try:
        user32.MessageBoxW(
            None,
            "EWEADN GS02 Pro Control Hub sudah berjalan.\n\n"
            "Cek taskbar / Alt+Tab. Kalau tidak terlihat, tunggu beberapa "
            "detik atau tutup lewat Task Manager lalu buka lagi.",
            "EWEADN GS02 Pro", 0x40)
    except Exception:
        pass


def main():
    log("-" * 50)
    log("start (pid %d)" % os.getpid())

    if already_running():
        log("instance lain sudah berjalan -> keluar")
        notify_already_running()
        return

    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    api = Api()
    window = webview.create_window(
        "EWEADN GS02 Pro Control Hub",
        resource_path("web", "index.html"),
        js_api=api,
        width=1120, height=840,
        min_size=(960, 640),
        background_color="#0d131f",
        # Jendela NATIVE (frameless=False): Windows mengurus title bar, drag,
        # resize, Aero Snap, minimize/maximize/close, dan klik taskbar sendiri —
        # paling stabil, tanpa hack Win32. Tombol window custom di UI
        # disembunyikan (lihat app.css/js) karena sudah ada title bar native.
        frameless=False,
        easy_drag=False,
    )
    api.set_window(window)
    window.events.closed += lambda: api.shutdown()

    try:
        webview.start(debug=False, private_mode=True, http_server=True)
    except Exception:
        log("FATAL:\n" + traceback.format_exc())
        raise
    finally:
        try:
            api.shutdown()
        except Exception:
            pass
        log("stop")


if __name__ == "__main__":
    main()
