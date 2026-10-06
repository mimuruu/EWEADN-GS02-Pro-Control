# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec untuk EWEADN GS02 Pro Control Hub.

Build:  python -m PyInstaller --clean --noconfirm GS02Pro-Control.spec
Hasil:  dist/GS02Pro-Control.exe  (salin ke folder root project)
"""
import os
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

hidden = (collect_submodules("webview") + collect_submodules("hid") +
          ["backend", "backend.api", "backend.engine", "backend.hid",
           "backend.keycodes"])

datas = [
    ("web/index.html", "web"),
    ("web/css/app.css", "web/css"),
    ("web/js/app.js", "web/js"),
    ("web/js/icons.js", "web/js"),
    ("web/fonts/fonts.css", "web/fonts"),
    ("web/favicon.png", "web"),
    ("web/logo.png", "web"),
    ("web/logo_128.png", "web"),
    ("icon.ico", "."),
]

a = Analysis(
    ["main.py"],
    pathex=[os.path.abspath(".")],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "PIL", "PyQt5", "PySide2"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name="GS02Pro-Control",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="icon.ico",
)
