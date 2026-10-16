# Plan Archive

A private, browser-local planner for projects, deadlines, time blocks, and quick journal notes. The interface is responsive for computer and phone screens, and data stays in the current browser unless it is exported as JSON.

## Run locally

```bash
cd /Users/jingxuanfeng/Desktop/Plan_app
npm run dev
```

Open <http://localhost:4173>.

## Verify

```bash
npm test
npm run check
```

## Data and backups

- Tasks, projects, and notes are stored in browser `localStorage`.
- Use **Data & backup** in the app to export or import JSON.
- `task-template.json` is an example import file.
- Clearing browser storage deletes local data unless it has been exported.

Git synchronizes the app source code. It does not synchronize personal task data between browsers or devices.
