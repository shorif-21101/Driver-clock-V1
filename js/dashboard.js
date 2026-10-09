let monthData = {};
let currentDate = new Date();
currentDate.setDate(1);
let selectedDateStr = "";

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("btnPrevMonth").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("btnNextMonth").addEventListener("click", () => shiftMonth(1));
  document.getElementById("btnCancelEdit").addEventListener("click", closeModal);
  document.getElementById("btnSaveEdit").addEventListener("click", saveEdit);
  loadMonth();
});


  document.getElementById("btnCopyClockLink").addEventListener("click", async () => {
    const clockUrl = new URL("clock.html", window.location.href).href;
    try {
      await navigator.clipboard.writeText(clockUrl);
    } catch (err) {
      const temp = document.createElement("textarea");
      temp.value = clockUrl;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
    const btn = document.getElementById("btnCopyClockLink");
    const label = document.getElementById("copyLinkLabel");
    btn.classList.add("copied");
    label.innerText = "Copied!";
    setTimeout(() => {
      btn.classList.remove("copied");
      label.innerText = "Copy Clock Link";
    }, 1800);
  });










function toIsoDate(d) {
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

function toggleLoading(on) {
  document.getElementById("loadingOverlay").style.display = on ? "flex" : "none";
}

function showError(msg) {
  const b = document.getElementById("errorBanner");
  b.innerText = msg;
  b.style.display = "block";
  setTimeout(() => { b.style.display = "none"; }, 5000);
}

async function fetchMonthData(year, monthIndex) {
  const firstDay = toIsoDate(new Date(year, monthIndex, 1));
  const lastDay = toIsoDate(new Date(year, monthIndex + 1, 0));
  const { data, error } = await supabaseClient
    .from("work_log")
    .select("work_date, accumulated_seconds, target_hours")
    .gte("work_date", firstDay)
    .lte("work_date", lastDay);
  if (error) throw error;
  const map = {};
  (data || []).forEach((row) => { map[row.work_date] = row; });
  return map;
}

async function loadMonth() {
  toggleLoading(true);
  try {
    monthData = await fetchMonthData(currentDate.getFullYear(), currentDate.getMonth());
    renderCalendar();
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    toggleLoading(false);
  }
}

function shiftMonth(offset) {
  currentDate.setDate(1);
  currentDate.setMonth(currentDate.getMonth() + offset);
  loadMonth();
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById("monthYearLabel").innerText = `${monthNames[month]} ${year}`;

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startOffset = firstDay.getDay() - 1;
  if (startOffset === -1) startOffset = 6;

  const todayStr = toIsoDate(new Date());
  let totalSeconds = 0;

  for (let i = 0; i < startOffset; i++) {
    const cell = document.createElement("div");
    cell.className = "day-cell empty-cell";
    grid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toIsoDate(new Date(year, month, day));
    const row = monthData[dateStr];
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (dateStr === todayStr) cell.classList.add("today");

    let content;
    if (row && row.accumulated_seconds) {
      totalSeconds += row.accumulated_seconds;
      content = formatDuration(row.accumulated_seconds);
      const hoursWorked = row.accumulated_seconds / 3600;
      if (hoursWorked < 8) cell.classList.add("under-target");
      else if (hoursWorked < 10) cell.classList.add("target-met");
      else cell.classList.add("over-target");
    } else {
      cell.classList.add("missing-data");
      content = "No data";
    }

    cell.innerHTML = `<div class="date-number">${day}</div><div class="time-record">${content}</div>`;
    cell.addEventListener("click", () => openModal(dateStr, row));
    grid.appendChild(cell);
  }

  document.getElementById("monthlyTotal").innerText = formatDuration(totalSeconds);
}

function openModal(dateStr, row) {
  selectedDateStr = dateStr;
  const dateObj = new Date(dateStr + "T00:00:00");
  document.getElementById("modalDateLabel").innerText =
    dateObj.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const totalMinutes = row ? Math.floor((row.accumulated_seconds || 0) / 60) : 0;
  document.getElementById("editHours").value = Math.floor(totalMinutes / 60);
  document.getElementById("editMinutes").value = totalMinutes % 60;

  document.getElementById("editModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("editModal").classList.add("hidden");
  selectedDateStr = "";
}

async function saveEdit() {
  const hrs = parseInt(document.getElementById("editHours").value, 10) || 0;
  const mins = parseInt(document.getElementById("editMinutes").value, 10) || 0;
  const dateStr = selectedDateStr;
  const totalSeconds = (hrs * 3600) + (mins * 60);

  closeModal();
  toggleLoading(true);
  try {
    const { data: existing, error: fetchErr } = await supabaseClient
      .from("work_log")
      .select("work_date")
      .eq("work_date", dateStr)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    if (existing) {
      const { error } = await supabaseClient
        .from("work_log")
        .update({ accumulated_seconds: totalSeconds, status: "Clocked Out", last_clock_in: null, manual_override: true })
        .eq("work_date", dateStr);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from("work_log")
        .insert({ work_date: dateStr, accumulated_seconds: totalSeconds, status: "Clocked Out", manual_override: true });
      if (error) throw error;
    }
       await loadMonth();
    await loadWeeks(); // keep week total + panel in sync after an edit
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    toggleLoading(false);
  }
}


// ==========================================
// WEEKLY HOURS (Mon–Sun) + SLIDE-IN PANEL
// ==========================================

let weeksData = []; // 10 weeks, oldest -> newest (last item = current week)

function getMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday = start of week
  return x;
}

function weekStatus(hours) {
  if (hours >= 60) return { cls: "wk-purple", label: "EXCELLENT" };
  if (hours >= 55) return { cls: "wk-green", label: "ON TARGET" };
  return { cls: "wk-red", label: "WARNING" };
}

async function loadWeeks() {
  try {
    const thisMonday = getMonday(new Date());
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - 63); // 9 weeks back + current week = 10
    const end = new Date(thisMonday);
    end.setDate(end.getDate() + 6);

    const { data, error } = await supabaseClient
      .from("work_log")
      .select("work_date, accumulated_seconds")
      .gte("work_date", toIsoDate(start))
      .lte("work_date", toIsoDate(end));
    if (error) throw error;

    const weeks = [];
    for (let i = 0; i < 10; i++) {
      const ws = new Date(start);
      ws.setDate(start.getDate() + i * 7);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      weeks.push({ start: ws, end: we, startStr: toIsoDate(ws), endStr: toIsoDate(we), seconds: 0 });
    }

    (data || []).forEach((r) => {
      const w = weeks.find((wk) => r.work_date >= wk.startStr && r.work_date <= wk.endStr);
      if (w) w.seconds += r.accumulated_seconds || 0;
    });

    weeksData = weeks;
    document.getElementById("weeklyTotal").innerText = formatDuration(weeks[9].seconds);
    renderWeekList();
  } catch (err) {
    showError(err.message || String(err));
  }
}

function renderWeekList() {
  const list = document.getElementById("weekList");
  list.innerHTML = "";
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  [...weeksData].reverse().forEach((w, i) => {
    const hours = w.seconds / 3600;
    const st = weekStatus(hours);
    const pct = Math.min(100, (hours / 65) * 100);

    const block = document.createElement("div");
    block.className = `week-block ${st.cls}`;
    block.style.setProperty("--i", i);
    block.innerHTML = `
      <div class="wb-top">
        <span class="wb-range">${fmt(w.start)} – ${fmt(w.end)}</span>
        ${i === 0 ? '<span class="wb-tag">THIS WEEK</span>' : ""}
      </div>
      <div class="wb-main">
        <span class="wb-hours">${formatDuration(w.seconds)}</span>
        <span class="wb-status">${st.label}</span>
      </div>
      <div class="wb-bar"><div class="wb-bar-fill" style="width:${pct}%"></div></div>
    `;
    list.appendChild(block);
  });
}

function openWeekPanel() {
  document.getElementById("weekPanel").classList.add("open");
  document.getElementById("weekPanel").setAttribute("aria-hidden", "false");
  document.getElementById("weekBackdrop").classList.add("show");
}

function closeWeekPanel() {
  document.getElementById("weekPanel").classList.remove("open");
  document.getElementById("weekPanel").setAttribute("aria-hidden", "true");
  document.getElementById("weekBackdrop").classList.remove("show");
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("btnWeekPill").addEventListener("click", openWeekPanel);
  document.getElementById("btnCloseWeek").addEventListener("click", closeWeekPanel);
  document.getElementById("weekBackdrop").addEventListener("click", closeWeekPanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWeekPanel(); });
  loadWeeks();
});