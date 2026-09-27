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
  if (!existing) throw new Error("Set today's target first.");

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

async function adjustAccumulated(deltaSeconds) {
  const dateStr = getTodayDateStr();
  const existing = await fetchTodayRow();
  if (!existing) return;
  const next = Math.max(0, (existing.accumulated_seconds || 0) + deltaSeconds);
  const { error } = await supabaseClient
    .from("work_log")
    .update({ accumulated_seconds: next, manual_override: true })
    .eq("work_date", dateStr);
  if (error) throw error;
  return fetchTodayRow();
}

async function resetDay() {
  const { error } = await supabaseClient
    .from("work_log")
    .delete()
    .eq("work_date", getTodayDateStr());
  if (error) throw error;
}

// ==========================================
// UI STATE
// ==========================================

let row = null;               // current Supabase row for today
let liveTickId = null;
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
  if (!row || row.target_hours == null) {
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
  const badge = el("shiftBadge");
  badge.classList.toggle("on", isOn);
  el("shiftBadgeText").innerText = isOn ? "ON SHIFT" : "OFF SHIFT";

  el("ringButton").classList.toggle("on", isOn);
  el("ringHint").innerText = isOn ? "TAP TO CLOCK OUT" : "TAP TO CLOCK IN";
  el("ringTimer").innerText = formatClock(currentSessionSeconds());

  const workedSeconds = currentWorkedSeconds();
  const targetSeconds = row.target_hours * 3600;
  const remainingSeconds = Math.max(0, targetSeconds - workedSeconds);
  const pct = targetSeconds > 0 ? Math.min(100, (workedSeconds / targetSeconds) * 100) : 0;

  el("statWorked").innerText = formatDuration(workedSeconds);
  el("statRemaining").innerText = formatDuration(remainingSeconds);
  el("statTarget").innerText = `${row.target_hours}h`;
  el("targetPct").innerText = `${Math.round(pct)}%`;
  el("targetBarFill").style.width = `${pct}%`;

  const ringProgress = el("ringProgress");
  ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
  ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - pct / 100)}`;

  // Manual override controls are disabled while a session is running,
  // so accumulated time never gets edited out from under a live clock-in.
  const overrideControls = document.querySelectorAll(".qa-btn, #customSubtract, #customAdd, #customHrs, #customMin");
  overrideControls.forEach((btn) => { btn.disabled = isOn; });
  el("overrideHint").style.display = isOn ? "block" : "none";

  clearInterval(liveTickId);
  if (isOn) {
    liveTickId = setInterval(render, 1000);
  }
}

async function refresh() {
  clearError();
  try {
    row = await fetchTodayRow();
    render();
  } catch (err) {
    showError(err.message || String(err));
  }
}

// ==========================================
// TARGET SETUP SCREEN WIRING
// ==========================================

let tsHoursValue = 8;
const TS_PRESET_VALUES = [6, 8, 10, 12];

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
    try {
      row = await startDay(tsHoursValue);
      playTargetSetSound();
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  el("ringButton").addEventListener("click", async () => {
    try {
      clearError();
      row = await toggleClock();
      row.status === "Clocked In" ? playClockInSound() : playClockOutSound();
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  document.querySelectorAll(".qa-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        row = await adjustAccumulated(parseInt(btn.dataset.delta, 10));
        render();
      } catch (err) {
        showError(err.message || String(err));
      }
    });
  });

  el("customAdd").addEventListener("click", async () => {
    const hrs = parseInt(el("customHrs").value, 10) || 0;
    const mins = parseInt(el("customMin").value, 10) || 0;
    if (!hrs && !mins) return showError("Enter hours and/or minutes.");
    try {
      row = await adjustAccumulated((hrs * 3600) + (mins * 60));
      el("customHrs").value = "";
      el("customMin").value = "";
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  el("customSubtract").addEventListener("click", async () => {
    const hrs = parseInt(el("customHrs").value, 10) || 0;
    const mins = parseInt(el("customMin").value, 10) || 0;
    if (!hrs && !mins) return showError("Enter hours and/or minutes.");
    try {
      row = await adjustAccumulated(-((hrs * 3600) + (mins * 60)));
      el("customHrs").value = "";
      el("customMin").value = "";
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  el("changeTargetBtn").addEventListener("click", () => {
    openTargetSetup(row ? row.target_hours : 8);
  });
  el("statTargetCard").addEventListener("click", () => {
    openTargetSetup(row ? row.target_hours : 8);
  });

  el("resetDayBtn").addEventListener("click", async () => {
    if (!confirm("Reset today completely? This deletes all tracked hours and your target.")) return;
    try {
      await resetDay();
      row = null;
      render();
    } catch (err) {
      showError(err.message || String(err));
    }
  });

  refresh();
});
