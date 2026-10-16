import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveCompletedTask,
  calculateNextDate,
  compareTasks,
  createInitialState,
  normalizeState,
  taskDueStatus,
} from "../src/model.js";

test("important tasks sort before earlier non-important deadlines", () => {
  const tasks = [
    { title: "Soon", important: false, dueDate: "2026-01-02", dueTime: "", manualOrder: 0, createdAt: "2026-01-01T00:00:00Z" },
    { title: "Important", important: true, dueDate: "2026-02-01", dueTime: "", manualOrder: 0, createdAt: "2026-01-01T00:00:00Z" },
  ];
  assert.equal(tasks.sort(compareTasks)[0].title, "Important");
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
