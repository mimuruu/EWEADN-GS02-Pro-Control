# EWEADN GS02 Pro Control Hub

A Windows control panel / driver for the **EWEADN GS02 Pro** gaming mouse —
fully offline, no official software required. Built with Python +
[pywebview](https://pywebview.flowrl.com/) (HTML/CSS/JS UI) and talks to the
mouse directly over the HID **Report ID `0xF0`** protocol.

> A native desktop replacement for EWEADN's web-based driver: lightweight, fast,
> and needs no internet connection.

## ⬇️ Download

**[Download GS02Pro-Control.exe (v3.0.0)](https://github.com/mimuruu/EWEADN-GS02-Pro-Control/releases/latest/download/GS02Pro-Control.exe)**
— standalone, no Python install required. Requires 64-bit Windows 10/11.

See all versions on the [**Releases**](https://github.com/mimuruu/EWEADN-GS02-Pro-Control/releases) page.

---

## ✨ Features

| Page | What it does |
|---|---|
| **DPI** | 6 sensitivity stages (200 – 24,000 DPI), X/Y independent, lift-off distance |
| **Key Remapping** | Remap all 5 buttons (left / right / middle / 2 side) |
| **Performance** | Polling rate (125/250/500/1000 Hz), debounce, sleep light |
| **Lighting** | 7 built-in lighting effects |
| **Macro** | Record & play macros (global hotkeys: **F9** record, **F10** play) |
| **Fire Key** | Automatic rapid-clicking while the trigger button is held |

- 🎨 Dark UI with an orange accent (`#ff5019`) and smooth fade animations.
- 🪟 **Borderless** window — drag from the title area, double-click to maximize.
- ⌨️ **Global F9/F10 hotkeys** — work even when the window isn't focused.
- 🔋 Battery and firmware status read straight from the device.
- 🖥️ Maximize uses the **work area** so the taskbar stays visible.

---

## 📋 Device Specifications (EWEADN GS02 Pro)

| | |
|---|---|
| Sensor | PixArt PAW3311 (optical gaming) |
| DPI | 200 – 24,000 DPI |
| DPI presets | 400 / 800 / 1200 / 1600 / 2400 / 3200 |
| Polling rate | 125 / 250 / 500 / 1000 Hz (1K receiver) |
| Tracking speed | 300 IPS |
| Acceleration | 35 G |
| Weight | 65 g |
| Dimensions | 118 × 67 × 41 mm |
| Battery | 3.7 V 500 mAh (NTC), up to ~120 h |
| Main switches | Huano 20 million clicks |
| Middle/side switches | Huano 3 million clicks |
| Encoder | FSWITCH 30,000 cycles |
| Connectivity | Tri-mode (Type-C / 2.4G / Bluetooth) |
| Coating | Nano-Skin sweat-resistant |
| Feet (skates) | Pure PTFE |
| Official driver | <https://eweadn1.yjx2012.com/> |

---

## 🚀 Usage

1. Connect the mouse via Type-C cable or the 2.4G dongle.
   *(Bluetooth mode is not supported by this driver's protocol.)*
2. Run **`GS02Pro-Control.exe`** (or `Jalankan.bat`).
3. Configure through the 6 pages listed above.
4. Click **"Apply All"** to save to the mouse's memory.

---

## 🛠️ Run from Source

```bash
pip install -r requirements.txt
python main.py
```

Requires Python 3.10+ on Windows.

### Rebuild the `.exe`

```bash
pip install pyinstaller
python -m PyInstaller --clean --noconfirm GS02Pro-Control.spec
copy dist\GS02Pro-Control.exe .
```

App log: `%LOCALAPPDATA%\GS02Pro-Control\app.log`

---

## ⚠️ Important Notes

- The GS02 Pro only exposes **Report ID `0xF0`**, which means:
  - **Macros cannot be stored on the mouse chip** → they run on the PC (host-side).
  - **Fire Key** also runs on the PC.
  - Macros and Fire Key keep working as long as the app is open.
- The mouse only has **7 built-in lighting effects** (no solid color support).
- The app uses a **native Windows window** (title bar, minimize / maximize /
  close, drag, resize, Aero Snap, taskbar click) — everything is handled by
  Windows, so it behaves like any normal desktop app.
- All UI animations are **simple, standard fade in / fade out** (no sliding or
  scaling), consistent with typical desktop apps.
- An **About** button in the top bar shows the version, author and license.
- The app icon and in-app logo use the **EWEADN triangle mark**.

---

## ❓ FAQ

**Q: Why are my side buttons set to Volume +/−?**
A: That's the GS02 Pro factory default. If you previously changed them in the
official web driver, those settings are stored in the mouse's memory and read
back by this app. Change them again on the **Key Remapping** page (there are
"Side = Forward / Back" and "Disable Side Buttons" presets), then click
**Apply All**.

**Q: Is the battery reading accurate?**
A: Yes. The app reads the battery register directly from the mouse (`0x30`
command), the same way EWEADN's official driver does. While charging, the value
may stay pinned at 100% even before it's full; it drops with usage once unplugged.

**Q: How do I use Fire Key?**
A: Open the **Fire Key** page → toggle it on → pick a Trigger Button (e.g. Side
X2) → set Delay & Click Count → click **Apply Fire Key**. Then **hold** the
trigger button: the mouse auto-clicks left repeatedly. There's a **Test Now**
button to try it without touching the mouse.

**Q: Does this driver work over cable or Bluetooth?**
A: **Cable** (VID `0xA8A4`) & **2.4G** (VID `0xA8A5`): yes. **Bluetooth**: no,
because in Bluetooth mode the mouse doesn't expose the vendor interface
(`0xFF01`) this driver uses. Use a cable or the 2.4G dongle to change settings.

**Q: If my friend uses a different mouse, will it still connect?**
A: For other EWEADN mice using the same protocol (VID `0xA8A4` / `0xA8A5`),
most likely yes. For other brands, no. Some GS02 Pro-specific features (e.g. the
number of lighting effects) may differ between models.

**Q: Can the lighting be set to a single solid color?**
A: No. The GS02 Pro only has 7 built-in effects and doesn't store RGB color
codes in its firmware (only a 1-byte mode, with no color field). For a near-static
single-color look, use the "Breathing" or "Blink" effect.

**Q: Mouse not detected / settings not saving?**
A: Make sure the cable/2.4G dongle is connected, then click **Reload**. Settings
are only saved after you click **Apply All**. The mouse "sleeps" after 10 seconds
of inactivity (normal) — move it to wake it up.

**Q: Windows Defender / antivirus flags the .exe as a virus — is it safe?**
A: **Yes, it's a false positive.** The app is open source — you can read every
line in this repo and even build the `.exe` yourself. It gets flagged because:

1. The app legitimately uses a **global keyboard hook** (`SetWindowsHookEx`) and
   **`SendInput`** to implement **Macros** and **Fire Key**. That combination is
   the same pattern keyloggers use, so heuristic scanners flag it — even though
   here it only replays *your own* recorded macros.
2. The `.exe` is **not code-signed** (a certificate costs money), so Windows
   SmartScreen shows "Windows protected your PC" for any new unsigned download.
3. PyInstaller bootloaders are common in both legitimate apps and malware, so
   they start with low reputation until many people download the file.

**How to run it anyway:**
- If SmartScreen shows *"Windows protected your PC"* → click **More info** →
  **Run anyway**.
- If Defender quarantines it → **Windows Security → Protection history** → find
  the item → **Actions → Allow on device** (or **Restore**).
- **Verify the file first:** compare the SHA-256 of your download with the value
  published in the release notes:
  ```powershell
  Get-FileHash .\GS02Pro-Control.exe -Algorithm SHA256
  ```

**Report the false positive to Microsoft** (helps everyone, takes ~2 minutes):
1. Go to <https://www.microsoft.com/en-us/wdsi/filesubmission>.
2. Choose **"Software developer"** → **"Incorrectly detected as malware"**.
3. Upload `GS02Pro-Control.exe` (or paste its SHA-256) and submit.

---

## 🧱 Project Structure

```
GS02Pro-Control/
├── main.py                 # application entry point
├── backend/
│   ├── hid.py              # HID Report ID 0xF0 protocol
│   ├── engine.py           # macro & fire key (input hook, lazy)
│   ├── api.py              # JS <-> Python bridge (pywebview)
│   └── keycodes.py         # 173 keycode mappings
├── web/                    # UI (HTML/CSS/JS)
│   ├── index.html
│   ├── css/app.css
│   ├── js/app.js
│   ├── js/icons.js
│   └── fonts/fonts.css
├── icon.ico
├── version_info.txt        # EXE version metadata (ProductName, version, ...)
├── GS02Pro-Control.spec    # PyInstaller configuration
├── Jalankan.bat            # launcher (exe / python)
└── requirements.txt
```

---

## 🔧 Technical Notes

- **HID protocol**: Report ID `0xF0`, 63-byte payload.
  - Read config: `[14,165,11,46,1,1,1,0,0]`
  - Write config: `[15,174,10,47,...]`
  - Read battery: `[48,165,11,46,1,1,1,0,0]` (`0x30` command)
  - Read buttons: `[8,165,11,44,0,0,0,0,0]`
- **VID/PID**: `0xA8A4` (cable) / `0xA8A5` (2.4G), PID `0x2255`,
  usage page `0xFF01`.
- **Anti-hang**: every object attribute on the `Api` class is prefixed with `_`
  so pywebview doesn't recursively scan public attributes
  (`maximum recursion depth exceeded` → "Not Responding" window).
- **UI is served over local HTTP** (`http_server=True`) to avoid the WebView2
  grey-screen issue.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.

> This project is not affiliated with EWEADN. The product name is used only to
> describe hardware compatibility.
