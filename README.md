# Plan Archive

A private, browser-local planner for projects, deadlines, time blocks, and quick journal notes. The interface is responsive for computer and phone screens, and data stays in the current browser unless it is exported as JSON.

## Run locally

```bash
cd /Users/jingxuanfeng/Desktop/Plan_app
npm run dev
```

Open <http://127.0.0.1:4173>. Keep using this same address so the browser uses the same saved data.

## Use the workspace

- **All tasks** combines a four-week timeline, a project directory, and the to-do list.
- Click a project or task to highlight its dates. A task linked to several projects appears in each relevant timeline row. Use the arrows to browse other weeks; selecting a dated task outside the current period reveals it.
- **Filter** combines project selection, overdue / next-seven-days / no-deadline options, and inclusive deadline date ranges. Clearing filters returns to all tasks.
- Tasks sort by deadline, with undated tasks last. Old importance flags no longer affect the interface or sorting.
- An overdue notice appears above the timeline only while there is overdue work.
- Quick notes, calendar, archive, and JSON backups remain available from the navigation.

## Verify

```bash
npm test
npm run check
```

With the local server running and Google Chrome installed on macOS, run `npm run test:browser` to check the main flows in a disposable browser profile.

## Data and backups

- Tasks, projects, and notes are stored in browser `localStorage`.
- Use **Data & backup** in the app to export or import JSON.
- `task-template.json` is an example import file.
- Clearing browser storage deletes local data unless it has been exported.

Git synchronizes the app source code. It does not synchronize personal task data between browsers or devices.
