"use strict";
/* Spine Hunter - importing (Goodreads, Fable, your spreadsheet) and the tidy-up tools.
   Ported from the Windows version so results are the same. */

/* ---------------- author names: one spelling per author ---------------- */
function samePerson(a, b) {
  const ta = fold(a).toLowerCase().match(/[a-z]+/g) || [], tb = fold(b).toLowerCase().match(/[a-z]+/g) || [];
  return !!(ta.length && tb.length) && ta[ta.length - 1] === tb[tb.length - 1] && ta[0][0] === tb[0][0];
}
class AuthorNames {
  constructor(books) { this.map = {}; (books || []).forEach(b => splitAuthors(b.authors).forEach(n => { const k = nameKey(n); if (k && !this.map[k]) this.map[k] = n; })); }
  prefer(n) { n = tidyName(n); if (nameKey(n)) this.map[nameKey(n)] = n; }
  canon(authors) {
    const out = [];
    splitAuthors(authors).forEach(n => { n = tidyName(n); const k = nameKey(n); if (!k) return; if (!this.map[k]) this.map[k] = n; if (!out.includes(this.map[k])) out.push(this.map[k]); });
    return out.join(", ");
  }
}
async function unifyAuthors(names) {
  for (const b of S.books) { const c = names.canon(b.authors); if (c !== (b.authors || "")) { b.authors = c; await saveBook(b, ["authors"]); } }
}

/* ---------------- spotting duplicates ---------------- */
class BookIndex {
  constructor(books) { this.byIsbn = {}; this.byTitle = {}; (books || []).forEach(b => this.add(b)); }
  add(b) {
    const i = isbn13(b.isbn); if (i && !this.byIsbn[i]) this.byIsbn[i] = b;
    const t = normTitle(b.title); if (t) (this.byTitle[t] = this.byTitle[t] || []).push(b);
  }
  find(b) {
    const i = isbn13(b.isbn);
    if (i && this.byIsbn[i] && this.byIsbn[i] !== b) return this.byIsbn[i];
    return (this.byTitle[normTitle(b.title)] || []).find(c => c !== b && authorsMatch(b.authors, c.authors)) || null;
  }
}
const STATUS_RANK = { "To read": 0, "Reading": 1, "Did not finish": 2, "Finished": 2 };
const MERGE_FIELDS = ["authors", "isbn", "publisher", "year", "pages", "subjects", "genres", "cover_url", "start_date", "end_date", "rating"];
/* Fills gaps in an existing book from a duplicate. Never adds a second copy and never overwrites what you entered. */
async function mergeInto(target, src) {
  const changed = [];
  MERGE_FIELDS.forEach(k => {
    if (!target[k] && src[k]) { target[k] = src[k]; changed.push(k); if (k === "cover_url" && src.own_cover) target.own_cover = src.own_cover; }
  });
  ["start_date", "end_date"].forEach(k => {
    const t = target[k] || "", s = src[k] || "";
    if (t && s && s.length > t.length && s.startsWith(t)) { target[k] = s; changed.push(k); }
  });
  if ((STATUS_RANK[src.status] || 0) > (STATUS_RANK[target.status] || 0)) { target.status = src.status; changed.push("status"); }
  const nn = (src.notes || "").trim(), on = (target.notes || "").trim();
  if (nn && !on.includes(nn)) { target.notes = (on + "\n\n" + nn).trim(); changed.push("notes"); }
  if (changed.length) await saveBook(target, changed);
  return changed;
}
function duplicateGroups() {
  const idx = new BookIndex(), groups = new Map();
  S.books.slice().sort((a, b) => (a.added_at || "") < (b.added_at || "") ? -1 : 1).forEach(b => {
    const hit = idx.find(b);
    if (hit) { if (!groups.has(hit.uid)) groups.set(hit.uid, [hit]); groups.get(hit.uid).push(b); } else idx.add(b);
  });
  return [...groups.values()];
}
async function mergeGroups(groups) {
  let removed = 0;
  const score = b => MERGE_FIELDS.concat(["notes"]).filter(k => b[k]).length + (b.cover_url ? 2 : 0);
  for (const g of groups) {
    const keeper = g.reduce((best, b) => score(b) > score(best) ? b : best, g[0]);
    for (const other of g) { if (other === keeper) continue; await mergeInto(keeper, other); await deleteBook(other.uid); removed++; }
  }
  return removed;
}

/* ---------------- matching a book online ---------------- */
const FILL_FIELDS = ["isbn", "publisher", "year", "pages", "subjects", "cover_url"];
async function bestMatch(book) {
  const want = normTitle(book.title), isbn = cleanIsbn(book.isbn);
  if (isbn) {
    const settled = await Promise.allSettled(SOURCES.map(fn => fn({ isbn, limit: 1 })));
    const byIsbn = settled.filter(r => r.status === "fulfilled").flatMap(r => r.value).filter(r => !want || titlesMatch(want, r.title));
    if (byIsbn.length) {
      const pick = Object.assign({}, byIsbn[0]);
      byIsbn.slice(1).forEach(r => FILL_FIELDS.forEach(k => { if (!pick[k] && r[k]) pick[k] = r[k]; }));
      pick.evidence = await gatherEvidence(Object.assign({}, book, { title: book.title || pick.title }), byIsbn);
      return pick;
    }
  }
  const res = await findMetadata({ title: searchTitle(book.title), author: firstAuthor(book.authors) });
  const good = res.filter(r => titlesMatch(want, r.title) && authorsMatch(book.authors, r.authors));
  if (!good.length) return null;
  const exact = good.filter(r => normTitle(r.title) === want);
  const pick = Object.assign({}, (exact.length ? exact : good)[0]);
  good.forEach(r => FILL_FIELDS.forEach(k => { if (!pick[k] && r[k]) pick[k] = r[k]; }));
  pick.evidence = await gatherEvidence(book, good);
  return pick;
}
/* Uses the online record's spelling of title and authors and fills gaps. Ratings, dates, status and notes are untouched. */
function applyMatch(book, m, names) {
  if (m.main_title) book.title = m.main_title;
  const online = splitAuthors(m.authors);
  online.forEach(n => names.prefer(n));
  const mine = splitAuthors(book.authors);
  book.authors = mine.length ? mine.map(n => online.find(o => samePerson(n, o)) || n).join(", ") : online.slice(0, 2).join(", ");
  FILL_FIELDS.forEach(k => { if (!book[k] && m[k]) book[k] = m[k]; });
  book.authors = names.canon(book.authors);
  book.title = tidyTitle(book.title);
  if (!parseGenres(book.genres).length) book.genres = suggestGenres([m.evidence || "", book.subjects || ""].join(" | "));
}
async function findCoverUrl(book) {
  const tried = new Set(), want = normTitle(book.title), i13 = isbn13(book.isbn);
  const urls = [];
  if (i13) urls.push(`https://covers.openlibrary.org/b/isbn/${i13}-L.jpg?default=false`);
  try {
    const rs = await findMetadata(i13 ? { isbn: i13 } : { title: searchTitle(book.title), author: firstAuthor(book.authors) });
    rs.filter(r => r.cover_url && (i13 || (titlesMatch(want, r.title) && authorsMatch(book.authors, r.authors)))).forEach(r => urls.push(r.cover_url));
    if (i13 && want && urls.length < 2) {
      const more = await findMetadata({ title: searchTitle(book.title), author: firstAuthor(book.authors) });
      more.filter(r => r.cover_url && titlesMatch(want, r.title) && authorsMatch(book.authors, r.authors)).forEach(r => urls.push(r.cover_url));
    }
  } catch (e) { /* offline */ }
  for (const u of urls) { if (tried.has(u)) continue; tried.add(u); if (await imageOk(u)) return u.replace("?default=false", ""); }
  return "";
}
function imageOk(url) {
  return new Promise(res => { const im = new Image(); const t = setTimeout(() => res(false), 12000); im.onload = () => { clearTimeout(t); res(im.naturalWidth > 40 && im.naturalHeight > 40); }; im.onerror = () => { clearTimeout(t); res(false); }; im.src = url; });
}

/* ---------------- reading import files ---------------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the spreadsheet reader. Check your internet connection, or save the spreadsheet as CSV.")); document.head.appendChild(s); });
}
async function readRows(file) {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    if (!window.XLSX) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  }
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
  return parseCSV(text.replace(/^﻿/, ""));
}
const s_ = v => v == null ? "" : String(v).trim();
function fromGoodreadsRow(r) {
  const title = stripSeries(s_(r["Title"])); if (!title) return null;
  const authors = [s_(r["Author"])].concat(s_(r["Additional Authors"]).split(",").map(x => x.trim())).filter(Boolean).join(", ");
  const shelf = s_(r["Exclusive Shelf"]).toLowerCase(), shelves = shelf + " " + s_(r["Bookshelves"]).toLowerCase();
  const dateRead = parseDate(r["Date Read"]);
  let status = "To read";
  if (/did-not-finish|dnf|abandon|did not finish/.test(shelves)) status = "Did not finish";
  else if (shelf === "currently-reading") status = "Reading";
  else if (shelf === "to-read") status = "To read";
  else if (shelf === "read" || dateRead) status = "Finished";
  const review = s_(r["My Review"]).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  const priv = s_(r["Private Notes"]);
  return {
    title, authors, isbn: cleanIsbn(r["ISBN13"]) || cleanIsbn(r["ISBN"]), publisher: s_(r["Publisher"]),
    year: s_(r["Original Publication Year"]) || s_(r["Year Published"]), pages: parseInt(s_(r["Number of Pages"]), 10) || null,
    status, rating: Math.max(0, Math.min(5, parseInt(s_(r["My Rating"]), 10) || 0)),
    start_date: parseDate(r["Date Started"]), end_date: ["Finished", "Did not finish"].includes(status) ? dateRead : "",
    notes: [review, priv ? "Private notes: " + priv : ""].filter(Boolean).join("\n\n"), source: "Goodreads/Fable import",
    genres: suggestGenres(s_(r["Bookshelves"]), 3), _dateAdded: parseDate(r["Date Added"]),
  };
}
function flipName(a) {
  const p = (a || "").split(",").map(x => x.trim());
  return (p.length === 2 && p[0] && !p[0].includes(" ") && /^(?:(?:[A-Z]\. ?)+|[A-Za-z][\w'-]*\.?)(?: [A-Z]\.?)*$/.test(p[1] || "")) ? `${p[1]} ${p[0]}` : a;
}
function fromOwnSpreadsheet(headers, records) {
  const low = headers.map(h => h.toLowerCase());
  const find = test => { const i = low.findIndex(test); return i < 0 ? null : i; };
  const ti = find(h => h.includes("title")), ai = find(h => h.includes("author")),
    fi = find(h => !h.includes("start") && (h.includes("finish") || h.includes("date") || h.includes("month") || ["read", "completed", "when"].includes(h))),
    si = find(h => h.includes("start")), ri = find(h => h.includes("rating") || h.includes("stars")),
    ni = find(h => h.includes("note")), gi = find(h => h.includes("genre"));
  if (ti === null) throw new Error("Couldn't find a 'Title' column. The first row must have column headings: Title, Author, Finished.");
  return records.map(v => {
    const title = s_(v[ti]); if (!title) return null;
    const fin = fi !== null ? v[fi] : null;
    const isDate = fin instanceof Date;
    // Excel turns "May 2023" into a date; you entered months, so keep month precision
    const end = isDate ? `${fin.getFullYear()}-${pad(fin.getMonth() + 1)}` : parseDate(fin);
    return {
      title, authors: ai !== null ? flipName(s_(v[ai])) : "", status: "Finished",
      rating: ri !== null ? Math.max(0, Math.min(5, parseInt(s_(v[ri]), 10) || 0)) : 0,
      start_date: si !== null ? (v[si] instanceof Date ? `${v[si].getFullYear()}-${pad(v[si].getMonth() + 1)}-${pad(v[si].getDate())}` : parseDate(v[si])) : "",
      end_date: end, notes: ni !== null ? s_(v[ni]) : "", source: "Spreadsheet import",
      // genres you typed are taken as written; anything else (e.g. "romantasy") is interpreted
      genres: gi !== null ? (parseGenres(s_(v[gi])).join(",") || suggestGenres(s_(v[gi]), 4)) : "", _rawFinished: isDate ? "" : s_(fin),
    };
  }).filter(Boolean);
}
async function readImportFile(file) {
  const rows = (await readRows(file)).filter(r => r && r.some(c => c !== null && c !== ""));
  if (!rows.length) throw new Error("The file is empty.");
  const headers = rows[0].map(h => s_(h));
  const low = headers.map(h => h.toLowerCase());
  if (low.includes("exclusive shelf") || low.includes("my rating")) {
    const recs = rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    return { books: recs.map(fromGoodreadsRow).filter(Boolean), kind: "Goodreads/Fable export" };
  }
  return { books: fromOwnSpreadsheet(headers, rows.slice(1)), kind: "your spreadsheet" };
}
function previewFlags(books) {
  const existing = new BookIndex(S.books), seen = new BookIndex();
  books.forEach(b => {
    const f = [];
    if (existing.find(b)) f.push("Already in your journal: won't be added again");
    else if (seen.find(b)) f.push("Repeated in this file: added once");
    if (b._rawFinished && !b.end_date) f.push(`Finished date "${b._rawFinished}" not understood`);
    else if (["Finished", "Did not finish"].includes(b.status) && !b.end_date) f.push("No finish date");
    seen.add(b); b._flag = f.join("; "); b._dupe = f.some(x => x.startsWith("Already") || x.startsWith("Repeated"));
  });
}

/* ---------------- jobs (each runs book by book with a progress bar) ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function importJob(books, lookup) {
  const st = { added: 0, merged: 0, matched: 0 };
  let names, index;
  return {
    items: books,
    setup() { names = new AuthorNames(S.books); index = new BookIndex(S.books); },
    async step(src) {
      const b = newBook(Object.fromEntries(Object.entries(src).filter(([k]) => !k.startsWith("_"))));
      if (lookup) {
        try { const m = await bestMatch(b); if (m) { st.matched++; applyMatch(b, m, names); } } catch (e) { /* offline */ }
      }
      b.title = tidyTitle(b.title); b.authors = names.canon(b.authors);
      if (!parseGenres(b.genres).length) b.genres = suggestGenres(b.subjects);
      const hit = index.find(b);
      if (hit) { await mergeInto(hit, b); st.merged++; if (lookup && !hit.cover_url) { const u = await findCoverUrl(hit); if (u) { hit.cover_url = u; await saveBook(hit, ["cover_url"]); } } }
      else {
        if (lookup && !b.cover_url) b.cover_url = await findCoverUrl(b);
        await saveBook(b, SYNC_FIELDS); index.add(b); st.added++;
      }
      if (lookup) await sleep(150);
    },
    async finish() { await unifyAuthors(names); },
    summary() {
      return [`Added ${st.added} new book${st.added === 1 ? "" : "s"}.`,
        st.merged ? `${st.merged} were already in your journal (or repeated in the file), so they weren't added again. Any details they were missing were filled in.` : "",
        lookup ? `Details found online for ${st.matched}. Books without a match keep the details from your file; open one and use Quick find to fix it.` : ""].filter(Boolean).join("\n\n");
    },
  };
}
function tidyJob() {
  const st = { matched: 0, changed: 0, merged: 0 };
  const names = new AuthorNames();
  return {
    items: S.books.slice(),
    setup() {},
    async step(b) {
      const before = JSON.stringify(SYNC_FIELDS.map(f => b[f]));
      try { const m = await bestMatch(b); if (m) { st.matched++; applyMatch(b, m, names); } } catch (e) { /* offline */ }
      b.title = tidyTitle(b.title); b.authors = names.canon(b.authors);
      if (!b.cover_url) b.cover_url = await findCoverUrl(b);
      const changed = SYNC_FIELDS.filter((f, i) => JSON.stringify(b[f]) !== JSON.stringify(JSON.parse(before)[i]));
      if (changed.length) { await saveBook(b, changed); st.changed++; }
      await sleep(150);
    },
    async finish() { await unifyAuthors(names); st.merged = await mergeGroups(duplicateGroups()); },
    summary() {
      return [`Matched ${st.matched} of ${this.items.length} books online and updated ${st.changed}.`,
        st.merged ? `Merged ${st.merged} duplicate entries, so each book is now counted once.` : "",
        "Books that couldn't be matched kept their details. Open one and use Quick find to pick the right match by hand."].filter(Boolean).join("\n\n");
    },
  };
}
function coverJob() {
  let found = 0;
  return {
    items: S.books.filter(b => !b.cover_url),
    setup() {},
    async step(b) { const u = await findCoverUrl(b); if (u) { b.cover_url = u; await saveBook(b, ["cover_url"]); found++; } await sleep(150); },
    async finish() {},
    summary() { const miss = this.items.length - found; return `Found covers for ${found} of ${this.items.length} books.` + (miss ? "\n\nFor the rest, open the book, tap Edit and use 'Use my own photo', or add the ISBN and try 'Find a cover'." : ""); },
  };
}
function genreJob() {
  let found = 0;
  return {
    items: S.books.filter(b => !parseGenres(b.genres).length),
    setup() {},
    async step(b) {
      const ev = await genreEvidence(b);
      const g = suggestGenres([b.subjects || "", ev].join(" | "));
      const changed = [];
      if (g) { b.genres = g; changed.push("genres"); found++; }
      if (!b.subjects) { const sub = cleanSubjects(ev.split(/\s*\|\s*/)); if (sub) { b.subjects = sub; changed.push("subjects"); } }
      if (changed.length) await saveBook(b, changed);
      await sleep(150);
    },
    async finish() {},
    summary() { return `Found genres for ${found} of ${this.items.length} books.` + (found < this.items.length ? "\n\nThe rest aren't described clearly enough in the book databases. Open one and pick its genres in Edit." : ""); },
  };
}
