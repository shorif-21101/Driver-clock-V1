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
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    toggleLoading(false);
  }
}