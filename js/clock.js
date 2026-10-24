// ==========================================
// HELPERS
// ==========================================

function el(id) { return document.getElementById(id); }

function getTodayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDuration(totalSeconds) {
  const totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ==========================================
// DATA LAYER (Supabase)
// ==========================================

async function fetchTodayRow() {
  const { data, error } = await supabaseClient
    .from("work_log")
    .select("*")
    .eq("work_date", getTodayDateStr())
    .maybeSingle();
  if (error) throw error;
  return data;
}

// targetHours can be a number, or null for "skip target for today"
async function startDay(targetHours) {
  const dateStr = getTodayDateStr();
  const existing = await fetchTodayRow();
  if (existing) {
    const { error } = await supabaseClient
      .from("work_log")
      .update({ target_hours: targetHours })
      .eq("work_date", dateStr);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient
      .from("work_log")
      .insert({ work_date: dateStr, target_hours: targetHours, status: "Clocked Out", accumulated_seconds: 0 });
    if (error) throw error;
  }
  return fetchTodayRow();
}

async function toggleClock() {
  const dateStr = getTodayDateStr();
  const existing = await fetchTodayRow();
  if (!existing) throw new Error("Start today first.");

  if (existing.status === "Clocked In") {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(existing.last_clock_in).getTime()) / 1000));
    const { error } = await supabaseClient
      .from("work_log")
      .update({
        status: "Clocked Out",
        last_clock_in: null,
        accumulated_seconds: (existing.accumulated_seconds || 0) + elapsedSeconds
      })
      .eq("work_date", dateStr);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient
      .from("work_log")
      .update({ status: "Clocked In", last_clock_in: new Date().toISOString() })
      .eq("work_date", dateStr);
    if (error) throw error;
  }
  return fetchTodayRow();
}

// Manual override: replaces today's total with exactly this many seconds.
// Clocking in afterwards keeps adding on top of it.
async function setAccumulated(totalSeconds) {
  const { error } = await supabaseClient
    .from("work_log")
    .update({ accumulated_seconds: totalSeconds, manual_override: true })
    .eq("work_date", getTodayDateStr());
  if (error) throw error;
  return fetchTodayRow();
}

// ==========================================
// UI STATE
// ==========================================

let row = null;               // today's Supabase row (null = today not started yet)
let liveTickId = null;
// ---- Local cache so the screen shows instantly on reopen ----
const CACHE_KEY = "shiftRowCache";

function saveCachedRow(r) {
  try {
    if (r) localStorage.setItem(CACHE_KEY, JSON.stringify({ date: getTodayDateStr(), row: r }));
    else localStorage.removeItem(CACHE_KEY);
  } catch (e) {}
}

function loadCachedRow() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.date === getTodayDateStr() ? parsed.row : null; // ignore yesterday's cache
  } catch (e) { return null; }
}

function hideLoader() {
  const l = el("loadingScreen");
  if (!l || l.classList.contains("hidden")) return;
  l.classList.add("hidden");
  setTimeout(() => { l.style.display = "none"; }, 400);
}
const RING_RADIUS = 115;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function currentWorkedSeconds() {
  if (!row) return 0;
  let seconds = row.accumulated_seconds || 0;
  if (row.status === "Clocked In" && row.last_clock_in) {
    seconds += Math.max(0, Math.floor((Date.now() - new Date(row.last_clock_in).getTime()) / 1000));
  }
  return seconds;
}

function currentSessionSeconds() {
  if (!row || row.status !== "Clocked In" || !row.last_clock_in) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(row.last_clock_in).getTime()) / 1000));
}

function showError(msg) {
  const b = el("errorBanner");
  b.innerText = msg;
  b.style.display = "block";
}

function clearError() {
  const b = el("errorBanner");
  b.style.display = "none";
  b.innerText = "";
}

function render() {
  saveCachedRow(row);
  // The target screen only shows when today has no row at all yet.
  // Once "Start Day" or "Skip" has been used today, it never shows again that day.
  if (!row) {
    el("targetSetup").style.display = "flex";
    el("shiftScreen").style.display = "none";
    clearInterval(liveTickId);
    return;
  }

  el("targetSetup").style.display = "none";
  el("shiftScreen").style.display = "flex";

  const dateObj = new Date();
  el("shiftDate").innerText = dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  const isOn = row.status === "Clocked In";
  el("shiftBadge").classList.toggle("on", isOn);
  el("shiftBadgeText").innerText = isOn ? "ON SHIFT" : "OFF SHIFT";

 el("ringButton").classList.toggle("on", isOn);
  el("reactor").classList.toggle("on", isOn);
  el("ringHint").innerText = isOn ? "TAP TO CLOCK OUT" : "TAP TO CLOCK IN";
  el("ringTimer").innerText = formatClock(currentSessionSeconds());

  const workedSeconds = currentWorkedSeconds();
  const hasTarget = row.target_hours != null;
  const targetSeconds = hasTarget ? row.target_hours * 3600 : 0;
  const remainingSeconds = hasTarget ? Math.max(0, targetSeconds - workedSeconds) : 0;
  const pct = hasTarget && targetSeconds > 0 ? Math.min(100, (workedSeconds / targetSeconds) * 100) : 0;

  el("statWorked").innerText = formatDuration(workedSeconds);
  el("statRemaining").innerText = hasTarget ? formatDuration(remainingSeconds) : "—";
  el("statTarget").innerText = hasTarget ? `${row.target_hours}h` : "Not set";
  el("targetPct").innerText = hasTarget ? `${Math.round(pct)}%` : "—";
  el("targetBarFill").style.width = `${pct}%`;
  document.querySelector(".target-row").classList.toggle("no-target", !hasTarget);

  const ringProgress = el("ringProgress");
  ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
  ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - pct / 100)}`;

  // Manual override is locked while a session is running, so the saved
  // total can never clash with a live clock-in.
  const overrideControls = document.querySelectorAll("#customHrs, #customMin, #overrideSave");
  overrideControls.forEach((ctrl) => { ctrl.disabled = isOn; });
  el("overrideHint").style.display = isOn ? "block" : "none";

  clearInterval(liveTickId);
  if (isOn) {
    liveTickId = setInterval(render, 1000);
  }
}

async function refresh() {
  clearError();

  // 1) Instant paint from cache (if today was already started on this phone)
  const cached = loadCachedRow();
  if (cached) {
    row = cached;
    render();
    hideLoader();
  }

  // 2) Confirm with Supabase in the background
  try {
    row = await fetchTodayRow();
    render();
  } catch (err) {
    // If we have no cache, we still can't show a wrong screen, so fall back
    // to the shift screen only when a row exists.
    showError(err.message || String(err));
  } finally {
    hideLoader();
  }
}

// ==========================================
// TARGET SETUP SCREEN
// ==========================================

let tsHoursValue = 8;

function renderTsHours() {
  el("tsHours").innerText = tsHoursValue;
  document.querySelectorAll(".ts-preset").forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.hours, 10) === tsHoursValue);
  });
}

function openTargetSetup(prefillHours) {
  tsHoursValue = prefillHours || 8;
  renderTsHours();
  el("targetSetup").style.display = "flex";
  el("shiftScreen").style.display = "none";
}

// ==========================================
// EVENT WIRING
// ==========================================

document.addEventListener("DOMContentLoaded", function () {
  if (!supabaseClient) {
    document.body.innerHTML =
      '<div style="padding:24px;color:#F5F5F4;font-family:sans-serif;line-height:1.5;">' +
      "<strong>Supabase isn't configured yet.</strong><br>Open <code>js/supabaseClient.js</code> and paste in your " +
      "Project URL and anon key from your Supabase dashboard (Project Settings &gt; API), then reload this page." +
      "</div>";
    return;
  }


    // ---- Dashboard button ----
  const goDashboard = () => { window.location.href = "index.html"; };
  el("btnDashboard").addEventListener("click", goDashboard);
  el("btnDashboard").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") goDashboard();
  });

  // ---- Target screen ----
  el("tsMinus").addEventListener("click", () => {
    tsHoursValue = Math.max(1, tsHoursValue - 1);
    renderTsHours();
  });

  el("tsPlus").addEventListener("click", () => {
    tsHoursValue = Math.min(16, tsHoursValue + 1);
    renderTsHours();
  });

  document.querySelectorAll(".ts-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      tsHoursValue = parseInt(btn.dataset.hours, 10);
      renderTsHours();
    });
  });

  el("tsStart").addEventListener("click", async () => {
    unlockAudioContext();
    try {
      row = await startDay(tsHoursValue);
      playTargetSetSound();
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  el("tsSkip").addEventListener("click", async () => {
    unlockAudioContext();
    try {
      row = await startDay(null);
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  // ---- Clock ring ----
  el("ringButton").addEventListener("click", async () => {
    unlockAudioContext();
    try {
      clearError();
      row = await toggleClock();
      row.status === "Clocked In" ? playClockInSound() : playClockOutSound();
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  // ---- Manual override (hours + minutes + save) ----
  el("overrideSave").addEventListener("click", async () => {
    const hrsRaw = el("customHrs").value;
    const minRaw = el("customMin").value;
    if (hrsRaw === "" && minRaw === "") return showError("Enter hours and/or minutes.");

    const hrs = Math.min(24, Math.max(0, parseInt(hrsRaw, 10) || 0));
    const mins = Math.min(59, Math.max(0, parseInt(minRaw, 10) || 0));

    try {
      clearError();
      row = await setAccumulated((hrs * 3600) + (mins * 60));
      el("customHrs").value = "";
      el("customMin").value = "";
      el("overrideSave").closest("details").open = false;
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  // ---- Tap the Target card to change today's target ----
  el("statTargetCard").addEventListener("click", () => {
    openTargetSetup(row ? row.target_hours : 8);
  });

  // Re-sync quietly whenever you come back to the app
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });

  refresh();
});