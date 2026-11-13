"use strict";
/* Spine Hunter - the More tab: importing, tidy-up tools, backup and restore */

const GUIDES = {
  goodreads: {
    title: "Import from Goodreads",
    links: [["Open Goodreads export page", "https://www.goodreads.com/review/import"]],
    steps: [
      ["Get your Goodreads export (about 2 minutes)", [
        "Do this on a computer in a web browser. The Goodreads phone app can't export.",
        "Open the Goodreads export page (button below) and sign in if asked. Or go to goodreads.com → My Books → Import and export (under Tools on the left).",
        "Click Export Library near the top of the page.",
        "Wait while Goodreads prepares the file. A big library can take a few minutes, so refresh if nothing appears.",
        "A link appears under the button, e.g. 'Your export from 01/11/2026'. Click it.",
        "The file downloads as goodreads_library_export.csv."]],
      ["Import it into Spine Hunter", [
        "Click Choose file below and pick goodreads_library_export.csv.",
        "Check the preview. Books already in your journal are marked, and they're never added twice. Books with no finish date are flagged. Untick anything you don't want.",
        "Leave 'Look up covers and missing details online' ticked, then import. Titles and author names are matched to Open Library, Google Books and Apple Books so they're consistent."]],
      ["Good to know", [
        "What comes across: title, author, ISBN, pages, publisher, your rating, shelf (read / currently-reading / to-read), date read, your review and private notes (added to notes), and genre shelves such as 'fantasy'.",
        "Books marked read without a date import with no finish date and won't show in monthly stats until you add one. Or tick 'Use the date added when there's no date read'.",
        "You can import a newer export any time: nothing is added twice."]],
    ],
  },
  fable: {
    title: "Import from Fable",
    links: [["Open Fable", "https://fable.co"], ["Find the exporter in the Chrome Web Store", "https://chromewebstore.google.com/search/fable%20export"]],
    steps: [
      ["Get your Fable export (about 5 minutes)", [
        "Fable has no official export button. This uses a free third-party Chrome extension that reads your library while you're signed in and saves it in Goodreads format. It isn't made by Fable and it uses your Fable sign-in, so only go ahead if you're comfortable with that. You need Chrome on a computer.",
        "In Chrome, open Fable (button below) and sign in.",
        "Open the Chrome Web Store search (button below), pick an exporter such as 'ShelfBridge' or 'Fable Exporter Extension', read its description and reviews, then click Add to Chrome → Add extension.",
        "Click the puzzle-piece icon at the top right of Chrome, then the exporter's name.",
        "Export your whole library (all lists). A CSV downloads, possibly called goodreads_import.csv, which is expected.",
        "Recommended: open it in Excel and spot-check a few finish dates against Fable.",
        "Optional: remove the extension afterwards (right-click its icon → Remove from Chrome)."]],
      ["Import it into Spine Hunter", [
        "Click Choose file below and pick the CSV.",
        "Check the preview, untick anything you don't want, and import.",
        "Used both Goodreads and Fable? Import both files. Books in both are spotted (by ISBN, or title + author) and added once."]],
    ],
  },
  sheet: {
    title: "Import your past-books spreadsheet",
    links: [],
    steps: [
      ["Set up the spreadsheet", [
        "Use Excel (.xlsx) or save it as .csv.",
        "Put these headings in the first row:  Title | Author | Finished",
        "One book per row. For Finished, type the month as 2023-05 or May 2023. A full date like 14/05/2023 or just a year like 2023 also works. Leave it blank if you don't know.",
        "Optional extra columns: Rating (1-5), Notes, Started (start date), Genre (e.g. Fantasy, Romance)."]],
      ["Import it", [
        "Click Choose file below and pick your spreadsheet.",
        "Check the preview. Rows whose Finished value couldn't be understood are flagged so you can fix them.",
        "Leave 'Look up covers and missing details online' ticked and import. Books it can't match are still imported with your details.",
        "Added more rows later? Import the same spreadsheet again. Books already in your journal are recognised and not added twice."]],
    ],
  },
};

function renderMore() {
  const noCover = S.books.filter(b => !b.cover_url).length, noGenre = S.books.filter(b => !parseGenres(b.genres).length).length;
  $("#view").innerHTML = `<div class="more-grid">
    <div class="pad"><div class="card"><div class="label">Import books</div>
      <p class="small muted">Bring in your reading history. Books already in your journal are never added twice.</p>
      <div class="stack"><button class="btn blue wide" data-action="guide" data-v="goodreads">From Goodreads</button>
      <button class="btn blue wide" data-action="guide" data-v="fable">From Fable</button>
      <button class="btn blue wide" data-action="guide" data-v="sheet">From my own spreadsheet</button></div></div></div>
    <div class="pad"><div class="card"><div class="label">Tidy up</div>
      <p class="small muted">These look your books up on Open Library, Google Books and Apple Books (covers also check Amazon and Goodreads). Your ratings, dates, status and notes are never changed.</p>
      <div class="stack"><button class="btn ghost wide" data-action="tool" data-v="tidy">Tidy up titles and authors (all books)</button>
      <button class="btn ghost wide" data-action="tool" data-v="covers">Find missing covers ${noCover ? `(${noCover})` : ""}</button>
      <button class="btn ghost wide" data-action="tool" data-v="genres">Find genres for books without one ${noGenre ? `(${noGenre})` : ""}</button>
      <button class="btn ghost wide" data-action="tool" data-v="dupes">Find and merge duplicates</button></div></div></div>
    <div class="pad"><div class="card"><div class="label">Theme</div>
      <p class="small muted" style="margin-bottom:0">Pick a look. It follows you to every device you sign in on.</p>${themePicker()}</div></div>
    <div class="pad"><div class="card"><div class="label">Account</div>
      <p class="small" style="margin-bottom:4px">Signed in as <b>${esc(Cloud.user ? (Cloud.user.email || Cloud.user.displayName || "you") : "")}</b></p>
      <p class="small muted">Your journal is saved to your account and kept up to date on every device you sign in on. It works offline and catches up when you're back online.</p>
      <button class="btn ghost wide" data-action="signout">Sign out</button></div></div>
    <div class="pad"><div class="card"><div class="label">Backup</div>
      <p class="small muted">A backup file is a spare copy you keep yourself. Restore also brings in an old OneDrive sync file or a backup from the earlier version.</p>
      <div class="stack"><button class="btn ghost wide" data-action="backup">Save a backup file</button>
      <button class="btn ghost wide" data-action="restore">Restore from a backup or sync file</button></div></div></div>
    <div class="pad" style="margin-bottom:24px"><div class="card"><div class="label">About</div>
      <p class="small muted" style="margin-bottom:0;line-height:1.5"><b>Version ${APP_VERSION}</b> (test version) · ${S.books.length} books · ${Object.keys(S.trophies).length} of 100 trophies · <a href="privacy.html">Privacy</a><br>
      Install it from your browser's menu (Install app / Add to home screen) for its own icon and window.</p></div></div></div>`;
}

function openGuide(key) {
  const g = GUIDES[key];
  openScreen(`<div class="screen-head"><button class="icon-btn" data-action="close-screen" aria-label="Close">✕</button><h2>${esc(g.title)}</h2></div>
    <div class="form">${g.steps.map(([h, items]) => `<div class="card"><div class="label">${esc(h)}</div><ol class="steps">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ol></div>`).join("")}
      <div class="stack">${g.links.map(([l, u]) => `<a class="btn blue wide" style="text-align:center;text-decoration:none" href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}
      <button class="btn wide" data-action="choose-import">Choose file…</button></div></div>`);
}

function chooseImport() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".csv,.xlsx,.xlsm,.xls,text/csv";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    let r;
    try { r = await readImportFile(f); } catch (e) { return notify("Couldn't read file", e.message); }
    if (!r.books.length) return notify("Nothing to import", "No books were found in that file.");
    openPreview(r.books, r.kind, f.name);
  };
  inp.click();
}

let P = null;  // the import preview
function openPreview(books, kind, filename) {
  previewFlags(books);
  books.forEach(b => { b._pick = true; });
  P = { books };
  const dupes = books.filter(b => b._dupe).length;
  const hasAdded = books.some(b => b._dateAdded && !b.end_date && b.status === "Finished");
  openScreen(`<div class="screen-head"><button class="icon-btn" data-action="close-screen" aria-label="Close">✕</button><h2>Check before importing</h2></div>
    <div class="form"><div class="small muted">Found ${books.length} books in ${esc(kind)} (${esc(filename)}). Tap a book to tick or untick it.${dupes ? `<br>${dupes} are already in your journal or repeated in the file. They won't be added twice; if ticked, they only fill in details your journal is missing.` : ""}</div>
      <div class="row" style="flex-wrap:wrap"><button class="chip" data-action="pv-all" data-v="1">Tick all</button><button class="chip" data-action="pv-all" data-v="0">Untick all</button><span id="pv-count" class="small muted"></span></div>
      <div id="pv-list" class="pv-list">${books.map((b, i) => `<button class="pv-row" data-action="pv-toggle" data-i="${i}"><span class="tick">☑</span>
        <span class="pv-main"><b>${esc(b.title)}</b><span class="small muted">${esc([b.authors, b.status, prettyDate(b.end_date), stars(b.rating)].filter(Boolean).join(" · "))}</span>
        ${b._flag ? `<span class="small flag">${esc(b._flag)}</span>` : ""}</span></button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="pv-lookup" checked> Look up covers and missing details online (a second or two per book)</label>
      ${hasAdded ? `<label class="check"><input type="checkbox" id="pv-added"> Use the date added when there's no date read (Goodreads/Fable often leaves this blank)</label>` : ""}
      <button class="btn wide" id="pv-go" data-action="pv-import">Import</button></div>`);
  previewCount();
}
function previewCount() {
  const n = P.books.filter(b => b._pick).length;
  $("#pv-count").textContent = `${n} of ${P.books.length} selected`;
  $("#pv-go").textContent = `Import ${n} book${n === 1 ? "" : "s"}`;
  $("#pv-go").disabled = !n;
  document.querySelectorAll(".pv-row").forEach(r => { const on = P.books[+r.dataset.i]._pick; r.classList.toggle("off", !on); r.querySelector(".tick").textContent = on ? "☑" : "☐"; });
}
function startImport() {
  const lookup = $("#pv-lookup").checked, useAdded = $("#pv-added") && $("#pv-added").checked;
  const chosen = P.books.filter(b => b._pick).map(b => {
    const c = Object.assign({}, b);
    if (useAdded && !c.end_date && c.status === "Finished") c.end_date = c._dateAdded || "";
    return c;
  });
  closeScreen();
  runJob("Importing", "Import complete", importJob(chosen, lookup));
}

/* ---------------- progress window for long jobs ---------------- */
async function runJob(title, doneTitle, job) {
  if (!job.items.length) { await notify(doneTitle, "There's nothing to do: every book is already sorted."); return; }
  let stop = false;
  $("#dialog").innerHTML = `<h3>${esc(title)}…</h3><p class="small muted" id="job-msg">Starting…</p>
    <div style="height:12px;background:var(--bg);border-radius:6px;overflow:hidden;margin-bottom:14px"><div id="job-bar" style="height:100%;width:0;background:var(--purple-d);transition:width .2s"></div></div>
    <div class="actions"><button class="btn ghost" id="job-stop">Stop</button></div>`;
  $("#dialog-wrap").classList.remove("hidden");
  $("#job-stop").onclick = () => { stop = true; $("#job-msg").textContent = "Stopping after the current book…"; };
  job.setup();
  const n = job.items.length;
  let done = 0, err = null;
  try {
    for (const it of job.items) {
      if (stop) break;
      $("#job-msg").textContent = `${done + 1} of ${n}: ${(it.title || "").slice(0, 60)}`;
      await job.step(it);
      done++;
      $("#job-bar").style.width = (done / n * 100) + "%";
    }
    $("#job-msg").textContent = "Finishing up…";
    await job.finish();
  } catch (e) { err = e; }
  $("#dialog-wrap").classList.add("hidden");
  render();
  if (err) await notify("Stopped", `Processed ${done} books before an error:\n${err.message}`);
  else await notify(doneTitle, (stop ? "Stopped early at your request.\n\n" : "") + job.summary());
  checkTrophies();
}

async function runTool(v) {
  if (v === "tidy") {
    if (!S.books.length) return;
    const mins = Math.ceil(S.books.length * 2 / 60);
    if (await ask("Tidy up titles and authors", `This looks up all ${S.books.length} books and:\n• uses the official spelling and capitals for titles and author names\n• fills in missing details and covers\n• merges duplicate entries, so each book is counted once\n\nRatings, dates, status and notes aren't changed. If you've read a book twice, its entries are combined into one.\n\nIt takes about ${mins} minute${mins > 1 ? "s" : ""}. Keep this page open.`))
      runJob("Tidying up", "Tidy-up complete", tidyJob());
  } else if (v === "covers") {
    const job = coverJob();
    if (!job.items.length) return notify("Find missing covers", "Every book already has a cover.");
    if (await ask("Find missing covers", `${job.items.length} books don't have a cover yet. Spine Hunter will search Open Library, Apple Books and Google Books for each one.`)) runJob("Finding covers", "Covers", job);
  } else if (v === "genres") {
    const job = genreJob();
    if (!job.items.length) return notify("Find genres", "Every book already has a genre.");
    if (await ask("Find genres", `${job.items.length} books don't have a genre yet. Spine Hunter will look each one up and pick genres from what the book databases say. Books that already have genres aren't changed.`)) runJob("Finding genres", "Genres", job);
  } else if (v === "dupes") {
    const groups = duplicateGroups();
    if (!groups.length) return notify("No duplicates", "No duplicate books found. Each book is counted once.");
    const list = groups.slice(0, 12).map(g => `• ${g[0].title} (${g.length} entries)`).join("\n") + (groups.length > 12 ? `\n…and ${groups.length - 12} more` : "");
    if (await ask("Merge duplicates", `Found ${groups.length} books with more than one entry:\n\n${list}\n\nThe most complete entry is kept, and any extra details (dates, rating, notes) from the others are added to it.`, "Merge")) {
      const n = await mergeGroups(groups); render(); notify("Duplicates merged", `Removed ${n} duplicate entr${n === 1 ? "y" : "ies"}.`);
    }
  }
}

async function restoreFile() {
  let f;
  try { f = await pickFileText(); } catch (e) { return; }
  let st;
  try { st = JSON.parse(f.text); if (st.app !== "Spine Hunter") throw new Error(); }
  catch (e) { return notify("That's not a Spine Hunter file", "Pick a backup (spine-hunter-backup-….json) or a sync file (spine-hunter-sync.json)."); }
  if (!(await ask("Restore", `${f.name} has ${(st.books || []).length} books. They'll be merged into your journal: newer edits win, and nothing is added twice.`, "Restore"))) return;
  const counts = await applyMerged(mergeStates([exportState(), st]));
  render();
  await notify("Restored", `${counts.added} books added, ${counts.updated} updated. Your journal has ${S.books.length} books.`);
  checkTrophies();
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]"); if (!el) return;
  const v = el.dataset.v;
  switch (el.dataset.action) {
    case "guide": openGuide(v); break;
    case "close-screen": closeScreen(); break;
    case "choose-import": chooseImport(); break;
    case "pv-toggle": { const b = P.books[+el.dataset.i]; b._pick = !b._pick; previewCount(); break; }
    case "pv-all": P.books.forEach(b => { b._pick = v === "1"; }); previewCount(); break;
    case "pv-import": startImport(); break;
    case "tool": runTool(v); break;
    case "restore": restoreFile(); break;
  }
});
