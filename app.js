const STORAGE_KEY = "aiStudyPlannerV1";
const MAX_DAILY_HOURS = 3;

const state = {
  studentName: "",
  subjects: [],
  tasks: [],
  completedTaskIds: {},
};

let reminderTimeouts = [];

const elements = {
  addSubjectBtn: document.getElementById("add-subject-btn"),
  generateBtn: document.getElementById("generate-btn"),
  resetBtn: document.getElementById("reset-btn"),
  subjectsContainer: document.getElementById("subjects-container"),
  subjectTemplate: document.getElementById("subject-template"),
  statusMessage: document.getElementById("status-message"),
  scheduleList: document.getElementById("schedule-list"),
  overallProgressText: document.getElementById("overall-progress-text"),
  overallProgressFill: document.getElementById("overall-progress-fill"),
  subjectProgress: document.getElementById("subject-progress"),
  enableRemindersBtn: document.getElementById("enable-reminders-btn"),
  reminderList: document.getElementById("reminder-list"),
  downloadIcsBtn: document.getElementById("download-ics-btn"),
  studentNameInput: document.getElementById("student-name"),
};

function showMessage(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? "#7a1f15" : "#0a5a54";
}

function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatHumanDate(date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSubjectRow(subject = null) {
  const fragment = elements.subjectTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".subject-row");

  const subjectName = row.querySelector(".subject-name");
  const examDate = row.querySelector(".subject-exam");
  const hours = row.querySelector(".subject-hours");
  const difficulty = row.querySelector(".subject-difficulty");

  if (subject) {
    subjectName.value = subject.name;
    examDate.value = subject.examDate;
    hours.value = subject.targetHours;
    difficulty.value = String(subject.difficulty);
  }

  row.querySelector(".remove-subject-btn").addEventListener("click", () => {
    row.remove();
  });

  elements.subjectsContainer.appendChild(fragment);
}

function getSubjectsFromForm() {
  const rows = [...elements.subjectsContainer.querySelectorAll(".subject-row")];
  const subjects = [];

  for (const row of rows) {
    const name = row.querySelector(".subject-name").value.trim();
    const examDate = row.querySelector(".subject-exam").value;
    const targetHours = Number(row.querySelector(".subject-hours").value);
    const difficulty = Number(row.querySelector(".subject-difficulty").value);

    if (!name || !examDate || !targetHours) {
      continue;
    }

    subjects.push({
      id: uid("sub"),
      name,
      examDate,
      targetHours: clamp(Math.round(targetHours), 1, 300),
      difficulty: clamp(Math.round(difficulty), 1, 3),
    });
  }

  return subjects;
}

function generateTasks(subjects) {
  const today = dayStart(new Date());
  const tasks = [];
  const dailySlots = new Map();

  const subjectRuntime = subjects.map((subject) => {
    const exam = parseDateInput(subject.examDate);
    const daysLeft = Math.ceil((exam - today) / 86400000);
    const usableDays = Math.max(daysLeft - 1, 1);

    return {
      ...subject,
      examDateObj: exam,
      daysLeft,
      usableDays,
      remainingSessions: Math.ceil(subject.targetHours),
      preferredDailyLoad: clamp(Math.ceil(subject.targetHours / usableDays), 1, MAX_DAILY_HOURS),
    };
  });

  const validSubjects = subjectRuntime.filter((subject) => subject.daysLeft >= 1);

  if (!validSubjects.length) {
    return [];
  }

  const latestExam = validSubjects.reduce((max, subject) => {
    return subject.examDateObj > max ? subject.examDateObj : max;
  }, today);

  for (let date = new Date(today); date <= latestExam; date = addDays(date, 1)) {
    const dateKey = date.toISOString().slice(0, 10);
    dailySlots.set(dateKey, []);
  }

  // Greedy scheduler prioritizes urgent + difficult subjects while keeping daily workload balanced.
  function chooseSubject(date) {
    const available = validSubjects.filter((subject) => {
      const dateKey = date.toISOString().slice(0, 10);
      const beforeExam = date < subject.examDateObj;
      const underDailyLimit = dailySlots
        .get(dateKey)
        .filter((task) => task.subjectId === subject.id).length < subject.preferredDailyLoad;
      return subject.remainingSessions > 0 && beforeExam && underDailyLimit;
    });

    if (!available.length) {
      return null;
    }

    let best = available[0];
    let bestScore = -Infinity;

    for (const subject of available) {
      const daysToExam = Math.ceil((subject.examDateObj - date) / 86400000);
      const urgencyScore = 40 / Math.max(daysToExam, 1);
      const difficultyScore = subject.difficulty * 6;
      const remainingScore = subject.remainingSessions * 0.3;
      const score = urgencyScore + difficultyScore + remainingScore;

      if (score > bestScore) {
        best = subject;
        bestScore = score;
      }
    }

    return best;
  }

  for (let date = new Date(today); date <= latestExam; date = addDays(date, 1)) {
    const dateKey = date.toISOString().slice(0, 10);
    const dayBucket = dailySlots.get(dateKey);

    for (let slot = 0; slot < MAX_DAILY_HOURS; slot += 1) {
      const subject = chooseSubject(date);
      if (!subject) {
        break;
      }

      const hourLabel = `${9 + slot}:00`;
      const task = {
        id: uid("task"),
        subjectId: subject.id,
        subjectName: subject.name,
        date: dateKey,
        time: hourLabel,
        minutes: 60,
        label: `Study ${subject.name} (${hourLabel})`,
        type: "study",
      };

      tasks.push(task);
      dayBucket.push(task);
      subject.remainingSessions -= 1;
    }
  }

  for (const subject of validSubjects) {
    const revisionDate = addDays(subject.examDateObj, -1);
    if (revisionDate < today) {
      continue;
    }

    const dateKey = revisionDate.toISOString().slice(0, 10);
    const bucket = dailySlots.get(dateKey);
    if (!bucket) {
      continue;
    }

    if (bucket.length < MAX_DAILY_HOURS) {
      const slot = bucket.length;
      const revisionTask = {
        id: uid("task"),
        subjectId: subject.id,
        subjectName: subject.name,
        date: dateKey,
        time: `${9 + slot}:00`,
        minutes: 60,
        label: `Final revision: ${subject.name}`,
        type: "revision",
      };

      tasks.push(revisionTask);
      bucket.push(revisionTask);
    }
  }

  tasks.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return a.time.localeCompare(b.time);
  });

  return tasks;
}

function renderSchedule() {
  elements.scheduleList.innerHTML = "";

  if (!state.tasks.length) {
    elements.scheduleList.innerHTML = "<p>No schedule generated yet.</p>";
    return;
  }

  const grouped = new Map();
  for (const task of state.tasks) {
    if (!grouped.has(task.date)) {
      grouped.set(task.date, []);
    }
    grouped.get(task.date).push(task);
  }

  for (const [dateKey, tasks] of grouped.entries()) {
    const dayCard = document.createElement("article");
    dayCard.className = "schedule-day";

    const heading = document.createElement("h3");
    heading.textContent = formatHumanDate(new Date(`${dateKey}T00:00:00`));
    dayCard.appendChild(heading);

    for (const task of tasks) {
      const row = document.createElement("div");
      row.className = "task-row";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = Boolean(state.completedTaskIds[task.id]);
      check.addEventListener("change", () => {
        state.completedTaskIds[task.id] = check.checked;
        saveState();
        renderProgress();
        renderSchedule();
      });

      const textWrap = document.createElement("div");
      const title = document.createElement("div");
      title.textContent = task.label;
      if (check.checked) {
        title.classList.add("task-complete");
      }

      const meta = document.createElement("div");
      meta.className = "task-meta";
      meta.textContent = `${task.minutes} min | ${task.type}`;
      textWrap.appendChild(title);
      textWrap.appendChild(meta);

      const calendarLink = document.createElement("a");
      calendarLink.className = "calendar-link";
      calendarLink.target = "_blank";
      calendarLink.rel = "noopener noreferrer";
      calendarLink.href = buildGoogleCalendarUrl(task);
      calendarLink.textContent = "Add to Google Calendar";

      row.appendChild(check);
      row.appendChild(textWrap);
      row.appendChild(calendarLink);
      dayCard.appendChild(row);
    }

    elements.scheduleList.appendChild(dayCard);
  }
}

function renderProgress() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => state.completedTaskIds[task.id]).length;

  if (!total) {
    elements.overallProgressText.textContent = "No tasks yet.";
    elements.overallProgressFill.style.width = "0%";
    elements.subjectProgress.innerHTML = "";
    return;
  }

  const percent = Math.round((done / total) * 100);
  elements.overallProgressText.textContent = `Overall: ${done}/${total} tasks complete (${percent}%)`;
  elements.overallProgressFill.style.width = `${percent}%`;

  const bySubject = new Map();
  for (const task of state.tasks) {
    const existing = bySubject.get(task.subjectName) || { total: 0, done: 0 };
    existing.total += 1;
    if (state.completedTaskIds[task.id]) {
      existing.done += 1;
    }
    bySubject.set(task.subjectName, existing);
  }

  elements.subjectProgress.innerHTML = "";
  for (const [subjectName, info] of bySubject.entries()) {
    const row = document.createElement("article");
    row.className = "subject-progress-row";

    const label = document.createElement("div");
    label.className = "subject-progress-label";
    const pct = Math.round((info.done / info.total) * 100);
    label.innerHTML = `<strong>${subjectName}</strong><span>${pct}%</span>`;

    const bar = document.createElement("div");
    bar.className = "progress-bar";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    row.appendChild(label);
    row.appendChild(bar);
    elements.subjectProgress.appendChild(row);
  }
}

function buildGoogleCalendarUrl(task) {
  const start = `${task.date.replaceAll("-", "")}T180000`;
  const end = `${task.date.replaceAll("-", "")}T190000`;
  const text = encodeURIComponent(task.label);
  const details = encodeURIComponent(`Auto-created by AI Study Planner for Students.`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

function generateIcsContent(tasks) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Study Planner//EN",
  ];

  for (const task of tasks) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const start = `${task.date.replaceAll("-", "")}T180000`;
    const end = `${task.date.replaceAll("-", "")}T190000`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${task.id}@aistudyplanner.local`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${task.label}`);
    lines.push("DESCRIPTION:Auto-created by AI Study Planner for Students");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadIcs() {
  if (!state.tasks.length) {
    showMessage("Generate a schedule first to export calendar.", true);
    return;
  }

  const blob = new Blob([generateIcsContent(state.tasks)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ai-study-schedule.ics";
  a.click();
  URL.revokeObjectURL(url);
}

function clearReminderTimeouts() {
  for (const timeoutId of reminderTimeouts) {
    clearTimeout(timeoutId);
  }
  reminderTimeouts = [];
}

function renderReminders() {
  elements.reminderList.innerHTML = "";

  const upcoming = state.tasks
    .filter((task) => !state.completedTaskIds[task.id])
    .map((task) => {
      const trigger = new Date(`${task.date}T09:00:00`);
      return { ...task, trigger };
    })
    .filter((task) => task.trigger >= new Date())
    .sort((a, b) => a.trigger - b.trigger)
    .slice(0, 8);

  if (!upcoming.length) {
    elements.reminderList.innerHTML = "<p>No upcoming reminders.</p>";
    return;
  }

  for (const task of upcoming) {
    const item = document.createElement("div");
    item.className = "reminder-item";
    item.textContent = `${formatHumanDate(task.trigger)}: ${task.label}`;
    elements.reminderList.appendChild(item);
  }
}

function scheduleBrowserReminders() {
  clearReminderTimeouts();

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const now = Date.now();
  const maxDelay = 2147483647;

  for (const task of state.tasks) {
    if (state.completedTaskIds[task.id]) {
      continue;
    }

    const trigger = new Date(`${task.date}T09:00:00`).getTime();
    const delay = trigger - now;

    if (delay <= 0 || delay > maxDelay) {
      continue;
    }

    const timeoutId = setTimeout(() => {
      new Notification("Study Reminder", {
        body: `${task.label} is scheduled for today.`,
      });
    }, delay);

    reminderTimeouts.push(timeoutId);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.studentName = parsed.studentName || "";
    state.subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    state.completedTaskIds = parsed.completedTaskIds && typeof parsed.completedTaskIds === "object"
      ? parsed.completedTaskIds
      : {};
  } catch {
    showMessage("Stored data was invalid and has been ignored.", true);
  }
}

function hydrateForm() {
  elements.subjectsContainer.innerHTML = "";
  elements.studentNameInput.value = state.studentName;

  if (!state.subjects.length) {
    createSubjectRow();
    createSubjectRow();
    return;
  }

  for (const subject of state.subjects) {
    createSubjectRow(subject);
  }
}

function onGenerate() {
  const subjects = getSubjectsFromForm();

  if (!subjects.length) {
    showMessage("Add at least one subject with exam date and study hours.", true);
    return;
  }

  const today = dayStart(new Date());
  const hasPastExam = subjects.some((subject) => parseDateInput(subject.examDate) <= today);
  if (hasPastExam) {
    showMessage("Each exam date must be in the future.", true);
    return;
  }

  state.studentName = elements.studentNameInput.value.trim();
  state.subjects = subjects;
  state.tasks = generateTasks(subjects);
  state.completedTaskIds = {};

  if (!state.tasks.length) {
    showMessage("No tasks generated. Check your exam dates.", true);
    return;
  }

  saveState();
  renderSchedule();
  renderProgress();
  renderReminders();
  scheduleBrowserReminders();

  showMessage(`Generated ${state.tasks.length} smart tasks successfully.`);
}

function onReset() {
  state.studentName = "";
  state.subjects = [];
  state.tasks = [];
  state.completedTaskIds = {};
  saveState();
  hydrateForm();
  renderSchedule();
  renderProgress();
  renderReminders();
  clearReminderTimeouts();
  showMessage("Plan reset.");
}

function attachEvents() {
  elements.addSubjectBtn.addEventListener("click", () => createSubjectRow());
  elements.generateBtn.addEventListener("click", onGenerate);
  elements.resetBtn.addEventListener("click", onReset);
  elements.downloadIcsBtn.addEventListener("click", downloadIcs);
  elements.studentNameInput.addEventListener("input", () => {
    state.studentName = elements.studentNameInput.value;
    saveState();
  });

  elements.enableRemindersBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showMessage("This browser does not support notifications.", true);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showMessage("Notification permission was not granted.", true);
      return;
    }

    scheduleBrowserReminders();
    showMessage("Browser reminders are enabled.");
  });
}

function init() {
  loadState();
  hydrateForm();
  renderSchedule();
  renderProgress();
  renderReminders();
  scheduleBrowserReminders();
  attachEvents();
}

init();
