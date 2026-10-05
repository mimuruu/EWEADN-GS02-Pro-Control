# -*- coding: utf-8 -*-
"""Engine input global untuk fitur Makro & Fire Key (host-side).

Merekam tombol keyboard/mouse lewat low-level Windows hooks
(WH_KEYBOARD_LL / WH_MOUSE_LL) dan memutarnya kembali memakai SendInput.

PENTING (performa):
  Hook mouse low-level dipanggil untuk SETIAP pergerakan mouse (sampai
  1000x/detik) dan menambah latensi -> mouse terasa "patah-patah". Karena itu
  hook TIDAK dipasang terus-menerus: hanya saat merekam makro atau saat Fire
  Key aktif (dan pemicunya tombol mouse/keyboard yang relevan), lalu dilepas.
  Saat aplikasi cuma terbuka (idle), TIDAK ada hook sama sekali.

Makro dijalankan di PC (host-side) karena hardware GS02 Pro hanya
mengekspos report ID 0xF0.
"""
import ctypes
import threading
import time
from ctypes import wintypes

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

ULONG_PTR = (ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8
             else ctypes.c_ulong)

WH_KEYBOARD_LL = 13
WH_MOUSE_LL = 14

WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
WM_MOUSEMOVE = 0x0200
WM_LBUTTONDOWN = 0x0201
WM_LBUTTONUP = 0x0202
WM_RBUTTONDOWN = 0x0204
WM_RBUTTONUP = 0x0205
WM_MBUTTONDOWN = 0x0207
WM_MBUTTONUP = 0x0208
WM_MOUSEWHEEL = 0x020A
WM_XBUTTONDOWN = 0x020B
WM_XBUTTONUP = 0x020C
WM_MOUSEHWHEEL = 0x020E

LLKHF_INJECTED = 0x00000010
LLMHF_INJECTED = 0x00000001
MAGIC = 0x1EAF0C0D  # penanda event buatan kita sendiri

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_XDOWN = 0x0080
MOUSEEVENTF_XUP = 0x0100
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
XBUTTON1 = 1
XBUTTON2 = 2

EXTENDED_VKS = {0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E,
                0x5B, 0x5C, 0x5D, 0x6F, 0x90, 0xA3, 0xA5}

WM_APP = 0x8000
MSG_SET_HOOKS = WM_APP + 1     # wparam=kbd(0/1), lparam=mouse(0/1)
PM_NOREMOVE = 0x0000

TRIGGER_CHOICES = [
    ("Mouse X1 (samping belakang)", ("mouse", "X1")),
    ("Mouse X2 (samping depan)", ("mouse", "X2")),
    ("Mouse Tengah", ("mouse", "M")),
    ("Mouse Kanan", ("mouse", "R")),
] + [("Tombol %s" % n, ("key", vk)) for n, vk in [
    ("F1", 0x70), ("F2", 0x71), ("F3", 0x72), ("F4", 0x73), ("F5", 0x74),
    ("F6", 0x75), ("F7", 0x76), ("F8", 0x77), ("F9", 0x78), ("F10", 0x79),
    ("F11", 0x7A), ("F12", 0x7B), ("Caps Lock", 0x14), ("Scroll Lock", 0x91),
    ("Tab", 0x09), ("Space", 0x20), ("Insert", 0x2D),
]]


# --------------------------------------------------------------------------
# SendInput structures
# --------------------------------------------------------------------------
class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ULONG_PTR)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD),
                ("wParamH", wintypes.WORD)]


class _INPUTunion(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", wintypes.DWORD), ("u", _INPUTunion)]


user32.SendInput.restype = wintypes.UINT
user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]


def _send(inp):
    return user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def send_key(vk, down):
    flags = 0
    if vk in EXTENDED_VKS:
        flags |= KEYEVENTF_EXTENDEDKEY
    if not down:
        flags |= KEYEVENTF_KEYUP
    inp = INPUT(type=INPUT_KEYBOARD)
    inp.ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=flags, time=0,
                        dwExtraInfo=MAGIC)
    _send(inp)


def _mouse(flags, data=0):
    inp = INPUT(type=INPUT_MOUSE)
    inp.mi = MOUSEINPUT(dx=0, dy=0, mouseData=data & 0xFFFFFFFF,
                        dwFlags=flags, time=0, dwExtraInfo=MAGIC)
    _send(inp)


def send_mouse_button(btn, down):
    m = {"L": (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
         "R": (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
         "M": (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP)}
    if btn in m:
        _mouse(m[btn][0 if down else 1])
    elif btn in ("X1", "X2"):
        data = XBUTTON1 if btn == "X1" else XBUTTON2
        _mouse(MOUSEEVENTF_XDOWN if down else MOUSEEVENTF_XUP, data)


def send_wheel(delta, horizontal=False):
    _mouse(MOUSEEVENTF_HWHEEL if horizontal else MOUSEEVENTF_WHEEL,
           delta & 0xFFFFFFFF)


# --------------------------------------------------------------------------
# Hook structures
# --------------------------------------------------------------------------
class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [("vkCode", wintypes.DWORD), ("scanCode", wintypes.DWORD),
                ("flags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ULONG_PTR)]


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class MSLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [("pt", POINT), ("mouseData", wintypes.DWORD),
                ("flags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ULONG_PTR)]


HOOKPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_int,
                              wintypes.WPARAM, wintypes.LPARAM)

user32.SetWindowsHookExW.restype = wintypes.HHOOK
user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC,
                                     wintypes.HINSTANCE, wintypes.DWORD]
user32.UnhookWindowsHookEx.argtypes = [wintypes.HHOOK]
user32.CallNextHookEx.restype = ctypes.c_ssize_t
user32.CallNextHookEx.argtypes = [wintypes.HHOOK, ctypes.c_int,
                                  wintypes.WPARAM, wintypes.LPARAM]
user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND,
                               wintypes.UINT, wintypes.UINT]
user32.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND,
                                wintypes.UINT, wintypes.UINT, wintypes.UINT]
user32.PeekMessageW.restype = wintypes.BOOL
user32.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT,
                                      wintypes.WPARAM, wintypes.LPARAM]
kernel32.GetCurrentThreadId.restype = wintypes.DWORD

WM_QUIT = 0x0012


class InputEngine:
    """Hook global + pemutar makro + fire key (semua di thread sendiri)."""

    def __init__(self, on_toggle_record=None, on_play=None,
                 on_firekey_state=None, on_fire_click=None):
        self.on_toggle_record = on_toggle_record
        self.on_play = on_play
        self.on_firekey_state = on_firekey_state
        self.on_fire_click = on_fire_click

        self._lock = threading.RLock()
        self._thread = None
        self._thread_id = None
        self._ready = threading.Event()
        self._hk_proc = None
        self._ms_proc = None
        self._hk = None
        self._ms = None
        self._kbd_wanted = False
        self._ms_wanted = False

        self.recording = False
        self._rec_events = []
        self._rec_last = 0.0

        self.hotkey_record = 0x78   # F9
        self.hotkey_play = 0x79     # F10
        self.hotkey_intercept = True
        self._hotkey_down = set()   # vk yang sedang ditahan (anti autorepeat)

        self.firekey_enabled = False
        self.firekey_trigger = ("mouse", "X2")
        self.firekey_delay = 30
        self.firekey_times = 0
        self._fk_thread = None
        self._fk_stop = threading.Event()

        self.last_error = None

    # -- lifecycle ---------------------------------------------------------
    def start(self):
        if self._thread and self._thread.is_alive():
            return True
        self._ready.clear()
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name="gs02-input-hook")
        self._thread.start()
        self._ready.wait(3.0)
        return self.last_error is None

    def stop(self):
        if self._thread_id:
            try:
                user32.PostThreadMessageW(self._thread_id, WM_QUIT, 0, 0)
            except Exception:
                pass
        if self._thread:
            self._thread.join(2.0)
        self._thread = None

    # -- hook kendali (dipasang sesuai kebutuhan saja) ---------------------
    def _want_hooks(self):
        # Keyboard hook SELALU aktif: murah (hanya bereaksi saat ada tombol
        # ditekan) dan wajib agar hotkey global F9 (rekam) / F10 (putar)
        # berfungsi walau jendela aplikasi tidak sedang difokuskan.
        # Mouse hook MAHAL (dipanggil tiap gerakan, sampai 1000x/detik), jadi
        # hanya dipasang saat merekam atau firekey memakai pemicu mouse.
        need_ms = self.recording or (
            self.firekey_enabled and self.firekey_trigger
            and self.firekey_trigger[0] == "mouse")
        self._set_wanted(True, need_ms)

    def _set_wanted(self, kbd, ms):
        if not self._thread_id:
            return
        if kbd == self._kbd_wanted and ms == self._ms_wanted:
            return
        self._kbd_wanted, self._ms_wanted = kbd, ms
        try:
            user32.PostThreadMessageW(self._thread_id, MSG_SET_HOOKS,
                                      int(bool(kbd)), int(bool(ms)))
        except Exception:
            pass

    def _apply_hooks(self, kbd, ms):
        if kbd and not self._hk:
            self._hk = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self._hk_proc,
                                                None, 0)
        elif not kbd and self._hk:
            try:
                user32.UnhookWindowsHookEx(self._hk)
            except Exception:
                pass
            self._hk = None
        if ms and not self._ms:
            self._ms = user32.SetWindowsHookExW(WH_MOUSE_LL, self._ms_proc,
                                                None, 0)
        elif not ms and self._ms:
            try:
                user32.UnhookWindowsHookEx(self._ms)
            except Exception:
                pass
            self._ms = None

    # -- recording ---------------------------------------------------------
    def record_start(self):
        with self._lock:
            self._rec_events = []
            self._rec_last = time.perf_counter()
            self.recording = True
        self._want_hooks()

    def record_stop(self):
        with self._lock:
            self.recording = False
            events = list(self._rec_events)
        self._want_hooks()
        return events

    def record_snapshot(self):
        with self._lock:
            return list(self._rec_events)

    # -- playback ----------------------------------------------------------
    def play(self, events, speed=1.0, repeat=1, on_done=None):
        def worker():
            try:
                for _ in range(max(1, int(repeat))):
                    self._play_once(events, speed)
            finally:
                if on_done:
                    on_done()
        threading.Thread(target=worker, daemon=True, name="gs02-play").start()

    def _play_once(self, events, speed):
        speed = speed if speed and speed > 0 else 1.0
        for ev in events:
            dt = ev.get("dt", 0) / 1000.0 / speed
            if dt > 0:
                time.sleep(dt)
            kind = ev.get("k")
            if kind == "d":
                send_key(ev["vk"], True)
            elif kind == "u":
                send_key(ev["vk"], False)
            elif kind == "md":
                send_mouse_button(ev["btn"], True)
            elif kind == "mu":
                send_mouse_button(ev["btn"], False)
            elif kind == "w":
                send_wheel(ev["d"])

    # -- fire key ----------------------------------------------------------
    def set_firekey(self, enabled, trigger, delay, times):
        with self._lock:
            self.firekey_enabled = bool(enabled)
            self.firekey_trigger = tuple(trigger)
            self.firekey_delay = max(5, int(delay))
            self.firekey_times = max(0, int(times))
        self._want_hooks()

    def _firekey_burst(self, times):
        def worker():
            n = times if times > 0 else 10 ** 9
            i = 0
            while i < n and not self._fk_stop.is_set():
                send_mouse_button("L", True)
                time.sleep(0.008)
                send_mouse_button("L", False)
                i += 1
                if self.on_fire_click:
                    try:
                        self.on_fire_click()
                    except Exception:
                        pass
                if self._fk_stop.wait(self.firekey_delay / 1000.0):
                    break
        self._fk_stop.clear()
        self._fk_thread = threading.Thread(target=worker, daemon=True,
                                           name="gs02-firekey")
        self._fk_thread.start()

    # -- hook thread -------------------------------------------------------
    def _run(self):
        try:
            self._hk_proc = HOOKPROC(self._kbd_cb)
            self._ms_proc = HOOKPROC(self._mouse_cb)
            self._thread_id = kernel32.GetCurrentThreadId()
            _m = wintypes.MSG()
            user32.PeekMessageW(ctypes.byref(_m), None, 0, 0, PM_NOREMOVE)
            # Pasang hook keyboard SEKARANG supaya hotkey F9/F10 langsung
            # berfungsi sejak aplikasi dibuka (tanpa perlu klik jendela dulu).
            self._apply_hooks(True, False)
            self._kbd_wanted = True
        except Exception as e:
            self.last_error = str(e)
            self._ready.set()
            return
        self._ready.set()

        msg = wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            if msg.message == MSG_SET_HOOKS:
                self._apply_hooks(bool(msg.wParam), bool(msg.lParam))
            else:
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        self._apply_hooks(False, False)

    def _kbd_cb(self, code, wparam, lparam):
        if code >= 0:
            try:
                kb = ctypes.cast(lparam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                if kb.dwExtraInfo != MAGIC and not (kb.flags & LLKHF_INJECTED):
                    down = wparam in (WM_KEYDOWN, WM_SYSKEYDOWN)
                    if self._on_key(kb.vkCode, down):
                        return 1
            except Exception:
                pass
        return user32.CallNextHookEx(self._hk, code, wparam, lparam)

    def _mouse_cb(self, code, wparam, lparam):
        # Lewati WM_MOUSEMOVE secepat mungkin (dipanggil tiap gerakan).
        if code >= 0 and wparam != WM_MOUSEMOVE:
            try:
                ms = ctypes.cast(lparam, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
                if ms.dwExtraInfo != MAGIC and not (ms.flags & LLMHF_INJECTED):
                    if self._on_mouse(wparam, ms):
                        return 1
            except Exception:
                pass
        return user32.CallNextHookEx(self._ms, code, wparam, lparam)

    def _on_key(self, vk, down):
        # Tombol hotkey (F9/F10) SELALU ditelan, baik saat ditekan maupun
        # dilepas, supaya:
        #   - F9 tidak ikut terekam sebagai aksi makro saat rekaman aktif;
        #   - tidak ada autorepeat F9 yang men-toggle berulang saat ditahan.
        if self.hotkey_intercept and self.hotkey_record \
                and vk == self.hotkey_record:
            if down and vk not in self._hotkey_down:
                self._hotkey_down.add(vk)
                if self.on_toggle_record:
                    self.on_toggle_record()
            elif not down:
                self._hotkey_down.discard(vk)
            return True
        if self.hotkey_intercept and self.hotkey_play \
                and vk == self.hotkey_play:
            if down and vk not in self._hotkey_down:
                self._hotkey_down.add(vk)
                if self.on_play:
                    self.on_play()
            elif not down:
                self._hotkey_down.discard(vk)
            return True
        if self.firekey_enabled and self.firekey_trigger[0] == "key" \
                and vk == self.firekey_trigger[1]:
            self._firekey_trigger(down)
            return False
        if self.recording:
            self._append(("d" if down else "u"), vk=vk)
        return False

    def _on_mouse(self, wparam, ms):
        btn = None
        down = None
        wheel = None
        if wparam == WM_LBUTTONDOWN:
            btn, down = "L", True
        elif wparam == WM_LBUTTONUP:
            btn, down = "L", False
        elif wparam == WM_RBUTTONDOWN:
            btn, down = "R", True
        elif wparam == WM_RBUTTONUP:
            btn, down = "R", False
        elif wparam == WM_MBUTTONDOWN:
            btn, down = "M", True
        elif wparam == WM_MBUTTONUP:
            btn, down = "M", False
        elif wparam in (WM_XBUTTONDOWN, WM_XBUTTONUP):
            hi = (ms.mouseData >> 16) & 0xFFFF
            btn = "X1" if hi == XBUTTON1 else "X2"
            down = wparam == WM_XBUTTONDOWN
        elif wparam == WM_MOUSEWHEEL:
            wheel = ctypes.c_short((ms.mouseData >> 16) & 0xFFFF).value
        elif wparam == WM_MOUSEHWHEEL:
            wheel = ctypes.c_short((ms.mouseData >> 16) & 0xFFFF).value

        if self.firekey_enabled and btn is not None:
            trig = self.firekey_trigger
            if trig[0] == "mouse" and btn == trig[1]:
                self._firekey_trigger(down)
                return False

        if self.recording:
            if btn is not None:
                self._append("md" if down else "mu", btn=btn)
            elif wheel is not None:
                self._append("w", d=wheel)
        return False

    def _firekey_trigger(self, down):
        if self.on_firekey_state:
            try:
                self.on_firekey_state(bool(down))
            except Exception:
                pass
        if down:
            self._firekey_burst(self.firekey_times)
        else:
            self._fk_stop.set()

    def _append(self, kind, **kw):
        now = time.perf_counter()
        dt = int((now - self._rec_last) * 1000)
        self._rec_last = now
        ev = {"k": kind, "dt": dt}
        ev.update(kw)
        with self._lock:
            self._rec_events.append(ev)
            if len(self._rec_events) > 20000:
                self._rec_events = self._rec_events[-20000:]
