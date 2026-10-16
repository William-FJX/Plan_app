export const STORAGE_KEY = "plan-archive-state-v1";
export const SCHEMA_VERSION = 1;

export function makeId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    tasks: [],
    notes: [],
  };
}

export function normalizeState(candidate) {
  const source = candidate?.data ?? candidate;
  if (!source || typeof source !== "object") {
    throw new Error("The selected file does not contain Plan Archive data.");
  }

  const projects = Array.isArray(source.projects) ? source.projects : [];
  const tasks = Array.isArray(source.tasks) ? source.tasks : [];
  const notes = Array.isArray(source.notes) ? source.notes : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    projects: projects.map((project) => ({
      id: String(project.id || makeId("project")),
      name: String(project.name || "Untitled project"),
      description: String(project.description || ""),
      deadline: validDateString(project.deadline) ? project.deadline : "",
      color: validColor(project.color) ? project.color : "#4aa8ff",
      createdAt: validTimestamp(project.createdAt) ? project.createdAt : new Date().toISOString(),
    })),
    tasks: tasks.map((task) => normalizeTask(task)),
    notes: notes.map((note) => ({
      id: String(note.id || makeId("note")),
      text: String(note.text || ""),
      createdAt: validTimestamp(note.createdAt) ? note.createdAt : new Date().toISOString(),
    })).filter((note) => note.text.trim()),
  };
}

export function normalizeTask(task = {}) {
  const recurrence = task.recurrence && typeof task.recurrence === "object"
    ? task.recurrence
    : {};
  const timeBlock = task.timeBlock && typeof task.timeBlock === "object"
    ? task.timeBlock
    : {};

  return {
    id: String(task.id || makeId("task")),
    title: String(task.title || "Untitled task"),
    instructions: String(task.instructions || ""),
    location: String(task.location || ""),
    dueDate: validDateString(task.dueDate) ? task.dueDate : "",
    dueTime: validTimeString(task.dueTime) ? task.dueTime : "",
    important: Boolean(task.important),
    projectIds: Array.isArray(task.projectIds) ? task.projectIds.map(String) : [],
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map((subtask) => ({
          id: String(subtask.id || makeId("subtask")),
          title: String(subtask.title || "Untitled subtask"),
          completed: Boolean(subtask.completed),
        }))
      : [],
    recurrence: {
      type: ["none", "daily", "weekly", "monthly", "custom"].includes(recurrence.type)
        ? recurrence.type
        : "none",
      interval: positiveInteger(recurrence.interval, 1),
      unit: ["day", "week", "month"].includes(recurrence.unit) ? recurrence.unit : "week",
      weekdays: Array.isArray(recurrence.weekdays)
        ? recurrence.weekdays.map(Number).filter((day) => day >= 0 && day <= 6)
        : [],
    },
    timeBlock: {
      date: validDateString(timeBlock.date) ? timeBlock.date : "",
      start: validTimeString(timeBlock.start) ? timeBlock.start : "",
      end: validTimeString(timeBlock.end) ? timeBlock.end : "",
    },
    completed: Boolean(task.completed),
    completedAt: validTimestamp(task.completedAt) ? task.completedAt : "",
    archived: Boolean(task.archived || task.completed),
    archivedAt: validTimestamp(task.archivedAt) ? task.archivedAt : "",
    createdAt: validTimestamp(task.createdAt) ? task.createdAt : new Date().toISOString(),
    manualOrder: Number.isFinite(Number(task.manualOrder)) ? Number(task.manualOrder) : 0,
  };
}

export function dueTimestamp(task) {
  if (!task?.dueDate || !validDateString(task.dueDate)) return Number.POSITIVE_INFINITY;
  const time = task.dueTime && validTimeString(task.dueTime) ? task.dueTime : "23:59";
  return new Date(`${task.dueDate}T${time}:00`).getTime();
}

export function compareTasks(a, b) {
  const aDue = dueTimestamp(a);
  const bDue = dueTimestamp(b);
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  if (a.manualOrder !== b.manualOrder) return (a.manualOrder || 0) - (b.manualOrder || 0);
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function matchesTaskFilters(task, filters, now = new Date()) {
  const projects = filters.projectIds || [];
  if (projects.length && !projects.some((id) => id === "__uncategorized"
    ? task.projectIds.length === 0
    : task.projectIds.includes(id))) return false;
  if (filters.status === "overdue" && taskDueStatus(task, now) !== "overdue") return false;
  if (filters.status === "soon" && taskDueStatus(task, now) !== "soon") return false;
  if (filters.status === "undated" && task.dueDate) return false;
  if ((filters.from || filters.to) && !task.dueDate) return false;
  if (filters.from && task.dueDate < filters.from) return false;
  if (filters.to && task.dueDate > filters.to) return false;
  return true;
}

export function taskDueStatus(task, now = new Date()) {
  const due = dueTimestamp(task);
  if (!Number.isFinite(due) || task.completed || task.archived) return "none";
  if (due < now.getTime()) return "overdue";

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + 7);
  return due <= end.getTime() ? "soon" : "later";
}

export function nextOccurrence(task) {
  if (!task?.recurrence || task.recurrence.type === "none") return null;

  const nextDueDate = task.dueDate ? calculateNextDate(task.dueDate, task.recurrence) : "";
  const nextBlockDate = task.timeBlock?.date ? calculateNextDate(task.timeBlock.date, task.recurrence) : "";
  if (!nextDueDate && !nextBlockDate) return null;

  const nextTask = normalizeTask({
    ...task,
    id: makeId("task"),
    dueDate: nextDueDate,
    timeBlock: {
      ...task.timeBlock,
      date: nextBlockDate,
    },
    subtasks: task.subtasks.map((subtask) => ({
      ...subtask,
      id: makeId("subtask"),
      completed: false,
    })),
    completed: false,
    completedAt: "",
    archived: false,
    archivedAt: "",
    createdAt: new Date().toISOString(),
  });

  return nextTask;
}

export function calculateNextDate(baseDate, recurrence) {
  const date = fromDateInput(baseDate);
  if (!date) return "";

  if (recurrence.type === "daily") date.setDate(date.getDate() + 1);
  if (recurrence.type === "weekly") date.setDate(date.getDate() + 7);
  if (recurrence.type === "monthly") addMonthsClamped(date, 1);

  if (recurrence.type === "custom") {
    const interval = positiveInteger(recurrence.interval, 1);
    if (recurrence.unit === "day") date.setDate(date.getDate() + interval);
    if (recurrence.unit === "month") addMonthsClamped(date, interval);
    if (recurrence.unit === "week") {
      const weekdays = [...new Set(recurrence.weekdays || [])].sort((a, b) => a - b);
      if (!weekdays.length) {
        date.setDate(date.getDate() + 7 * interval);
      } else {
        const base = new Date(date);
        const baseWeek = startOfWeek(base);
        let match = null;
        for (let offset = 1; offset <= 370; offset += 1) {
          const candidate = new Date(base);
          candidate.setDate(candidate.getDate() + offset);
          if (!weekdays.includes(candidate.getDay())) continue;
          const weeksApart = Math.round((startOfWeek(candidate) - baseWeek) / 604800000);
          if (weeksApart % interval === 0) {
            match = candidate;
            break;
          }
        }
        if (!match) return "";
        date.setTime(match.getTime());
      }
    }
  }

  return toDateInput(date);
}

export function archiveCompletedTask(state, taskId, completedAt = new Date().toISOString()) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return { state, repeated: false };
  const repeatedTask = nextOccurrence(task);
  const tasks = state.tasks.map((item) => item.id === taskId
    ? { ...item, completed: true, archived: true, completedAt, archivedAt: completedAt }
    : item);
  if (repeatedTask) tasks.push(repeatedTask);
  return { state: { ...state, tasks }, repeated: Boolean(repeatedTask) };
}

export function exportPayload(state) {
  return {
    app: "Plan Archive",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: normalizeState(state),
  };
}

export function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateInput(value) {
  if (!validDateString(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(value) {
  const date = new Date(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addMonthsClamped(date, months) {
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
}

function validDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTimeString(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function validColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
