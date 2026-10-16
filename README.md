# Plan Archive

A private, browser-local planner for projects, deadlines, time blocks, and quick journal notes. The interface is responsive for computer and phone screens, and data stays in the current browser unless it is exported as JSON.

## Run locally

```bash
cd /Users/jingxuanfeng/Desktop/Plan_app
npm run dev
```

Open <http://127.0.0.1:4173>. Keep using this same address so the browser uses the same saved data.

## Use the workspace

- **All tasks** combines a daily timeline and one list of projects and standalone to-dos. Type labels distinguish the entries; expand a project to see its tasks. Shared tasks appear under each linked project, but remain one saved task.
- The timeline opens with today as the first visible date. Scroll horizontally in either direction to keep browsing dates, or use the arrows to move one week. **Today** returns today to the left edge. Days are recycled offscreen to keep scrolling lightweight.
- Click a project or task to highlight its dates. A task linked to several projects appears in each relevant timeline row; selecting a dated task outside the current period reveals it.
- **Filter** sits on the list and combines project selection, overdue / next-seven-days / no-deadline options, and inclusive deadline date ranges. Filters and search affect only this list, never the timeline or its date window. Matching project groups open automatically.
- Tasks sort by deadline, with undated tasks last. A project is ordered by its earliest active task or project deadline. Old importance flags no longer affect the interface or sorting.
- An overdue notice appears above the timeline only while there is overdue work.
- Quick notes, calendar, archive, and JSON backups remain available from the navigation.

The small, flat SVG halo is a Hina-inspired fan drawing based on the crown, diagonal stripes, side diamonds, and lower rings in [her official anime character art](https://sh-anime.shochiku.co.jp/bluearchive-anime/character/sorasaki-hina/). No character artwork is bundled with the app.

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
