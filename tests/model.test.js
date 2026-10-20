import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveCompletedTask,
  calculateNextDate,
  compareTasks,
  createInitialState,
  exportPayload,
  matchesTaskFilters,
  normalizeState,
  taskDueStatus,
  timelineOccurrences,
} from "../src/model.js";

test("deadlines sort first regardless of legacy importance flags", () => {
  const tasks = [
    { title: "Soon", important: false, dueDate: "2026-01-02", dueTime: "", manualOrder: 0, createdAt: "2026-01-01T00:00:00Z" },
    { title: "Important", important: true, dueDate: "2026-02-01", dueTime: "", manualOrder: 0, createdAt: "2026-01-01T00:00:00Z" },
  ];
  assert.equal(tasks.sort(compareTasks)[0].title, "Soon");
});

test("tasks without deadlines sort last, even if created first", () => {
  const state = normalizeState({ tasks: [
    { title: "Undated", manualOrder: 0 },
    { title: "Dated", dueDate: "2026-05-12", manualOrder: 1 },
  ] });
  assert.deepEqual(state.tasks.sort(compareTasks).map((task) => task.title), ["Dated", "Undated"]);
});

test("filters combine any selected project with inclusive deadline bounds", () => {
  const task = normalizeState({ tasks: [{ projectIds: ["lab", "school"], dueDate: "2026-05-12" }] }).tasks[0];
  assert.equal(matchesTaskFilters(task, { projectIds: ["job", "school"], from: "2026-05-12", to: "2026-05-12" }), true);
  assert.equal(matchesTaskFilters(task, { projectIds: ["job"], from: "2026-05-12" }), false);
  assert.equal(matchesTaskFilters(task, { projectIds: ["lab"], to: "2026-05-11" }), false);
});

test("uncategorized and undated filters are independent; ranges exclude undated tasks", () => {
  const task = normalizeState({ tasks: [{ title: "Idea" }] }).tasks[0];
  assert.equal(matchesTaskFilters(task, { projectIds: ["__uncategorized"], status: "undated" }), true);
  assert.equal(matchesTaskFilters(task, { from: "2026-05-01" }), false);
});

test("next-seven-days filter excludes overdue and completed work", () => {
  const now = new Date("2026-05-10T12:00:00");
  const tasks = normalizeState({ tasks: [
    { dueDate: "2026-05-09" },
    { dueDate: "2026-05-12" },
    { dueDate: "2026-05-12", completed: true },
    { dueDate: "2026-05-20" },
  ] }).tasks;
  assert.deepEqual(tasks.map((task) => matchesTaskFilters(task, { status: "soon" }, now)), [false, true, false, false]);
});

test("due status distinguishes overdue and next-seven-day work", () => {
  const now = new Date("2026-05-10T12:00:00");
  assert.equal(taskDueStatus({ dueDate: "2026-05-09", dueTime: "", completed: false, archived: false }, now), "overdue");
  assert.equal(taskDueStatus({ dueDate: "2026-05-15", dueTime: "", completed: false, archived: false }, now), "soon");
  assert.equal(taskDueStatus({ dueDate: "2026-05-25", dueTime: "", completed: false, archived: false }, now), "later");
});

test("custom weekly recurrence supports selected weekdays", () => {
  const next = calculateNextDate("2026-05-11", {
    type: "custom",
    interval: 1,
    unit: "week",
    weekdays: [2, 4],
  });
  assert.equal(next, "2026-05-12");
});

test("completing a recurring task archives it and creates the next occurrence", () => {
  const state = createInitialState();
  state.tasks.push(normalizeState({
    tasks: [{ id: "task-1", title: "Review", dueDate: "2026-05-11", recurrence: { type: "weekly" } }],
  }).tasks[0]);
  const result = archiveCompletedTask(state, "task-1", "2026-05-11T15:00:00Z");
  assert.equal(result.repeated, true);
  assert.equal(result.state.tasks.length, 2);
  assert.equal(result.state.tasks[0].archived, true);
  assert.equal(result.state.tasks[1].dueDate, "2026-05-18");
  assert.equal(result.state.tasks[1].completed, false);
});

test("recurrence advances deadline and time block from their own dates", () => {
  const state = normalizeState({
    tasks: [{
      id: "task-1",
      title: "Prepare report",
      dueDate: "2026-05-15",
      timeBlock: { date: "2026-05-12", start: "10:00", end: "11:00" },
      recurrence: { type: "weekly" },
    }],
  });
  const result = archiveCompletedTask(state, "task-1");
  assert.equal(result.state.tasks[1].dueDate, "2026-05-22");
  assert.equal(result.state.tasks[1].timeBlock.date, "2026-05-19");
});

test("monthly recurrence clamps to the final valid day", () => {
  assert.equal(calculateNextDate("2026-01-31", { type: "monthly" }), "2026-02-28");
});

test("import normalization preserves uncategorized tasks", () => {
  const state = normalizeState({ tasks: [{ title: "Free task" }] });
  assert.deepEqual(state.tasks[0].projectIds, []);
});

test("note titles are optional and old notes keep their text and timestamp", () => {
  const legacy = { id: "legacy-note", text: "An existing thought.", createdAt: "2026-01-01T12:00:00.000Z" };
  const state = normalizeState({ notes: [legacy, { text: "Another thought.", title: "   " }] });
  assert.deepEqual(state.notes[0], { ...legacy, title: "" });
  assert.equal(state.notes[1].title, "");
});

test("titled and untitled notes survive JSON export and import", () => {
  const state = normalizeState({ notes: [
    { title: "  Lab questions  ", text: "Ask about the next experiment." },
    { text: "A quick thought without a title." },
  ] });
  assert.equal(state.notes[0].title, "Lab questions");
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(exportPayload(state)))).notes, state.notes);
});

test("legacy project deadlines are removed without changing task deadlines", () => {
  const state = normalizeState({ projects: [{ id: "project", name: "Lab", deadline: "2026-12-01" }],
    tasks: [{ title: "Report", dueDate: "2026-11-01", projectIds: ["project"] }] });
  assert.equal("deadline" in state.projects[0], false);
  assert.equal(state.tasks[0].dueDate, "2026-11-01");
  assert.equal("deadline" in exportPayload(state).data.projects[0], false);
});

test("recurrence end dates are optional and survive JSON export/import", () => {
  const state = normalizeState({ tasks: [
    { recurrence: { type: "daily" } },
    { recurrence: { type: "weekly", endDate: "2026-06-01" } },
  ] });
  assert.equal(state.tasks[0].recurrence.endDate, "");
  assert.equal(normalizeState(JSON.parse(JSON.stringify(exportPayload(state)))).tasks[1].recurrence.endDate, "2026-06-01");
});

test("daily previews include every date through the inclusive end without mutating data", () => {
  const task = normalizeState({ tasks: [{ dueDate: "2026-05-10", recurrence: { type: "daily", endDate: "2026-05-14" } }] }).tasks[0];
  const before = JSON.stringify(task);
  assert.deepEqual(timelineOccurrences(task, "2026-05-11", "2026-05-30").map(event => event.date),
    ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14"]);
  assert.equal(JSON.stringify(task), before);
  assert.deepEqual(timelineOccurrences(task, "2026-06-01", "2026-06-30"), []);
});

test("open-ended recurrence previews follow the browsed window well beyond the next task", () => {
  const task = normalizeState({ tasks: [{ dueDate: "2020-01-01", recurrence: { type: "weekly" } }] }).tasks[0];
  assert.deepEqual(timelineOccurrences(task, "2026-05-01", "2026-05-31").map(event => event.date),
    ["2026-05-06", "2026-05-13", "2026-05-20", "2026-05-27"]);
});

test("custom interval and weekday previews respect their inclusive end date", () => {
  const tasks = normalizeState({ tasks: [
    { dueDate: "2026-05-10", recurrence: { type: "custom", unit: "day", interval: 2, endDate: "2026-05-15" } },
    { dueDate: "2026-05-12", recurrence: { type: "custom", unit: "week", interval: 2, weekdays: [2, 4], endDate: "2026-06-11" } },
  ] }).tasks;
  assert.deepEqual(timelineOccurrences(tasks[0], "2026-05-01", "2026-06-30").map(event => event.date),
    ["2026-05-10", "2026-05-12", "2026-05-14"]);
  assert.deepEqual(timelineOccurrences(tasks[1], "2026-05-01", "2026-06-30").map(event => event.date),
    ["2026-05-12", "2026-05-14", "2026-05-26", "2026-05-28", "2026-06-09", "2026-06-11"]);
  assert.equal(calculateNextDate("2026-05-11", { type: "custom", unit: "week", interval: 99, weekdays: [1] }), "2028-04-03");
});

test("monthly previews use the same month-end clamping as completion", () => {
  const task = normalizeState({ tasks: [{ dueDate: "2026-01-31", recurrence: { type: "monthly", endDate: "2026-03-31" } }] }).tasks[0];
  assert.deepEqual(timelineOccurrences(task, "2026-01-01", "2026-04-30").map(event => event.date),
    ["2026-01-31", "2026-02-28", "2026-03-28"]);
});

test("deadlines and time blocks repeat independently and neither extends beyond the end date", () => {
  const state = normalizeState({ tasks: [{ id: "report", dueDate: "2026-05-15", dueTime: "18:00",
    timeBlock: { date: "2026-05-12", start: "10:00", end: "11:00" },
    recurrence: { type: "weekly", endDate: "2026-05-20" } }] });
  assert.deepEqual(timelineOccurrences(state.tasks[0], "2026-05-01", "2026-06-01"), [
    { kind: "block", date: "2026-05-12" }, { kind: "due", date: "2026-05-15" }, { kind: "block", date: "2026-05-19" },
  ]);
  const result = archiveCompletedTask(state, "report");
  assert.equal(result.state.tasks[1].dueDate, "");
  assert.equal(result.state.tasks[1].dueTime, "");
  assert.equal(result.state.tasks[1].timeBlock.date, "2026-05-19");
  assert.equal(archiveCompletedTask(result.state, result.state.tasks[1].id).repeated, false);
});

test("time-only repeats stop cleanly, and completion does not duplicate future previews", () => {
  const state = normalizeState({ tasks: [{ id: "meeting", timeBlock: { date: "2026-05-11", start: "10:00", end: "11:00" },
    recurrence: { type: "daily", endDate: "2026-05-12" } }] });
  const next = archiveCompletedTask(state, "meeting");
  assert.deepEqual(next.state.tasks.flatMap(task => timelineOccurrences(task, "2026-05-01", "2026-05-31")),
    [{ kind: "block", date: "2026-05-12" }]);
  const last = archiveCompletedTask(next.state, next.state.tasks[1].id);
  assert.equal(last.repeated, false);
  assert.deepEqual(last.state.tasks.flatMap(task => timelineOccurrences(task, "2026-05-01", "2026-05-31")), []);
});

test("expired time blocks are cleared when a later deadline still repeats", () => {
  const state = normalizeState({ tasks: [{ id: "task", dueDate: "2026-05-11",
    timeBlock: { date: "2026-05-13", start: "10:00", end: "11:00" }, recurrence: { type: "weekly", endDate: "2026-05-18" } }] });
  const result = archiveCompletedTask(state, "task");
  assert.equal(result.state.tasks[1].dueDate, "2026-05-18");
  assert.deepEqual(result.state.tasks[1].timeBlock, { date: "", start: "", end: "" });
  assert.equal(archiveCompletedTask(result.state, result.state.tasks[1].id).repeated, false);
});
