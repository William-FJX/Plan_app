import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const debuggingPort = 9300 + Math.floor(Math.random() * 300);
const profilePath = `/tmp/plan-archive-smoke-${process.pid}-${Date.now()}`;
const targetUrl = "http://127.0.0.1:4173";

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profilePath}`,
  targetUrl,
], { stdio: "ignore" });

let socket;
const pending = new Map();
const browserErrors = [];
let messageId = 0;

try {
  const target = await waitForTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", handleMessage);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor(() => evaluate("document.readyState === 'complete'"));

  await evaluate("localStorage.clear(); location.reload(); true");
  await waitFor(() => evaluate("document.readyState === 'complete' && Boolean(document.querySelector('#content'))"));

  const initialTitle = await evaluate("document.querySelector('#page-title').textContent");
  assert(initialTitle === "All tasks", "The initial All tasks view did not render.");
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 0, "Fresh storage should start with no tasks.");

  await evaluate(`(() => {
    document.querySelector('[data-action="add-project"]').click();
    const form = document.querySelector('#project-form');
    form.elements.name.value = 'Graduate Applications';
    form.elements.description.value = 'Track schools, writing, and recommendation letters.';
    form.elements.deadline.value = '2026-12-01';
    form.elements.color.value = '#4aa8ff';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).projects.length") === 1, "Project creation did not persist.");

  await evaluate(`(() => {
    document.querySelector('#add-task-button').click();
    const form = document.querySelector('#task-form');
    form.elements.title.value = 'Draft statement of purpose';
    form.elements.dueDate.value = '2026-11-01';
    form.elements.dueTime.value = '18:00';
    form.elements.blockDate.value = '2026-10-25';
    form.elements.blockStart.value = '14:00';
    form.elements.blockEnd.value = '16:00';
    document.querySelector('#task-project-list input').checked = true;
    document.querySelector('#subtask-editor input[type="text"]').value = 'Create outline';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.length") === 1, "Task creation did not persist.");
  await evaluate("document.querySelector('[data-view=tasks]').click(); true");
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "Created task did not appear in the task queue.");

  await evaluate("document.querySelector('[data-view=calendar]').click(); true");
  assert(await evaluate("Boolean(document.querySelector('.week-calendar'))"), "Default week calendar did not render.");

  await evaluate(`(() => {
    document.querySelector('[data-view=notes]').click();
    const form = document.querySelector('#note-form');
    form.elements.noteText.value = 'Ask the lab mentor about the next milestone.';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.note-card').length") === 1, "Timestamped note did not render.");

  await evaluate("document.querySelector('[data-view=tasks]').click(); document.querySelector('.complete-button').click(); true");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks[0].archived") === true, "Completing a task did not archive it.");
  await evaluate("document.querySelector('[data-view=archive]').click(); true");
  assert(await evaluate("document.querySelectorAll('.archive-row').length") === 1, "Archived task did not appear in Archive.");
  await evaluate("document.querySelector('.archive-row [data-action=restore-task]').click(); true");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks[0].archived") === false, "Task restore did not persist.");

  // Seed representative data in this disposable Chrome profile.
  await evaluate(`(async () => {
    const { normalizeState, toDateInput } = await import('/src/model.js');
    const date = (offset) => { const value = new Date(); value.setDate(value.getDate() + offset); return toDateInput(value); };
    const fixture = normalizeState({
      projects: [
        { id: 'applications', name: 'Applications', deadline: date(19), color: '#a18bb8', description: 'School shortlist, references, and statements.' },
        { id: 'school', name: 'School', deadline: date(12), color: '#afa4c2' },
        { id: 'lab', name: 'Lab', deadline: date(15), color: '#98a8a4' },
        { id: 'jobs', name: 'Job hunting', deadline: date(22), color: '#bcacbb' },
      ],
      tasks: [
        { id: 'overdue', title: 'Send reference request', dueDate: date(-2), projectIds: ['applications'] },
        { id: 'shared', title: 'Update research CV', dueDate: date(3), projectIds: ['applications', 'jobs'] },
        { id: 'homework', title: 'Finish analysis problem set', dueDate: date(5), projectIds: ['school'] },
        { id: 'labtask', title: 'Review experiment results', dueDate: date(7), projectIds: ['lab'], timeBlock: { date: date(4), start: '14:00', end: '15:00' } },
        { id: 'independent', title: 'Book a dentist appointment', dueDate: date(9) },
        { id: 'undated', title: 'Choose a book for the weekend', important: true },
        { id: 'distant', title: 'Prepare interview portfolio', dueDate: date(70), projectIds: ['jobs'] },
      ],
      notes: [{ id: 'note', text: 'Ask about next semester’s lab schedule.', createdAt: new Date().toISOString() }],
    });
    localStorage.setItem('plan-archive-state-v1', JSON.stringify(fixture));
    return true;
  })()`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("document.querySelectorAll('.task-row').length === 7"));
  assert(await evaluate("Boolean(document.querySelector('.overdue-notice'))"), "Overdue work needs a notice.");
  assert(await evaluate("!document.querySelector('.stat-card, [data-view=soon], [name=important]')"), "Removed UI should not be present.");
  assert(await evaluate("document.querySelectorAll('.overview-row').length") === 5, "Timeline must combine projects and uncategorized work.");
  assert(await evaluate("document.querySelector('.task-row:last-child').dataset.taskId") === "undated", "Legacy importance must not override deadline order.");
  await screenshot("desktop");

  await evaluate("document.querySelector('.project-directory [data-id=applications]').click(); true");
  assert(await evaluate("document.querySelector('.overview-row[data-project=applications]').classList.contains('is-selected')"), "Project selection must highlight its timeline row.");
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 7, "Highlighting a project must not filter the to-do list.");
  await evaluate("document.querySelector('.task-copy[data-id=shared]').click(); true");
  assert(await evaluate("document.querySelectorAll('.overview-event[data-id=shared].is-selected').length") === 2, "A shared task should highlight both project occurrences.");
  await screenshot("selected");
  await evaluate("document.querySelector('.task-copy[data-id=distant]').click(); true");
  assert(await evaluate("Boolean(document.querySelector('.overview-event[data-id=distant].is-selected'))"), "Selecting distant work should reveal its date.");
  await evaluate("document.querySelector('.task-copy[data-id=undated]').click(); true");
  assert(await evaluate("document.querySelector('.selection-bar').textContent.includes('No date assigned')"), "Undated task selection must explain the missing timeline marker.");
  await evaluate("document.querySelector('[data-action=clear-selection]').click(); document.querySelector('[data-action=timeline-today]').click(); true");

  await evaluate(`(() => {
    document.querySelector('[data-action=open-filters]').click();
    document.querySelector('#filter-project-list input[value=applications]').checked = true;
    document.querySelector('#filter-form').elements.status.value = 'soon';
    document.querySelector('#filter-form').requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "Project and upcoming filters should combine.");
  assert(await evaluate("document.querySelector('.task-row').dataset.taskId") === "shared", "Upcoming project filter returned the wrong task.");
  assert(await evaluate("document.querySelectorAll('.overview-row').length") === 1, "Timeline should follow applied filters.");
  await evaluate("document.querySelector('[data-action=clear-filters]').click(); document.querySelector('[data-action=show-overdue]').click(); true");
  assert(await evaluate("document.querySelector('.task-row').dataset.taskId") === "overdue", "Notice Review action should show overdue tasks.");
  await evaluate("document.querySelector('.task-row .complete-button').click(); true");
  assert(await evaluate("!document.querySelector('.overdue-notice')"), "Notice should disappear when no overdue work remains.");
  await evaluate("document.querySelector('[data-action=clear-filters]').click(); true");
  await evaluate(`(() => {
    document.querySelector('[data-action=open-filters]').click();
    const form = document.querySelector('#filter-form');
    document.querySelector('#filter-project-list input[value=__uncategorized]').checked = true;
    form.elements.status.value = 'undated';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "Uncategorized undated filter must work.");
  await evaluate("document.querySelector('[data-action=clear-filters]').click(); document.querySelector('[data-action=open-filters]').click(); true");
  await screenshot("filters");
  await evaluate("document.querySelector('#filter-dialog').close(); true");

  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("document.readyState === 'complete'"));
  assert(await evaluate("getComputedStyle(document.querySelector('.mobile-add-button')).display") === "grid", "Mobile create-task button is not visible.");
  await screenshot("mobile");
  await evaluate("document.querySelector('#mobile-menu-button').click(); true");
  assert(await evaluate("document.body.classList.contains('menu-open')") === true, "Mobile navigation did not open.");
  const mobileViewport = await evaluate("({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth })");
  assert(mobileViewport.documentWidth <= mobileViewport.width + 1, "The mobile layout causes horizontal page overflow.");
  await evaluate("document.querySelector('#mobile-overlay').click(); document.querySelector('[data-action=open-filters]').click(); true");
  assert(await evaluate("document.querySelector('#filter-dialog').open"), "Mobile filter dialog did not open.");
  await screenshot("mobile-filters");

  assert(browserErrors.length === 0, `Browser runtime errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({
    desktop: { projectCreated: true, taskCreated: true, weekCalendar: true, noteCreated: true, archiveRestore: true, integratedTimeline: true, sharedTaskHighlight: true, combinedFilters: true, overdueNotice: true },
    mobile: { ...mobileViewport, menuOpened: true, createButtonVisible: true },
    browserErrors: 0,
  }, null, 2));
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
}

async function screenshot(name) {
  if (!process.env.QA_SCREENSHOTS) return;
  const result = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(process.env.QA_SCREENSHOTS + "/" + name + ".png", Buffer.from(result.data, "base64"));
}

function handleMessage(event) {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails?.text || "Unknown runtime exception");
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
}

function send(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Browser evaluation failed");
  }
  return response.result.value;
}

async function waitForTarget() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Timed out while starting headless Chrome.");
}

async function waitFor(check) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error("Timed out waiting for the browser state.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
