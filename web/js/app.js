/* ==========================================================================
   EWEADN GS02 Pro Control Hub — aplikasi UI
   ==========================================================================
   Prinsip:
   1) UI langsung digambar dengan nilai default (SINKRON) -> window tidak
      pernah kosong walau backend lambat.
   2) Data live dimuat async dengan timeout per panggilan.
   3) Jendela pakai title bar NATIVE (Windows), jadi tidak ada tombol window
      atau drag manual di sini.
   ========================================================================== */
const API = () => window.pywebview.api;
window.__APPJS_LOADED = true;

/* Laporkan error JS ke log Python supaya bisa didiagnosis. */
function _report(kind, detail) {
  try {
    const a = window.pywebview && window.pywebview.api;
    if (a && typeof a.ui_heartbeat === "function") {
      a.ui_heartbeat({ jsError: kind, detail: String(detail).slice(0, 400) });
    }
  } catch (_) { }
}
window.addEventListener("error", e =>
  _report("window.onerror", (e.message || "") + " @line " + (e.lineno || "?")));
window.addEventListener("unhandledrejection", e =>
  _report("unhandledrejection", (e.reason && e.reason.message) || e.reason));

const state = {
  ready: false,
  connected: false,
  mode: "-",
  battery: null,
  firmware: "",
  profile: "Esports-Default",
  cfg: {},
  keys: [],
  constants: {},
  catalog: { items: [], groups: [] },
  macro: { events: [], count: 0, duration: 0, recording: false },
  macroLib: { items: [], active: null },
  firekey: { enabled: false, trigger: ["mouse", "X2"], delay: 20, times: 0 },
  page: "dpi",
  editDpi: [400, 800, 1200, 1600, 2400, 3200],
  editActive: 1, editCount: 6,
  editRR: 3, editLod: 1, editKeyResp: 8, editSleep: 10,
  editSensor: 0, editHigh: 0, editLight: 0, editMove: 0,
  editKeys: [],
  macroSpeed: 1.0, macroRepeat: 1,
  fkEdit: { enabled: false, trigger: ["mouse", "X2"], delay: 20, times: 0 },
  fkClicks: 0,
  maximized: false,
};

/* ------------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, kind = "ok") {
  const wrap = $("#toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = icon(kind === "err" ? "info" : "checkCircle") + `<span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0"; el.style.transition = "all .3s";
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

function setStatus(text, kind = "") {
  const el = $("#status");
  if (!el) return;
  el.className = "status " + kind;
  el.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>`;
}

const PAGES = [
  { key: "dpi", label: "DPI", icon: "dpi", crumb: "KONFIGURASI SENSOR / PROFIL ESPORTS", title: "DPI Calibration", sub: "Sesuaikan sensitivitas sensor optik dan konfigurasi level DPI mouse" },
  { key: "remap", label: "Key Remapping", icon: "remap", crumb: "HARDWARE MAPPING / GS02 PRO", title: "Key Remapping", sub: "Konfigurasi fungsi tombol fisik pada mouse EWEADN GS02 Pro" },
  { key: "performance", label: "Performance", icon: "performance", crumb: "SENSOR / PAW3311 ULTRA", title: "Performance", sub: "Optimasi respon sensor, laju polling USB, dan parameter latensi" },
  { key: "lampu", label: "Lampu", icon: "lampu", crumb: "MODUL PENCAHAYAAN / LED ENGINE", title: "Lampu", sub: "Kustomisasi pola pencahayaan LED dan manajemen daya lampu mouse" },
  { key: "makro", label: "Makro", icon: "makro", crumb: "MAKRO ENGINE (HOST-SIDE / PC)", title: "Makro", sub: "Perekam dan pengelola skrip otomatisasi tombol gaming ultra-low latency" },
  { key: "firekey", label: "Fire Key", icon: "firekey", crumb: "FIRE KEY / MODUL TEMBAK CEPAT", title: "Fire Key", sub: "Konfigurasi otomatisasi klik beruntun (rapid click) untuk gaming kompetitif" },
];

/* ------------------------------------------------------------------- render */
function renderTopbar() {
  const batt = state.battery == null ? "—" : state.battery + "%";
  const conn = state.connected;
  $("#topbar").innerHTML = `
    <div class="brand">
      <div class="logo"><img src="logo.png" alt="EWEADN" width="32" height="32"></div>
      <div class="brand-text">
        <div class="t1">EWEADN GS02 Pro</div>
        <div class="t2">Driver Kontrol Mouse Gaming Offline</div>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="statusbar-chips">
      <span class="chip ${conn ? "ok" : "err"}">${icon("wifi")}<span>${esc(conn ? state.mode : "Terputus")}</span></span>
      <span class="chip">${icon("battery")}<span>Baterai: <strong>${batt}</strong></span></span>
      <span class="chip"><span class="mono">FW: ${esc(state.firmware || "—")}</span></span>
      <button class="chip chip-btn" title="Tentang aplikasi" onclick="openAbout()">${icon("info")}<span>About</span></button>
    </div>`;
}

function renderSidebar() {
  const items = PAGES.map(p => `
    <div class="nav-item ${state.page === p.key ? "active" : ""}" onclick="go('${p.key}')">
      ${icon(p.icon)}<span>${p.label}</span>
      ${p.key === "makro" ? '<span class="kbd">F9/F10</span>' : ""}
    </div>`).join("");
  const conn = state.connected;
  $("#sidebar").innerHTML = `
    <div class="nav-label">Navigasi Perangkat</div>
    <div class="nav">${items}</div>
    <div class="side-foot">
      <div class="profile-card">
        <div class="plabel">Profil Aktif</div>
        <div class="pname">${icon("layers")}<span>${esc(state.profile)}</span></div>
        <div class="conn-line">
          <span class="dot" style="background:${conn ? "var(--ok)" : "var(--err)"};box-shadow:0 0 8px ${conn ? "var(--ok)" : "var(--err)"}"></span>
          <span>${conn ? "Terhubung — siap" : "Tidak terhubung"}</span>
        </div>
      </div>
    </div>`;
}

function renderBottombar() {
  $("#bottombar").innerHTML = `
    <div id="status" class="status"><span class="dot"></span><span>${state.connected ? "Terhubung — siap" : "Menunggu perangkat"}</span></div>
    <div class="spacer"></div>
    <div class="actions">
      <button class="btn ghost" onclick="saveProfile()">${icon("save")}Simpan Profil</button>
      <button class="btn ghost" onclick="loadProfile()">${icon("folder")}Muat Profil</button>
      <button class="btn ghost" onclick="reloadAll()">${icon("refresh")}Muat Ulang</button>
      <button class="btn primary" onclick="applyAll()">${icon("check")}Terapkan Semua</button>
    </div>`;
}

function renderPage() {
  const p = PAGES.find(x => x.key === state.page);
  $("#page-head").innerHTML = `
    <div>
      <div class="crumbs">${esc(p.crumb)}</div>
      <h1>${esc(p.title)}</h1>
      <div class="sub">${esc(p.sub)}</div>
    </div>
    <div class="head-right">${pageHeadRight()}</div>`;
  $("#content").innerHTML = ({
    dpi: pageDpi, remap: pageRemap, performance: pagePerformance,
    lampu: pageLampu, makro: pageMakro, firekey: pageFireKey,
  })[state.page]();
  if (state.page === "dpi") bindDpi();
  if (state.page === "makro") { renderMacroList(); renderMacroLib(); }
}

/* Jalankan animasi masuk (fade + stagger) saat GANTI tab.
   Class DILEPAS setelah animasi selesai supaya re-render berkala (polling)
   tidak memicu animasi ulang (penyebab efek "mental-mental"). */
function animatePageIn() {
  const c = $("#content"), h = $("#page-head");
  if (!c) return;
  [c, h].forEach(el => { if (el) el.classList.remove("anim-page", "anim-head"); });
  void (c && c.offsetWidth);  // paksa reflow agar animasi diputar ulang
  if (c) c.classList.add("anim-page");
  if (h) h.classList.add("anim-head");
  clearTimeout(window.__animTimer);
  window.__animTimer = setTimeout(() => {
    if (c) c.classList.remove("anim-page");
    if (h) h.classList.remove("anim-head");
  }, 520);
}

function pageHeadRight() {
  if (state.page === "dpi") return `<span class="pill">${icon("cpu")}<span class="dot"></span>PAW3311 Engine Ready</span>`;
  if (state.page === "remap") return `<span class="pill">${icon("activity")}<span>Polling: 1000Hz</span></span>`;
  if (state.page === "performance") return `<span class="pill">${icon("bolt")}<span>Latensi Input: 1.0 ms</span></span>`;
  if (state.page === "lampu") return `<span class="pill">${icon("palette")}<span class="dot"></span>Status LED: Aktif</span>`;
  if (state.page === "makro") return `<span class="pill">${icon("zap")}<span>Hook Driver Aktif</span></span>`;
  if (state.page === "firekey") return `<span class="pill">${icon("crosshair")}<span>Anti-Ghosting: HW Level-0</span></span>`;
  return "";
}

/* ------------------------------------------------------------------ DPI page */
function pageDpi() {
  const c = state.constants;
  const colors = c.dpi_colors || [], names = c.dpi_color_names || [];
  const rows = state.editDpi.map((v, i) => `
    <tr class="${i === state.editActive ? "sel" : ""}">
      <td><span class="radio ${i === state.editActive ? "on" : ""}" onclick="pickStage(${i})"></span></td>
      <td><span class="stage-tag ${i === state.editActive ? "on" : ""}">Stage ${i + 1}</span></td>
      <td>
        <div class="stepper">
          <button onclick="dpiStep(${i},-50)">−</button>
          <input class="val" id="dpiv${i}" type="number" inputmode="numeric"
                 min="${c.dpi_min || 200}" max="${c.dpi_max || 24000}" step="50"
                 value="${v}" onchange="dpiType(${i}, this)" onkeydown="dpiKey(event, ${i}, this)">
          <button onclick="dpiStep(${i},50)">+</button>
        </div>
      </td>
      <td><span class="color-ind"><span class="cd" style="background:${colors[i] || "#888"}"></span>${esc(names[i] || "")}${i === state.editActive ? " (Aktif)" : ""}</span></td>
    </tr>`).join("");
  const dmin = c.dpi_min || 200, dmax = c.dpi_max || 24000;
  return `
  <div class="grid cols-2">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-head">
          <div class="ci">${icon("dpi")}</div>
          <div class="ct"><div class="h">DPI Stages</div><div class="s">Konfigurasi 6 level sensitivitas sensor</div></div>
          <div class="cr"><span class="pill"><span class="dot"></span>Aktif: Stage ${state.editActive + 1}</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Aktif</th><th>Stage</th><th>Nilai DPI</th><th>Indikator Warna</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("sliders")}</div><div class="ct"><div class="h">Atur Stage Aktif</div><div class="s">Stage ${state.editActive + 1} dari 6</div></div></div>
        <div style="display:flex;justify-content:center;margin-bottom:10px">
          <input class="dpi-big-input" id="dpiBig" type="number" inputmode="numeric"
                 min="${dmin}" max="${dmax}" step="50" value="${state.editDpi[state.editActive]}"
                 onchange="dpiType(${state.editActive}, this, true)" onkeydown="dpiKey(event, ${state.editActive}, this, true)">
        </div>
        <input type="range" class="slider" id="dpiSlider" min="${dmin}" max="${dmax}" step="50" value="${state.editDpi[state.editActive]}">
        <div class="flex" style="justify-content:space-between;font-size:11px;color:var(--muted);font-family:var(--mono)">
          <span>${dmin} DPI</span><span>${dmax} DPI</span>
        </div>
      </div>
      <div class="row-cards">
        <div class="stat-card"><div class="st-label">${icon("move")}X/Y Independent</div><div class="st-value">Terkunci (1:1)</div><div class="st-sub">Rasio gerak seragam</div></div>
        <div class="stat-card"><div class="st-label">${icon("target")}Lift-off Distance</div><div class="st-value">${["0.7", "1.0", "2.0"][state.editLod] || "1.0"} mm</div><div class="st-sub">${["Sangat Rendah", "Rendah", "Tinggi"][state.editLod] || "Rendah"}</div></div>
        <div class="stat-card"><div class="st-label">${icon("clock")}Debounce Time</div><div class="st-value">${state.editKeyResp} ms</div><div class="st-sub">${state.editKeyResp <= 4 ? "Ultra Fast" : "Stabil"}</div></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-head"><div class="ci">${icon("cpu")}</div><div class="ct"><div class="h">Spesifikasi Sensor</div><div class="s">Optical engine gaming</div></div><div class="cr"><span class="mono muted" style="font-size:10px">PIXART PAW3311</span></div></div>
        <div class="spec-grid">
          <div class="sg"><div class="l">Sensor Model</div><div class="v">PixArt PAW3311</div></div>
          <div class="sg"><div class="l">DPI Maksimal</div><div class="v accent">24.000 DPI</div></div>
          <div class="sg"><div class="l">Kecepatan Tracking</div><div class="v">300 IPS</div></div>
          <div class="sg"><div class="l">Akselerasi Maks</div><div class="v">35 G</div></div>
          <div class="sg"><div class="l">Berat</div><div class="v">65 gram</div></div>
          <div class="sg"><div class="l">Tingkat Polling</div><div class="v">1000 Hz / 1,0 ms</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("layers")}</div><div class="ct"><div class="h">Jumlah Stage Aktif</div><div class="s">Hingga 6 stage dialihkan via tombol DPI fisik</div></div></div>
        <div class="flex" style="justify-content:space-between">
          <span class="muted" style="font-size:12px">Stage yang dipakai</span>
          <div class="stepper"><button onclick="countStep(-1)">−</button><span class="val" id="cntVal">${state.editCount}</span><button onclick="countStep(1)">+</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("info")}</div><div class="ct"><div class="h">Panduan Kalibrasi</div></div></div>
        <div class="hint">${icon("info")}<div>Penyetelan resolusi DPI yang tepat meningkatkan akurasi bidikan refleks mikro pada panel 144Hz–360Hz. Gunakan tahapan <strong>800–1600 DPI</strong> untuk stabilitas tracking kompetitif.</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("mouse")}</div><div class="ct"><div class="h">Spesifikasi Perangkat</div><div class="s">EWEADN GS02 Pro</div></div></div>
        <div class="spec-grid">
          <div class="sg"><div class="l">Sensor</div><div class="v">PixArt PAW3311</div></div>
          <div class="sg"><div class="l">Konektivitas</div><div class="v">Tri-mode (Kabel / 2.4G / BT)</div></div>
          <div class="sg"><div class="l">Baterai</div><div class="v">500 mAh (s/d 120 jam)</div></div>
          <div class="sg"><div class="l">Switch L/R</div><div class="v">Huano 20 juta klik</div></div>
          <div class="sg"><div class="l">Encoder</div><div class="v">FSWITCH 30.000 siklus</div></div>
          <div class="sg"><div class="l">Dimensi</div><div class="v">118 × 67 × 41 mm</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

function bindDpi() {
  const s = $("#dpiSlider");
  if (!s) return;
  s.addEventListener("input", e => {
    const v = parseInt(e.target.value, 10);
    state.editDpi[state.editActive] = v;
    const big = $("#dpiBig");
    if (big) big.value = v;
    const el = $("#dpiv" + state.editActive);
    if (el) el.value = v;
  });
}
function pickStage(i) { state.editActive = i; renderPage(); }
function dpiStep(i, d) {
  const c = state.constants;
  const lo = c.dpi_min || 200, hi = c.dpi_max || 24000;
  state.editDpi[i] = Math.max(lo, Math.min(hi, state.editDpi[i] + d));
  if (i === state.editActive) { renderPage(); }
  else { const el = $("#dpiv" + i); if (el) el.value = state.editDpi[i]; }
}
/* Nilai DPI DIKETIK langsung: validasi + clamp ke rentang sensor. */
function dpiType(i, el, isBig) {
  const c = state.constants;
  const lo = c.dpi_min || 200, hi = c.dpi_max || 24000;
  let v = parseInt(el.value, 10);
  if (isNaN(v)) { el.value = state.editDpi[i]; return; }
  v = Math.max(lo, Math.min(hi, v));
  state.editDpi[i] = v;
  el.value = v;
  if (isBig) {
    const row = $("#dpiv" + i);
    if (row) row.value = v;
    const s = $("#dpiSlider");
    if (s) s.value = v;
  } else {
    const big = $("#dpiBig");
    if (big && i === state.editActive) { big.value = v; const s = $("#dpiSlider"); if (s) s.value = v; }
  }
}
/* Enter = konfirmasi nilai ketikan (biar tidak perlu klik keluar dulu). */
function dpiKey(ev, i, el, isBig) {
  if (ev.key === "Enter") { ev.preventDefault(); el.blur(); dpiType(i, el, isBig); }
}
function countStep(d) { state.editCount = Math.max(1, Math.min(6, state.editCount + d)); $("#cntVal").textContent = state.editCount; }

/* -------------------------------------------------------------- REMAP page */
function pageRemap() {
  const labels = state.constants.button_labels || [];
  // Urutan TAMPILAN (dari depan ke belakang): Kiri, Kanan, Tengah, lalu
  // tombol samping DEPAN (baris 4) dan BELAKANG (baris 5).
  // Indeks internal tetap mengikuti slot firmware:
  //   index 3 = slot 4 = samping BELAKANG
  //   index 4 = slot 5 = samping DEPAN
  const order = [0, 1, 2, 4, 3];
  const rows = order.map((idx, pos) => {
    const k = state.editKeys[idx] || { group: "", label: "" };
    return `
    <div class="key-row">
      <div class="knum">${pos + 1}</div>
      <div class="kinfo">
        <div class="kn">${esc(labels[idx] || ("Tombol " + (pos + 1)))}</div>
        <div class="kd">[${esc(k.group)}] ${esc(k.label)}</div>
      </div>
      <button class="btn ghost sm" onclick="openKeyPicker(${idx})">${icon("edit")}Ubah</button>
    </div>`;
  }).join("");
  const sideDefault = state.editKeys[4] && state.editKeys[4].group === "Media";
  return `
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><div class="ci">${icon("remap")}</div><div class="ct"><div class="h">Pemetaan Tombol</div><div class="s">5 tombol terprogram</div></div>
        <div class="cr"><button class="btn danger sm" onclick="resetKeys()">${icon("rotate")}Kembalikan Default</button></div></div>
      ${rows}
      <div class="flex gap8 mt12" style="flex-wrap:wrap">
        <span class="muted" style="font-size:11px;align-self:center">Preset cepat:</span>
        <button class="btn ghost sm" onclick="presetSideButtons()">${icon("arrowRight")}Samping = Maju / Mundur</button>
        <button class="btn ghost sm" onclick="presetSideVolume()">${icon("activity")}Samping = Volume +/−</button>
        <button class="btn ghost sm" onclick="presetSideOff()">${icon("x")}Matikan Tombol Samping</button>
      </div>
      ${sideDefault ? `<div class="hint mt12">${icon("info")}<div><strong>Perhatian:</strong> tombol samping saat ini masih bawaan pabrik (Volume +/−). Untuk navigasi seperti mouse gaming pada umumnya (Maju/Mundur), klik <strong>Samping = Maju / Mundur</strong> di atas, lalu <strong>Terapkan Semua</strong>.</div></div>`
      : `<div class="hint mt12">${icon("info")}<div>Klik <strong>Ubah</strong> untuk memilih fungsi pintasan keyboard, kontrol multimedia, atau aksi khusus. Konfigurasi disimpan ke memori internal onboard setelah <strong>Terapkan Semua</strong>.</div></div>`}
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-head"><div class="ci">${icon("mouse")}</div><div class="ct"><div class="h">Diagram Skematik GS02 Pro</div><div class="s">Posisi fisik 5 tombol terprogram</div></div></div>
        <div style="display:flex;justify-content:center;padding:10px 0">
          <svg width="200" height="215" viewBox="0 0 200 215" fill="none">
            <rect x="52" y="8" width="96" height="196" rx="48" fill="#242a36" stroke="#2d3748" stroke-width="2"/>
            <line x1="100" y1="8" x2="100" y2="70" stroke="#2d3748" stroke-width="2"/>
            <rect x="94" y="32" width="12" height="32" rx="6" fill="#2d3748"/>
            <circle cx="100" cy="120" r="28" fill="#1a202c" stroke="#ff5019" stroke-width="2"/>
            <circle cx="100" cy="120" r="5" fill="#ff5019"/>
            ${[["1", 74, 34], ["2", 126, 34], ["3", 100, 56], ["4", 34, 122], ["5", 34, 158]].map(([n, x, y]) =>
    `<circle cx="${x}" cy="${y}" r="10" fill="#ff5019"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" font-family="JetBrains Mono">${n}</text>`).join("")}
            <text x="100" y="185" text-anchor="middle" font-size="9" fill="#6b7280" font-family="JetBrains Mono">SENSOR PAW3311</text>
          </svg>
        </div>
        <div class="flex gap8" style="justify-content:space-between;font-size:10.5px;color:var(--muted);font-family:var(--mono)">
          <span>1 Kiri</span><span>2 Kanan</span><span>3 Tengah</span>
        </div>
        <div class="flex gap8" style="justify-content:space-between;font-size:10.5px;color:var(--muted);font-family:var(--mono);margin-top:4px">
          <span>4 Samping Atas (Depan)</span><span>5 Samping Bawah (Belakang)</span>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("layers")}</div><div class="ct"><div class="h">Profil Aktif</div><div class="s">${esc(state.profile)} · Slot 1 dari 4 (EEPROM)</div></div></div>
        <div class="stat-card" style="background:var(--surface-low)"><div class="st-label">${icon("keyboard")}Switch L/R</div><div class="st-value">Huano 20 Juta Klik</div></div>
      </div>
    </div>
  </div>`;
}

function openKeyPicker(idx) {
  const cur = state.editKeys[idx];
  const groups = ["Semua", ...(state.catalog.groups || [])];
  const el = $("#modal");
  el.className = "overlay show";
  el.innerHTML = `
    <div class="modal">
      <div class="modal-head"><div class="ci" style="width:30px;height:30px;border-radius:6px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)">${icon("edit")}</div>
        <div class="h">Ubah Fungsi Tombol ${idx + 1}</div>
        <span class="x" onclick="closeModal()">${icon("x")}</span></div>
      <div class="modal-body">
        <div class="field" style="margin-bottom:12px">
          <label>Fungsi Terpasang Saat Ini</label>
          <div class="input" style="display:flex;align-items:center">[${esc(cur.group)}] ${esc(cur.label)}</div>
        </div>
        <div class="cat-tabs" id="catTabs">${groups.map((g, i) => `<span class="cat-tab ${i === 0 ? "active" : ""}" onclick="filterCat('${esc(g)}',this)">${esc(g)}</span>`).join("")}</div>
        <div class="cat-list" id="catList"></div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" onclick="closeModal()">Batal</button>
        <button class="btn primary" onclick="applyKeyPick(${idx})">${icon("check")}Pasang</button>
      </div>
    </div>`;
  window._catFilter = "Semua";
  window._catPick = { raw: cur.raw.slice(), label: cur.label, group: cur.group };
  renderCatList();
}
function filterCat(g, el) {
  window._catFilter = g;
  $$("#catTabs .cat-tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  renderCatList();
}
function renderCatList() {
  const f = window._catFilter;
  const items = state.catalog.items.filter(it => f === "Semua" || it.group === f);
  const pick = window._catPick;
  $("#catList").innerHTML = items.map(it => {
    const raw = [it.type, it.c1, it.c2, it.c3];
    const sel = JSON.stringify(raw) === JSON.stringify(pick.raw);
    return `<div class="cat-item ${sel ? "sel" : ""}" onclick='chooseCat(${JSON.stringify(it)}, this)'>
      <span class="g">[${esc(it.group)}]</span><span class="n">${esc(it.name)}</span></div>`;
  }).join("") || `<div class="empty">Tidak ada item</div>`;
}
function chooseCat(it, el) {
  window._catPick = { raw: [it.type, it.c1, it.c2, it.c3], label: it.name, group: it.group };
  $$("#catList .cat-item").forEach(x => x.classList.remove("sel"));
  el.classList.add("sel");
}
function applyKeyPick(idx) {
  const pick = window._catPick;
  // Fungsi DAYA berbahaya (bisa mematikan/menidurkan PC). Konfirmasi dulu
  // lewat modal sendiri (window.confirm tidak andal di WebView2).
  if (pick.group === "[Daya]") {
    const isSleep = pick.label.toLowerCase().includes("tidur") ||
      pick.label.toLowerCase().includes("sleep");
    const el = $("#modal");
    el.className = "overlay show";
    el.innerHTML = `
      <div class="modal" style="width:440px">
        <div class="modal-head">
          <div class="ci" style="width:30px;height:30px;border-radius:6px;display:grid;place-items:center;background:#c42b1c22;color:#e5484d">${icon("bolt")}</div>
          <div class="h">Konfirmasi Fungsi Daya</div>
          <span class="x" onclick="openKeyPicker(${idx})">${icon("x")}</span>
        </div>
        <div class="modal-body">
          <div class="hint" style="border-color:#e5484d55">
            ${icon("bolt")}
            <div>Fungsi <strong>${esc(pick.label)}</strong> akan dipasang pada
            <strong>Tombol ${idx + 1}</strong>.<br><br>
            Menekan tombol itu akan langsung <strong>${isSleep ? "MENIDURKAN" : "MEMATIKAN"}</strong>
            komputer — <strong>tanpa konfirmasi lagi</strong>. Pastikan kamu memang
            ingin begitu.</div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn ghost" onclick="openKeyPicker(${idx})">Batal</button>
          <button class="btn danger" onclick="confirmPowerKey(${idx})">${icon("check")}Ya, Pasang</button>
        </div>
      </div>`;
    return;
  }
  state.editKeys[idx] = { raw: pick.raw.slice(), label: pick.label, group: pick.group };
  closeModal(); renderPage();
}
function confirmPowerKey(idx) {
  const pick = window._catPick;
  state.editKeys[idx] = { raw: pick.raw.slice(), label: pick.label, group: pick.group };
  closeModal(); renderPage();
  toast("Fungsi daya dipasang — klik Terapkan Semua untuk menyimpan", "err");
}
function closeModal() { $("#modal").className = "overlay"; $("#modal").innerHTML = ""; }

/* --------------------------------------------------- TENTANG / ABOUT / KREDIT */
function openAbout() {
  const el = $("#modal");
  el.className = "overlay show";
  const ver = state.appVersion || "3.1.0";
  el.innerHTML = `
    <div class="modal" style="width:520px">
      <div class="modal-head">
        <div class="ci" style="width:30px;height:30px;border-radius:6px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)">${icon("info")}</div>
        <div class="h">Tentang Aplikasi</div>
        <span class="x" onclick="closeModal()">${icon("x")}</span>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
          <img src="logo_128.png" alt="EWEADN" width="56" height="56" style="border-radius:14px">
          <div>
            <div style="font-size:17px;font-weight:700;color:var(--fg)">EWEADN GS02 Pro Control Hub</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">Versi ${esc(ver)} &middot; Driver kontrol mouse gaming offline</div>
          </div>
        </div>

        <div class="hint" style="margin-bottom:14px">
          ${icon("info")}
          <div>Aplikasi desktop untuk mengatur mouse <strong>EWEADN GS02 Pro</strong> tanpa
          software resmi. Berkomunikasi langsung lewat protokol HID
          <span class="mono">Report ID 0xF0</span>.</div>
        </div>

        <div class="divider"></div>
        <div class="spec-grid">
          <div class="sg"><div class="l">Dibuat oleh</div><div class="v accent">mimuruu</div></div>
          <div class="sg"><div class="l">Lisensi</div><div class="v">MIT</div></div>
          <div class="sg"><div class="l">Repository</div><div class="v mono" style="font-size:11px">github.com/mimuruu/EWEADN-GS02-Pro-Control</div></div>
          <div class="sg"><div class="l">Teknologi</div><div class="v">Python &middot; pywebview &middot; hidapi</div></div>
          <div class="sg"><div class="l">Discord</div><div class="v mono" style="font-size:11px">mimuruu &middot; 832007262314692659</div></div>
        </div>

        <div class="hint" style="margin-top:12px">
          ${icon("message")}
          <div>Ada bug atau saran? Hubungi Discord <strong>mimuruu</strong> di atas.</div>
        </div>

        <div class="divider"></div>
        <div style="font-size:11px;color:var(--faint);line-height:1.6">
          Proyek ini tidak berafiliasi dengan EWEADN. Nama produk dipakai hanya
          untuk menjelaskan kompatibilitas perangkat.<br>
          &copy; 2026 mimuruu &middot; Dirilis di bawah Lisensi MIT.
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" onclick="openDiscord()">${icon("discord")}Discord</button>
        <button class="btn ghost" onclick="openAboutLink()">${icon("arrowRight")}GitHub</button>
        <button class="btn ghost" onclick="checkUpdate(true)">${icon("refresh")}Cek Update</button>
        <button class="btn primary" onclick="closeModal()">${icon("check")}Tutup</button>
      </div>
    </div>`;
}

const DISCORD_ID = "832007262314692659";
const DISCORD_URL = "https://discord.com/users/" + DISCORD_ID;

function openDiscord() {
  try { window.pywebview.api.open_url(DISCORD_URL); } catch (e) { }
}

function openAboutLink() {
  try { window.pywebview.api.open_url("https://github.com/mimuruu/EWEADN-GS02-Pro-Control"); }
  catch (e) { }
}

/* Preset cepat untuk 2 tombol samping.
   Urutan slot firmware: index 3 (slot 4) = sisi BELAKANG (bawah),
   index 4 (slot 5) = sisi DEPAN (atas). Dibuktikan dengan membaca tombol
   dari perangkat: slot 5 = tombol paling depan. */
function presetSideButtons() {
  state.editKeys[3] = { raw: [32, 8, 0, 0], label: "Mundur (Backward)", group: "Mouse" };
  state.editKeys[4] = { raw: [32, 16, 0, 0], label: "Maju (Forward)", group: "Mouse" };
  renderPage();
  toast("Tombol samping diset Maju / Mundur — klik Terapkan Semua");
}
function presetSideVolume() {
  state.editKeys[3] = { raw: [48, 234, 0, 0], label: "Volume -", group: "Media" };
  state.editKeys[4] = { raw: [48, 233, 0, 0], label: "Volume +", group: "Media" };
  renderPage();
  toast("Tombol samping diset Volume +/− — klik Terapkan Semua");
}
function presetSideOff() {
  state.editKeys[3] = { raw: [32, 0, 0, 0], label: "Nonaktifkan (Disable)", group: "Lainnya" };
  state.editKeys[4] = { raw: [32, 0, 0, 0], label: "Nonaktifkan (Disable)", group: "Lainnya" };
  renderPage();
  toast("Tombol samping dimatikan — klik Terapkan Semua");
}

/* -------------------------------------------------------- PERFORMANCE page */
function pagePerformance() {
  const rates = state.constants.report_rates || [];
  const segs = rates.map(r => `<button class="seg ${state.editRR === r.value ? "active" : ""}" onclick="setRR(${r.value})">${esc(r.label)}<br><span style="font-size:9.5px;font-family:var(--mono);opacity:.7">${esc(r.ms)}</span></button>`).join("");
  return `
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><div class="ci">${icon("performance")}</div><div class="ct"><div class="h">Polling Rate</div><div class="s">Frekuensi komunikasi mouse dengan komputer</div></div></div>
      <div class="segmented wide">${segs}</div>
      <div class="hint mt12">${icon("bolt")}<div>Rekomendasi gaming kompetitif: <strong>1000 Hz</strong> (latensi 1 ms). Buffer USB HID High-Speed.</div></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="ci">${icon("zap")}</div><div class="ct"><div class="h">High-Speed Mode</div><div class="s">Transmisi tanpa jeda hemat daya</div></div>
        <div class="cr"><label class="switch"><input type="checkbox" ${state.editHigh ? "checked" : ""} onchange="state.editHigh=this.checked?1:0"><span class="track"></span></label></div></div>
      <div class="hint">${icon("info")}<div>Aktifkan untuk latensi minimum saat mode kabel. Mode daya tinggi meningkatkan respon tetapi menambah konsumsi baterai.</div></div>
    </div>
  </div>
  <div class="card mt16">
    <div class="card-head"><div class="ci">${icon("sliders")}</div><div class="ct"><div class="h">Pengaturan Lanjutan</div><div class="s">Konfigurasi hardware level sensor dan mikrokontroler</div></div>
      <div class="cr"><button class="btn ghost sm" onclick="factoryPerf()">${icon("rotate")}Standar Pabrik</button></div></div>
    <div class="grid cols-3" style="gap:16px">
      <div class="field">
        <label>${icon("target")}LOD (Lift-Off Distance)</label>
        <select class="input" onchange="state.editLod=parseInt(this.value)">
          <option value="0" ${state.editLod === 0 ? "selected" : ""}>0.7 mm (Sangat Rendah)</option>
          <option value="1" ${state.editLod === 1 ? "selected" : ""}>1.0 mm (Rendah)</option>
          <option value="2" ${state.editLod === 2 ? "selected" : ""}>2.0 mm (Tinggi)</option>
        </select>
        <span class="muted" style="font-size:11px">Ketinggian sensor berhenti membaca saat diangkat</span>
      </div>
      <div class="field">
        <label>${icon("clock")}Key Response (Debounce)</label>
        <div class="stepper" style="align-self:flex-start"><button onclick="krStep(-1)">−</button><span class="val" id="krVal">${state.editKeyResp}</span><button onclick="krStep(1)">+</button></div>
        <span class="muted" style="font-size:11px">Filter anti double-click tombol (ms)</span>
      </div>
      <div class="field">
        <label>${icon("moon")}Sleep Light (Mode Siaga)</label>
        <div class="stepper" style="align-self:flex-start"><button onclick="slStep(-1)">−</button><span class="val" id="slVal">${state.editSleep}</span><button onclick="slStep(1)">+</button></div>
        <span class="muted" style="font-size:11px">Lampu redup saat mouse tidak digerakkan (detik)</span>
      </div>
    </div>
    <div class="divider"></div>
    <div class="grid cols-2e">
      <div class="flex" style="justify-content:space-between">
        <div><div style="font-size:13px;color:var(--fg);font-weight:600">Sensor Mode (Angle Snapping)</div><div class="muted" style="font-size:11px;margin-top:2px">Koreksi prediksi garis lurus sensor optik</div></div>
        <div class="segmented"><button class="seg ${state.editSensor === 0 ? "active" : ""}" onclick="state.editSensor=0;renderPage()">Off (Raw 1:1)</button><button class="seg ${state.editSensor === 1 ? "active" : ""}" onclick="state.editSensor=1;renderPage()">On</button></div>
      </div>
      <div class="flex" style="justify-content:space-between">
        <div><div style="font-size:13px;color:var(--fg);font-weight:600">Debounce / Key Response</div><div class="muted" style="font-size:11px;margin-top:2px">Filter anti double-click pada sakelar Huano</div></div>
        <div class="segmented"><button class="seg active">${state.editKeyResp} ms</button></div>
      </div>
    </div>
  </div>`;
}
function setRR(v) { state.editRR = v; renderPage(); }
function krStep(d) { state.editKeyResp = Math.max(2, Math.min(20, state.editKeyResp + d)); $("#krVal").textContent = state.editKeyResp; }
function slStep(d) { state.editSleep = Math.max(0, Math.min(60, state.editSleep + d)); $("#slVal").textContent = state.editSleep; }
function factoryPerf() { state.editRR = 3; state.editLod = 1; state.editKeyResp = 8; state.editSleep = 10; state.editSensor = 0; state.editHigh = 0; renderPage(); toast("Standar pabrik dimuat"); }

/* --------------------------------------------------------------- LAMPU page */
function pageLampu() {
  const modes = state.constants.light_modes || [];
  const icons = ["power", "waves", "sparkle", "bolt", "circle", "arrowRight", "moon"];
  const grid = modes.map((m, i) => `
    <div class="light-item ${state.editLight === m.value ? "active" : ""}" onclick="setLight(${m.value})">
      ${icon(icons[i] || "circle")}<span>${esc(m.label)}</span></div>`).join("");
  return `
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><div class="ci">${icon("lampu")}</div><div class="ct"><div class="h">Efek Lampu</div><div class="s">Pilih salah satu dari 7 mode pencahayaan dinamis</div></div>
        <div class="cr"><span class="pill">7 PRESET</span></div></div>
      <div class="light-grid">${grid}</div>
      <div class="hint mt12">${icon("info")}<div>GS02 Pro hanya punya <strong>7 efek bawaan</strong>. Tidak ada mode warna solid — beberapa efek memang berwarna-warni dan berubah sendiri.</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-head"><div class="ci">${icon("move")}</div><div class="ct"><div class="h">Lampu Saat Digerakkan (Move Light)</div><div class="s">Optimasi daya saat pergerakan intensif</div></div></div>
        <div class="field">
          <label>${icon("power")}Perilaku Move Light</label>
          <select class="input" onchange="state.editMove=parseInt(this.value)">
            <option value="0" ${state.editMove === 0 ? "selected" : ""}>Tetap nyalakan lampu saat bergerak</option>
            <option value="1" ${state.editMove === 1 ? "selected" : ""}>Matikan lampu saat mouse bergerak (hemat daya)</option>
          </select>
        </div>
        <div class="hint mt12">${icon("info")}<div>Memadamkan lampu saat mouse digerakkan dapat memperpanjang daya tahan baterai nirkabel hingga <strong>45%</strong>.</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("palette")}</div><div class="ct"><div class="h">Pratinjau Pola LED</div><div class="s">Efek terpilih</div></div></div>
        <div class="flex gap12" style="justify-content:center;padding:8px 0">
          <span style="width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px var(--accent)"></span>
          <span style="width:14px;height:14px;border-radius:50%;background:#2ecc71;box-shadow:0 0 14px #2ecc71"></span>
          <span style="width:14px;height:14px;border-radius:50%;background:#3498db;box-shadow:0 0 14px #3498db"></span>
          <span style="width:14px;height:14px;border-radius:50%;background:#9b59b6;box-shadow:0 0 14px #9b59b6"></span>
        </div>
        <div class="muted" style="text-align:center;font-size:12px">${esc((modes.find(m => m.value === state.editLight) || {}).label || "-")}</div>
      </div>
    </div>
  </div>`;
}
function setLight(v) { state.editLight = v; renderPage(); }

/* --------------------------------------------------------------- MAKRO page */
function pageMakro() {
  return `
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><div class="ci">${icon("makro")}</div><div class="ct"><div class="h">Perekam Makro</div><div class="s">F9 = Rekam / Berhenti · F10 = Putar</div></div>
        <div class="cr"><span class="pill"><span class="dot"></span>${state.macro.recording ? "Merekam..." : "Siap"}</span></div></div>
      <div class="flex gap8" style="flex-wrap:wrap">
        <button class="btn ${state.macro.recording ? "danger" : "primary"}" id="recBtn" onclick="toggleRecord()">${icon(state.macro.recording ? "stop" : "record")}${state.macro.recording ? "Stop Rekam (F9)" : "Mulai Rekam (F9)"}</button>
        <button class="btn ghost" onclick="playMacro()">${icon("play")}Putar (F10)</button>
        <button class="btn ghost" onclick="clearMacro()">${icon("trash")}Hapus</button>
        <button class="btn ghost" onclick="saveMacroFile()">${icon("download")}Simpan File</button>
        <button class="btn ghost" onclick="loadMacroFile()">${icon("upload")}Muat File</button>
      </div>
      <div class="flex gap12 mt12" style="flex-wrap:wrap">
        <div class="field"><label>Kecepatan (Delay)</label>
          <div class="stepper"><button onclick="spStep(-1)">−</button><span class="val" id="spVal">${state.macroSpeed.toFixed(1)}x</span><button onclick="spStep(1)">+</button></div></div>
        <div class="field"><label>Ulangi (Loop)</label>
          <div class="stepper"><button onclick="lpStep(-1)">−</button><span class="val" id="lpVal">${state.macroRepeat}x</span><button onclick="lpStep(1)">+</button></div></div>
        <div class="field" style="justify-content:flex-end"><label>Status</label>
          <div class="input mono" id="macroStatus" style="display:flex;align-items:center">${state.macro.count} Aksi • ${state.macro.duration} ms</div></div>
      </div>
      <div class="hint mt12">${icon("info")}<div>Tekan <strong>F9</strong> kapan saja untuk mulai/berhenti merekam. Makro berjalan di PC (host-side) tanpa batas 4 KB firmware.</div></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="ci">${icon("folder")}</div><div class="ct"><div class="h">Pustaka Makro (di PC)</div><div class="s">Daftar makro tersimpan</div></div>
        <div class="cr"><span class="pill">${state.macroLib.items.length} Profil</span></div></div>
      <div id="macroLibList"></div>
      <div class="flex gap8 mt12">
        <button class="btn ghost sm" onclick="libLoad()">${icon("upload")}Muat</button>
        <button class="btn primary sm" onclick="libSave()">${icon("save")}Simpan</button>
        <button class="btn danger sm" onclick="libDelete()">${icon("trash")}Hapus</button>
      </div>
    </div>
  </div>
  <div class="card mt16">
    <div class="card-head"><div class="ci">${icon("activity")}</div><div class="ct"><div class="h">Urutan Aksi Input (Keystrokes)</div><div class="s" id="macroSummary">${state.macro.count} aksi • ${state.macro.duration} ms</div></div>
      <div class="cr"><div class="flex gap12" style="font-size:10.5px;font-family:var(--mono)">
        <span style="color:var(--ok)">■ Key Down</span><span style="color:var(--accent)">■ Key Up</span><span style="color:var(--warn)">■ Jeda</span></div></div></div>
    <div class="macro-list" id="macroList"></div>
  </div>`;
}

function renderMacroList() {
  const el = $("#macroList"); if (!el) return;
  const evs = state.macro.events;
  if (!evs.length) {
    el.innerHTML = `<div class="empty">${icon("record")}<div>Belum ada aksi terekam.<br>Klik <strong>Mulai Rekam (F9)</strong> atau tekan F9 pada keyboard.</div></div>`;
    return;
  }
  el.innerHTML = evs.map((e, i) => `
    <div class="macro-row">
      <span class="idx">${String(i + 1).padStart(2, "0")}</span>
      <span class="tag ${e.kind}">${esc(e.label)}</span>
      <span class="detail">${esc(e.detail)}</span>
      <span class="delay">${e.dt} ms</span>
      <span class="del" onclick="delStep(${i})">${icon("x")}</span>
    </div>`).join("");
  const sum = $("#macroSummary"); if (sum) sum.textContent = `${evs.length} aksi • ${state.macro.duration} ms`;
  const st = $("#macroStatus"); if (st) st.textContent = `${evs.length} Aksi • ${state.macro.duration} ms`;
}

function renderMacroLib() {
  const el = $("#macroLibList"); if (!el) return;
  const items = state.macroLib.items;
  if (!items.length) { el.innerHTML = `<div class="empty">${icon("folder")}<div>Pustaka kosong</div></div>`; return; }
  el.innerHTML = items.map(it => `
    <div class="lib-row ${it.active ? "active" : ""}" onclick="libSelect('${esc(it.name)}')">
      <div class="li">${icon("makro")}</div>
      <div class="linfo"><div class="lname">${esc(it.name)}</div><div class="lmeta">${it.steps} langkah • ${it.delay} ms</div></div>
      ${it.active ? '<span class="badge-active">Aktif</span>' : ""}
    </div>`).join("");
}

function spStep(d) { state.macroSpeed = Math.max(0.1, Math.min(5, +(state.macroSpeed + d * 0.1).toFixed(1))); const e = $("#spVal"); if (e) e.textContent = state.macroSpeed.toFixed(1) + "x"; }
function lpStep(d) { state.macroRepeat = Math.max(1, Math.min(99, state.macroRepeat + d)); const e = $("#lpVal"); if (e) e.textContent = state.macroRepeat + "x"; }
function libSelect(n) { window._libSel = n; libLoad(n); }

/* ------------------------------------------------------------- FIREKEY page */
function pageFireKey() {
  const triggers = state.constants.triggers || [];
  const fk = state.fkEdit;
  return `
  <div class="grid cols-2">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-head"><div class="ci">${icon("firekey")}</div><div class="ct"><div class="h">Fire Key</div><div class="s">Otomatisasi klik beruntun saat pemicu ditahan</div></div>
          <div class="cr"><label class="switch"><input type="checkbox" ${fk.enabled ? "checked" : ""} onchange="fkToggle(this.checked)"><span class="track"></span></label></div></div>
        <div class="stat-card" style="background:var(--surface-low);border-color:${fk.enabled ? "var(--accent)" : "var(--border)"}">
          <div class="st-label">${icon("crosshair")}Status Mesin Pemicu</div>
          <div class="st-value" style="color:${fk.enabled ? "var(--ok)" : "var(--muted)"}">${fk.enabled ? "AKTIF" : "NONAKTIF"}</div>
          <div class="st-sub" id="fkLive">${fk.enabled ? "Menunggu pemicu — tahan tombol pemicu untuk menembak" : "Fitur Fire Key dimatikan"}</div>
        </div>
        <div class="field mt12">
          <label>${icon("target")}Tombol Pemicu Utama</label>
          <select class="input" onchange="fkTrigger(this.value)">
            ${triggers.map(t => `<option value='${JSON.stringify(t.value)}' ${JSON.stringify(t.value) === JSON.stringify(fk.trigger) ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
          </select>
          <span class="muted" style="font-size:11px">Tombol yang harus ditahan untuk memicu klik beruntun.</span>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("info")}</div><div class="ct"><div class="h">Cara Pakai (3 Langkah)</div></div></div>
        <div class="hint">${icon("info")}<div>
          <strong>1.</strong> Nyalakan sakelar di kanan atas.<br>
          <strong>2.</strong> Pilih <strong>Tombol Pemicu</strong> (mis. Samping X2) dan atur <strong>Delay</strong> + <strong>Jumlah Klik</strong>.<br>
          <strong>3.</strong> Klik <strong>Terapkan Fire Key</strong>.<br>
          Lalu tahan tombol pemicu itu — mouse akan otomatis klik kiri beruntun. Lepas untuk berhenti.
        </div></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-head"><div class="ci">${icon("sliders")}</div><div class="ct"><div class="h">Pengaturan Parameter</div><div class="s">Delay & jumlah klik</div></div>
          <div class="cr"><span class="pill">Berjalan di PC</span></div></div>
        <div class="field">
          <label>${icon("clock")}Delay Antar Klik (ms)</label>
          <div class="stepper" style="align-self:flex-start"><button onclick="fkDelay(-5)">−</button><span class="val" id="fkDelayVal">${fk.delay} ms</span><button onclick="fkDelay(5)">+</button></div>
          <div class="flex gap8 mt8">${[10, 20, 50].map(v => `<button class="btn ghost sm" onclick="fkSetDelay(${v})">${v}ms</button>`).join("")}</div>
          <span class="muted" style="font-size:11px;margin-top:6px">Semakin kecil interval, semakin cepat laju tembakan (≈ ${(1000 / fk.delay).toFixed(0)} klik/detik)</span>
        </div>
        <div class="field mt12">
          <label>${icon("zap")}Jumlah Klik (Burst)</label>
          <div class="segmented wide">
            <button class="seg ${fk.times === 0 ? "active" : ""}" onclick="fkTimes(0)">Kontinu (0)</button>
            <button class="seg ${fk.times === 3 ? "active" : ""}" onclick="fkTimes(3)">3-Burst</button>
            <button class="seg ${fk.times === 5 ? "active" : ""}" onclick="fkTimes(5)">5-Burst</button>
          </div>
          <span class="muted" style="font-size:11px;margin-top:6px">Nilai 0 = klik terus-menerus selama tombol pemicu ditahan</span>
        </div>
        <button class="btn primary mt16" style="width:100%" onclick="fkApply()">${icon("check")}Terapkan Fire Key</button>
        <button class="btn ghost mt8" style="width:100%" onclick="fkTest()">${icon("play")}Tes Sekarang (5 klik)</button>
      </div>
      <div class="card">
        <div class="card-head"><div class="ci">${icon("info")}</div><div class="ct"><div class="h">Catatan Penting</div></div></div>
        <div class="hint">${icon("info")}<div>
          • Fire Key dijalankan oleh driver ini <strong>di PC</strong> (bukan disimpan di chip mouse), jadi aplikasi harus tetap terbuka.<br>
          • Beberapa game (terutama anti-cheat ketat) bisa memblokir rapid click. Pakai dengan bijak.<br>
          • Tombol pemicu tetap berfungsi normal saat Fire Key nonaktif.
        </div></div>
      </div>
    </div>
  </div>`;
}
function fkToggle(on) { state.fkEdit.enabled = on; renderPage(); }
function fkTrigger(v) { state.fkEdit.trigger = JSON.parse(v); }
function fkDelay(d) { state.fkEdit.delay = Math.max(5, Math.min(500, state.fkEdit.delay + d)); renderPage(); }
function fkSetDelay(v) { state.fkEdit.delay = v; renderPage(); }
function fkTimes(n) { state.fkEdit.times = n; renderPage(); }
async function fkApply() {
  const fk = state.fkEdit;
  const r = await API().firekey_apply(fk.enabled, fk.trigger, fk.delay, fk.times);
  if (r.ok) { state.firekey = r.firekey; toast(r.message); } else toast(r.message || "Gagal", "err");
}
async function fkTest() {
  const r = await API().firekey_test();
  if (r.ok) toast(r.message || "Tes: 5 klik terkirim"); else toast(r.message || "Gagal", "err");
}

/* --------------------------------------------------------- macro actions */
async function toggleRecord() {
  if (state.macro.recording) {
    const r = await API().macro_stop();
    state.macro = { events: r.events, count: r.count, duration: r.duration, recording: false };
    toast(`Rekaman selesai — ${r.count} aksi`);
    renderPage();
  } else {
    await API().macro_start();
    state.macro.recording = true; state.macro.events = []; state.macro.count = 0; state.macro.duration = 0;
    toast("Merekam... tekan F9 untuk berhenti");
    renderPage();
  }
}
async function playMacro() {
  const r = await API().macro_play(state.macroSpeed, state.macroRepeat);
  if (r.ok) toast("Memutar makro..."); else toast(r.message, "err");
}
async function clearMacro() { await API().macro_clear(); state.macro = { events: [], count: 0, duration: 0, recording: false }; renderPage(); toast("Makro dibersihkan"); }
async function delStep(i) {
  const r = await API().macro_delete_step(i);
  state.macro.events = r.events; state.macro.count = r.events.length; state.macro.duration = r.duration;
  renderMacroList();
}
async function saveMacroFile() { const r = await API().macro_save_file(); if (r.ok) toast(r.message); else if (!r.cancelled) toast(r.message, "err"); }
async function loadMacroFile() {
  const r = await API().macro_load_file();
  if (r.ok) { state.macro.events = r.events; state.macro.count = r.events.length; state.macro.duration = r.duration; renderMacroList(); toast(r.message); }
  else if (!r.cancelled) toast(r.message, "err");
}
async function libSave() {
  const r = await API().macro_lib_save(state.macroLib.active || "Makro Baru");
  if (r.ok) { state.macroLib = r.lib; renderMacroLib(); toast(r.message); }
}
async function libLoad(name) {
  const n = name || window._libSel || state.macroLib.active;
  if (!n) return toast("Pilih makro dulu", "err");
  const r = await API().macro_lib_load(n);
  if (r.ok) { state.macro.events = r.events; state.macro.count = r.events.length; state.macro.duration = r.duration; state.macroLib = r.lib; renderMacroList(); renderMacroLib(); toast(r.message); }
  else toast(r.message, "err");
}
async function libDelete() {
  const n = window._libSel || state.macroLib.active;
  if (!n) return toast("Pilih makro dulu", "err");
  const r = await API().macro_lib_delete(n);
  if (r.ok) { state.macroLib = r.lib; renderMacroLib(); toast("Makro dihapus"); }
}

/* -------------------------------------------------------- key/apply actions */
async function resetKeys() {
  const r = await API().reset_keys();
  if (r.ok) { await reloadAll(); toast(r.message); } else toast(r.message, "err");
}
async function applyAll() {
  const cfg = {
    light_mode: state.editLight, report_rate: state.editRR,
    dpi_count: state.editCount, dpi_index: state.editActive,
    dpi: state.editDpi.slice(),
    lod: state.editLod, key_respond: state.editKeyResp,
    sleep_light: state.editSleep, sensor_flag: state.editSensor,
    highspeed: state.editHigh, move_light: state.editMove,
  };
  const keys = state.editKeys.map(k => k.raw);
  const r = await API().apply_all({ config: cfg, keys });
  if (r.ok) { toast(r.message); setStatus("Tersimpan ke mouse ✓"); }
  else { toast(r.message, "err"); setStatus("Gagal: " + r.message, "err"); }
}
async function saveProfile() { const r = await API().profile_save(); if (r.ok) toast(r.message); else if (!r.cancelled) toast(r.message, "err"); }
async function loadProfile() {
  const r = await API().profile_load();
  if (r.ok) {
    applyState(r.state);
    state.macro.events = r.macro || [];
    state.macro.count = state.macro.events.length;
    state.macro.duration = state.macro.events.reduce((a, e) => a + (e.dt || 0), 0);
    renderPage(); toast(r.message);
  } else if (!r.cancelled) toast(r.message, "err");
}
async function reloadAll() {
  setStatus("Membaca dari mouse...");
  const s = await API().read_all();
  applyState(s);
  renderAll();
  if (s.connected) {
    setStatus("Terhubung — siap");
  } else {
    setStatus("Mouse tidak terdeteksi — coba sambungkan ulang", "err");
    if (s.error) console.warn("read_all error:", s.error);
  }
}

/* ------------------------------------------------------------- state sync */
function applyState(s) {
  if (!s) return;
  state.connected = !!s.connected;
  state.mode = s.mode || state.mode;
  state.battery = s.battery;
  state.firmware = s.firmware || "";
  if (s.profile) state.profile = s.profile;
  if (s.config) {
    const c = s.config;
    state.cfg = c;
    state.editDpi = (c.dpi || state.editDpi).slice(0, 6);
    state.editActive = c.dpi_index != null ? c.dpi_index : state.editActive;
    state.editCount = c.dpi_count != null ? c.dpi_count : state.editCount;
    state.editRR = c.report_rate != null ? c.report_rate : state.editRR;
    state.editLod = c.lod != null ? c.lod : state.editLod;
    state.editKeyResp = c.key_respond != null ? c.key_respond : state.editKeyResp;
    state.editSleep = c.sleep_light != null ? c.sleep_light : state.editSleep;
    state.editSensor = c.sensor_flag != null ? c.sensor_flag : state.editSensor;
    state.editHigh = c.highspeed != null ? c.highspeed : state.editHigh;
    state.editLight = c.light_mode != null ? c.light_mode : state.editLight;
    state.editMove = c.move_light != null ? c.move_light : state.editMove;
  }
  if (s.keys) state.editKeys = s.keys.map(k => ({ raw: k.raw.slice(), label: k.label, group: k.group }));
  if (s.firekey) { state.firekey = s.firekey; state.fkEdit = JSON.parse(JSON.stringify(s.firekey)); }
}

function renderAll() { renderTopbar(); renderSidebar(); renderPage(); renderBottombar(); }
function go(key) {
  if (key === state.page) return;
  state.page = key;
  renderSidebar();
  renderPage();
  animatePageIn();
  $("#main").scrollTop = 0;
}

/* ------------------------------------------------ engine poll (from Python) */
let _pollBusy = false;
let _pollFast = false;
let _pollTick = 0;
async function pollEngine() {
  if (_pollBusy || !state.ready) return;
  _pollBusy = true;
  try {
    const r = await API().poll_events();
    if (!r) return;
    (r.events || []).forEach(handleEngineEvent);
    _pollTick++;
    // Saat merekam, ambil snapshot daftar aksi supaya tampil live.
    // Start/stop rekaman ditangani oleh event dari Python (record-started /
    // record-stopped), jadi di sini cukup memperbarui daftarnya saja.
    if (r.recording) {
      _pollFast = true;
      if (r.events_snapshot) {
        state.macro.events = r.events_snapshot;
        state.macro.count = r.count || 0;
        state.macro.duration = r.duration || 0;
        if (state.page === "makro") renderMacroList();
      }
    } else if (state.macro.recording) {
      // jaring pengaman: bila event stop tidak sampai, ikuti status Python.
      state.macro.recording = false;
      _pollFast = state.fkEdit.enabled && state.firekey.enabled;
      const st = await API().macro_state();
      state.macro.events = st.events; state.macro.count = st.count; state.macro.duration = st.duration;
      if (state.page === "makro") renderPage();
    } else {
      _pollFast = state.fkEdit.enabled && state.firekey.enabled;
    }
    if (typeof r.fk_clicks === "number") state.fkClicks = r.fk_clicks;
    // Status koneksi (auto-detect dari backend, tanpa perlu refresh manual).
    if (r.conn && typeof r.conn.connected === "boolean") {
      const nowConn = r.conn.connected;
      if (nowConn !== state.connected) {
        state.connected = nowConn;
        if (r.conn.mode) state.mode = r.conn.mode;
        renderTopbar();
        renderBottombar();
        setStatus(nowConn ? "Terhubung — siap"
          : "Mouse terputus — nyalakan mouse / sambungkan dongle",
          nowConn ? "" : "err");
        // Kalau baru tersambung lagi, muat ulang state dari perangkat.
        if (nowConn) { try { applyState(await API().connect()); renderPage(); } catch (e) { } }
      }
    }
  } catch (e) { /* coba lagi nanti */ }
  finally { _pollBusy = false; }
}
function _schedulePoll() {
  setTimeout(async () => { await pollEngine(); _schedulePoll(); }, _pollFast ? 150 : 1000);
}
function handleEngineEvent(msg) {
  const { event, data } = msg;
  if (event === "record-started") {
    state.macro.recording = true;
    state.macro.events = []; state.macro.count = 0; state.macro.duration = 0;
    _pollFast = true;
    toast("Merekam... tekan F9 untuk berhenti");
    if (state.page === "makro") renderPage();
  } else if (event === "record-stopped") {
    state.macro.recording = false;
    state.macro.events = data.events || [];
    state.macro.count = data.count || 0;
    state.macro.duration = data.duration || 0;
    _pollFast = false;
    toast(`Rekaman selesai — ${data.count || 0} aksi`);
    if (state.page === "makro") renderPage();
  } else if (event === "play-started") {
    toast(`Memutar makro (${data.count} aksi)...`);
  } else if (event === "play-empty") {
    toast("Belum ada aksi terekam — rekam dulu dengan F9", "err");
  } else if (event === "play-done") {
    toast("Pemutaran makro selesai");
  } else if (event === "firekey-state") {
    const el = $("#fkLive");
    if (el) el.textContent = data.active ? "🔥 Pemicu aktif — menembak..." : "Menunggu pemicu...";
  } else if (event === "firekey-clicks") {
    const el = $("#fkLive");
    if (el && state.fkEdit.enabled) el.textContent = `${data.clicks} klik terkirim...`;
  }
}

/* --------------------------------------------------------------------- init */
/* FASE 1: gambar UI dengan nilai default SEKARANG (sinkron) -> tidak pernah
   kosong. FASE 2: muat data live saat API siap (async, dengan timeout). */
let _booted = false;
function boot() {
  if (_booted) return;
  _booted = true;
  try {
    state.editDpi = [400, 800, 1200, 1600, 2400, 3200];
    state.editKeys = [
      { raw: [32, 1, 0, 0], label: "Klik Kiri", group: "Mouse" },
      { raw: [32, 2, 0, 0], label: "Klik Kanan", group: "Mouse" },
      { raw: [32, 4, 0, 0], label: "Klik Tengah", group: "Mouse" },
      { raw: [32, 8, 0, 0], label: "Mundur (Backward)", group: "Mouse" },
      { raw: [32, 16, 0, 0], label: "Maju (Forward)", group: "Mouse" },
    ];
    renderAll();
    setStatus("Menghubungkan ke mouse...");
    state.ready = true;
    _schedulePoll();
  } catch (e) {
    try { API().ui_heartbeat({ error: "boot:" + String(e) }); } catch (_) { }
  }
  waitApi(0);
}

function apiReady() {
  return !!(window.pywebview && window.pywebview.api &&
    typeof window.pywebview.api.get_constants === "function" &&
    typeof window.pywebview.api.read_all === "function");
}
function waitApi(tries) {
  if (apiReady()) { loadLive(); return; }
  if (tries > 400) {
    setStatus("Jembatan Python tidak merespons — jalankan ulang aplikasi", "err");
    return;
  }
  setTimeout(() => waitApi(tries + 1), 100);
}

async function loadLive() {
  const api = window.pywebview.api;
  const call = (fn, ...a) => Promise.race([
    api[fn](...a),
    new Promise((_, rej) => setTimeout(() => rej(new Error(fn + " timeout")), 8000)),
  ]);
  try { const c = await call("get_constants"); if (c) state.constants = c; } catch (e) { }
  try { const c = await call("get_catalog"); if (c) state.catalog = c; } catch (e) { }
  try {
    const ai = await call("app_info");
    if (ai) { state.appName = ai.name; state.appVersion = ai.version; }
  } catch (e) { }
  try { const s = await call("connect"); applyState(s); } catch (e) { }
  try { const l = await call("macro_lib_list"); if (l) state.macroLib = l; } catch (e) { }
  try {
    renderAll();
    setStatus(state.connected ? "Terhubung — siap"
      : "Mouse tidak terdeteksi — sambungkan via kabel/dongle",
      state.connected ? "" : "err");
    api.ui_heartbeat({
      ready: true, nav: document.querySelectorAll(".nav-item").length,
      cards: document.querySelectorAll(".card").length,
      connected: state.connected, battery: state.battery,
      firmware: state.firmware, w: window.innerWidth, h: window.innerHeight,
    });
  } catch (e) { }
  // Cek pembaruan di latar belakang (tidak memblokir UI, gagal = diam saja).
  checkUpdate(false);
}

/* ------------------------------------------------------ CEK PEMBARUAN
   Tipe "check-only": hanya menanyakan versi terbaru ke GitHub, lalu
   menampilkan banner. Tidak mengunduh / memasang apa pun secara otomatis —
   pengguna membuka halaman rilis dan memasang sendiri (transparan). */
let _updateInfo = null;
async function checkUpdate(manual) {
  if (manual) setStatus("Mengecek pembaruan...");
  try {
    const r = await Promise.race([
      window.pywebview.api.check_update(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 9000)),
    ]);
    _updateInfo = r;
    if (!r || !r.ok) {
      if (manual) setStatus("Tidak bisa mengecek pembaruan (offline?)", "err");
      return;
    }
    if (r.update_available) {
      renderUpdateBanner(r);
      if (manual) setStatus("Pembaruan tersedia: v" + r.latest, "");
    } else if (manual) {
      setStatus("Aplikasi sudah versi terbaru (v" + (r.current || "") + ")", "");
      toast("Aplikasi sudah versi paling baru.");
    }
  } catch (e) {
    if (manual) setStatus("Gagal mengecek pembaruan", "err");
  }
}

function renderUpdateBanner(info) {
  const el = $("#update-banner");
  if (!el) return;
  el.className = "update-banner";
  el.innerHTML = `
    <div class="ub-ic">${icon("arrowRight")}</div>
    <div class="ub-txt">Pembaruan tersedia: <b>v${esc(info.latest)}</b>
      &middot; kamu memakai v${esc(info.current)}</div>
    <div class="ub-actions">
      <button class="ub-btn primary" onclick="openUpdatePage()">Unduh Pembaruan</button>
      <button class="ub-btn" onclick="dismissUpdate()">Nanti</button>
    </div>
    <button class="ub-close" title="Tutup" onclick="dismissUpdate()">${icon("x")}</button>`;
}

function openUpdatePage() {
  const url = (_updateInfo && _updateInfo.url) ||
    "https://github.com/mimuruu/EWEADN-GS02-Pro-Control/releases";
  try { window.pywebview.api.open_url(url); } catch (e) { }
}

function dismissUpdate() {
  const el = $("#update-banner");
  if (el) { el.className = "update-banner hidden"; el.innerHTML = ""; }
}

window.addEventListener("pywebviewready", boot);
boot();
