import {
  STORAGE_KEY,
  archiveCompletedTask,
  compareTasks,
  createInitialState,
  dueTimestamp,
  exportPayload,
  fromDateInput,
  makeId,
  normalizeState,
  normalizeTask,
  taskDueStatus,
  toDateInput,
} from "./model.js";

const content = document.querySelector("#content");
const taskDialog = document.querySelector("#task-dialog");
const taskForm = document.querySelector("#task-form");
const projectDialog = document.querySelector("#project-dialog");
const projectForm = document.querySelector("#project-form");
const dataDialog = document.querySelector("#data-dialog");
const searchInput = document.querySelector("#search-input");
const toastRegion = document.querySelector("#toast-region");

let state = loadState();
const ui = {
  view: "tasks",
  taskFilter: "all",
  search: "",
  editingTaskId: null,
  editingProjectId: null,
  selectedProjectId: null,
  taskPresetProjectIds: [],
  calendarMode: "week",
  calendarCursor: new Date(),
};

const viewDetails = {
  tasks: ["MISSION CONTROL", "All tasks"],
  soon: ["DEADLINE RADAR", "Due soon"],
  calendar: ["TIME MAP", "Calendar"],
  projects: ["LIFE MISSIONS", "Projects"],
  notes: ["MEMORY LOG", "Quick notes"],
  archive: ["COMPLETED RECORDS", "Archive"],
};

const iconPaths = {
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  note: '<path d="M5 3h11l3 3v15H5z"/><path d="M15 3v5h4M8 12h8M8 16h6"/>',
  archive: '<path d="M4 7v13h16V7M3 3h18v4H3zM9 11h6"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/>',
  upload: '<path d="M12 16V4m0 0 4 4m-4-4L8 8M5 20h14"/>',
  file: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/>',
  map: '<path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z"/><circle cx="12" cy="9" r="2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  block: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8v8H8z"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  spark: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/>',
  subtasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M4 12h2M4 18h2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  journal: '<path d="M6 3h12v18H6zM9 3v18M12 8h3M12 12h3"/>',
};

function iconMarkup(name) {
  const paths = iconPaths[name] || iconPaths.spark;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function renderIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = iconMarkup(element.dataset.icon);
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createInitialState();
  } catch (error) {
    console.warn("Could not load local planner data", error);
    return createInitialState();
  }
}

function saveState(message = "") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  if (message) showToast(message);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activeTasks() {
  return state.tasks.filter((task) => !task.archived && !task.completed);
}

function archivedTasks() {
  return state.tasks.filter((task) => task.archived || task.completed);
}

function projectById(id) {
  return state.projects.find((project) => project.id === id);
}

function matchesSearch(task) {
  if (!ui.search) return true;
  const projectNames = task.projectIds.map((id) => projectById(id)?.name || "").join(" ");
  const subtaskNames = task.subtasks.map((subtask) => subtask.title).join(" ");
  const haystack = `${task.title} ${task.instructions} ${task.location} ${projectNames} ${subtaskNames}`.toLowerCase();
  return haystack.includes(ui.search);
}

function formatDate(dateString, options = {}) {
  const date = fromDateInput(dateString);
  if (!date) return "No deadline";
  return new Intl.DateTimeFormat(undefined, {
    month: options.long ? "long" : "short",
    day: "numeric",
    ...(options.year ? { year: "numeric" } : {}),
    ...(options.weekday ? { weekday: options.weekday } : {}),
  }).format(date);
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatClock(time) {
  if (!time) return "";
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function todayInput() {
  return toDateInput(new Date());
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3300);
}

function render() {
  const details = viewDetails[ui.view] || viewDetails.tasks;
  document.querySelector("#page-eyebrow").textContent = details[0];
  document.querySelector("#page-title").textContent = details[1];
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === ui.view);
  });

  const currentTasks = activeTasks();
  const soonCount = currentTasks.filter((task) => ["overdue", "soon"].includes(taskDueStatus(task))).length;
  document.querySelector("#count-tasks").textContent = currentTasks.length;
  document.querySelector("#count-soon").textContent = soonCount || "";
  document.querySelector("#count-projects").textContent = state.projects.length;
  document.querySelector("#count-notes").textContent = state.notes.length;

  const renderer = {
    tasks: renderTasksView,
    soon: renderSoonView,
    calendar: renderCalendarView,
    projects: renderProjectsView,
    notes: renderNotesView,
    archive: renderArchiveView,
  }[ui.view] || renderTasksView;

  content.innerHTML = renderer();
  renderIcons(content);
}

function renderTasksView() {
  const tasks = activeTasks().filter(matchesSearch).sort(compareTasks);
  const filtered = tasks.filter((task) => {
    if (ui.taskFilter === "important") return task.important;
    if (ui.taskFilter === "overdue") return taskDueStatus(task) === "overdue";
    if (ui.taskFilter === "uncategorized") return task.projectIds.length === 0;
    return true;
  });
  const overdue = activeTasks().filter((task) => taskDueStatus(task) === "overdue").length;
  const soon = activeTasks().filter((task) => taskDueStatus(task) === "soon").length;

  return `
    <div class="view-header">
      <div>
        <h2>Your next moves</h2>
        <p>Important work stays at the front, followed by the nearest deadlines. Tasks may belong to several projects or none.</p>
      </div>
    </div>
    <div class="dashboard-grid">
      ${statCard("alert", "Overdue", overdue, "danger")}
      ${statCard("clock", "Due within 7 days", soon, "warning")}
      ${statCard("target", "Active projects", state.projects.length, "")}
    </div>
    <section class="panel">
      <div class="panel-heading">
        <h3>Task queue <span class="muted-count">${filtered.length}</span></h3>
        <div class="filter-row">
          ${filterChip("all", "All")}
          ${filterChip("important", "Important")}
          ${filterChip("overdue", "Overdue")}
          ${filterChip("uncategorized", "Uncategorized")}
        </div>
      </div>
      ${filtered.length ? `<div class="task-list">${filtered.map((task) => taskRow(task)).join("")}</div>` : emptyState("tasks", ui.search ? "No matching tasks" : "Your queue is clear", ui.search ? "Try a different search phrase." : "Create a task and give it a deadline when one matters.", "Create task", "add-task")}
    </section>
  `;
}

function renderSoonView() {
  const tasks = activeTasks().filter(matchesSearch).sort(compareTasks);
  const overdue = tasks.filter((task) => taskDueStatus(task) === "overdue");
  const soon = tasks.filter((task) => taskDueStatus(task) === "soon");
  return `
    <div class="view-header">
      <div>
        <h2>Seven-day radar</h2>
        <p>Overdue work remains visible until completed or rescheduled. Upcoming work covers today through the next seven days.</p>
      </div>
    </div>
    ${taskSection("Overdue", overdue, "Nothing overdue", "You are caught up on missed deadlines.")}
    <div style="height:16px"></div>
    ${taskSection("Due in the next 7 days", soon, "No approaching deadlines", "Your next seven days are currently clear.")}
  `;
}

function taskSection(title, tasks, emptyTitle, emptyCopy) {
  return `
    <section class="panel">
      <div class="panel-heading"><h3>${escapeHtml(title)} <span class="muted-count">${tasks.length}</span></h3></div>
      ${tasks.length ? `<div class="task-list">${tasks.map((task) => taskRow(task)).join("")}</div>` : emptyState("check", emptyTitle, emptyCopy)}
    </section>
  `;
}

function statCard(icon, label, value, className) {
  return `
    <article class="stat-card ${className}">
      <span class="stat-card-label"><span data-icon="${icon}"></span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function filterChip(value, label) {
  return `<button class="filter-chip ${ui.taskFilter === value ? "is-active" : ""}" data-action="filter-tasks" data-filter="${value}">${label}</button>`;
}

function taskRow(task, options = {}) {
  const dueStatus = taskDueStatus(task);
  const dueLabel = task.dueDate
    ? `${formatDate(task.dueDate, { year: true })}${task.dueTime ? ` · ${formatClock(task.dueTime)}` : ""}`
    : "";
  const projects = task.projectIds.map(projectById).filter(Boolean);
  const completedSubtasks = task.subtasks.filter((subtask) => subtask.completed).length;
  const subtaskPercent = task.subtasks.length ? Math.round((completedSubtasks / task.subtasks.length) * 100) : 0;
  const isArchive = Boolean(options.archive);

  return `
    <article class="task-row ${task.important ? "is-important" : ""} ${isArchive ? "archive-row" : ""}">
      <button class="complete-button" data-action="${isArchive ? "restore-task" : "complete-task"}" data-id="${escapeHtml(task.id)}" aria-label="${isArchive ? "Restore" : "Complete"} ${escapeHtml(task.title)}">
        ${iconMarkup("check")}
      </button>
      <div class="task-copy">
        <div class="task-title-line">
          ${task.important ? '<span class="star-marker" title="Important">★</span>' : ""}
          <strong>${escapeHtml(task.title)}</strong>
        </div>
        <div class="task-meta">
          ${dueLabel ? `<span><span data-icon="clock"></span>${escapeHtml(dueLabel)}</span>` : ""}
          ${dueStatus === "overdue" ? '<span class="status-pill overdue">Overdue</span>' : ""}
          ${dueStatus === "soon" ? '<span class="status-pill soon">Due soon</span>' : ""}
          ${task.location ? `<span><span data-icon="map"></span>${escapeHtml(task.location)}</span>` : ""}
          ${task.timeBlock?.date ? `<span><span data-icon="block"></span>${escapeHtml(formatDate(task.timeBlock.date))} ${escapeHtml(formatClock(task.timeBlock.start))}–${escapeHtml(formatClock(task.timeBlock.end))}</span>` : ""}
          ${task.recurrence?.type !== "none" ? `<span><span data-icon="repeat"></span>${escapeHtml(recurrenceLabel(task.recurrence))}</span>` : ""}
          ${projects.map((project) => `<span class="project-pill"><i class="project-dot" style="background:${escapeHtml(project.color)}"></i>${escapeHtml(project.name)}</span>`).join("")}
          ${!projects.length ? '<span class="project-pill">Uncategorized</span>' : ""}
          ${task.subtasks.length ? `<span title="${completedSubtasks} of ${task.subtasks.length} subtasks"><span data-icon="subtasks"></span>${completedSubtasks}/${task.subtasks.length}<i class="subtask-progress"><span style="width:${subtaskPercent}%"></span></i></span>` : ""}
        </div>
      </div>
      <div class="task-actions">
        ${isArchive
          ? `<button class="icon-button" data-action="restore-task" data-id="${escapeHtml(task.id)}" title="Restore">${iconMarkup("restore")}</button><button class="icon-button danger-button" data-action="delete-task" data-id="${escapeHtml(task.id)}" title="Delete permanently">${iconMarkup("trash")}</button>`
          : `<button class="icon-button" data-action="edit-task" data-id="${escapeHtml(task.id)}" title="Edit">${iconMarkup("edit")}</button>`}
      </div>
    </article>
  `;
}

function recurrenceLabel(recurrence) {
  if (recurrence.type === "daily") return "Daily";
  if (recurrence.type === "weekly") return "Weekly";
  if (recurrence.type === "monthly") return "Monthly";
  if (recurrence.type === "custom") {
    const unit = recurrence.interval === 1 ? recurrence.unit : `${recurrence.unit}s`;
    return `Every ${recurrence.interval} ${unit}`;
  }
  return "";
}

function emptyState(icon, title, copy, buttonLabel = "", action = "") {
  return `
    <div class="empty-state">
      <div>
        <span class="empty-state-mark" data-icon="${iconPaths[icon] ? icon : "spark"}"></span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(copy)}</p>
        ${buttonLabel ? `<button class="primary-button" data-action="${action}"><span data-icon="plus"></span>${escapeHtml(buttonLabel)}</button>` : ""}
      </div>
    </div>
  `;
}

function renderProjectsView() {
  const projects = state.projects.filter((project) => {
    if (!ui.search) return true;
    return `${project.name} ${project.description}`.toLowerCase().includes(ui.search);
  });
  const selected = projectById(ui.selectedProjectId);

  return `
    <div class="view-header">
      <div>
        <h2>Major life missions</h2>
        <p>Use projects for applications, school, lab, job hunting, or any larger outcome. Each project gets its own deadline and task timeline.</p>
      </div>
      <button class="primary-button" data-action="add-project"><span data-icon="plus"></span>New project</button>
    </div>
    ${projects.length
      ? `<div class="project-grid">${projects.map(projectCard).join("")}</div>`
      : `<section class="panel">${emptyState("layers", ui.search ? "No matching projects" : "Create your first project", ui.search ? "Try another search phrase." : "Projects keep the moving pieces of a major event together.", ui.search ? "" : "Create project", "add-project")}</section>`}
    ${selected ? projectDetail(selected) : ""}
  `;
}

function projectCard(project) {
  const tasks = state.tasks.filter((task) => task.projectIds.includes(project.id));
  const completed = tasks.filter((task) => task.completed || task.archived).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return `
    <article class="project-card" style="--project-color:${escapeHtml(project.color)}" data-action="select-project" data-id="${escapeHtml(project.id)}">
      <div class="project-card-top">
        <span class="project-card-icon" data-icon="target"></span>
        <button class="icon-button" data-action="edit-project" data-id="${escapeHtml(project.id)}" title="Edit project"><span data-icon="edit"></span></button>
      </div>
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(project.description || "No description yet.")}</p>
      <div class="project-progress-row">
        <span>${completed}/${tasks.length} tasks complete</span>
        <span>${project.deadline ? formatDate(project.deadline, { year: true }) : "No deadline"}</span>
      </div>
      <div class="project-progress"><span style="width:${percent}%"></span></div>
    </article>
  `;
}

function projectDetail(project) {
  const tasks = state.tasks
    .filter((task) => task.projectIds.includes(project.id))
    .sort((a, b) => {
      const difference = dueTimestamp(a) - dueTimestamp(b);
      if (Number.isFinite(difference) && difference !== 0) return difference;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  const milestones = tasks.map((task) => ({
    date: task.dueDate,
    title: task.title,
    detail: task.completed ? "Completed" : task.dueDate ? (taskDueStatus(task) === "overdue" ? "Overdue" : "Task deadline") : "No deadline assigned",
    completed: task.completed,
  }));
  if (project.deadline) milestones.push({ date: project.deadline, title: `${project.name} deadline`, detail: "Project target", projectDeadline: true });
  milestones.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return `
    <section class="panel project-detail" style="--project-color:${escapeHtml(project.color)}">
      <div class="project-detail-banner">
        <div>
          <span class="eyebrow">ACTIVE PROJECT FILE</span>
          <h2>${escapeHtml(project.name)}</h2>
          <p>${escapeHtml(project.description || "Add a project description to keep the outcome clear.")}</p>
        </div>
        <div class="project-banner-actions">
          <button class="secondary-button" data-action="project-add-task" data-id="${escapeHtml(project.id)}"><span data-icon="plus"></span>Add task</button>
          <button class="icon-button" data-action="edit-project" data-id="${escapeHtml(project.id)}" title="Edit project"><span data-icon="edit"></span></button>
        </div>
      </div>
      <div class="timeline">
        <div class="timeline-heading"><h3>Timeline</h3><span class="project-pill">${tasks.length} linked task${tasks.length === 1 ? "" : "s"}</span></div>
        ${milestones.length ? milestones.map((milestone) => `
          <div class="timeline-item">
            <div class="timeline-date">${milestone.date ? escapeHtml(formatDate(milestone.date, { year: true })) : "Anytime"}</div>
            <div class="timeline-rail"><span class="timeline-dot"></span></div>
            <div class="timeline-copy"><strong>${escapeHtml(milestone.title)}</strong><small>${escapeHtml(milestone.detail)}</small></div>
          </div>
        `).join("") : `<div class="empty-state"><div><p>No timeline items yet. Add a task with a deadline to create the first milestone.</p></div></div>`}
      </div>
    </section>
  `;
}

function renderCalendarView() {
  const periodLabel = ui.calendarMode === "week"
    ? weekLabel(ui.calendarCursor)
    : new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(ui.calendarCursor);
  return `
    <div class="view-header">
      <div>
        <h2>Calendar map</h2>
        <p>Deadlines appear as all-day markers. Optional time blocks place work into a specific hour.</p>
      </div>
    </div>
    <section class="panel calendar-shell">
      <div class="calendar-toolbar">
        <div class="calendar-controls">
          <button class="icon-button" data-action="calendar-prev" aria-label="Previous period"><span data-icon="left"></span></button>
          <button class="filter-chip" data-action="calendar-today">Today</button>
          <button class="icon-button" data-action="calendar-next" aria-label="Next period"><span data-icon="right"></span></button>
        </div>
        <div class="calendar-period">${escapeHtml(periodLabel)}</div>
        <div class="segmented-control">
          <button class="segmented-button ${ui.calendarMode === "week" ? "is-active" : ""}" data-action="calendar-mode" data-mode="week">Week</button>
          <button class="segmented-button ${ui.calendarMode === "month" ? "is-active" : ""}" data-action="calendar-mode" data-mode="month">Month</button>
        </div>
      </div>
      ${ui.calendarMode === "week" ? renderWeekCalendar() : renderMonthCalendar()}
    </section>
  `;
}

function weekStart(value) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function weekLabel(value) {
  const start = weekStart(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(end);
  return `${startLabel} – ${endLabel}`;
}

function renderWeekCalendar() {
  const start = weekStart(ui.calendarCursor);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date;
  });
  const hours = Array.from({ length: 17 }, (_, index) => index + 6);

  const headers = days.map((date) => {
    const isToday = toDateInput(date) === todayInput();
    return `<div class="week-day-header ${isToday ? "is-today" : ""}"><span>${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</span><strong>${date.getDate()}</strong></div>`;
  }).join("");

  const allDayCells = days.map((date) => {
    const dateString = toDateInput(date);
    const tasks = activeTasks().filter((task) => task.dueDate === dateString && task.timeBlock?.date !== dateString).filter(matchesSearch).sort(compareTasks);
    return `<div class="all-day-cell">${tasks.map(calendarEvent).join("")}</div>`;
  }).join("");

  const timeRows = hours.map((hour) => {
    const labelDate = new Date(2000, 0, 1, hour, 0);
    const label = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(labelDate);
    const cells = days.map((date) => {
      const dateString = toDateInput(date);
      const tasks = activeTasks().filter((task) => {
        if (task.timeBlock?.date !== dateString || !task.timeBlock.start) return false;
        const startHour = Number(task.timeBlock.start.split(":")[0]);
        return Math.max(6, Math.min(22, startHour)) === hour;
      }).filter(matchesSearch).sort(compareTasks);
      return `<div class="week-cell">${tasks.map(calendarEvent).join("")}</div>`;
    }).join("");
    return `<div class="week-time-label">${escapeHtml(label)}</div>${cells}`;
  }).join("");

  return `
    <div class="week-calendar-scroll">
      <div class="week-calendar"><div class="week-corner"></div>${headers}</div>
      <div class="all-day-strip"><div class="all-day-label">DEADLINE</div>${allDayCells}</div>
      <div class="week-calendar">${timeRows}</div>
    </div>
  `;
}

function calendarEvent(task) {
  const project = task.projectIds.map(projectById).find(Boolean);
  const time = task.timeBlock?.start ? `${formatClock(task.timeBlock.start)} ` : "";
  return `<button class="calendar-event" style="--event-color:${escapeHtml(project?.color || "#4aa8ff")}" data-action="edit-task" data-id="${escapeHtml(task.id)}" title="${escapeHtml(task.title)}">${escapeHtml(time + task.title)}</button>`;
}

function renderMonthCalendar() {
  const year = ui.calendarCursor.getFullYear();
  const month = ui.calendarCursor.getMonth();
  const first = new Date(year, month, 1, 12);
  const start = weekStart(first);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date;
  });
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 0, 5 + index);
    return `<div class="month-weekday">${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</div>`;
  }).join("");

  const cells = days.map((date) => {
    const dateString = toDateInput(date);
    const tasks = activeTasks().filter((task) => task.dueDate === dateString || task.timeBlock?.date === dateString).filter(matchesSearch).sort(compareTasks);
    const uniqueTasks = [...new Map(tasks.map((task) => [task.id, task])).values()];
    return `
      <div class="month-day ${date.getMonth() !== month ? "is-outside" : ""} ${dateString === todayInput() ? "is-today" : ""}">
        <span class="month-day-number">${date.getDate()}</span>
        ${uniqueTasks.slice(0, 4).map((task) => {
          const project = task.projectIds.map(projectById).find(Boolean);
          return `<button class="month-event" style="--event-color:${escapeHtml(project?.color || "#4aa8ff")}" data-action="edit-task" data-id="${escapeHtml(task.id)}" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</button>`;
        }).join("")}
        ${uniqueTasks.length > 4 ? `<span class="task-meta">+${uniqueTasks.length - 4} more</span>` : ""}
      </div>
    `;
  }).join("");
  return `<div class="month-grid">${weekdays}${cells}</div>`;
}

function renderNotesView() {
  const notes = [...state.notes]
    .filter((note) => !ui.search || note.text.toLowerCase().includes(ui.search))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <div class="view-header">
      <div>
        <h2>Quick memory log</h2>
        <p>Capture a thought without organizing it first. Every entry receives a timestamp automatically.</p>
      </div>
    </div>
    <div class="notes-layout">
      <form class="panel note-composer" id="note-form">
        <h3>Record a thought</h3>
        <p>No title, category, or extra setup required.</p>
        <textarea name="noteText" maxlength="4000" required placeholder="What is on your mind?"></textarea>
        <button class="primary-button" type="submit"><span data-icon="journal"></span>Save note</button>
      </form>
      <div class="note-list">
        ${notes.length ? notes.map((note) => `
          <article class="note-card">
            <time datetime="${escapeHtml(note.createdAt)}">${escapeHtml(formatDateTime(note.createdAt))}</time>
            <p>${escapeHtml(note.text)}</p>
            <button class="icon-button danger-button" data-action="delete-note" data-id="${escapeHtml(note.id)}" title="Delete note"><span data-icon="trash"></span></button>
          </article>
        `).join("") : `<section class="panel">${emptyState("journal", ui.search ? "No matching notes" : "No notes yet", ui.search ? "Try a different search phrase." : "Your first quick thought will appear here.")}</section>`}
      </div>
    </div>
  `;
}

function renderArchiveView() {
  const tasks = archivedTasks().filter(matchesSearch).sort((a, b) => new Date(b.archivedAt || b.completedAt || b.createdAt) - new Date(a.archivedAt || a.completedAt || a.createdAt));
  return `
    <div class="view-header">
      <div>
        <h2>Completed records</h2>
        <p>Completed tasks move here automatically. Restore a task or delete it permanently when you no longer need the record.</p>
      </div>
    </div>
    <section class="panel">
      <div class="panel-heading"><h3>Archive <span class="muted-count">${tasks.length}</span></h3></div>
      ${tasks.length ? `<div class="task-list">${tasks.map((task) => taskRow(task, { archive: true })).join("")}</div>` : emptyState("archive", "The archive is empty", "Completed tasks will be stored here.")}
    </section>
  `;
}

function openTaskDialog(taskId = null, presetProjectIds = []) {
  ui.editingTaskId = taskId;
  ui.taskPresetProjectIds = presetProjectIds;
  const task = taskId ? state.tasks.find((item) => item.id === taskId) : null;
  document.querySelector("#task-dialog-title").textContent = task ? "Edit task" : "Create task";
  taskForm.reset();
  taskForm.elements.repeatInterval.value = "1";
  taskForm.elements.repeatUnit.value = "week";
  taskForm.elements.title.value = task?.title || "";
  taskForm.elements.important.checked = Boolean(task?.important);
  taskForm.elements.dueDate.value = task?.dueDate || "";
  taskForm.elements.dueTime.value = task?.dueTime || "";
  taskForm.elements.location.value = task?.location || "";
  taskForm.elements.instructions.value = task?.instructions || "";
  taskForm.elements.blockDate.value = task?.timeBlock?.date || "";
  taskForm.elements.blockStart.value = task?.timeBlock?.start || "";
  taskForm.elements.blockEnd.value = task?.timeBlock?.end || "";
  taskForm.elements.repeatType.value = task?.recurrence?.type || "none";
  taskForm.elements.repeatInterval.value = task?.recurrence?.interval || 1;
  taskForm.elements.repeatUnit.value = task?.recurrence?.unit || "week";

  const selectedProjectIds = task?.projectIds || presetProjectIds;
  const projectList = document.querySelector("#task-project-list");
  projectList.innerHTML = state.projects.length
    ? state.projects.map((project) => `
        <label class="project-check">
          <input type="checkbox" value="${escapeHtml(project.id)}" ${selectedProjectIds.includes(project.id) ? "checked" : ""}>
          <span><i class="project-dot" style="background:${escapeHtml(project.color)}"></i>${escapeHtml(project.name)}</span>
        </label>
      `).join("")
    : '<span class="task-meta">No projects yet. This task will remain uncategorized.</span>';

  const editor = document.querySelector("#subtask-editor");
  editor.innerHTML = "";
  (task?.subtasks || []).forEach((subtask) => addSubtaskRow(subtask));
  if (!task?.subtasks?.length) addSubtaskRow();

  document.querySelectorAll("#weekday-picker input").forEach((checkbox) => {
    checkbox.checked = Boolean(task?.recurrence?.weekdays?.includes(Number(checkbox.value)));
  });
  updateRepeatFields();
  taskDialog.showModal();
  window.setTimeout(() => taskForm.elements.title.focus(), 50);
}

function addSubtaskRow(subtask = {}) {
  const row = document.createElement("div");
  row.className = "subtask-input-row";
  row.dataset.id = subtask.id || makeId("subtask");
  row.innerHTML = `
    <input type="checkbox" ${subtask.completed ? "checked" : ""} aria-label="Subtask completed">
    <input type="text" maxlength="160" value="${escapeHtml(subtask.title || "")}" placeholder="Subtask">
    <button type="button" class="icon-button" data-remove-subtask aria-label="Remove subtask">${iconMarkup("close")}</button>
  `;
  document.querySelector("#subtask-editor").append(row);
}

function updateRepeatFields() {
  const isCustom = taskForm.elements.repeatType.value === "custom";
  document.querySelectorAll(".custom-repeat-field").forEach((element) => element.classList.toggle("is-hidden", !isCustom));
  const showWeekdays = isCustom && taskForm.elements.repeatUnit.value === "week";
  document.querySelector("#weekday-picker").classList.toggle("is-hidden", !showWeekdays);
}

function submitTask(event) {
  event.preventDefault();
  const fields = taskForm.elements;
  if (fields.dueTime.value && !fields.dueDate.value) {
    showToast("Choose a deadline date before adding a deadline time.");
    fields.dueDate.focus();
    return;
  }
  const hasAnyBlockValue = fields.blockDate.value || fields.blockStart.value || fields.blockEnd.value;
  const hasFullBlock = fields.blockDate.value && fields.blockStart.value && fields.blockEnd.value;
  if (hasAnyBlockValue && !hasFullBlock) {
    showToast("A time block needs a date, start time, and end time.");
    return;
  }
  if (hasFullBlock && fields.blockEnd.value <= fields.blockStart.value) {
    showToast("The time block must end after it starts.");
    fields.blockEnd.focus();
    return;
  }
  if (fields.repeatType.value !== "none" && !fields.dueDate.value && !fields.blockDate.value) {
    showToast("A repeating task needs a deadline date or time-block date.");
    fields.dueDate.focus();
    return;
  }

  const existing = ui.editingTaskId ? state.tasks.find((task) => task.id === ui.editingTaskId) : null;
  const projectIds = [...document.querySelectorAll("#task-project-list input:checked")].map((input) => input.value);
  const subtasks = [...document.querySelectorAll("#subtask-editor .subtask-input-row")].map((row) => ({
    id: row.dataset.id,
    title: row.querySelector('input[type="text"]').value.trim(),
    completed: row.querySelector('input[type="checkbox"]').checked,
  })).filter((subtask) => subtask.title);
  const weekdays = [...document.querySelectorAll("#weekday-picker input:checked")].map((checkbox) => Number(checkbox.value));

  const task = normalizeTask({
    ...existing,
    id: existing?.id || makeId("task"),
    title: fields.title.value.trim(),
    instructions: fields.instructions.value.trim(),
    location: fields.location.value.trim(),
    dueDate: fields.dueDate.value,
    dueTime: fields.dueTime.value,
    important: fields.important.checked,
    projectIds,
    subtasks,
    recurrence: {
      type: fields.repeatType.value,
      interval: Number(fields.repeatInterval.value || 1),
      unit: fields.repeatUnit.value,
      weekdays,
    },
    timeBlock: {
      date: fields.blockDate.value,
      start: fields.blockStart.value,
      end: fields.blockEnd.value,
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
    manualOrder: existing?.manualOrder ?? state.tasks.length,
  });

  if (existing) {
    state = { ...state, tasks: state.tasks.map((item) => item.id === existing.id ? task : item) };
  } else {
    state = { ...state, tasks: [...state.tasks, task] };
  }
  taskDialog.close();
  saveState(existing ? "Task updated." : "Task added to your queue.");
}

function openProjectDialog(projectId = null) {
  ui.editingProjectId = projectId;
  const project = projectId ? projectById(projectId) : null;
  projectForm.reset();
  document.querySelector("#project-dialog-title").textContent = project ? "Edit project" : "Create project";
  projectForm.elements.name.value = project?.name || "";
  projectForm.elements.description.value = project?.description || "";
  projectForm.elements.deadline.value = project?.deadline || "";
  projectForm.elements.color.value = project?.color || "#4aa8ff";
  document.querySelector("#delete-project-button").classList.toggle("is-hidden", !project);
  projectDialog.showModal();
  window.setTimeout(() => projectForm.elements.name.focus(), 50);
}

function submitProject(event) {
  event.preventDefault();
  const existing = ui.editingProjectId ? projectById(ui.editingProjectId) : null;
  const project = {
    id: existing?.id || makeId("project"),
    name: projectForm.elements.name.value.trim(),
    description: projectForm.elements.description.value.trim(),
    deadline: projectForm.elements.deadline.value,
    color: projectForm.elements.color.value,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  state = {
    ...state,
    projects: existing
      ? state.projects.map((item) => item.id === existing.id ? project : item)
      : [...state.projects, project],
  };
  ui.selectedProjectId = project.id;
  projectDialog.close();
  saveState(existing ? "Project updated." : "Project created.");
}

function deleteProject() {
  const project = projectById(ui.editingProjectId);
  if (!project) return;
  if (!window.confirm(`Delete “${project.name}”? Its tasks will remain, but this project link will be removed.`)) return;
  state = {
    ...state,
    projects: state.projects.filter((item) => item.id !== project.id),
    tasks: state.tasks.map((task) => ({ ...task, projectIds: task.projectIds.filter((id) => id !== project.id) })),
  };
  ui.selectedProjectId = null;
  projectDialog.close();
  saveState("Project deleted; linked tasks were kept.");
}

function completeTask(id) {
  const result = archiveCompletedTask(state, id);
  state = result.state;
  saveState(result.repeated ? "Task completed. The next occurrence is ready." : "Task completed and archived.");
}

function restoreTask(id) {
  state = {
    ...state,
    tasks: state.tasks.map((task) => task.id === id
      ? { ...task, completed: false, archived: false, completedAt: "", archivedAt: "" }
      : task),
  };
  saveState("Task restored to the active queue.");
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !window.confirm(`Permanently delete “${task.title}”? This cannot be undone.`)) return;
  state = { ...state, tasks: state.tasks.filter((item) => item.id !== id) };
  saveState("Task permanently deleted.");
}

function saveNote(form) {
  const text = form.elements.noteText.value.trim();
  if (!text) return;
  state = {
    ...state,
    notes: [...state.notes, { id: makeId("note"), text, createdAt: new Date().toISOString() }],
  };
  saveState("Note saved with the current time.");
}

function exportBackup() {
  const payload = JSON.stringify(exportPayload(state), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `plan-archive-backup-${todayInput()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup exported.");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const imported = normalizeState(JSON.parse(await file.text()));
    if (!window.confirm(`Import ${imported.projects.length} projects, ${imported.tasks.length} tasks, and ${imported.notes.length} notes? This replaces the data in this browser.`)) return;
    state = imported;
    ui.selectedProjectId = null;
    dataDialog.close();
    saveState("Backup imported successfully.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not import this file.");
  } finally {
    document.querySelector("#import-input").value = "";
  }
}

function shiftCalendar(direction) {
  const date = new Date(ui.calendarCursor);
  if (ui.calendarMode === "week") date.setDate(date.getDate() + direction * 7);
  else date.setMonth(date.getMonth() + direction);
  ui.calendarCursor = date;
  render();
}

document.querySelector("#nav-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  ui.view = button.dataset.view;
  ui.search = "";
  searchInput.value = "";
  document.body.classList.remove("menu-open");
  render();
});

document.querySelector("#add-task-button").addEventListener("click", () => openTaskDialog());
document.querySelector("#mobile-add-button").addEventListener("click", () => openTaskDialog());
document.querySelector("#mobile-menu-button").addEventListener("click", () => document.body.classList.add("menu-open"));
document.querySelector("#mobile-overlay").addEventListener("click", () => document.body.classList.remove("menu-open"));
document.querySelector("#open-data-button").addEventListener("click", () => dataDialog.showModal());
document.querySelector("#export-button").addEventListener("click", exportBackup);
document.querySelector("#import-input").addEventListener("change", (event) => importBackup(event.target.files?.[0]));
document.querySelector("#add-subtask-button").addEventListener("click", () => addSubtaskRow());
document.querySelector("#repeat-type").addEventListener("change", updateRepeatFields);
document.querySelector("#repeat-unit").addEventListener("change", updateRepeatFields);
document.querySelector("#delete-project-button").addEventListener("click", deleteProject);
taskForm.addEventListener("submit", submitTask);
projectForm.addEventListener("submit", submitProject);

searchInput.addEventListener("input", (event) => {
  ui.search = event.target.value.trim().toLowerCase();
  render();
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    document.querySelector(`#${closeButton.dataset.closeDialog}`)?.close();
    return;
  }
  const removeSubtask = event.target.closest("[data-remove-subtask]");
  if (removeSubtask) {
    const row = removeSubtask.closest(".subtask-input-row");
    if (document.querySelectorAll("#subtask-editor .subtask-input-row").length === 1) {
      row.querySelector('input[type="text"]').value = "";
      row.querySelector('input[type="checkbox"]').checked = false;
    } else {
      row.remove();
    }
  }
});

content.addEventListener("submit", (event) => {
  if (event.target.matches("#note-form")) {
    event.preventDefault();
    saveNote(event.target);
  }
});

content.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const { action, id } = actionTarget.dataset;
  if (action === "add-task") openTaskDialog();
  if (action === "edit-task") openTaskDialog(id);
  if (action === "complete-task") completeTask(id);
  if (action === "restore-task") restoreTask(id);
  if (action === "delete-task") deleteTask(id);
  if (action === "filter-tasks") {
    ui.taskFilter = actionTarget.dataset.filter;
    render();
  }
  if (action === "add-project") openProjectDialog();
  if (action === "edit-project") {
    event.stopPropagation();
    openProjectDialog(id);
  }
  if (action === "select-project") {
    ui.selectedProjectId = id;
    render();
    window.setTimeout(() => document.querySelector(".project-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }
  if (action === "project-add-task") openTaskDialog(null, [id]);
  if (action === "delete-note") {
    const note = state.notes.find((item) => item.id === id);
    if (note && window.confirm("Delete this note permanently?")) {
      state = { ...state, notes: state.notes.filter((item) => item.id !== id) };
      saveState("Note deleted.");
    }
  }
  if (action === "calendar-prev") shiftCalendar(-1);
  if (action === "calendar-next") shiftCalendar(1);
  if (action === "calendar-today") {
    ui.calendarCursor = new Date();
    render();
  }
  if (action === "calendar-mode") {
    ui.calendarMode = actionTarget.dataset.mode;
    render();
  }
});

[taskDialog, projectDialog, dataDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

const now = new Date();
document.querySelector("#today-chip").innerHTML = `${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(now).toUpperCase()}<strong>${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(now)}</strong>`;
renderIcons();
render();
