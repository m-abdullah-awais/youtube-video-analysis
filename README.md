# Video Summaries

A local web app that fills the Description column of a YouTube video spreadsheet with AI summaries from the vidIQ MCP. You write one summary template, and every video gets a summary in exactly that structure, placed in the correct row of your file.

No more pasting video links into vidIQ one at a time: upload the sheet, check the columns, start the run, and download the finished spreadsheet.

## Features

- **CSV and Excel support.** Reads `.csv`, `.xlsx` and `.xls`. CSV files keep their delimiter, quoting, line endings and BOM byte for byte. Excel files keep other sheets, columns, numbers, formulas and links.
- **Automatic column detection.** Finds the video link column (URLs, Shorts links, `youtu.be` links, bare IDs and hyperlinked cells) and the Description column. You can change either from a dropdown with a live spreadsheet preview.
- **Custom summary template.** Presets or your own structure, for example `Summary`, `Key Points` and `Topics`. Each summary is checked for the sections you asked for, and anything missing is flagged.
- **Plain text output.** vidIQ answers in Markdown; the app turns it into clean text that reads well in a YouTube description.
- **Credit-aware.** Shows your vidIQ balance and the estimated cost before you start (25 credits per long video, 10 per Short). It pauses cleanly if credits run out.
- **Reliable batches.** Two videos are processed at a time. Each row has its own status, and a failed video never stops the batch. Network errors are retried automatically, and you can retry all failed rows or a single row.
- **No duplicate work.** Rows that already have a description are skipped unless you choose to replace them. A video that appears twice is summarized once.
- **Survives restarts.** Progress is saved after every video. If the app stops mid-run, it picks up where it left off without paying again for videos already sent to vidIQ.
- **Your original file is never changed.** The app keeps a copy and writes summaries into a new download.

## Quick start (Windows)

Double-click **`Start.bat`**. It will:

1. Use the Node.js on your computer if it is version 22.13 or later. Otherwise it downloads a private copy of Node.js into this folder (`.runtime/`) and checks its integrity. Nothing is installed globally, and no admin rights are needed.
2. Install the app's dependencies into this folder (first run only).
3. Build an optimized version of the app (first run, and after code changes).
4. Start the app at http://localhost:3000 and open it in your browser.

Every step is labeled in the window, including what is being downloaded or installed. Keep the window open while you use the app; close it to stop the app.

## Using the app

1. **Connect.** Select **Get sign-in link**, then **Copy link** or **Open in browser**. Open the link in the browser where you are signed in to the vidIQ account you want to use, and approve access. The app updates on its own. Use **Switch account** to change accounts later.
2. **Upload.** Drop a CSV or Excel file with one video per row (up to 20 MB and 5,000 rows).
3. **Configure.** Check the video and Description columns, pick or write a template, and review the estimated credit cost.
4. **Run.** Watch each row fill in. Pause, resume or retry failed rows at any time, and use **Download spreadsheet** to get the finished file.

## How it works

```
Browser UI (Next.js, React)
   |
   |  REST API routes (src/app/api)
   v
Job service + runner (src/lib/jobs)  <-->  SQLite (data/app.db)
   |                                         original uploads (data/jobs)
   |  MCP client with OAuth (src/lib/vidiq)
   v
vidIQ MCP (https://mcp.vidiq.com/mcp)
   vidiq_video_watch / vidiq_watch_shortform_content  -> async job
   vidiq_job_poll                                     -> summary text
   vidiq_balance                                      -> credits
```

- Sign-in uses OAuth 2.0 with PKCE and dynamic client registration. Tokens are stored in the local SQLite database and refreshed automatically.
- The runner submits each video to vidIQ with your template as the prompt, polls the job until it finishes, converts the result to plain text and saves it immediately.
- The download re-reads your original file and writes only the Description cells.

## Project structure

```
src/
  app/                  pages and API routes
  components/app/       the four steps, the run ledger and shared pieces
  components/ui/        shadcn/ui components
  lib/sheet/            CSV and Excel reading, writing and column detection
  lib/youtube/          video link and ID parsing
  lib/template/         prompt building, section checks, Markdown to text
  lib/vidiq/            vidIQ MCP client, OAuth storage, response parsing
  lib/jobs/             job storage, the runner and the job service
scripts/start.mjs       production launcher used by Start.bat
data/                   local database and uploads (created on first run, not committed)
```

## Development

Requirements: Node.js 22.13 or later (Node.js 24 recommended).

```bash
npm install
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run app` | Same as `Start.bat`: install if needed, build if changed, start, open the browser |
| `npm run lint` | Lint the code |
| `npm run test` | Run the test suite (Vitest) |

## Tech stack

- Next.js 16 (App Router) and React 19 with TypeScript
- Tailwind CSS 4 and shadcn/ui (Base UI)
- SheetJS for Excel files, a built-in CSV reader and writer for exact CSV round trips
- Model Context Protocol TypeScript SDK for the vidIQ MCP connection
- Node.js built-in SQLite for local storage
- Vitest for tests

## Privacy and security

- The app runs only on your computer and listens on `localhost` only.
- Your spreadsheets, summaries and vidIQ sign-in stay in the local `data/` folder.
- Video links and your template are sent to vidIQ to generate summaries. Nothing else leaves your computer.

## Developer

**Muhammad Abdullah Awais**
Full Stack Developer

- Website: [www.abdullahawais.com](https://www.abdullahawais.com)
- Email: [contact@abdullahawais.com](mailto:contact@abdullahawais.com)
- LinkedIn: [m-abdullah-awais-programmer](https://www.linkedin.com/in/m-abdullah-awais-programmer)
- GitHub: [m-abdullah-awais](https://github.com/m-abdullah-awais)
- YouTube: [@m_abdullah_awais](https://www.youtube.com/@m_abdullah_awais)
- Instagram: [m_abdullah_awais](https://www.instagram.com/m_abdullah_awais)
