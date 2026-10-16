import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveCompletedTask,
  calculateNextDate,
  compareTasks,
  createInitialState,
  matchesTaskFilters,
  normalizeState,
  taskDueStatus,
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
