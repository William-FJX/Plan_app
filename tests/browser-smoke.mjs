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
  await waitFor(() => evaluate("document.querySelectorAll('.project-group').length === 4"));
  assert(await evaluate("Boolean(document.querySelector('.overdue-notice'))"), "Overdue work needs a notice.");
  assert(await evaluate("!document.querySelector('.stat-card, [data-view=soon], [name=important], .project-directory, .todo-section')"), "Removed UI should not be present.");
  assert(await evaluate("document.querySelectorAll('.overview-row').length") === 5, "Timeline must combine projects and uncategorized work.");
  assert(await evaluate("document.querySelectorAll('.mixed-list > .project-group').length") === 4, "Projects must share the list with standalone tasks.");
  assert(await evaluate("document.querySelectorAll('.mixed-list > .task-row').length") === 2, "Only standalone tasks belong at the root.");
  assert(await evaluate("document.querySelectorAll('.project-toggle[aria-expanded=false]').length") === 4, "Project groups should start collapsed.");
  assert(await evaluate("document.querySelector('.mixed-list > :last-child').dataset.taskId") === "undated", "Legacy importance must not override deadline order.");
  assert(await evaluate("document.querySelectorAll('.entry-type').length") === 6, "Each root item must identify its type.");
  assert(await evaluate("Boolean(document.querySelector('.workspace-list [data-action=open-filters]')) && !document.querySelector('.overview-panel [data-action=open-filters]')"), "Filter belongs on the list, not the timeline.");
  assert(await evaluate("document.querySelector('.brand-mark').complete && document.querySelector('.brand-mark').naturalWidth > 0"), "The halo SVG must load.");
  await screenshot("desktop");

  await evaluate("document.querySelector('.project-toggle[data-id=applications]').click(); true");
  assert(await evaluate("document.querySelector('.overview-row[data-project=applications]').classList.contains('is-selected')"), "Project selection must highlight its timeline row.");
  assert(await evaluate("document.querySelectorAll('[data-project-id=applications] .task-row').length") === 2, "Expanding a project must reveal its tasks.");
  assert(await evaluate("document.querySelectorAll('.project-group').length") === 4, "Expanding must not hide other projects.");
  await evaluate("document.querySelector('.project-toggle[data-id=applications]').click(); true");
  assert(await evaluate("document.querySelector('.project-toggle[data-id=applications]').getAttribute('aria-expanded')") === "false", "Project must collapse again.");
  assert(await evaluate("document.activeElement.matches('.project-toggle[data-id=applications]')"), "Toggling must preserve keyboard focus.");
  assert(await evaluate("document.querySelector('[data-project-id=applications] .project-children').hidden"), "Collapsed tasks must be hidden.");
  await evaluate("document.querySelector('.project-toggle[data-id=applications]').click(); document.querySelector('.project-toggle[data-id=jobs]').click(); true");
  assert(await evaluate("document.querySelectorAll('.task-row[data-task-id=shared]').length") === 2, "A linked task must appear inside both projects.");
  await evaluate("document.querySelector('.task-copy[data-id=shared]').click(); true");
  assert(await evaluate("document.querySelectorAll('.overview-event[data-id=shared].is-selected').length") === 2, "A shared task should highlight both project occurrences.");
  await screenshot("selected");
  await evaluate("document.querySelector('.task-copy[data-id=distant]').click(); true");
  assert(await evaluate("Boolean(document.querySelector('.overview-event[data-id=distant].is-selected'))"), "Selecting distant work should reveal its date.");
  await evaluate("document.querySelector('.task-copy[data-id=undated]').click(); true");
  assert(await evaluate("document.querySelector('.selection-bar').textContent.includes('No date assigned')"), "Undated task selection must explain the missing timeline marker.");
  await evaluate("document.querySelector('[data-action=clear-selection]').click(); document.querySelector('[data-action=timeline-today]').click(); true");
  const timelineBeforeFilters = await evaluate("document.querySelector('.overview-panel').innerHTML");

  await evaluate(`(() => {
    document.querySelector('[data-action=open-filters]').click();
    document.querySelector('#filter-project-list input[value=applications]').checked = true;
    document.querySelector('#filter-form').elements.status.value = 'soon';
    document.querySelector('#filter-form').requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "Project and upcoming filters should combine.");
  assert(await evaluate("document.querySelector('.task-row').dataset.taskId") === "shared", "Upcoming project filter returned the wrong task.");
  assert(await evaluate("document.querySelectorAll('.project-group').length") === 1, "Project filter must narrow list groups.");
  assert(await evaluate("document.querySelector('.overview-panel').innerHTML") === timelineBeforeFilters, "Filtering must preserve every timeline row, marker, selection, and date.");
  await screenshot("filtered-list");
  await evaluate("document.querySelector('[data-action=clear-filters]').click(); true");
  assert(await evaluate("document.querySelector('.overview-panel').innerHTML") === timelineBeforeFilters, "Clearing filters must not alter the timeline.");
  await evaluate(`(() => {
    const input = document.querySelector('#search-input');
    input.value = 'experiment';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "Search must reveal a matching task inside its project.");
  assert(await evaluate("document.querySelector('.task-row').dataset.taskId") === "labtask", "Search returned the wrong nested task.");
  assert(await evaluate("document.querySelector('.overview-panel').innerHTML") === timelineBeforeFilters, "Search must not filter the timeline.");
  await evaluate(`(() => {
    const input = document.querySelector('#search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-action=open-filters]').click();
    const form = document.querySelector('#filter-form');
    const tasks = JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks;
    const distant = tasks.find(task => task.id === 'distant').dueDate;
    form.elements.from.value = distant;
    form.elements.to.value = distant;
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "An inclusive single-day range must return only its task.");
  assert(await evaluate("document.querySelector('.task-row').dataset.taskId") === "distant", "Date range returned the wrong task.");
  assert(await evaluate("document.querySelector('.overview-panel').innerHTML") === timelineBeforeFilters, "A distant date filter must not change the timeline window.");
  await evaluate(`(() => {
    document.querySelector('[data-action=open-filters]').click();
    document.querySelector('#filter-project-list input[value=school]').checked = true;
    document.querySelector('#filter-form').requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelector('.workspace-list .empty-state').textContent.includes('No matching items')"), "Zero matches need a useful list empty state.");
  assert(await evaluate("document.querySelector('.overview-panel').innerHTML") === timelineBeforeFilters, "An empty result must keep the full timeline.");

  await evaluate("document.querySelector('[data-action=clear-filters]').click(); document.querySelector('[data-action=show-overdue]').click(); true");
  assert(await evaluate("document.querySelector('.task-row').dataset.taskId") === "overdue", "Notice Review action should show overdue tasks.");
  assert(await evaluate("document.querySelector('.overview-panel').innerHTML") === timelineBeforeFilters, "Overdue review must only filter the list.");
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
  assert(await evaluate("document.querySelectorAll('.project-group').length") === 0, "Standalone-only filter must hide project groups.");
  await evaluate("document.querySelector('[data-action=clear-filters]').click(); true");

  await evaluate("document.querySelector('.task-row[data-task-id=shared] .complete-button').click(); true");
  assert(await evaluate("document.querySelectorAll('.task-row[data-task-id=shared], .overview-event[data-id=shared]').length") === 0, "Completing a shared task must update every occurrence.");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.filter(task => task.id === 'shared' && task.archived).length") === 1, "Shared tasks must remain one stored record.");
  await evaluate("document.querySelector('[data-view=archive]').click(); document.querySelector('[data-action=restore-task][data-id=shared]').click(); document.querySelector('[data-view=tasks]').click(); true");
  assert(await evaluate("document.querySelectorAll('.task-row[data-task-id=shared]').length") === 2, "Restoring must update both project groups.");

  await evaluate("window.scrollTo(0, 0); document.querySelector('[data-action=open-filters]').click(); true");
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
  await evaluate("document.querySelector('.project-toggle[data-id=applications]').click(); true");
  assert(await evaluate("document.querySelector('.project-toggle[data-id=applications]').getAttribute('aria-expanded')") === "true", "Mobile project dropdown must open.");
  assert(await evaluate("Boolean(document.querySelector('[data-project-id=applications] .task-row'))"), "Mobile project dropdown must expose tasks.");
  await screenshot("mobile-expanded");
  await evaluate("document.querySelector('#mobile-menu-button').click(); true");
  assert(await evaluate("document.body.classList.contains('menu-open')") === true, "Mobile navigation did not open.");
  await screenshot("mobile-menu");
  const mobileViewport = await evaluate("({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth })");
  assert(mobileViewport.documentWidth <= mobileViewport.width + 1, "The mobile layout causes horizontal page overflow.");
  await evaluate("document.querySelector('#mobile-overlay').click(); document.querySelector('[data-action=open-filters]').click(); true");
  assert(await evaluate("document.querySelector('#filter-dialog').open"), "Mobile filter dialog did not open.");
  await screenshot("mobile-filters");
  await evaluate("document.querySelector('#filter-dialog').close(); document.querySelector('.overview-scroll').scrollLeft = 160; true");
  const mobileTimelineScroll = await evaluate("document.querySelector('.overview-scroll').scrollLeft");
  await evaluate("document.querySelector('[data-action=open-filters]').click(); document.querySelector('#filter-form').elements.status.value = 'undated'; document.querySelector('#filter-form').requestSubmit(); true");
  assert(await evaluate("document.querySelector('.overview-scroll').scrollLeft") === mobileTimelineScroll, "List filtering must preserve the mobile timeline scroll position.");
  assert(await evaluate("document.querySelectorAll('.overview-row').length") === 5, "Mobile list filtering must keep all timeline rows.");

  if (process.env.QA_SCREENSHOTS) {
    await evaluate("document.querySelector('#filter-dialog').close(); const preview = document.createElement('img'); preview.src = '/assets/hina-halo.svg'; preview.style.cssText = 'width:360px;height:auto;display:block;margin:40px auto'; document.body.replaceChildren(preview); document.body.style.background = '#faf9fc'; true");
    await waitFor(() => evaluate("document.querySelector('img').complete"));
    await screenshot("halo");
  }
  assert(browserErrors.length === 0, `Browser runtime errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({
    desktop: { projectCreated: true, taskCreated: true, weekCalendar: true, noteCreated: true, archiveRestore: true, integratedTimeline: true, mixedList: true, projectDropdowns: true, sharedTaskHighlight: true, listOnlyFilters: true, haloLoaded: true, overdueNotice: true },
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
