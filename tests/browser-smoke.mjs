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
  assert(await evaluate("!document.querySelector('.brand-kicker, .eyebrow, .local-badge, .selection-bar')"), "Decorative captions must be removed without empty placeholder rows.");
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 0, "Fresh storage should start with no tasks.");
  assert(await evaluate("(() => { const message = document.querySelector('.timeline-empty').getBoundingClientRect(); const scroll = document.querySelector('.overview-scroll').getBoundingClientRect(); return message.left >= scroll.left && message.right <= scroll.right; })()"), "An empty timeline must keep its hint in view.");
  await evaluate("document.querySelector('.workspace-list [data-action=add-task]').click(); true");
  assert(await evaluate("document.querySelector('#task-no-project').checked && !document.querySelector('#task-project-list input')"), "A new to-do must work before any projects exist.");
  await evaluate("document.querySelector('#task-form').elements.title.value = 'Standalone without projects'; document.querySelector('#task-form').requestSubmit(); true");
  assert(await evaluate("document.querySelectorAll('.mixed-list > .task-row').length") === 1, "A standalone to-do must appear directly in the combined list.");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks[0].projectIds.length") === 0, "No project must save an empty project list, not a fake project ID.");
  await evaluate("localStorage.clear(); location.reload(); true");
  await waitFor(() => evaluate("document.readyState === 'complete' && Boolean(document.querySelector('.workspace-list')) && !document.querySelector('.task-row')"));

  await evaluate(`(() => {
    document.querySelector('[data-action="add-project"]').click();
    const form = document.querySelector('#project-form');
    form.elements.name.value = 'Graduate Applications';
    form.elements.description.value = 'Track schools, writing, and recommendation letters.';
    form.elements.color.value = '#4aa8ff';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).projects.length") === 1, "Project creation did not persist.");
  assert(await evaluate("!document.querySelector('#project-form [name=deadline]')"), "Projects must not have a deadline field.");

  await evaluate(`(() => {
    document.querySelector('#add-task-button').click();
    const form = document.querySelector('#task-form');
    form.elements.title.value = 'Draft statement of purpose';
    form.elements.dueDate.value = '2026-11-01';
    form.elements.dueTime.value = '18:00';
    form.elements.blockDate.value = '2026-10-25';
    form.elements.blockStart.value = '14:00';
    form.elements.blockEnd.value = '16:00';
    document.querySelector('#task-project-list input').click();
    document.querySelector('#subtask-editor input[type="text"]').value = 'Create outline';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.length") === 1, "Task creation did not persist.");
  await evaluate("document.querySelector('[data-view=tasks]').click(); true");
  assert(await evaluate("document.querySelectorAll('.task-row').length") === 1, "Created task did not appear in the task queue.");

  await evaluate("document.querySelector('[data-view=calendar]').click(); true");
  assert(await evaluate("Boolean(document.querySelector('.week-calendar'))"), "Default week calendar did not render.");
  assert(await evaluate("document.querySelector('#page-title').textContent === 'Calendar' && !document.querySelector('.view-header')"), "Calendar must keep its title without a decorative subtitle.");

  await evaluate(`(() => {
    document.querySelector('[data-view=notes]').click();
    const form = document.querySelector('#note-form');
    form.elements.noteText.value = 'Ask the lab mentor about the next milestone.';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.note-card').length") === 1, "Timestamped note did not render.");
  assert(await evaluate("document.querySelector('#page-title').textContent === 'Quick notes' && !document.querySelector('.view-header, .note-composer > p')"), "Notes must keep their content without decorative helper lines.");
  assert(await evaluate("!document.querySelector('#note-form').elements.noteTitle.required && !document.querySelector('.note-card h3') && JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes[0].title === ''"), "A note must save without a title or an empty heading.");
  await evaluate(`(() => {
    const form = document.querySelector('#note-form');
    form.elements.noteTitle.value = '  Lab questions <draft> & ideas  ';
    form.elements.noteText.value = 'Discuss the next experiment.';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelector('.note-card h3').textContent === 'Lab questions <draft> & ideas' && !document.querySelector('.note-card draft')"), "A title must be trimmed and rendered as plain text.");
  assert(await evaluate("document.querySelector('#note-form').elements.noteTitle.value === '' && document.querySelector('#note-form').elements.noteText.value === ''"), "Saving must clear both note fields.");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("Boolean(document.querySelector('.workspace-list'))"));
  await evaluate("document.querySelector('[data-view=notes]').click(); true");
  assert(await evaluate("document.querySelectorAll('.note-card').length === 2 && document.querySelector('.note-card h3').textContent === 'Lab questions <draft> & ideas'"), "Titled and untitled notes must survive reload.");
  for (const query of ['IDEAS', 'experiment']) {
    await evaluate(`(() => {
      const search = document.querySelector('#search-input');
      search.value = ${JSON.stringify(query)};
      search.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert(await evaluate("document.querySelectorAll('.note-card').length === 1 && Boolean(document.querySelector('.note-card h3'))"), "Search must match a note's title or body, ignoring case.");
  }
  await evaluate("document.querySelector('#search-input').value = ''; document.querySelector('#search-input').dispatchEvent(new Event('input', { bubbles: true })); true");
  await screenshot("notes-titles");
  const notesBeforeEdit = await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes");
  const editedNote = notesBeforeEdit.find(note => note.title);
  await evaluate("document.querySelector('.note-card h3').closest('article').querySelector('[data-action=edit-note]').click(); true");
  assert(await evaluate("document.querySelector('#note-form').elements.noteTitle.value === 'Lab questions <draft> & ideas' && document.querySelector('#note-form').elements.noteText.value === 'Discuss the next experiment.'"), "Edit must populate the existing title and text.");
  await screenshot("notes-edit");
  await evaluate("document.querySelector('#note-form').elements.noteTitle.value = 'Discarded title'; document.querySelector('#note-form').elements.noteText.value = 'Discarded changes'; document.querySelector('[data-action=cancel-note-edit]').click(); true");
  assert(JSON.stringify(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes")) === JSON.stringify(notesBeforeEdit), "Cancel must not change any saved note.");
  assert(await evaluate("document.querySelector('#note-form').elements.noteTitle.value === '' && !document.querySelector('[data-action=cancel-note-edit]')"), "Cancel must return to a blank new-note form.");
  await evaluate("document.querySelector('.note-card h3').closest('article').querySelector('[data-action=edit-note]').click(); document.querySelector('#note-form').elements.noteText.value = '   '; document.querySelector('#note-form').requestSubmit(); true");
  assert(JSON.stringify(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes")) === JSON.stringify(notesBeforeEdit), "An empty edited body must not overwrite saved content.");
  await evaluate("document.querySelector('#note-form').elements.noteTitle.value = ''; document.querySelector('#note-form').elements.noteText.value = 'Bring the updated experiment results.'; document.querySelector('#note-form').requestSubmit(); true");
  const notesAfterEdit = await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes");
  const savedEdit = notesAfterEdit.find(note => note.id === editedNote.id);
  assert(notesAfterEdit.length === notesBeforeEdit.length && savedEdit.title === '' && savedEdit.text === 'Bring the updated experiment results.' && savedEdit.createdAt === editedNote.createdAt, "Editing must update in place, allow title removal, and keep the original timestamp.");
  assert(!await evaluate("Boolean(document.querySelector('.note-card h3'))"), "Removing a title must remove its heading.");
  await evaluate(`document.querySelector('[data-action=edit-note][data-id="${editedNote.id}"]').click(); document.querySelector('#note-form').elements.noteTitle.value = 'Lab follow-up'; document.querySelector('#note-form').requestSubmit(); true`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("Boolean(document.querySelector('.workspace-list'))"));
  await evaluate("document.querySelector('[data-view=notes]').click(); true");
  assert(await evaluate("document.querySelector('.note-card h3').textContent === 'Lab follow-up' && document.querySelector('.note-card h3').closest('article').querySelector('p').textContent === 'Bring the updated experiment results.'"), "Edited notes must survive reload.");

  await evaluate("document.querySelector('[data-view=tasks]').click(); document.querySelector('.project-toggle[aria-expanded=false]')?.click(); document.querySelector('.complete-button').click(); true");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks[0].archived") === true, "Completing a task did not archive it.");
  await evaluate("document.querySelector('[data-view=archive]').click(); true");
  assert(await evaluate("document.querySelectorAll('.archive-row').length") === 1, "Archived task did not appear in Archive.");
  assert(await evaluate("document.querySelector('#page-title').textContent === 'Archive' && !document.querySelector('.view-header')"), "Archive must keep its title without a decorative subtitle.");
  await evaluate("document.querySelector('.archive-row [data-action=restore-task]').click(); true");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks[0].archived") === false, "Task restore did not persist.");

  await evaluate("document.querySelector('[data-view=tasks]').click(); document.querySelector('.workspace-list [data-action=add-task]').click(); true");
  assert(await evaluate("document.querySelector('#task-no-project').checked && !document.querySelector('#task-project-list input:checked')"), "General New to-do must not inherit the highlighted project.");
  await evaluate(`(async () => {
    const { toDateInput } = await import('/src/model.js');
    const form = document.querySelector('#task-form');
    form.elements.title.value = 'Independent errand';
    form.elements.dueDate.value = toDateInput(new Date());
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelector('.mixed-list > .task-row').textContent.includes('Independent errand')"), "Standalone creation must remain available when projects exist.");
  assert(await evaluate("Boolean(document.querySelector('.overview-row[data-project=__uncategorized] .overview-event'))"), "A standalone deadline must appear on the timeline.");
  await evaluate("document.querySelector('.mixed-list > .task-row [data-action=edit-task]').click(); document.querySelector('#task-project-list input').click(); true");
  assert(await evaluate("!document.querySelector('#task-no-project').checked"), "Choosing a project must deselect No project.");
  await evaluate("document.querySelector('#task-no-project').click(); true");
  assert(await evaluate("!document.querySelector('#task-project-list input:checked')"), "No project must clear project membership.");
  await screenshot("standalone-dialog");
  await evaluate("document.querySelector('#task-form').requestSubmit(); document.querySelector('[data-action=project-add-task]').click(); true");
  assert(await evaluate("!document.querySelector('#task-no-project').checked && Boolean(document.querySelector('#task-project-list input:checked'))"), "Add to-do inside a project must still preset that project.");
  await evaluate("document.querySelector('#task-no-project').click(); document.querySelector('#task-form').elements.title.value = 'Personal reminder'; document.querySelector('#task-form').requestSubmit(); true");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("document.querySelectorAll('.mixed-list > .task-row').length === 2"));
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.filter(task => task.projectIds.length === 0).length") === 2, "Standalone tasks must remain standalone after reload.");

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
        { id: 'labfollowup', title: 'Send lab report', dueDate: date(7), projectIds: ['lab'] },
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
  assert(await evaluate("!document.querySelector('.overview-event[data-kind=project], .project-row .task-meta') && !document.querySelector('.timeline-legend').textContent.includes('Project deadline')"), "Legacy project deadlines must not appear in the list or timeline.");
  const dayHeaders = await evaluate("[...document.querySelectorAll('.overview-axis [data-date]')].map(day => day.dataset.date)");
  assert(dayHeaders.length === 84 && dayHeaders.every((day, index) => !index || Date.parse(day) - Date.parse(dayHeaders[index - 1]) === 86400000), "Timeline must label every consecutive day, including month boundaries.");
  const today = await evaluate("(async () => { const { toDateInput } = await import('/src/model.js'); return toDateInput(new Date()); })()");
  await assertTodayFirst(today);
  assert(await evaluate(`(() => {
    const headers = [...document.querySelectorAll('.overview-axis [data-date]')];
    return [...document.querySelectorAll('.overview-event')].every(event => {
      const day = headers.find(header => header.dataset.date === event.dataset.date).getBoundingClientRect();
      const item = event.getBoundingClientRect();
      return item.left >= day.left && item.right <= day.right;
    });
  })()`), "Every deadline and time block must fit beneath its own date.");
  assert(await evaluate(`(() => {
    const first = document.querySelector('.overview-event[data-id=labtask][data-kind=due]').getBoundingClientRect();
    const second = document.querySelector('.overview-event[data-id=labfollowup]').getBoundingClientRect();
    return Math.abs(first.left - second.left) < 1 && first.bottom <= second.top;
  })()`), "Deadlines on the same day must stack without overlapping.");
  assert(await evaluate(`(() => {
    const event = document.querySelector('.overview-event[data-id=shared]');
    const label = getComputedStyle(event.querySelector('span'));
    const row = document.querySelector('.overview-row[data-project=applications]');
    return parseFloat(getComputedStyle(event).fontSize) >= 13
      && label.webkitLineClamp === '2'
      && label.whiteSpace !== 'nowrap'
      && row.getBoundingClientRect().height <= 46;
  })()`), "Timeline labels need larger, two-line text in compact rows.");
  assert(await evaluate("document.querySelectorAll('.mixed-list > .project-group').length") === 4, "Projects must share the list with standalone tasks.");
  assert(await evaluate("document.querySelectorAll('.mixed-list > .task-row').length") === 2, "Only standalone tasks belong at the root.");
  assert(await evaluate("document.querySelectorAll('.project-toggle[aria-expanded=false]').length") === 4, "Project groups should start collapsed.");
  assert(await evaluate("document.querySelector('.mixed-list > :last-child').dataset.taskId") === "undated", "Legacy importance must not override deadline order.");
  assert(await evaluate("document.querySelectorAll('.entry-type').length") === 6, "Each root item must identify its type.");
  assert(await evaluate("Boolean(document.querySelector('.workspace-list [data-action=open-filters]')) && !document.querySelector('.overview-panel [data-action=open-filters]')"), "Filter belongs on the list, not the timeline.");
  assert(await evaluate("document.querySelector('.brand-mark').complete && document.querySelector('.brand-mark').naturalWidth > 0"), "The halo SVG must load.");
  await screenshot("desktop");

  // Cross the rolling window repeatedly without changing the visible date or scroll container.
  for (const direction of [1, 1, 1, 1, -1, -1, -1, -1, -1, -1]) {
    const previousStart = (await timelineViewport()).loadedStart;
    const anchor = await evaluate(`(() => {
      const scroll = document.querySelector('.overview-scroll');
      window.timelineScrollContainer = scroll;
      scroll.scrollLeft = ${direction} > 0 ? scroll.scrollWidth - scroll.clientWidth - 200 : 200;
      const edge = scroll.getBoundingClientRect().left + scroll.querySelector('.overview-axis > span').offsetWidth;
      const first = [...scroll.querySelectorAll('.overview-axis [data-date]')].find(header => header.getBoundingClientRect().right > edge + 1);
      const anchor = { date: first.dataset.date, offset: first.getBoundingClientRect().left - edge };
      scroll.dispatchEvent(new Event('scroll'));
      return anchor;
    })()`);
    await waitFor(async () => (await timelineViewport()).loadedStart !== previousStart);
    const after = await timelineViewport();
    assert(Date.parse(after.loadedStart) - Date.parse(previousStart) === direction * 28 * 86400000, "Scrolling near either edge must load the next set of dates.");
    assert(after.dayCount === 84, "Continuous scrolling must keep the number of rendered days bounded.");
    assert(after.firstVisible === anchor.date && Math.abs(after.offset - anchor.offset) < 1, "Recycling dates must not jump the visible timeline.");
    assert(await evaluate("window.timelineScrollContainer === document.querySelector('.overview-scroll')"), "Recycling days must keep the native scroll container intact.");
  }
  assert((await timelineViewport()).firstVisible < today, "Scrolling backward must allow dates before today.");
  await evaluate("document.querySelector('[data-action=timeline-today]').click(); true");
  await assertTodayFirst(today);
  await evaluate("document.querySelector('[data-action=timeline-next]').click(); true");
  await waitFor(async () => (await timelineViewport()).firstVisible !== today);
  assert(Date.parse((await timelineViewport()).firstVisible) - Date.parse(today) === 7 * 86400000, "Forward arrow must move the visible dates by one week.");
  await evaluate("document.querySelector('[data-action=timeline-prev]').click(); true");
  await assertTodayFirst(today);
  const wheelTarget = await evaluate("(() => { const rect = document.querySelector('.overview-scroll').getBoundingClientRect(); return { x: rect.right - 50, y: rect.top + 50 }; })()");
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", ...wheelTarget, deltaX: 1100, deltaY: 0 });
  await waitFor(async () => (await timelineViewport()).firstVisible !== today);
  await evaluate("document.querySelector('[data-action=timeline-today]').click(); true");
  await assertTodayFirst(today);

  await evaluate("document.querySelector('.project-toggle[data-id=applications]').click(); true");
  assert(await evaluate("document.querySelector('.overview-row[data-project=applications]').classList.contains('is-selected')"), "Project selection must highlight its timeline row.");
  assert(await evaluate("document.querySelectorAll('[data-project-id=applications] .task-row').length") === 2, "Expanding a project must reveal its tasks.");
  assert(await evaluate(`(() => {
    const rows = document.querySelectorAll('[data-project-id=applications] .task-row');
    return rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom >= 4;
  })()`), "Adjacent highlighted task rows must have a visible gap.");
  assert(await evaluate("getComputedStyle(document.querySelector('.overview-row.is-selected')).boxShadow !== 'none'"), "Timeline highlights need inset edges to stay visually separate.");
  await screenshot("project-highlight");
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
  assert(await evaluate("!document.querySelector('.selection-bar') && Boolean(document.querySelector('.workspace-list [data-action=clear-selection]'))"), "Selection must remain clearable without the helper line.");
  await evaluate("document.querySelector('[data-action=clear-selection]').click(); document.querySelector('[data-action=timeline-today]').click(); true");
  assert(await evaluate("!document.querySelector('.overview-row.is-selected, .overview-event.is-selected, .task-row.is-selected, [data-action=clear-selection]')"), "Clear selection must remove highlights and its temporary control.");
  await assertTodayFirst(today);
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
  await assertTodayFirst(today);
  await evaluate("document.querySelector('.overview-scroll').scrollLeft += 3 * 124; true");
  assert(await evaluate(`(() => {
    const event = document.querySelector('.overview-event[data-id=shared]');
    const label = event.querySelector('span').getBoundingClientRect();
    const bounds = event.getBoundingClientRect();
    const scroll = document.querySelector('.overview-scroll').getBoundingClientRect();
    return parseFloat(getComputedStyle(event).fontSize) >= 13
      && bounds.left >= scroll.left + 135 && bounds.right <= scroll.right
      && label.top >= bounds.top && label.bottom <= bounds.bottom;
  })()`), "Mobile timeline labels must remain readable and contained in their day.");
  await screenshot("mobile-timeline-labels");
  await evaluate("document.querySelector('[data-action=timeline-today]').click(); true");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touchY = await evaluate("document.querySelector('.overview-scroll').getBoundingClientRect().top + 60");
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 345, y: touchY }] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 165, y: touchY }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitFor(async () => (await timelineViewport()).firstVisible !== today);
  await evaluate("document.querySelector('[data-action=timeline-today]').click(); true");
  await assertTodayFirst(today);
  const mobileStart = (await timelineViewport()).loadedStart;
  await evaluate("const timeline = document.querySelector('.overview-scroll'); timeline.scrollLeft = timeline.scrollWidth - timeline.clientWidth - 100; timeline.dispatchEvent(new Event('scroll')); true");
  await waitFor(async () => (await timelineViewport()).loadedStart !== mobileStart);
  await evaluate("document.querySelector('[data-action=timeline-today]').click(); true");
  await assertTodayFirst(today);
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
  await evaluate("document.querySelector('#filter-dialog').close(); document.querySelector('.overview-scroll').scrollLeft += 160; true");
  const mobileTimelineScroll = await evaluate("document.querySelector('.overview-scroll').scrollLeft");
  await evaluate("document.querySelector('[data-action=open-filters]').click(); document.querySelector('#filter-form').elements.status.value = 'undated'; document.querySelector('#filter-form').requestSubmit(); true");
  assert(await evaluate("document.querySelector('.overview-scroll').scrollLeft") === mobileTimelineScroll, "List filtering must preserve the mobile timeline scroll position.");
  assert(await evaluate("document.querySelectorAll('.overview-row').length") === 5, "Mobile list filtering must keep all timeline rows.");
  await evaluate("document.querySelector('[data-action=clear-filters]').click(); document.querySelector('.workspace-list [data-action=add-task]').click(); true");
  assert(await evaluate("document.querySelector('#task-dialog').open && document.querySelector('#task-no-project').checked"), "Mobile list must offer a standalone to-do without a project.");
  await screenshot("mobile-standalone-dialog");
  await evaluate("document.querySelector('#task-form').elements.title.value = 'Phone reminder'; document.querySelector('#task-form').requestSubmit(); true");
  assert(await evaluate("[...document.querySelectorAll('.mixed-list > .task-row')].some(row => row.textContent.includes('Phone reminder'))"), "Mobile standalone creation must show the saved task in the root list.");

  // A recurring task remains one saved active item while its future dates are previewed.
  await evaluate(`(async () => {
    const { toDateInput } = await import('/src/model.js');
    document.querySelector('[data-action=timeline-today]').click();
    document.querySelector('.workspace-list [data-action=add-task]').click();
    const form = document.querySelector('#task-form');
    form.elements.title.value = 'Daily recurring review';
    form.elements.dueDate.value = toDateInput(new Date());
    form.elements.repeatType.value = 'daily';
    form.elements.repeatType.dispatchEvent(new Event('change'));
    const before = new Date(); before.setDate(before.getDate() - 1);
    form.elements.repeatEndDate.value = toDateInput(before);
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelector('#task-dialog').open && !document.querySelector('#task-form').elements.repeatEndDate.disabled"), "An end date before the first occurrence must be rejected.");
  assert(await evaluate("!JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.some(task => task.title === 'Daily recurring review')"), "Invalid recurrence must not save.");
  const repeatEnd = await evaluate(`(async () => {
    const { toDateInput } = await import('/src/model.js');
    const last = new Date(); last.setDate(last.getDate() + 4);
    const end = toDateInput(last);
    document.querySelector('#task-form').elements.repeatEndDate.value = end;
    return end;
  })()`);
  await evaluate("document.querySelector('.repeat-end-field').scrollIntoView({ block: 'center' }); true");
  await screenshot("mobile-repeat-end");
  await evaluate("document.querySelector('#task-form').requestSubmit(); true");
  const recurringId = await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.find(task => task.title === 'Daily recurring review').id");
  let previewDates = await evaluate(`Array.from(document.querySelectorAll('.overview-event[data-id="${recurringId}"]'), event => event.dataset.date)`);
  assert(previewDates.length === 5 && previewDates[0] === today && previewDates.at(-1) === repeatEnd, "Timeline must show all five dates through the inclusive repeat end.");
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.filter(task => task.title === 'Daily recurring review').length") === 1, "Timeline previews must not save duplicate tasks.");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('[data-action=timeline-today]').click(); window.scrollTo(0, 0); true");
  await screenshot("recurring-timeline");
  await evaluate(`document.querySelectorAll('.overview-event[data-id="${recurringId}"]')[3].click(); true`);
  assert(await evaluate(`(() => {
    const marker = document.querySelectorAll('.overview-event[data-id="${recurringId}"]')[3];
    const rect = marker.getBoundingClientRect();
    const scroll = document.querySelector('.overview-scroll').getBoundingClientRect();
    return marker.classList.contains('is-selected') && rect.left >= scroll.left + 170 && rect.right <= scroll.right;
  })()`), "Selecting a future recurrence must reveal that date, not jump to the first occurrence.");
  await evaluate(`document.querySelector('[data-action=edit-task][data-id="${recurringId}"]').click(); true`);
  assert(await evaluate("document.querySelector('#task-form').elements.repeatEndDate.value") === repeatEnd, "Editing must retain the repeat end date.");
  await evaluate("document.querySelector('#task-form').elements.repeatEndDate.value = ''; document.querySelector('#task-form').requestSubmit(); true");
  previewDates = await evaluate(`Array.from(document.querySelectorAll('.overview-event[data-id="${recurringId}"]'), event => event.dataset.date)`);
  assert(previewDates.length > 5, "A blank end date must preview ongoing repeats.");
  const lastPreview = previewDates.at(-1);
  await evaluate("const recurringScroll = document.querySelector('.overview-scroll'); recurringScroll.scrollLeft = recurringScroll.scrollWidth - recurringScroll.clientWidth - 100; recurringScroll.dispatchEvent(new Event('scroll')); true");
  assert(await evaluate(`Array.from(document.querySelectorAll('.overview-event[data-id="${recurringId}"]'), event => event.dataset.date).at(-1) > '${lastPreview}'`), "More occurrences must appear as the timeline scrolls into later dates.");
  await evaluate(`document.querySelector('[data-action=edit-task][data-id="${recurringId}"]').click(); document.querySelector('#task-form').elements.repeatEndDate.value = '${repeatEnd}'; document.querySelector('#task-form').requestSubmit(); document.querySelector('[data-action=timeline-today]').click(); true`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelectorAll('.overview-event[data-id="${recurringId}"]').length === 5`));
  for (let remaining = 4; remaining >= 0; remaining -= 1) {
    await evaluate(`(() => {
      const task = JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.find(task => task.title === 'Daily recurring review' && !task.archived);
      document.querySelector('[data-action=complete-task][data-id="' + task.id + '"]').click();
      return true;
    })()`);
    assert(await evaluate("document.querySelectorAll('.overview-event[title^=\"Daily recurring review\"]').length") === remaining, "Completion must advance previews without duplicates and stop at the end date.");
  }
  assert(await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).tasks.filter(task => task.title === 'Daily recurring review' && !task.archived).length") === 0, "Completing the final occurrence must not create another task.");
  await evaluate(`(async () => {
    const { toDateInput } = await import('/src/model.js');
    const date = offset => { const value = new Date(); value.setDate(value.getDate() + offset); return toDateInput(value); };
    document.querySelector('.workspace-list [data-action=add-task]').click();
    const form = document.querySelector('#task-form');
    form.elements.title.value = 'Weekly lab block';
    form.elements.blockDate.value = date(1);
    form.elements.blockStart.value = '10:00';
    form.elements.blockEnd.value = '11:00';
    form.elements.repeatType.value = 'weekly';
    form.elements.repeatType.dispatchEvent(new Event('change'));
    form.elements.repeatEndDate.value = date(15);
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.overview-event.block[title^=\"Weekly lab block\"]').length") === 3, "Time-block-only events must preview every week through the end date.");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.querySelector('[data-view=notes]').click(); window.scrollTo(0, 0); true");
  assert(await evaluate("document.querySelectorAll('.note-card').length === 1 && !document.querySelector('.note-card h3') && document.querySelector('.note-card p').textContent === 'Ask about next semester’s lab schedule.'"), "Legacy untitled notes must remain readable on mobile.");
  await evaluate(`(() => {
    const form = document.querySelector('#note-form');
    form.elements.noteTitle.value = 'Ideas for next semester — research, applications, and a better weekly routine';
    form.elements.noteText.value = 'Keep one afternoon free for deep work.';
    form.requestSubmit();
    return true;
  })()`);
  assert(await evaluate("document.querySelectorAll('.note-card').length === 2 && Boolean(document.querySelector('.note-card h3')) && document.documentElement.scrollWidth <= window.innerWidth + 1 && getComputedStyle(document.querySelector('[name=noteTitle]')).fontSize === '16px'"), "Mobile title entry and long note headings must fit the screen.");
  await waitFor(() => evaluate("!document.querySelector('.toast')"));
  await screenshot("mobile-note-titles");
  const legacyNoteTime = await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes.find(note => note.id === 'note').createdAt");
  await evaluate("document.querySelector('[data-action=edit-note][data-id=note]').click(); true");
  assert(await evaluate("document.querySelector('#note-form').elements.noteTitle.value === '' && document.querySelector('#note-form').elements.noteText.value === 'Ask about next semester’s lab schedule.'"), "Mobile editing must also support legacy notes with no title.");
  await evaluate("document.querySelector('#note-form').elements.noteTitle.value = 'Lab schedule'; document.querySelector('#note-form').elements.noteText.value = 'Ask about next semester’s lab schedule and meeting times.'; true");
  await screenshot("mobile-note-edit");
  await evaluate("document.querySelector('#note-form').requestSubmit(); true");
  const mobileNotes = await evaluate("JSON.parse(localStorage.getItem('plan-archive-state-v1')).notes");
  assert(mobileNotes.length === 2 && mobileNotes.find(note => note.id === 'note').title === 'Lab schedule' && mobileNotes.find(note => note.id === 'note').createdAt === legacyNoteTime, "Mobile editing must update a legacy note without duplicating it or changing its timestamp.");

  if (process.env.QA_SCREENSHOTS) {
    await evaluate("document.querySelector('#filter-dialog').close(); const preview = document.createElement('img'); preview.src = '/assets/hina-halo.svg'; preview.style.cssText = 'width:360px;height:auto;display:block;margin:40px auto'; document.body.replaceChildren(preview); document.body.style.background = '#faf9fc'; true");
    await waitFor(() => evaluate("document.querySelector('img').complete"));
    await screenshot("halo");
  }
  assert(browserErrors.length === 0, `Browser runtime errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({
    desktop: { projectCreated: true, projectsWithoutDeadlines: true, recurringTimeline: true, repeatEndDates: true, taskCreated: true, standaloneTasks: true, separatedHighlights: true, weekCalendar: true, noteCreated: true, optionalNoteTitles: true, archiveRestore: true, integratedTimeline: true, todayFirst: true, continuousScrolling: true, mixedList: true, projectDropdowns: true, sharedTaskHighlight: true, listOnlyFilters: true, haloLoaded: true, overdueNotice: true },
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

async function timelineViewport() {
  return evaluate(`(() => {
    const scroll = document.querySelector('.overview-scroll');
    const headers = [...scroll.querySelectorAll('.overview-axis [data-date]')];
    const edge = scroll.getBoundingClientRect().left + scroll.querySelector('.overview-axis > span').offsetWidth;
    const first = headers.find(header => header.getBoundingClientRect().right > edge + 1);
    return { loadedStart: headers[0].dataset.date, firstVisible: first.dataset.date,
      offset: first.getBoundingClientRect().left - edge, dayCount: headers.length };
  })()`);
}

async function assertTodayFirst(today) {
  const viewport = await timelineViewport();
  assert(viewport.firstVisible === today && Math.abs(viewport.offset) < 1, "Today must be the first visible date, aligned exactly to the left edge.");
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
