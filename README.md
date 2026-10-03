# Video Summaries

**Write the descriptions for a whole spreadsheet of YouTube videos in one go.**

You give the app your list of videos and tell it how each summary should look. vidIQ watches every video and writes a summary in exactly that format, and the app puts each summary in the right row of your spreadsheet. When it is done, you download the finished file.

No more copying video links into vidIQ one at a time.

Available in English and Spanish.

---

## What you need

- **A Windows computer.** Nothing needs to be installed beforehand.
- **A vidIQ account with credits.** Each long video costs 25 vidIQ credits and each YouTube Short costs 10. The app always shows the cost before you start.
- **Your list of videos** as a CSV or Excel file (`.csv`, `.xlsx` or `.xls`), with one video per row and a column of YouTube links. Not sure about the format? The app has a sample file you can download and fill in.

## Getting started

1. **Get the app.** On the [GitHub page](https://github.com/m-abdullah-awais/youtube-video-analysis), click the green **Code** button, choose **Download ZIP**, and unzip the folder anywhere on your computer.
2. **Double-click `Start.bat`** inside the folder.
3. A window opens and shows each step as it happens: checking, downloading, installing, building and starting. **The first time takes a few minutes.** After that it starts in seconds.
4. Your browser opens the app at **http://localhost:4817**.

Keep the black window open while you use the app. To stop the app, close that window.

> Everything the app needs stays inside its own folder. It does not install anything on your computer, and it does not need administrator rights. If Node.js is missing or too old, the app downloads a private copy into its own folder.

## How to use it

The app guides you through four steps.

### 1. Connect vidIQ

Click **Get sign-in link**. You can copy the link or open it straight away. Open it in the browser where you are signed in to the vidIQ account you want to use, then approve access. The app notices on its own and shows your credit balance.

You only do this once. To use another account later, choose **Switch account**.

### 2. Upload your spreadsheet

Drag your file onto the page, or click to choose it. Your original file is never changed; the app works on a copy.

Earlier uploads are listed under **Your runs**, where you can open, rename or delete them.

### 3. Choose columns and template

- **Columns.** The app finds the column with the video links and the column for descriptions by itself. A preview of your sheet shows what it picked, and you can change it.
- **Template.** Pick a ready-made template or write your own. Start each section with its name and a colon, for example:

  ```
  Summary: 2-3 sentences on what the video covers.
  Key Points: 3-5 bullet points with the main takeaways.
  Topics: a comma-separated list of the main topics.
  ```

- **Language.** Choose whether summaries are written in the video's own language, in English or in Spanish.
- **Try it on one video first.** See a real summary before you spend credits on the whole sheet. If you keep the same settings, that summary is reused when you start, so you never pay for that video twice.
- **Before you start.** The app shows how many videos will be summarized, the estimated cost, and your balance.

### 4. Run and download

Click **Start summaries** and watch each row fill in. You can:

- **Pause and resume** at any time. Nothing is lost.
- **Read, edit or regenerate** any summary.
- **Retry** videos that failed. Each failure explains what went wrong and what to do.
- **Download** the spreadsheet at any time, even halfway through.

You can leave the tab. The tab title shows the progress, and your browser can notify you when the run finishes.

## Good to know

- **Existing descriptions are kept.** Rows that already have a description are skipped, unless you turn on **Replace descriptions that already have text**.
- **Repeated videos are summarized once.** If the same video appears in several rows, every row gets the same summary and you pay once.
- **Running out of credits is safe.** The run pauses, and you can continue after adding credits in vidIQ.
- **Closing the window is safe.** Start the app again and the run continues where it stopped, without paying again for videos already sent to vidIQ.
- **Ready to paste.** Summaries are written as plain text, ready for a YouTube description.
- **Your data stays on your computer.** Only the video links and your template are sent to vidIQ. The app only accepts connections from this computer.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| The black window shows an error and closes when you press a key | Read the last lines before closing it. Most often the internet connection dropped during the first setup; run `Start.bat` again. |
| The browser did not open | Open **http://localhost:4817** yourself while the black window is open. |
| "vidIQ needs you to sign in again" | Go to **Connect**, get a new sign-in link and approve access again. |
| "Out of vidIQ credits" | Add credits in vidIQ, then click **Resume**. |
| A video failed | Read the reason shown in its row. You can **Retry** it, or **Write it yourself**. |

## Developer

**Muhammad Abdullah Awais**
Full Stack Developer

- Website: [www.abdullahawais.com](https://www.abdullahawais.com)
- Email: [contact@abdullahawais.com](mailto:contact@abdullahawais.com)
- LinkedIn: [m-abdullah-awais-programmer](https://www.linkedin.com/in/m-abdullah-awais-programmer)
- GitHub: [m-abdullah-awais](https://github.com/m-abdullah-awais)
- YouTube: [@m_abdullah_awais](https://www.youtube.com/@m_abdullah_awais)
- Instagram: [m_abdullah_awais](https://www.instagram.com/m_abdullah_awais)

---

## Technical details

This section is for developers working on the app.

### How it works

```
Browser (Next.js, React)  ->  API routes (src/app/api)  ->  job service and runner (src/lib/jobs)
                                                               |            |
                                                     SQLite (data/app.db)   vidIQ MCP (mcp.vidiq.com)
```

- **vidIQ connection:** OAuth 2.0 with PKCE and dynamic client registration through the Model Context Protocol SDK. Tokens are stored in the local SQLite database and refreshed automatically.
- **Summaries:** each video goes to `vidiq_video_watch` (or `vidiq_watch_shortform_content` for Shorts) with the template as the prompt. The job is then polled with `vidiq_job_poll`, and the result is converted to plain text and saved right away.
- **Reliability:** two videos are processed at a time. Network errors and temporary vidIQ outages are retried automatically, a pause takes effect immediately, and interrupted runs resume without sending videos again.
- **Spreadsheets:** CSV files are written back byte for byte, keeping delimiter, quoting, line endings and BOM. Excel files keep their other sheets, numbers, formulas and links. Only the description cells change.
- **Security:** the server listens on `localhost` only and refuses API requests that come from other websites or other host names.

### Project structure

```
src/app/              pages and API routes
src/components/app/   the four steps, the run table and shared pieces
src/components/ui/    shadcn/ui components
src/lib/sheet/        CSV and Excel reading, writing and column detection
src/lib/template/     prompt building, section checks, plain-text cleanup
src/lib/vidiq/        vidIQ MCP client, sign-in storage, response parsing
src/lib/jobs/         job storage, the runner and the job service
src/lib/i18n/         English and Spanish text
scripts/start.mjs     launcher used by Start.bat
data/                 local database and uploads (created on first run, not committed)
```

### Commands

Requires Node.js 22.13 or later (Node.js 24 recommended).

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies into this folder |
| `npm run dev` | Development server at http://localhost:4817 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run app` | Same as `Start.bat`: install if needed, build if changed, start, open the browser |
| `npm run lint` | Lint the code |
| `npm run test` | Run the test suite |

### Tech stack

Next.js 16 and React 19 with TypeScript, Tailwind CSS 4 and shadcn/ui, SheetJS, the Model Context Protocol TypeScript SDK, the SQLite module built into Node.js, and Vitest.
