"use strict";
/* Spine Hunter (phone) - screens */

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PASTELS = ["var(--blue)", "var(--pink)", "var(--purple)"];
const SPINE_COLORS = SHARED.SPINE_COLORS;
const UI = { trophyView: "bookcase", tab: "books", q: "", status: "All", genre: "", sort: "Default", order: [], period: "This year", selTrophy: null };
const wide = () => window.innerWidth >= 960;

/* ---------- themes ---------- */
const THEMES = [
  ["candy", "Cotton Candy", ["#F6F3FB", "#DCCFF3", "#D5E7F8", "#FADDE8"]],
  ["mint", "Mint Tea", ["#F1F7F3", "#CDEBD9", "#D9EEF0", "#FDE2D4"]],
  ["ocean", "Ocean", ["#EFF5FA", "#C9E0F5", "#CDEEF0", "#FCE3E0"]],
  ["sunset", "Peach Sunset", ["#FDF4EE", "#FBD9C4", "#FCE9C2", "#F9D3DA"]],
  ["library", "Cosy Library", ["#F5EFE4", "#E8D6BD", "#B98A5E", "#5B4130"]],
  ["midnight", "Midnight", ["#1E1B2C", "#4A3F78", "#2D4766", "#5C3550"]],
];
function applyTheme(key) {
  if (!THEMES.some(t => t[0] === key)) key = "candy";
  if (key === "candy") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = key;
  try { localStorage.setItem("sh-theme", key); } catch (e) { /* private window */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#F6F3FB";
}
function setTheme(key) { applyTheme(key); S.settings.theme = key; saveMeta(); render(); }
function themePicker() {
  const cur = S.settings.theme || (document.documentElement.dataset.theme || "candy");
  return `<div class="themes">${THEMES.map(([k, name, sw]) => `<button class="theme-opt ${k === cur ? "on" : ""}" data-action="theme" data-v="${k}">
    <span class="sw">${sw.map(c => `<i style="background:${c}"></i>`).join("")}</span>${esc(name)}</button>`).join("")}</div>`;
}

/* ---------- small building blocks ---------- */
function stars(n) { n = +n || 0; return n ? "★".repeat(n) + "☆".repeat(5 - n) : ""; }
function coverHtml(b, size = "s") {
  const letter = esc((searchTitle(b.title)[0] || "?").toUpperCase());
  const bg = PASTELS[[...(b.title || "x")].reduce((t, c) => t + c.charCodeAt(0), 0) % 3];
  let src = "";
  if (b.cover_url === "own:" && b.own_cover) src = "data:image/jpeg;base64," + b.own_cover;
  else if (/^https?:/.test(b.cover_url || "")) src = b.cover_url;
  const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<div class="cover ${size}" style="background:${bg}">${letter && !src ? letter : ""}${img}</div>`;
}
function creaturesHtml(genres, size = 32) {
  return genreBadges(genres).map(([k]) => creatureImg(k, size)).join("");
}
function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}
function dialog({ title, text = "", html = "", buttons = [["OK", true, "btn"]] }) {
  return new Promise(resolve => {
    $("#dialog").innerHTML = `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${html}
      <div class="actions">${buttons.map(([l, v, cls], i) => `<button class="${cls || "btn"}" data-i="${i}">${esc(l)}</button>`).join("")}</div>`;
    $("#dialog-wrap").classList.remove("hidden");
    $("#dialog").querySelectorAll(".actions button").forEach(b => b.onclick = () => {
      const v = buttons[+b.dataset.i][1];
      const input = $("#dialog").querySelector("input");
      $("#dialog-wrap").classList.add("hidden");
      resolve(v === "input" ? (input ? input.value : "") : v);
    });
  });
}
const notify = (title, text) => dialog({ title, text });
const ask = (title, text, yes = "Continue") => dialog({ title, text, buttons: [["Cancel", false, "btn ghost"], [yes, true, "btn"]] });
function openSheet(html) { $("#sheet").innerHTML = `<div class="grab"></div>` + html; $("#sheet-wrap").classList.remove("hidden"); $("#sheet").scrollTop = 0; }
function closeSheet() { $("#sheet-wrap").classList.add("hidden"); if (UI.selTrophy) { UI.selTrophy = null; if (UI.tab === "trophies") render(); } }
function openScreen(html) { $("#screen").innerHTML = html; $("#screen").classList.remove("hidden"); $("#screen").scrollTop = 0; }
function closeScreen() { $("#screen").classList.add("hidden"); $("#screen").innerHTML = ""; stopScanner(); }

/* ---------- list order (Reading, then finished newest first, then to read) ---------- */
const SORTS = ["Default", "Title", "Author", "Finished (newest)", "Finished (oldest)", "Rating", "Recently added"];
function sortedBooks() {
  const rank = { Reading: 0, Finished: 1, "Did not finish": 1, "To read": 2 };
  const byTitle = (a, b) => (searchTitle(a.title) || "").localeCompare(searchTitle(b.title) || "");
  const surname = b => { const a = firstAuthor(b.authors).split(" "); return (a[a.length - 1] || "").toLowerCase(); };
  const cmp = {
    "Default": (a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1) || dkey(b.end_date).localeCompare(dkey(a.end_date)) || byTitle(a, b),
    "Title": byTitle,
    "Author": (a, b) => surname(a).localeCompare(surname(b)) || byTitle(a, b),
    "Finished (newest)": (a, b) => dkey(b.end_date).localeCompare(dkey(a.end_date)) || byTitle(a, b),
    "Finished (oldest)": (a, b) => (!a.end_date) - (!b.end_date) || dkey(a.end_date).localeCompare(dkey(b.end_date)) || byTitle(a, b),
    "Rating": (a, b) => (+b.rating || 0) - (+a.rating || 0) || byTitle(a, b),
    "Recently added": (a, b) => (b.added_at || "").localeCompare(a.added_at || ""),
  }[UI.sort] || ((a, b) => 0);
  return S.books.slice().sort(cmp);
}
function visibleBooks() {
  const q = UI.q.trim().toLowerCase();
  return sortedBooks().filter(b => (UI.status === "All" || b.status === UI.status)
    && (!UI.genre || parseGenres(b.genres).includes(UI.genre))
    && (!q || (b.title || "").toLowerCase().includes(q) || (b.authors || "").toLowerCase().includes(q)));
}

/* ---------- main render ---------- */
function render() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === UI.tab));
  $("#fab").classList.toggle("hidden", UI.tab !== "books");
  const fin = S.books.filter(b => b.status === "Finished").length;
  const year = new Date().getFullYear(), goal = S.goals[year];
  let sub = `${S.books.length} books · ${fin} finished`;
  if (goal) sub += ` · ${year} goal ${S.books.filter(b => b.status === "Finished" && (b.end_date || "").startsWith(String(year))).length}/${goal.target}`;
  $("#subtitle").textContent = sub;
  ({ books: renderBooks, trophies: renderTrophies, stats: renderStats, more: renderMore })[UI.tab]();
}

function renderBooks() {
  const list = visibleBooks();
  UI.order = list.map(b => b.uid);
  const statusChips = ["All"].concat(STATUSES).map(s => `<button class="chip ${UI.status === s ? "on" : ""}" data-action="status" data-v="${esc(s)}">${esc(s)}</button>`).join("");
  const genreChips = [`<button class="chip ${!UI.genre ? "on" : ""}" data-action="gfilter" data-v="">All genres</button>`]
    .concat(GENRE_KEYS.map(k => `<button class="chip ${UI.genre === k ? "on" : ""}" data-action="gfilter" data-v="${k}"><img src="creatures/${k}.png" alt="" style="width:18px;height:18px;vertical-align:-4px"> ${esc(GENRES[k])}</button>`)).join("");
  let body;
  if (!S.books.length) {
    body = `<div class="empty"><img src="icons/icon-192.png" alt="" style="width:90px;border-radius:22px"><h3 style="margin:14px 0 6px">Your shelf is empty</h3>
      <p>Import your Goodreads, Fable or spreadsheet history from <b>More</b> (or restore a Spine Hunter backup), or tap <b>+</b> to add a book.</p>
      <div class="row" style="justify-content:center"><button class="btn blue" data-action="tab" data-v="more">Import books</button><button class="btn ghost" data-action="add">Add a book</button></div></div>`;
  } else if (!list.length) {
    body = `<div class="empty">No books match.</div>`;
  } else {
    body = `<ul class="book-list">${list.map(b => `<li class="book ${wide() && UI.detail === b.uid ? "sel" : ""}" data-action="detail" data-uid="${b.uid}">${coverHtml(b)}
      <div class="info"><div class="t">${esc(b.title)}</div><div class="a">${esc(b.authors)}</div>
      <div class="meta"><span class="creatures">${creaturesHtml(b.genres)}</span>${b.rating ? `<span class="stars">${stars(b.rating)}</span>` : ""}
      <span>${esc(b.status === "Finished" ? prettyDate(b.end_date) || "Finished" : b.status)}</span></div></div></li>`).join("")}</ul>`;
  }
  const controls = `<div class="searchbar row"><input class="input" id="q" placeholder="Search title or author" value="${esc(UI.q)}" type="search">
      <select class="input sort" id="sort" aria-label="Sort">${SORTS.map(o => `<option ${o === UI.sort ? "selected" : ""}>${o}</option>`).join("")}</select></div>
    <div class="scroll-x">${statusChips}</div><div class="scroll-x">${genreChips}</div>`;
  if (wide() && S.books.length) {
    $("#view").innerHTML = `<div class="split"><div class="split-list">${controls}${body}</div><aside class="pane" id="pane"></aside></div>`;
    if (!UI.detail || !list.some(b => b.uid === UI.detail)) UI.detail = list.length ? list[0].uid : null;
    if (UI.detail) openDetail(UI.detail);
    else $("#pane").innerHTML = `<div class="empty">Pick a book</div>`;
  } else $("#view").innerHTML = controls + body;
  $("#sort").onchange = e => { UI.sort = e.target.value; renderBooks(); };
  $("#q").oninput = e => { UI.q = e.target.value; const pos = e.target.selectionStart; renderBooks(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); };
}

/* ---------- book detail ---------- */
function openDetail(uid) {
  const b = bookByUid(uid); if (!b) return closeSheet();
  const i = UI.order.indexOf(uid);
  const d = daysBetween(b.start_date, b.end_date);
  const pub = b.publisher ? `Published by ${b.publisher}${b.year ? ", " + b.year : ""}` : b.year ? `Published ${b.year}` : "";
  const facts = [b.authors && "by " + b.authors, `${b.status} ${stars(b.rating)}`, b.start_date && "Started " + prettyDate(b.start_date),
    b.end_date && "Finished " + prettyDate(b.end_date), d !== null && `Took ${d} days`, pub, b.pages && b.pages + " pages"].filter(Boolean);
  const html = (`<div class="detail-top">${coverHtml(b, "m")}<div style="flex:1;min-width:0"><h2>${esc(b.title)}</h2>
      <div class="big-creatures">${creatureChips(b.genres) || '<span class="muted small">No genre yet</span>'}</div></div></div>
    <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
    <div class="notes">${esc(b.notes || "No notes yet.")}</div>
    <div class="row" style="margin-top:16px">
      <button class="icon-btn" data-action="detail-nav" data-step="-1" ${i <= 0 ? "disabled" : ""} aria-label="Previous">‹</button>
      <button class="btn blue" style="flex:1" data-action="edit" data-uid="${uid}">Edit</button>
      <button class="icon-btn" data-action="detail-nav" data-step="1" ${i < 0 || i >= UI.order.length - 1 ? "disabled" : ""} aria-label="Next">›</button>
    </div>`);
  UI.detail = uid;
  if (wide() && UI.tab === "books" && $("#pane")) {
    $("#pane").innerHTML = html;
    document.querySelectorAll(".book").forEach(li => li.classList.toggle("sel", li.dataset.uid === uid));
  } else openSheet(html);
}

/* ---------- add / edit ---------- */
let E = null;   // the book being edited
function openEdit(uid) {
  closeSheet();
  const orig = uid ? bookByUid(uid) : null;
  E = { uid, book: Object.assign(newBook(), orig ? JSON.parse(JSON.stringify(orig)) : {}), isNew: !orig, dirty: false };
  const b = E.book, i = UI.order.indexOf(uid);
  const field = (k, label, type = "text", ph = "") => `<div class="field"><label>${label}</label><input class="input" data-f="${k}" type="${type}" value="${esc(b[k] ?? "")}" placeholder="${esc(ph)}" ${type === "number" ? 'inputmode="numeric"' : ""}></div>`;
  const dateField = (k, label) => `<div class="field"><label>${label}</label><div class="row"><input class="input" data-f="${k}" value="${esc(b[k] || "")}" placeholder="YYYY-MM-DD, YYYY-MM or YYYY">
      <button class="chip" data-action="today" data-f="${k}">Today</button></div></div>`;
  openScreen(`<div class="screen-head"><button class="icon-btn" data-action="close-edit" aria-label="Close">✕</button>
      <h2>${E.isNew ? "Add a book" : "Edit book"}</h2>
      ${E.isNew ? "" : `<button class="icon-btn" data-action="edit-nav" data-step="-1" ${i <= 0 ? "disabled" : ""} aria-label="Previous">‹</button>
      <button class="icon-btn" data-action="edit-nav" data-step="1" ${i < 0 || i >= UI.order.length - 1 ? "disabled" : ""} aria-label="Next">›</button>`}
      <button class="btn" data-action="save">Save</button></div>
    <div class="form">
      <div class="quick"><div class="small" style="margin-bottom:8px">Quick find: scan the barcode, or type an ISBN or a title and author</div>
        <div class="row"><input class="input" id="quick" placeholder="ISBN, title or author" enterkeyhint="search">
        <button class="icon-btn" data-action="scan" aria-label="Scan barcode">📷</button><button class="btn" data-action="quick">Find</button></div>
        <div id="results" class="results" style="margin-top:10px"></div></div>
      <div class="cover-edit"><div id="cover-box">${coverHtml(b, "m")}</div><div class="btns">
        <button class="btn pink" data-action="find-cover">Find a cover</button>
        <button class="btn ghost" data-action="own-photo">Use my own photo</button></div></div>
      ${field("title", "Title *")}${field("authors", "Author(s)")}${field("isbn", "ISBN", "text")}
      <div class="field"><label>Genres</label><div class="genre-grid">${GENRE_KEYS.map(k => `<button class="gchip" data-action="genre" data-k="${k}"><img src="creatures/${k}.png" alt="">${esc(GENRES[k])}</button>`).join("")}</div>
        <div class="row" style="margin-top:10px;justify-content:space-between"><div class="row"><span class="small muted">Shows as:</span><span id="gprev" class="creatures"></span></div>
        <button class="chip" data-action="suggest-genres">Suggest genres</button></div></div>
      <div class="field"><label>Status</label><div class="row" style="flex-wrap:wrap">${STATUSES.map(s => `<button class="chip" data-action="set-status" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>
      <div class="field"><label>Rating</label><div class="rating" id="rating"></div></div>
      ${dateField("start_date", "Started")}${dateField("end_date", "Finished")}
      <div class="field"><label>Notes</label><textarea class="input" data-f="notes">${esc(b.notes || "")}</textarea></div>
      ${field("publisher", "Publisher")}${field("year", "Year published", "text")}${field("pages", "Pages", "number")}${field("subjects", "Subjects")}
      ${E.isNew ? "" : `<button class="btn ghost wide" data-action="delete" style="color:var(--pink-d)">Delete this book</button>`}
    </div>`);
  $("#screen").querySelectorAll("[data-f]").forEach(el => el.addEventListener("input", () => { E.dirty = true; }));
  $("#quick").addEventListener("keydown", e => { if (e.key === "Enter") quickFind(); });
  refreshEditBits();
}
function readForm() {
  const b = E.book;
  $("#screen").querySelectorAll("[data-f]").forEach(el => { b[el.dataset.f] = el.value.trim(); });
  b.pages = b.pages ? parseInt(b.pages, 10) || null : null;
}
function refreshEditBits() {
  const b = E.book, sel = parseGenres(b.genres);
  $("#screen").querySelectorAll(".gchip").forEach(c => c.classList.toggle("on", sel.includes(c.dataset.k)));
  $("#screen").querySelectorAll("[data-action=set-status]").forEach(c => c.classList.toggle("on", c.dataset.v === b.status));
  $("#rating").innerHTML = [1, 2, 3, 4, 5].map(n => `<button data-action="rate" data-n="${n}">${n <= (+b.rating || 0) ? "★" : "☆"}</button>`).join("");
  $("#gprev").innerHTML = creaturesHtml(b.genres, 40) || '<span class="small muted">pick one or more</span>';
  $("#cover-box").innerHTML = coverHtml(b, "m");
}
async function writeEdit() {
  readForm();
  const b = E.book;
  if (!b.title) { await notify("Missing title", "Please enter a title."); return false; }
  for (const [k, l] of [["start_date", "Started"], ["end_date", "Finished"]]) {
    if (b[k]) { const p = parseDate(b[k]); if (!p) { await notify("Date not understood", `Couldn't understand the ${l} date "${b[k]}".\nUse YYYY-MM-DD, YYYY-MM or YYYY.`); return false; } b[k] = p; }
  }
  b.title = tidyTitle(b.title);
  b.authors = splitAuthors(b.authors).map(tidyName).join(", ");
  b.isbn = cleanIsbn(b.isbn);
  const orig = E.isNew ? null : bookByUid(E.uid);
  const changed = SYNC_FIELDS.filter(f => !orig || JSON.stringify(orig[f] ?? "") !== JSON.stringify(b[f] ?? "") || (f === "cover_url" && orig.own_cover !== b.own_cover));
  if (orig) { Object.assign(orig, b); await saveBook(orig, changed); }
  else await saveBook(b, SYNC_FIELDS);
  E.dirty = false;
  return true;
}
async function saveAndClose() {
  if (!(await writeEdit())) return;
  const uid = E.book.uid;
  closeScreen(); render(); await checkTrophies();
  if (UI.tab === "books") openDetail(uid);
}
async function editNav(step) {
  const i = UI.order.indexOf(E.uid), j = i + step;
  if (j < 0 || j >= UI.order.length) return;
  if (E.dirty && !(await writeEdit())) return;
  render();
  openEdit(UI.order[j]);
}
function applyResult(r) {
  const b = E.book;
  readForm();
  ["isbn", "publisher", "year", "pages", "subjects"].forEach(k => { if (r[k]) b[k] = r[k]; });
  if (r.main_title) b.title = tidyTitle(r.main_title);
  if (r.authors) b.authors = r.authors;
  if (r.cover_url) { b.cover_url = r.cover_url; b.own_cover = null; }
  E.dirty = true;
  $("#screen").querySelectorAll("[data-f]").forEach(el => { el.value = b[el.dataset.f] ?? ""; });
  refreshEditBits();
}
async function quickFind(q) {
  q = (q || $("#quick").value).trim(); if (!q) return;
  const box = $("#results"); box.innerHTML = `<div class="small">Searching Open Library, Google Books and Apple Books…</div>`;
  let results = [];
  try { results = await findMetadata(looksLikeIsbn(q) ? { isbn: cleanIsbn(q) } : { query: q }); }
  catch (e) { box.innerHTML = `<div class="small">${esc(e.message)}</div>`; return; }
  if (!results.length) { box.innerHTML = `<div class="small">No matches. Try fewer words, just the title, or the ISBN.</div>`; return; }
  E.results = results;
  box.innerHTML = results.slice(0, 12).map((r, i) => `<button class="result" data-action="pick" data-i="${i}">${coverHtml({ title: r.title, cover_url: r.cover_url }, "xs")}
    <div><div class="t">${esc(r.title)}</div><div class="small muted">${esc([r.authors, r.year, r.pages && r.pages + " pages", r.found_in].filter(Boolean).join(" · "))}</div></div></button>`).join("");
}
async function pickResult(i) {
  const picked = E.results[i], r = Object.assign({}, picked);
  E.results.forEach(o => { if (o !== picked && sameBook(r, o)) ["isbn", "publisher", "year", "pages", "subjects"].forEach(k => { if (!r[k] && o[k]) r[k] = o[k]; }); });
  if (!r.cover_url) r.cover_url = E.results.find(o => o.cover_url && sameBook(r, o))?.cover_url || "";
  applyResult(r);
  $("#results").innerHTML = "";
  if (!parseGenres(E.book.genres).length) {
    let ev = await gatherEvidence(r, E.results, false);
    let g = suggestGenres(ev);
    if (!g || g === "literary") g = suggestGenres(ev + " | " + await genreEvidence(E.book)) || g;
    if (g) { E.book.genres = g; refreshEditBits(); }
  }
  toast("Details filled in. Check them, then Save.");
}
async function findCover() {
  readForm();
  const b = E.book;
  if (!b.title && !b.isbn) return notify("Find a cover", "Enter the title (or ISBN) first.");
  toast("Searching Open Library, Google Books, Apple Books, Amazon and Goodreads…", 15000);
  const choices = await findCoverChoices(b);
  $("#toast").classList.add("hidden");
  if (!choices.length) return notify("No cover found", "None of the book databases has a cover for this one. Check the title and author (or add the ISBN) and try again, or use your own photo.");
  let pick = choices[0];
  if (choices.length > 1) {
    pick = await dialog({ title: `${choices.length} covers found`, html: `<p class="small muted" style="margin-top:0">Tap the one that matches your copy.</p>
      <div class="cover-picks">${choices.map((u, i) => `<button class="${i ? "" : "on"}" data-action="cover-pick" data-u="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join("")}</div>
      <input type="hidden" value="${esc(choices[0])}">`, buttons: [["Cancel", false, "btn ghost"], ["Use this cover", "input", "btn"]] });
    if (!pick) return;
  }
  b.cover_url = pick; b.own_cover = null; E.dirty = true; refreshEditBits(); toast("Cover added.");
}
function ownPhoto() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 400 / img.width, 600 / img.height);
      const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      E.book.own_cover = c.toDataURL("image/jpeg", 0.82).split(",")[1];
      E.book.cover_url = "own:"; E.dirty = true; refreshEditBits(); URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  inp.click();
}

/* ---------- barcode scanner (Chrome on Android) ---------- */
let scanStream = null, scanTimer = null;
async function startScanner() {
  if (!("BarcodeDetector" in window)) return notify("Scanning isn't available", "This browser can't read barcodes. Type the ISBN instead (it's printed above the barcode).");
  const det = new BarcodeDetector({ formats: ["ean_13"] });
  const closed = dialog({ title: "Scan the barcode", html: `<div class="scanner"><video id="cam" playsinline muted></video></div><p class="small muted" style="margin-top:10px">Hold the barcode on the back of the book in the frame.</p>`,
    buttons: [["Close", false, "btn ghost"]] });
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch (e) { $("#dialog-wrap").classList.add("hidden"); return notify("Camera not available", "Spine Hunter needs camera permission to scan. You can type the ISBN instead."); }
  const v = $("#cam"); v.srcObject = scanStream; await v.play();
  scanTimer = setInterval(async () => {
    try {
      const codes = await det.detect(v);
      const hit = codes.map(c => c.rawValue).find(x => /^97[89]\d{10}$/.test(x));
      if (hit) { stopScanner(); $("#dialog-wrap").classList.add("hidden"); $("#quick").value = hit; quickFind(hit); }
    } catch (e) { /* keep trying */ }
  }, 350);
  closed.then(stopScanner);
}
function stopScanner() {
  clearInterval(scanTimer); scanTimer = null;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
}

/* ---------- trophies ---------- */
function spineColor(t) { return SPINE_COLORS[(TROPHY_META.indexOf(t) * 5) % SPINE_COLORS.length]; }
function textOn(c) { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? "#3F3850" : "#FFFFFF"; }
function classicHtml(t, locked) {
  if (locked) return `<div class="classic locked">?</div>`;
  const col = spineColor(t);
  return `<div class="classic" style="background:${col}"><div class="panel">${esc(t.title)}</div><div class="au" style="color:${textOn(col)}">${esc(t.author)}</div>
    <div class="gem" style="background:${TIERS[t.tier][1]}"></div></div>`;
}
function trophySwitch() {
  return `<div class="seg"><button class="${UI.trophyView !== "creatures" ? "on" : ""}" data-action="trophy-view" data-v="bookcase">📚 Bookcase</button><button class="${UI.trophyView === "creatures" ? "on" : ""}" data-action="trophy-view" data-v="creatures">🐾 Creatures</button></div>`;
}
function renderTrophies() {
  if (UI.trophyView === "creatures") {
    $("#view").innerHTML = `<div class="pad" style="margin-bottom:4px">${trophySwitch()}<h2 style="font-size:19px">Your creatures</h2></div>` + renderCreatures();
    return;
  }
  const n = Object.keys(S.trophies).length;
  const chips = Object.entries(TIERS).map(([k, [name, col]]) => {
    const tot = TROPHY_META.filter(t => t.tier === k).length, got = TROPHY_META.filter(t => t.tier === k && S.trophies[t.id]).length;
    return `<span class="tier" style="background:${col}">${name} ${got}/${tot}</span>`;
  }).join("");
  const per = Math.max(10, Math.floor((Math.min(window.innerWidth, 900) - 44) / 22));
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const sizes = TROPHY_META.map(() => [1 + rnd() * .45, 120 + Math.round(rnd() * 46)]);
  let shelves = "";
  for (let i = 0; i < TROPHY_META.length; i += per) {
    shelves += `<div class="shelf">${TROPHY_META.slice(i, i + per).map((t, j) => {
      const [w, h] = sizes[i + j], earned = !!S.trophies[t.id], col = spineColor(t), tier = TIERS[t.tier][1];
      const out = UI.selTrophy === t.id ? "out" : "";
      return earned
        ? `<div class="spine ${out}" data-action="trophy" data-id="${t.id}" title="${esc(t.title + " · " + t.author + "\n" + TIERS[t.tier][0] + ": " + t.name)}" style="flex-grow:${w};height:${h}px;background:${col};color:${textOn(col)}">
            <span class="band t" style="background:${tier}"></span><span class="txt">${esc(t.title)}</span><span class="band b" style="background:${tier}"></span></div>`
        : `<div class="spine locked ${out}" data-action="trophy" data-id="${t.id}" title="${esc(t.secret ? "Secret trophy" : "Locked · " + t.name + ": " + t.desc)}" style="flex-grow:${w};height:${h}px"><span class="band t" style="background:${tier};opacity:.45"></span>?</div>`;
    }).join("")}</div>`;
  }
  $("#view").innerHTML = `<div class="pad" style="margin-bottom:8px">${trophySwitch()}<h2 style="font-size:19px">Trophy bookcase</h2>
      <div class="muted small">${n} of ${TROPHY_META.length} earned · tap a spine to pull it out</div></div>
    <div class="summary-chips">${chips}</div><div class="case">${shelves}</div><div style="height:30px"></div>`;
}
function openTrophy(id) {
  const t = TROPHY_BY_ID[id], rec = S.trophies[id];
  UI.selTrophy = id; renderTrophies();
  const hidden = !rec && t.secret;
  const results = rec ? null : evaluateTrophies()[id];
  let extra = "";
  if (rec) {
    const books = (rec.book_uids || []).map(bookByUid).filter(Boolean);
    const earned = prettyDate(rec.when_text) || prettyDate(rec.earned_at);
    extra = `<div class="small muted" style="margin-top:6px">Earned ${esc(earned)}</div></div>
      <div class="label" style="margin:16px 0 6px">Books that earned it</div>
      ${books.length ? books.slice(0, 40).map(b => `<div class="row" style="margin-bottom:8px">${coverHtml(b, "xs")}<div><b>${esc(b.title)}</b>
        <div class="small muted">${esc([firstAuthor(b.authors), b.end_date && "finished " + prettyDate(b.end_date)].filter(Boolean).join(", "))}</div></div></div>`).join("")
        : `<div class="small muted">${id === "platinum" ? "Every other trophy on the shelf." : id === "goal_set" ? "Setting your yearly goal." : "Earned from your journal as a whole."}</div>`}
      ${S.books.some(b => normTitle(b.title) === normTitle(t.title)) ? `<div class="small muted" style="margin-top:12px">Already in your journal.</div>`
        : `<button class="btn wide" style="margin-top:14px" data-action="trophy-toread" data-id="${id}">Add to my To-read</button>`}`;
  } else if (!hidden && results && results.progress && results.progress[1] > 1) {
    const [cur, need] = results.progress;
    extra = `<div style="margin-top:10px;height:10px;background:var(--bg);border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.min(100, cur / need * 100)}%;background:var(--purple-d)"></div></div>
      <div class="small muted" style="margin-top:6px">${cur.toLocaleString()} of ${need.toLocaleString()}</div></div>`;
  } else extra = "</div>";
  openSheet(`${classicHtml(t, !rec)}
    <div style="margin-top:14px"><span class="tier" style="background:${TIERS[t.tier][1]}">${TIERS[t.tier][0]} trophy</span></div>
    ${rec ? `<h2 style="margin-top:10px">${esc(t.title)}</h2><div class="muted">${esc(t.author)} · ${esc(t.year)}</div><p style="line-height:1.45">${esc(t.blurb)}</p>` : ""}
    <div class="card" style="margin-top:12px"><div class="label">${rec ? "Awarded for" : "To earn it"}</div>
      <h3 style="margin-top:4px">${hidden ? "Secret trophy" : esc(t.name)}</h3><div>${hidden ? "Keep reading to discover this one." : esc(t.desc)}</div>${extra}`);
}
async function trophyToRead(id) {
  const t = TROPHY_BY_ID[id];
  const b = newBook({ title: t.title, authors: t.author, status: "To read", year: /^\d{4}$/.test(t.year) ? t.year : "", source: "Trophy reward" });
  try {
    const rs = await findMetadata({ title: t.title, author: t.author });
    const m = rs.find(r => sameBook(b, r) && r.cover_url) || rs.find(r => sameBook(b, r));
    if (m) { ["isbn", "publisher", "pages", "subjects", "cover_url"].forEach(k => { if (m[k] && !b[k]) b[k] = m[k]; }); b.genres = suggestGenres(await gatherEvidence(b, rs)); }
  } catch (e) { /* offline: add it anyway */ }
  await saveBook(b, SYNC_FIELDS);
  closeSheet(); toast(`${t.title} added to your To-read list.`); checkTrophies();
}
async function checkTrophies() {
  const { fresh } = await awardTrophies();
  render();
  await checkCreatures();
  if (!fresh.length) return;
  const ts = fresh.map(id => TROPHY_BY_ID[id]);
  const html = ts.length === 1
    ? `${classicHtml(ts[0], false)}<p style="text-align:center;margin-top:14px"><b>${esc(ts[0].title)}</b> has been added to your bookcase.<br><span class="small muted">${esc(TIERS[ts[0].tier][0])} · ${esc(ts[0].name)}: ${esc(ts[0].desc)}</span></p>`
    : `<p>New books have been added to your bookcase.</p><div class="unlock-grid">${ts.slice(0, 9).map(t => classicHtml(t, false)).join("")}</div>${ts.length > 9 ? `<p class="small muted">…and ${ts.length - 9} more</p>` : ""}`;
  const go = await dialog({ title: ts.length === 1 ? "Trophy unlocked!" : `${ts.length} trophies unlocked!`, html,
    buttons: [["Lovely!", false, "btn ghost"], ["Open bookcase", true, "btn"]] });
  if (go) { UI.tab = "trophies"; UI.trophyView = "bookcase"; closeScreen(); closeSheet(); render(); }
}

/* ---------- stats ---------- */
function renderStats() {
  const fin = S.books.filter(b => b.status === "Finished" && b.end_date);
  const years = [...new Set(fin.map(b => b.end_date.slice(0, 4)))].sort().reverse();
  const now = new Date(), thisYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const periods = ["This year", "Last 12 months", "All time"].concat(years.filter(y => +y !== now.getFullYear()));
  if (!periods.includes(UI.period)) UI.period = "This year";
  let mode, slots, inRange;
  if (UI.period === "All time") {
    const ys = fin.map(b => +b.end_date.slice(0, 4));
    mode = "year"; slots = ys.length ? Array.from({ length: Math.max(...ys) - Math.min(...ys) + 1 }, (_, i) => String(Math.min(...ys) + i)) : [];
    inRange = fin;
  } else {
    mode = "month";
    const start = UI.period === "Last 12 months" ? addMonths(thisYm, -11) : `${UI.period === "This year" ? now.getFullYear() : UI.period}-01`;
    slots = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
    inRange = fin.filter(b => b.end_date.length >= 7 && slots.includes(b.end_date.slice(0, 7)));
  }
  const key = b => mode === "month" ? b.end_date.slice(0, 7) : b.end_date.slice(0, 4);
  const count = {}, pages = {};
  inRange.forEach(b => { count[key(b)] = (count[key(b)] || 0) + 1; pages[key(b)] = (pages[key(b)] || 0) + (+b.pages || 0); });
  const lab = s => mode === "month" ? MONTH_NAMES[+s.slice(5) - 1].slice(0, 1) + (s.slice(5) === "01" ? "'" + s.slice(2, 4) : "") : "'" + s.slice(2);
  const chart = (obj, cls) => { const mx = Math.max(1, ...slots.map(s => obj[s] || 0)); return `<div class="bars">${slots.map(s => `<div class="bar ${cls}">${obj[s] ? `<em>${obj[s] >= 1000 ? Math.round(obj[s] / 100) / 10 + "k" : obj[s]}</em>` : ""}<i style="height:${(obj[s] || 0) / mx * 100}%"></i><span>${lab(s)}</span></div>`).join("")}</div>`; };
  const withPages = inRange.filter(b => +b.pages), rated = inRange.filter(b => +b.rating);
  const durs = inRange.map(b => daysBetween(b.start_date, b.end_date)).filter(d => d !== null);
  const avg = (a, f) => a.reduce((t, x) => t + f(x), 0) / a.length;
  const zoo = {}; inRange.forEach(b => genreBadges(b.genres).forEach(([k]) => { zoo[k] = (zoo[k] || 0) + 1; }));
  const authors = {}; inRange.forEach(b => { const a = firstAuthor(b.authors); if (a) authors[a] = (authors[a] || 0) + 1; });
  const year = now.getFullYear(), goal = S.goals[year], doneYear = fin.filter(b => b.end_date.startsWith(String(year))).length;
  $("#view").innerHTML = `<div class="scroll-x">${periods.map(p => `<button class="chip ${UI.period === p ? "on" : ""}" data-action="period" data-v="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    <div class="tiles">
      <div class="tile" style="background:var(--purple)"><b>${inRange.length}</b>Books finished</div>
      <div class="tile" style="background:var(--blue)"><b>${withPages.length ? withPages.reduce((t, b) => t + +b.pages, 0).toLocaleString() : "–"}</b>Pages read</div>
      <div class="tile" style="background:var(--pink)"><b>${rated.length ? avg(rated, b => +b.rating).toFixed(1) + " ★" : "–"}</b>Average rating</div>
      <div class="tile" style="background:var(--gold)"><b>${durs.length ? Math.round(avg(durs, d => d)) : "–"}</b>Avg days to finish</div></div>
    <div class="pad" style="margin-top:12px"><div class="card"><div class="row" style="justify-content:space-between"><div><div class="label">${year} goal</div>
      <div style="margin-top:4px">${goal ? `${doneYear} of ${goal.target} books${doneYear >= goal.target ? " · reached!" : ` · ${goal.target - doneYear} to go`}` : "No goal set yet"}</div></div>
      <button class="btn gold" data-action="goal">${goal ? "Change" : "Set goal"}</button></div>
      ${goal ? `<div style="margin-top:10px;height:10px;background:var(--bg);border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.min(100, doneYear / goal.target * 100)}%;background:var(--purple-d)"></div></div>` : ""}</div></div>
    <div class="stats-grid"><div class="pad" style="margin-top:12px"><div class="card"><div class="label">Books finished per ${mode}</div>${chart(count, "")}</div></div>
    <div class="pad" style="margin-top:12px"><div class="card"><div class="label">Pages read per ${mode}</div>${chart(pages, "p")}</div></div>
    <div class="pad" style="margin-top:12px"><div class="card"><div class="row" style="justify-content:space-between"><div class="label">Your reading menagerie</div><button class="linkish" data-action="all-creatures">See all creatures ›</button></div>
      ${Object.keys(zoo).length ? `<div class="zoo" style="margin-top:10px">${Object.entries(zoo).sort((a, b) => b[1] - a[1]).map(([k, c]) => `<button class="zoo-beast ${isCombo(k) ? "rare" : ""}" data-action="creature" data-k="${k}" title="${esc(creatureName(k))}"><img src="creatures/${k}.png" alt="${esc(creatureName(k))}"><b>${esc(creatureName(k).split(/[ ,&]/)[0])}</b><small>${c} book${c > 1 ? "s" : ""}</small></button>`).join("")}</div>`
        : `<div class="small muted" style="margin-top:6px">No genres yet for these books.</div>`}</div></div>
    <div class="pad" style="margin-top:12px;margin-bottom:24px"><div class="card"><div class="label">Top authors</div>
      <ul class="list-plain">${Object.entries(authors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, c]) => `<li>${esc(a)} <span class="muted">(${c})</span></li>`).join("") || '<li class="muted">–</li>'}</ul></div></div></div>`;
}
async function setGoal() {
  const year = new Date().getFullYear(), cur = S.goals[year];
  const v = await dialog({ title: `Your ${year} reading goal`, text: "How many books would you like to read this year?",
    html: `<input class="input" type="number" inputmode="numeric" min="1" value="${cur ? cur.target : ""}" style="margin-bottom:12px">`,
    buttons: [["Cancel", false, "btn ghost"], ["Save goal", "input", "btn"]] });
  if (v === false) return;
  const n = parseInt(v, 10);
  if (!(n >= 1 && n <= 1000)) return notify("Yearly goal", "Please enter a number of books, like 24.");
  S.goals[year] = { target: n, set_at: nowIso() };
  await saveMeta(); render(); checkTrophies();
}

/* ---------- files (backup / restore) ---------- */
function pickFileText() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json,text/plain";
    inp.onchange = async () => inp.files[0] ? resolve({ text: await inp.files[0].text(), name: inp.files[0].name }) : reject(new DOMException("none", "AbortError"));
    inp.click();
  });
}
async function shareFile(json, name = "spine-hunter-sync.json") {
  const file = new File([json], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Spine Hunter sync file" }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
async function backup() {
  const st = exportState(); st.saved_at = nowIso(); st.saved_by = "phone backup";
  await shareFile(JSON.stringify(st), `spine-hunter-backup-${todayIso()}.json`);
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-action],[data-tab]");
  if (!el) return;
  if (el.dataset.tab) { UI.tab = el.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); return; }
  const a = el.dataset.action, v = el.dataset.v;
  switch (a) {
    case "tab": UI.tab = v; render(); break;
    case "status": UI.status = v; render(); break;
    case "gfilter": UI.genre = v; render(); break;
    case "detail": openDetail(el.dataset.uid); break;
    case "detail-nav": { const i = UI.order.indexOf(UI.detail) + +el.dataset.step; if (i >= 0 && i < UI.order.length) openDetail(UI.order[i]); break; }
    case "close-sheet": closeSheet(); break;
    case "genre-name": toast(el.dataset.name); break;
    case "creature": openCreature(el.dataset.k); break;
    case "theme": setTheme(v); break;
    case "trophy-view": UI.trophyView = v; render(); break;
    case "all-creatures": UI.tab = "trophies"; UI.trophyView = "creatures"; closeSheet(); render(); window.scrollTo(0, 0); break;
    case "add": openEdit(null); break;
    case "edit": openEdit(el.dataset.uid); break;
    case "close-edit":
      if (E && E.dirty && !(await ask("Discard changes?", "You've made changes that haven't been saved.", "Discard"))) break;
      closeScreen(); break;
    case "save": saveAndClose(); break;
    case "edit-nav": editNav(+el.dataset.step); break;
    case "quick": quickFind(); break;
    case "scan": startScanner(); break;
    case "pick": pickResult(+el.dataset.i); break;
    case "find-cover": findCover(); break;
    case "cover-pick": document.querySelectorAll(".cover-picks button").forEach(x => x.classList.toggle("on", x === el)); $("#dialog input").value = el.dataset.u; break;
    case "own-photo": ownPhoto(); break;
    case "genre": { readForm(); const g = new Set(parseGenres(E.book.genres)); g.has(el.dataset.k) ? g.delete(el.dataset.k) : g.add(el.dataset.k); E.book.genres = GENRE_KEYS.filter(k => g.has(k)).join(","); E.dirty = true; refreshEditBits(); break; }
    case "suggest-genres": {
      readForm(); if (!E.book.title && !E.book.isbn) { notify("Suggest genres", "Enter the title (or ISBN) first."); break; }
      toast("Looking it up…", 3000);
      const g = suggestGenres([E.book.subjects, await genreEvidence(E.book)].join(" | "));
      if (g) { E.book.genres = g; E.dirty = true; refreshEditBits(); toast("Genres suggested."); }
      else notify("No suggestion", "None of the book databases describe this book's genre. Pick one or more.");
      break;
    }
    case "set-status": readForm(); E.book.status = v; E.dirty = true; refreshEditBits(); break;
    case "rate": readForm(); E.book.rating = (+E.book.rating === +el.dataset.n) ? 0 : +el.dataset.n; E.dirty = true; refreshEditBits(); break;
    case "today": { const inp = $(`#screen [data-f="${el.dataset.f}"]`); inp.value = todayIso(); E.dirty = true; break; }
    case "delete":
      if (await ask("Delete book", `Delete "${E.book.title}" from your journal? It will be removed from all your devices.`, "Delete")) {
        await deleteBook(E.uid); closeScreen(); render(); toast("Deleted.");
      }
      break;
    case "trophy": openTrophy(el.dataset.id); break;
    case "trophy-toread": trophyToRead(el.dataset.id); break;
    case "period": UI.period = v; render(); break;
    case "goal": setGoal(); break;
    case "backup": backup(); break;
    case "signin": signIn(); break;
    case "signout": signOutNow(); break;
    case "install": if (UI.installEvent) { UI.installEvent.prompt(); UI.installEvent = null; $("#install").classList.add("hidden"); } break;
  }
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); UI.installEvent = e; $("#install").classList.remove("hidden"); });
let _wasWide = wide();
window.addEventListener("resize", () => {
  if (UI.tab === "trophies") renderTrophies();
  if (wide() !== _wasWide) { _wasWide = wide(); closeSheet(); render(); }
});
document.addEventListener("keydown", e => {
  if (!$("#screen").classList.contains("hidden") && E && !E.isNew && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); editNav(e.key === "ArrowLeft" ? -1 : 1); }
  if (e.key === "Escape" && !$("#sheet-wrap").classList.contains("hidden")) closeSheet();
});

// start once every script (including more.js and cloud.js) has loaded
window.addEventListener("DOMContentLoaded", function start() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});  // keep the offline copy
  render();
  startCloud();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
});
