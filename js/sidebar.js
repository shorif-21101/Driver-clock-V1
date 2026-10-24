// ==========================================
// SIDEBAR / TAB NAV
// To add a new page later: add ONE line to PAGES below.
// The highlighted tab is detected from the URL automatically.
// ==========================================

(function () {
  const ICON = {
    clock:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    calendar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
    analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'
  };

  const PAGES = [
    { id: "clock",     label: "CLOCK",     href: "clock.html",     icon: ICON.clock },
    { id: "dashboard", label: "CALENDAR",  href: "index.html",     icon: ICON.calendar },
    { id: "analytics", label: "ANALYTICS", href: "analytics.html", icon: ICON.analytics }
    // , { id: "xyz", label: "NEW PAGE", href: "xyz.html", icon: ICON.analytics }
  ];

  const path = location.pathname.toLowerCase();
  const current =
    path.endsWith("analytics.html") ? "analytics" :
    path.endsWith("clock.html")     ? "clock" :
    "dashboard";

  const nav = document.createElement("nav");
  nav.className = "side-nav";
  nav.setAttribute("aria-label", "Pages");

  nav.innerHTML =
    '<div class="sn-brand"><span class="sn-mark">//</span>' +
    '<span class="sn-brand-text">UBER<span class="slash">//</span>SHIFT</span></div>' +
    PAGES.map((p) =>
      `<a class="sn-item${p.id === current ? " active" : ""}" href="${p.href}" aria-label="${p.label}">` +
      `${p.icon}<span class="sn-label">${p.label}</span></a>`
    ).join("") +
    '<div class="sn-spacer"></div>';

  document.body.classList.add("has-sidenav");
  document.body.prepend(nav);
})();