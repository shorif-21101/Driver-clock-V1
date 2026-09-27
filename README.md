# Driver Hours Tracker

Personal work-hours tracker. Plain HTML/CSS/JS (no build step), backed by a
free Supabase database, hosted for free on GitHub Pages.

## Structure

```
driver-hours-tracker/
├── clock.html              # Target setup + tap-to-clock shift screen
├── css/
│   └── clock.css           # Dark grid theme, single warm accent color
├── js/
│   ├── supabaseClient.js   # Your Supabase project URL + anon key go here
│   └── clock.js            # Clock page logic + Supabase read/write
├── .gitignore
└── README.md
```

(`index.html` — the dashboard/calendar page — is still to come.)

## Before this will work

1. Open `js/supabaseClient.js` and paste in your project's values from
   Supabase (Project Settings > API):

   ```js
   const SUPABASE_URL = "PASTE_YOUR_PROJECT_URL_HERE";
   const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";
   ```

2. Make sure your `work_log` table has a `target_hours` column:

   ```sql
   alter table work_log add column target_hours numeric;
   ```

## How the Clock page behaves

- **First open of a day:** no target set yet, so you get the "TODAY'S
  TARGET" screen. Pick a preset or dial in a custom number of hours, hit
  **Start Day**.
- **Main screen:** one ring — tap it to clock in, tap again to clock out.
  While clocked in, the ring fills toward your target and the center shows
  a live-ticking timer for the *current session*. "Worked today" /
  "Remaining" update live too.
- **Manual override:** quick +/- 15m/30m buttons, or a custom hours/minutes
  add or subtract — locked while a session is running, so editing time
  never conflicts with a live clock-in.
- **Change daily target:** from the override panel, or by tapping the
  Target stat card — reopens the target screen without resetting today's
  progress.
- **Reset day:** wipes today's row entirely (back to the target-setup
  screen on next load).

Clocking in and out multiple times a day keeps adding to the day's total —
only the running daily total is ever shown, same as the original system.

## Running it locally

Plain static files — no build step. In VS Code, install the "Live Server"
extension, right-click `clock.html`, and choose "Open with Live Server".
