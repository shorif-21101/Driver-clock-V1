// ==========================================
// ANALYTICS PAGE
// Monthly mode: tax-year line chart (April → March)
// Weekly mode:  this week vs previous 4 weeks
// ==========================================

const ACCENT = "#D97757", ACCENT_HI = "#FF9B73";
const PURPLE = "#A594E0", GREEN = "#78B793", RED = "#C65D63";
const ORANGE = "#E0935C", CYAN = "#4FC3D0";

const MAX_MONTHS = 24;   // used for the trend card
const MAX_WEEKS = 12;

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MON_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

let allDays = new Map();   // "YYYY-MM-DD" -> hours
let months = [];           // oldest -> newest (last = current month)
let weeks = [];            // oldest -> newest (last = current week)
let mode = "monthly";
let taxYear = 0;           // start year of the tax year being shown (April of this year)
let chart2 = null;

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function getMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function daysIn(m) { return new Date(m.year, m.month + 1, 0).getDate(); }
function fmtH(h) {
  const mins = Math.round(Math.max(0, h) * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function sumTo(days, n) { return days.slice(0, n).reduce((a, b) => a + b, 0); }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function linreg(ys) {
  const n = ys.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  ys.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
  const d = n * sxx - sx * sx;
  if (!d) return null;
  const m = (n * sxy - sx * sy) / d;
  return { m, b: (sy - m * sx) / n };
}
// How many days of the current period to compare. If today has no hours yet,
// compare through yesterday so a fresh morning doesn't look like "decreased".
function effN(days, idx) {
  let n = idx + 1;
  if (n > 1 && days[idx] === 0) n--;
  return n;
}
function showError(msg) {
  const b = $("errorBanner");
  b.innerText = msg;
  b.style.display = "block";
}

// ---------- tax year helpers (April → March) ----------
function taxStart(year, month) { return month >= 3 ? year : year - 1; }
function taxLabelOf(y) { return `${y}/${String(y + 1).slice(2)}`; }
function taxSlots(startYear) {
  return Array.from({ length: 12 }, (_, i) => {
    const mi = 3 + i;
    return { year: startYear + (mi >= 12 ? 1 : 0), month: mi % 12 };
  });
}

// ==========================================
// CHART STYLING + PLUGINS
// ==========================================
const glowPlugin = {
  id: "glow",
  beforeDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index];
    if (!ds.glow) return;
    chart.ctx.save();
    chart.ctx.shadowColor = ds.borderColor;
    chart.ctx.shadowBlur = ds.glow;
  },
  afterDatasetDraw(chart, args) {
    if (chart.data.datasets[args.index].glow) chart.ctx.restore();
  }
};

// Prints the hours above each point, with a green ▲ / red ▼ change underneath
const valueLabelPlugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const small = chart.width < 520;
    const ctx = chart.ctx;
    chart.data.datasets.forEach((ds, di) => {
      if (!ds.showValues) return;
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      meta.data.forEach((pt, i) => {
        const v = ds.data[i];
               if (v == null || v === 0) return;
        const d = ds.deltas ? ds.deltas[i] : null;
        const baseY = pt.y - (i === ds.curIdx ? 16 : 13);

        let hoursY = baseY;
        if (d != null) {
          const pct = Math.round(d * 100);
          let txt, col;
          if (pct === 0) { txt = small ? "●0%" : "● 0%"; col = "#9497A6"; }
          else if (pct > 0) { txt = small ? `▲${pct}%` : `▲ ${pct}%`; col = GREEN; }
          else { txt = small ? `▼${Math.abs(pct)}%` : `▼ ${Math.abs(pct)}%`; col = RED; }
          ctx.font = `700 ${small ? 9 : 11}px 'Space Grotesk', sans-serif`;
          ctx.fillStyle = col;
          ctx.fillText(txt, pt.x, baseY);
          hoursY = baseY - (small ? 12 : 15);
        }
        ctx.font = `800 ${small ? 10 : 13}px 'Space Grotesk', sans-serif`;
        ctx.fillStyle = "#F5F5F4";
        ctx.fillText(`${Math.round(v)}h`, pt.x, hoursY);
      });
      ctx.restore();
    });
  }
};

// Prints each line's hours at the end of the line (weekly chart)
const endLabelPlugin = {
  id: "endLabels",
  afterDatasetsDraw(chart) {
    const items = [];
    chart.data.datasets.forEach((ds, di) => {
      if (!ds.endLabel) return;
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      let i = ds.data.length - 1;
      while (i >= 0 && ds.data[i] == null) i--;
      if (i < 0) return;
      const pt = meta.data[i];
      items.push({ x: pt.x, y: pt.y, text: `${Math.round(ds.data[i])}h`, color: ds.borderColor, bold: !!ds.isCur });
    });
    items.sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) {
      for (let j = 0; j < k; j++) {
        if (Math.abs(items[k].x - items[j].x) < 50 && items[k].y - items[j].y < 14) {
          items[k].y = items[j].y + 14;
        }
      }
    }
    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = "left";
    items.forEach((it) => {
      ctx.font = `${it.bold ? 800 : 700} ${it.bold ? 13 : 11}px 'Space Grotesk', sans-serif`;
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, it.x + 10, it.y + 4);
    });
    ctx.restore();
  }
};

function applyChartDefaults() {
  Chart.register(glowPlugin, valueLabelPlugin, endLabelPlugin);
  Chart.defaults.font.family = "'Space Grotesk', sans-serif";
  Chart.defaults.color = "#9497A6";
  Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
  Chart.defaults.animation.duration = 1100;
  Chart.defaults.animation.easing = "easeOutQuart";
}

const legendBase = {
  position: "top",
  align: "end",
  labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 11, weight: "600" } }
};

const yScale = (max) => ({
  beginAtZero: true,
  suggestedMax: max,
  grid: { color: "rgba(255,255,255,0.06)", drawTicks: false },
  border: { display: false },
  ticks: { padding: 8, maxTicksLimit: 7, callback: (v) => `${v}h` }
});
const xScale = () => ({
  grid: { display: false },
  border: { color: "rgba(255,255,255,0.1)" },
  ticks: { padding: 6, maxRotation: 0, autoSkip: false }
});

function areaGradient(ctx, hex) {
  const chart = ctx.chart, a = chart.chartArea;
  if (!a) return hexA(hex, 0.15);
  const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
  g.addColorStop(0, hexA(hex, 0.38));
  g.addColorStop(1, hexA(hex, 0));
  return g;
}

function lineSet(o) {
  return Object.assign({
    type: "line",
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 0,
    cubicInterpolationMode: "monotone",
    spanGaps: false
  }, o);
}

// No hover / tooltips anywhere: only clicks (so the legend still toggles lines)
const noHover = { events: ["click"] };

// ==========================================
// DATA
// ==========================================
async function fetchAllRows() {
  const rows = [];
  const page = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseClient
      .from("work_log")
      .select("work_date, accumulated_seconds")
      .order("work_date", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  return rows;
}

function buildMonths() {
  const byKey = new Map();
  allDays.forEach((h, ds) => {
    const [y, m, d] = ds.split("-").map(Number);
    const key = y * 12 + (m - 1);
    let o = byKey.get(key);
    if (!o) { o = { year: y, month: m - 1, days: new Array(31).fill(0), total: 0, worked: 0 }; byKey.set(key, o); }
    o.days[d - 1] += h;
    o.total += h;
    if (h > 0) o.worked++;
  });
  const now = new Date();
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const first = byKey.size ? Math.min(...byKey.keys()) : nowKey;
  const out = [];
  for (let k = first; k <= nowKey; k++) {
    out.push(byKey.get(k) || { year: Math.floor(k / 12), month: k % 12, days: new Array(31).fill(0), total: 0, worked: 0 });
  }
  return out;
}

function buildWeeks() {
  const byKey = new Map();
  allDays.forEach((h, ds) => {
    const d = parseDate(ds);
    const mon = getMonday(d);
    const key = toIso(mon);
    let o = byKey.get(key);
    if (!o) { o = { start: mon, days: new Array(7).fill(0), total: 0, worked: 0 }; byKey.set(key, o); }
    o.days[(d.getDay() + 6) % 7] += h;
    o.total += h;
    if (h > 0) o.worked++;
  });
  const thisMon = getMonday(new Date());
  const keys = [...byKey.keys()].sort();
  const firstMon = keys.length ? parseDate(keys[0]) : thisMon;
  const out = [];
  for (let d = new Date(firstMon); d <= thisMon; d.setDate(d.getDate() + 7)) {
    out.push(byKey.get(toIso(d)) || { start: new Date(d), days: new Array(7).fill(0), total: 0, worked: 0 });
  }
  return out;
}

async function loadData() {
  const rows = await fetchAllRows();
  allDays = new Map();
  rows.forEach((r) => {
    allDays.set(r.work_date, (allDays.get(r.work_date) || 0) + (r.accumulated_seconds || 0) / 3600);
  });
  months = buildMonths();
  weeks = buildWeeks();
  if (!taxYear) {
    const now = new Date();
    taxYear = taxStart(now.getFullYear(), now.getMonth());
  }
}

// ==========================================
// MODELS (what we compare)
// ==========================================
function modelMonthly() {
  const cur = months[months.length - 1];
  const completed = months.slice(0, -1);
  const dom = new Date().getDate();
  const n = effN(cur.days, dom - 1);
  const curTo = sumTo(cur.days, n);
  const comps = completed.map((m) => sumTo(m.days, Math.min(n, daysIn(m))));
  const last = completed[completed.length - 1];
  const usedSum = completed.reduce((s, m) => s + m.total, 0);
  const usedWorked = completed.reduce((s, m) => s + m.worked, 0);
  return {
    kind: "month", cur, completed, n, curTo,
    baseline: comps.length ? avg(comps) : null,
    baseCount: comps.length,
    lastTo: last ? sumTo(last.days, Math.min(n, daysIn(last))) : null,
    usualPerDay: usedWorked ? usedSum / usedWorked : null
  };
}

function modelWeekly() {
  const cur = weeks[weeks.length - 1];
  const completed = weeks.slice(0, -1);
  const prev = completed.slice(-4);
  const idx = (new Date().getDay() + 6) % 7;
  const n = effN(cur.days, idx);
  const curTo = sumTo(cur.days, n);
  const comps = prev.map((w) => sumTo(w.days, n));
  const last = completed[completed.length - 1];
  const usedSum = prev.reduce((s, w) => s + w.total, 0);
  const usedWorked = prev.reduce((s, w) => s + w.worked, 0);
  return {
    kind: "week", cur, completed, prev, n, curTo,
    baseline: comps.length ? avg(comps) : null,
    baseCount: comps.length,
    lastTo: last ? sumTo(last.days, n) : null,
    usualPerDay: usedWorked ? usedSum / usedWorked : null
  };
}

// ==========================================
// VERDICT + KPIs
// ==========================================
function renderVerdict(m) {
  const v = $("verdict");
  let cls = "neutral";
  let title = "NOT ENOUGH HISTORY";
  let text = "Keep logging. Comparisons unlock once a full previous period exists.";
  let text2 = "";
  let delta = "—";

  const isMonth = m.kind === "month";
  const through = isMonth ? `${MON[m.cur.month]} ${m.n}` : DOW[m.n - 1];
  const per = isMonth ? "month" : "week";

  if (m.baseline != null && m.baseline > 0 && !(m.n === 1 && m.curTo === 0)) {
    const d = m.curTo / m.baseline - 1;
    const diff = m.curTo - m.baseline;
    cls = d >= 0.05 ? "ahead" : d <= -0.05 ? "behind" : "par";
    title = { ahead: "HOURS INCREASED", par: "ABOUT THE SAME", behind: "HOURS DECREASED" }[cls];
    delta = `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))}%`;

    text = cls === "par"
      ? `You've worked ${fmtH(m.curTo)} by ${through}, about the same as usual.`
      : `You've worked ${fmtH(m.curTo)} by ${through}, which is ${fmtH(Math.abs(diff))} ${diff >= 0 ? "more" : "less"} than usual.`;

    text2 = `Usual by ${through}: ${fmtH(m.baseline)}` +
      (m.lastTo != null ? ` · Last ${per} by ${through}: ${fmtH(m.lastTo)}` : "");
  } else if (m.n === 1 && m.curTo === 0 && m.baseline) {
    title = "FRESH START";
    text = `No hours logged yet this ${per}.`;
  }

  v.className = `verdict ${cls}`;
  void v.offsetWidth;
  v.classList.add("enter");
  $("vTitle").innerText = title;
  $("vText").innerText = text;
  $("vText2").innerText = text2;
  $("vDelta").innerText = delta;
}

function deltaSub(cur, base, text) {
  if (!base) return '<span class="neu">no history yet</span>';
  const d = cur / base - 1;
  const cls = d >= 0.03 ? "pos" : d <= -0.03 ? "neg" : "neu";
  return `<span class="${cls}">${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 100))}%</span> ${text}`;
}

function renderKpis(m) {
  const isMonth = m.kind === "month";
  const cur = m.cur;
  const perDay = cur.worked ? cur.total / cur.worked : 0;

  const best = m.completed.length
    ? m.completed.reduce((a, b) => (b.total > a.total ? b : a))
    : null;
  const bestLabel = best
    ? (isMonth ? `${MON_FULL[best.month]} ${best.year}` : `Week of ${MON[best.start.getMonth()]} ${best.start.getDate()}`)
    : "no history yet";

  const trendSrc = m.completed.slice(-((isMonth ? MAX_MONTHS : MAX_WEEKS) - 1)).map((p) => p.total);
  const reg = trendSrc.length >= 3 ? linreg(trendSrc) : null;
  let trendVal = "—", trendSub = '<span class="neu">need 3+ periods</span>';
  if (reg) {
    const mean = avg(trendSrc) || 1;
    const rel = reg.m / mean;
    const dir = rel > 0.015 ? "pos" : rel < -0.015 ? "neg" : "neu";
    const word = dir === "pos" ? "▲ increasing" : dir === "neg" ? "▼ decreasing" : "● steady";
    trendVal = `${reg.m >= 0 ? "+" : "−"}${Math.abs(reg.m).toFixed(1)}h / ${isMonth ? "mo" : "wk"}`;
    trendSub = `<span class="${dir}">${word}</span> over ${trendSrc.length} ${isMonth ? "months" : "weeks"}`;
  }

  const cards = [
    { k: ACCENT, label: isMonth ? "This month" : "This week", value: fmtH(cur.total), sub: `${cur.worked} day${cur.worked === 1 ? "" : "s"} worked` },
    { k: PURPLE, label: "Avg / worked day", value: cur.worked ? fmtH(perDay) : "—", sub: cur.worked ? deltaSub(perDay, m.usualPerDay, "vs usual") : "no work logged yet" },
    { k: GREEN,  label: isMonth ? "Best month" : "Best week", value: best ? fmtH(best.total) : "—", sub: bestLabel },
    { k: CYAN,   label: "Trend", value: trendVal, sub: trendSub }
  ];

  $("kpiRow").innerHTML = cards.map((c, i) =>
    `<div class="kpi" style="--i:${i};--k:${c.k}">
       <div class="kpi-label">${c.label}</div>
       <div class="kpi-value">${c.value}</div>
       <div class="kpi-sub">${c.sub}</div>
     </div>`
  ).join("");
}

// ==========================================
// CHART: TAX YEAR (monthly mode)
// ==========================================
function updateTaxNav() {
  const now = new Date();
  const lastTax = taxStart(now.getFullYear(), now.getMonth());
  const firstTax = months.length ? taxStart(months[0].year, months[0].month) : lastTax;
  $("taxLabel").innerText = taxLabelOf(taxYear);
  $("btnPrevTax").disabled = taxYear <= firstTax;
  $("btnNextTax").disabled = taxYear >= lastTax;
}

function chartTaxYear(m) {
  const map = new Map();
  months.forEach((p) => map.set(p.year * 12 + p.month, p));

  const now = new Date();
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const slots = taxSlots(taxYear);
    const valuesFor = (sl) => sl.map((s) => {
    const key = s.year * 12 + s.month;
    if (key > nowKey) return null;            // future months: line waits for data
    const p = map.get(key);
    return p ? +p.total.toFixed(2) : 0;       // no data yet = sits on the ground
  });

  const data = valuesFor(slots);
  const curIdx = slots.findIndex((s) => s.year * 12 + s.month === nowKey);

  // change vs previous month (current month: vs the same point last month)
  const deltas = slots.map((s, i) => {
    if (data[i] == null) return null;
    if (i === curIdx) return m.lastTo > 0 ? m.curTo / m.lastTo - 1 : null;
    const prevP = map.get(s.year * 12 + s.month - 1);
    return prevP && prevP.total > 0 ? data[i] / prevP.total - 1 : null;
  });

  const datasets = [
    lineSet({
      label: taxLabelOf(taxYear), data,
           borderColor: ACCENT_HI, borderWidth: 3.5, glow: 18, order: 0, clip: false,
      fill: "origin", backgroundColor: (c) => areaGradient(c, ACCENT),
      pointRadius: (c) => (c.parsed.y === 0 ? 0 : c.dataIndex === curIdx ? 7 : 5),
      pointBackgroundColor: (c) => (c.dataIndex === curIdx ? ACCENT_HI : "#0d0e14"),
      pointBorderColor: ACCENT_HI, pointBorderWidth: 2.5,
      
      showValues: true, deltas, curIdx
    })
  ];

  const prevData = valuesFor(taxSlots(taxYear - 1));
  if (prevData.some((v) => v > 0)) {
    datasets.push(lineSet({
      label: taxLabelOf(taxYear - 1), data: prevData,
      borderColor: PURPLE, borderWidth: 2, glow: 6, order: 1, pointRadius: 3,
      pointBackgroundColor: PURPLE
    }));
  }

  $("c2Title").innerText = `TAX YEAR ${taxLabelOf(taxYear)}`;
   $("c2Sub").innerText = `April → March · hours per month · ▲▼ = change vs previous month · big filled dot = current month so far`;
  updateTaxNav();

  const vals = datasets.flatMap((d) => d.data.filter((v) => v != null));
  const yMax = Math.max(...vals, 10) * 1.3;

  return new Chart($("chart2"), {
    type: "line",
    data: { labels: slots.map((s) => MON[s.month]), datasets },
    options: Object.assign({}, noHover, {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 14 } },
      scales: { x: xScale(), y: yScale(yMax) },
      plugins: {
        legend: Object.assign({}, legendBase, { display: datasets.length > 1 }),
        tooltip: { enabled: false }
      }
    })
  });
}

// ==========================================
// CHART: WEEK vs PREVIOUS 4 WEEKS (weekly mode)
// ==========================================
function cumArray(days, len, limit) {
  let c = 0;
  const out = [];
  for (let i = 0; i < len; i++) {
    c += days[i];
    out.push(i < limit ? +c.toFixed(2) : null);
  }
  return out;
}

function chartWeekly(m) {
  const cur = m.cur;
  const prev = m.prev.slice().reverse();               // most recent first
  const palette = [PURPLE, CYAN, GREEN, ORANGE];

  const curSet = lineSet({
    isCur: true, endLabel: true, label: "This week",
    data: cumArray(cur.days, 7, m.n),
    borderColor: ACCENT_HI, borderWidth: 3.5, glow: 18, order: 0,
    fill: "origin", backgroundColor: (c) => areaGradient(c, ACCENT)
  });
  const prevSets = prev.map((p, i) => lineSet({
    endLabel: true,
    label: `Wk of ${MON[p.start.getMonth()]} ${p.start.getDate()}`,
    data: cumArray(p.days, 7, 99),
    borderColor: palette[i], borderWidth: 2, glow: 6, order: i + 1
  }));

  const datasets = [curSet, ...prevSets];
  if (prev.length) {
    const cums = prev.map((p) => cumArray(p.days, 7, 99));
    datasets.push(lineSet({
      endLabel: true, label: `Avg of previous ${prev.length}`,
      data: DOW.map((_, d) => +avg(cums.map((c) => c[d])).toFixed(2)),
      borderColor: "rgba(255,255,255,0.55)", borderDash: [6, 6], borderWidth: 1.8, order: 9
    }));
  }

  $("c2Title").innerText = "WEEK vs PREVIOUS 4 WEEKS";
  $("c2Sub").innerText = "Total hours built up through the week · the number at the end of each line is its hours";

  const all = datasets.flatMap((s) => s.data.filter((v) => v != null));
  const yMax = Math.max(...all, 10) * 1.1;

  return new Chart($("chart2"), {
    type: "line",
    data: { labels: DOW, datasets },
    options: Object.assign({}, noHover, {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 48 } },
      scales: { x: xScale(), y: yScale(yMax) },
      plugins: { legend: legendBase, tooltip: { enabled: false } }
    })
  });
}

// ==========================================
// RENDER + MODE SWITCH
// ==========================================
function buildChart(m) {
  if (chart2) chart2.destroy();
  chart2 = mode === "monthly" ? chartTaxYear(m) : chartWeekly(m);
}

function renderAll() {
  const m = mode === "monthly" ? modelMonthly() : modelWeekly();
  $("taxNav").style.display = mode === "monthly" ? "flex" : "none";
  renderVerdict(m);
  renderKpis(m);
  buildChart(m);
}

function setMode(next) {
  mode = next;
  try { localStorage.setItem("analyticsMode", next); } catch (e) {}
  $("modeToggle").dataset.mode = next;
  document.querySelectorAll("#modeToggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === next);
  });
  renderAll();
}

document.addEventListener("DOMContentLoaded", async function () {
  if (!supabaseClient) {
    showError("Supabase isn't configured. Check js/supabaseClient.js.");
    $("anLoading").classList.add("hidden");
    return;
  }

  applyChartDefaults();

  document.querySelectorAll("#modeToggle button").forEach((b) => {
    b.addEventListener("click", () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); });
  });

  $("btnPrevTax").addEventListener("click", () => { taxYear--; buildChart(modelMonthly()); });
  $("btnNextTax").addEventListener("click", () => { taxYear++; buildChart(modelMonthly()); });

  try { await document.fonts.ready; } catch (e) {}

  try {
    await loadData();
    let saved = null;
    try { saved = localStorage.getItem("analyticsMode"); } catch (e) {}
    setMode(saved === "weekly" ? "weekly" : "monthly");
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    $("anLoading").classList.add("hidden");
  }

  // Refresh quietly when you come back to the tab/app
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    try { await loadData(); renderAll(); } catch (e) {}
  });
});