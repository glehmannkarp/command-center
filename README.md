# Personal Command Center

A personal dashboard that runs in the browser: tasks, habits, a calendar, a focus timer, quick notes and St. Louis weather. Plain HTML, CSS and JavaScript, with no build step and nothing to install.

## Running it

Double-click `index.html`, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. After editing a file, hard-refresh with `Cmd + Shift + R`.

## Features

- **Dashboard**: time-of-day greeting (click the name to change it) with a summary of today's events and high-priority tasks, a clock, live weather (hourly and 7-day, from [Open-Meteo](https://open-meteo.com)), a Pomodoro-style focus timer, and quick notes that export to Word or PDF
- **Task manager**: tasks with priorities, editing, and undo on delete
- **Habit tracker**: weekly check-offs with streaks
- **Calendar**: month view with timed, editable and repeating events
- **Settings**: light, dark or system theme, plus backup and restore of all data
- Works on phones, with a bottom tab bar on narrow screens

## Data

Everything is stored in the browser's `localStorage`, so it stays on this computer and in this browser only. Use **Settings → Download Backup** to save a copy.
