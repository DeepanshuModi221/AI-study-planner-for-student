# AI Study Planner for Students

AI Study Planner for Students is a lightweight web app where students enter subjects and exam dates, then get an automatically generated study schedule.

## Features

1. Calendar Integration
- Export all study tasks as an `.ics` file for any calendar app.
- Add individual tasks directly to Google Calendar from the schedule list.

2. Smart Task Scheduling
- Generates a daily plan based on:
  - exam proximity
  - subject difficulty
  - target study hours
- Balances workload with a configurable daily cap.

3. Progress Tracking
- Mark tasks completed with checkboxes.
- View overall progress and subject-wise completion bars.
- Saves progress in browser local storage.

4. Reminder Notifications
- Uses browser notifications for upcoming tasks.
- Shows an upcoming reminder list in the app.

## Real-world Use

This project is practical for schools and colleges to support students in planning revision timelines, reducing last-minute cramming, and improving exam readiness.

## Run

1. Open `index.html` in a browser.
2. Add subjects, exam dates, difficulty, and target hours.
3. Click `Generate Smart Study Schedule`.

Optional for local server:

```bash
# from project folder
python -m http.server 5500
```

Then open `http://localhost:5500`.

## Tech

- HTML
- CSS
- Vanilla JavaScript
