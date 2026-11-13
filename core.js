"use strict";
/* Spine Hunter (phone) - data, lookups, sync merge and trophies.
   The rules here mirror spine_hunter.py so both apps behave the same way. */

const SYNC_FIELDS = ["title", "authors", "isbn", "publisher", "year", "pages", "subjects", "genres", "cover_url",
  "status", "rating", "start_date", "end_date", "notes", "source", "added_at"];
const BASE_TIME = "2000-01-01T00:00:00.000Z";
const STATUSES = ["To read", "Reading", "Finished", "Did not finish"];
const nowIso = () => new Date().toISOString();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const pad = n => String(n).padStart(2, "0");
const newUid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2))
  .replace(/-/g, "").slice(0, 32);

/* ---------------- storage ----------------
   Your journal is saved to your Google account (Firestore, see cloud.js), with an offline copy on
   each device. The old on-device store below is only read once, to move books from the earlier
   version of Spine Hunter into your account. */
const DB = (() => {
  let opening;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open("spine-hunter", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("books", { keyPath: "uid" }); r.result.createObjectStore("meta"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    allBooks: () => run("books", "readonly", s => s.getAll()),
    putBook: b => run("books", "readwrite", s => s.put(b)),
    delBook: uid => run("books", "readwrite", s => s.delete(uid)),
    replaceBooks: async list => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction("books", "readwrite");
        const s = t.objectStore("books");
        s.clear();
        list.forEach(b => s.put(b));
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    },
    get: k => run("meta", "readonly", s => s.get(k)),
    set: (k, v) => run("meta", "readwrite", s => s.put(v, k)),
  };
})();

const S = { books: [], deleted: {}, trophies: {}, goals: {}, settings: {} };

async function loadOldLocal() {
  try {
    return { books: (await DB.allBooks()) || [], trophies: (await DB.get("trophies")) || {}, goals: (await DB.get("goals")) || {} };
  } catch (e) { return { books: [], trophies: {}, goals: {} }; }
}
const saveMeta = async () => Store.putMeta();
const bookByUid = uid => S.books.find(b => b.uid === uid);

async function saveBook(book, changed) {
  const t = nowIso();
  book.field_times = book.field_times || {};
  (changed || SYNC_FIELDS).forEach(f => { if (SYNC_FIELDS.includes(f)) book.field_times[f] = t; });
  if (!S.books.includes(book)) S.books.push(book);
  Store.putBook(book, changed);
}
function newBook(fields) {
  const b = { uid: newUid(), title: "", authors: "", isbn: "", publisher: "", year: "", pages: null, subjects: "",
    genres: "", cover_url: "", status: "Finished", rating: 0, start_date: "", end_date: "", notes: "",
    source: "phone", added_at: new Date().toISOString().slice(0, 19), field_times: {}, own_cover: null };
  return Object.assign(b, fields || {});
}
async function deleteBook(uid) {
  S.books = S.books.filter(b => b.uid !== uid);
  Store.delBook(uid);
}

/* ---------------- dates ---------------- */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ymd(y, m, d) { const dt = new Date(+y, +m - 1, +d); return (dt.getMonth() === +m - 1 && dt.getDate() === +d) ? `${y}-${pad(m)}-${pad(d)}` : ""; }
function ym(y, m) { return (+m >= 1 && +m <= 12 && +y >= 1000) ? `${y}-${pad(m)}` : ""; }
function parseDate(v) {
  const s = String(v || "").trim(); if (!s) return "";
  const s2 = s.replace(/[/.]/g, "-");
  let m;
  if ((m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(m[1], m[2], m[3]);
  if ((m = s2.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) return ymd(m[3], m[2], m[1]);
  if ((m = s2.match(/^(\d{4})-(\d{1,2})$/))) return ym(m[1], m[2]);
  if ((m = s2.match(/^(\d{1,2})-(\d{4})$/))) return ym(m[2], m[1]);
  if ((m = s.match(/^([A-Za-z]+)[\s,-]+(\d{4}|\d{2})$/)) && MONTHS.includes(m[1].slice(0, 3).toLowerCase()))
    return ym(+m[2] < 100 ? +m[2] + 2000 : m[2], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1);
  if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s,-]+(\d{4})$/)) && MONTHS.includes(m[2].slice(0, 3).toLowerCase()))
    return ymd(m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, m[1]);
  if (/^\d{4}$/.test(s)) return s;
  return "";
}
function prettyDate(d) {
  if (!d) return "";
  if (d.length === 10) return `${+d.slice(8)} ${MONTH_NAMES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  if (d.length === 7) return `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  return d;
}
function daysBetween(a, b) {
  if ((a || "").length !== 10 || (b || "").length !== 10) return null;
  const d = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8))) / 86400000);
  return d >= 0 ? d : null;
}
function addMonths(ymStr, k) { const [y, m] = ymStr.split("-").map(Number); const i = y * 12 + (m - 1) + k; return `${Math.floor(i / 12)}-${pad(i % 12 + 1)}`; }

/* ---------------- text helpers ---------------- */
const fold = s => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
const cleanIsbn = s => String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
function isbn13(s) {
  s = cleanIsbn(s);
  if (s.length === 10 && /^\d{9}/.test(s)) {
    const core = "978" + s.slice(0, 9);
    const total = [...core].reduce((t, c, i) => t + (+c) * (i % 2 ? 3 : 1), 0);
    return core + ((10 - total % 10) % 10);
  }
  return (s.length === 13 && /^\d+$/.test(s)) ? s : "";
}
const looksLikeIsbn = t => /^[\d\-\s]{9,}[\dXx]$/.test((t || "").trim()) && [10, 13].includes(cleanIsbn(t).length);
const stripSeries = t => (t || "").replace(/\s*\([^()]*#\s*[\d.]+[^()]*\)\s*$/, "").trim();
const searchTitle = t => (t || "").replace(/\(.*?\)/g, "").split(":")[0].trim();
const normTitle = t => fold(searchTitle(t)).toLowerCase().replace(/&/g, "and").replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
function titlesMatch(want, title) { const got = normTitle(title); return !!(want && got && (want.includes(got) || got.includes(want))); }
const splitAuthors = a => (a || "").split(",").map(x => x.trim()).filter(Boolean);
const firstAuthor = a => splitAuthors(a)[0] || "";
const nameKey = n => fold(n).toLowerCase().replace(/[^a-z]/g, "");
const nameTokens = a => new Set((fold(a || "").toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length > 2));
function authorsMatch(a, b) { const ta = nameTokens(a), tb = nameTokens(b); if (!ta.size || !tb.size) return true; for (const x of ta) if (tb.has(x)) return true; return false; }
const SMALL_WORDS = new Set("a an and as at but by for from in into nor of on or over the to with".split(" "));
function oneCase(s) { const l = s.replace(/[^A-Za-z]/g, ""); return !!l && (l === l.toLowerCase() || l === l.toUpperCase()); }
function tidyTitle(s) {
  s = (s || "").trim().replace(/\s+/g, " ");
  const w = s.split(" ");
  const sentence = w.length >= 2 && /^[A-Z]/.test(w[0]) && w.slice(1).every(x => !/^[A-Za-z]/.test(x) || /^[a-z]/.test(x))
    && w.slice(1).some(x => !SMALL_WORDS.has(x.toLowerCase()));
  if (!(oneCase(s) || sentence)) return s;
  return s.toLowerCase().split(" ").map((x, i, arr) => (i && SMALL_WORDS.has(x) && !arr[i - 1].endsWith(":")) ? x : x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
}
function tidyName(s) {
  s = (s || "").trim().replace(/\s+/g, " ");
  if (!oneCase(s)) return s;
  return s.toLowerCase().split(" ").map(w => w.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-")
    .replace(/\.([a-z])/g, (_, c) => "." + c.toUpperCase())).join(" ");
}

/* ---------------- genres ---------------- */
const GENRES = SHARED.GENRES;
const COMBOS = SHARED.COMBOS;           // [key, name, [g1, g2]]
const GENRE_NAMES = Object.assign({}, GENRES, Object.fromEntries(COMBOS.map(c => [c[0], c[1]])));
const NAME_TO_KEY = Object.fromEntries(Object.entries(GENRES).map(([k, v]) => [v.toLowerCase(), k]));
const GENRE_KEYS = Object.keys(GENRES);
function parseGenres(text) {
  const found = new Set();
  (text || "").split(/[,;/|]/).forEach(p => { p = p.trim().toLowerCase(); const k = GENRES[p] ? p : NAME_TO_KEY[p]; if (k) found.add(k); });
  return GENRE_KEYS.filter(k => found.has(k));
}
function genreBadges(text) {
  const left = parseGenres(text), out = [];
  COMBOS.forEach(([key, name, pair]) => {
    if (pair.every(g => left.includes(g))) {
      out.push([key, `${name} (${GENRES[pair[0]]} + ${GENRES[pair[1]]})`]);
      pair.forEach(g => left.splice(left.indexOf(g), 1));
    }
  });
  return out.concat(left.map(g => [g, GENRES[g]]));
}
const GENRE_RULES = SHARED.RULES.map(([g, pat]) => [g, new RegExp(pat, "g")]);
const FICTION = new Set(["fantasy", "romance", "crime", "thriller", "mystery", "scifi", "horror", "comedy", "adventure"]);
function suggestGenres(text, limit = 2) {
  const t = (text || "").toLowerCase().replace(/_/g, " ");
  const sc = {};
  GENRE_RULES.forEach(([g, re]) => { const n = (t.match(re) || []).length; if (n) sc[g] = n; });
  if (sc.true_crime) { delete sc.crime; delete sc.nonfiction; }
  if (Object.keys(sc).some(g => FICTION.has(g))) { delete sc.nonfiction; if (!sc.historical) delete sc.literary; }
  if (sc.nonfiction) delete sc.literary;
  let best = Object.keys(sc).sort((a, b) => (sc[b] - sc[a]) || (GENRE_KEYS.indexOf(a) - GENRE_KEYS.indexOf(b))).slice(0, limit);
  if (limit === 2 && best.length && !COMBOS.some(c => c[2].every(g => best.includes(g)) && best.length === 2)) {
    for (const [, , pair] of COMBOS) {
      if (pair.includes(best[0])) { const other = pair[0] === best[0] ? pair[1] : pair[0]; if (sc[other]) { best = [best[0], other]; break; } }
    }
  }
  return GENRE_KEYS.filter(k => best.includes(k)).join(",");
}

/* ---------------- online lookups (Open Library, Google Books, Apple Books) ---------------- */
async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
function cleanSubjects(items, n = 6) {
  const noise = /large type|accessible|daisy|in library|staff picks|reading level|translations|^fiction$|^english fiction$|^american fiction$|^fiction, general$|^general$|^ebooks?$/i;
  const seen = new Set(), picked = [];
  items.forEach(x => { x = String(x).trim(); if (!x || x.includes(":") || x.includes("=") || x.length > 40 || seen.has(x.toLowerCase()) || noise.test(x)) return; seen.add(x.toLowerCase()); picked.push(x); });
  const genreLike = picked.filter(x => suggestGenres(x));
  return genreLike.concat(picked.filter(x => !genreLike.includes(x))).slice(0, n).join(", ");
}
async function searchOpenLibrary({ title = "", author = "", isbn = "", query = "", limit = 8 } = {}) {
  const p = new URLSearchParams({ limit, fields: "title,author_name,first_publish_year,publisher,isbn,number_of_pages_median,subject,cover_i,cover_edition_key,edition_key" });
  if (isbn) p.set("isbn", isbn); else if (query) p.set("q", query); else { if (title) p.set("title", title); if (author) p.set("author", author); }
  const j = await getJson("https://openlibrary.org/search.json?" + p);
  return (j.docs || []).map(d => {
    const isbns = d.isbn || [];
    return { title: d.title || "", main_title: d.title || "", authors: (d.author_name || []).slice(0, 3).join(", "),
      year: String(d.first_publish_year || ""), publisher: (d.publisher || [""])[0], pages: d.number_of_pages_median || null,
      isbn: isbn || isbns.find(i => i.length === 13) || isbns[0] || "", subjects: cleanSubjects(d.subject || []),
      evidence: (d.subject || []).slice(0, 80).join(" | "),
      cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : "", found_in: "Open Library",
      all_isbns: isbns.slice(0, 40), olids: [d.cover_edition_key].concat(d.edition_key || []).filter(Boolean).slice(0, 12) };
  });
}
async function searchGoogle({ title = "", author = "", isbn = "", query = "", limit = 6 } = {}) {
  const q = isbn ? `isbn:${isbn}` : query || [title && `intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join(" ");
  const j = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=${limit}&q=` + encodeURIComponent(q));
  return (j.items || []).map(it => {
    const v = it.volumeInfo || {};
    const ids = Object.fromEntries((v.industryIdentifiers || []).map(x => [x.type, x.identifier]));
    const links = v.imageLinks || {};
    const img = (["extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"].map(k => links[k]).find(Boolean) || "")
      .replace("http://", "https://").replace("&edge=curl", "");
    return { title: (v.title || "") + (v.subtitle ? ": " + v.subtitle : ""), main_title: v.title || "",
      authors: (v.authors || []).slice(0, 3).join(", "), year: (v.publishedDate || "").slice(0, 4), publisher: v.publisher || "",
      pages: v.pageCount || null, isbn: ids.ISBN_13 || ids.ISBN_10 || "", subjects: cleanSubjects(v.categories || []),
      evidence: (v.categories || []).join(" | "), gid: it.id || "", cover_url: img, found_in: "Google Books" };
  });
}
async function googleCategories(gid) {
  const v = (await getJson("https://www.googleapis.com/books/v1/volumes/" + gid)).volumeInfo || {};
  return (v.categories || []).concat(v.mainCategory ? [v.mainCategory] : []);
}
const appleTitle = t => stripSeries(t).replace(/\s*[([][^()[\]]*\b(book|volume|vol\.?|#|part)\s*\d+[^()[\]]*[)\]]\s*$/i, "").trim();
async function searchApple({ title = "", author = "", isbn = "", query = "", limit = 6, media = "ebook", country = "au" } = {}) {
  const url = isbn ? `https://itunes.apple.com/lookup?country=${country}&isbn=${isbn13(isbn) || cleanIsbn(isbn)}`
    : `https://itunes.apple.com/search?media=${media}&entity=${media}&country=${country}&limit=${limit}&term=` + encodeURIComponent(query || [title, author].filter(Boolean).join(" "));
  const j = await getJson(url);
  return (j.results || []).filter(d => d.trackName || d.collectionName).slice(0, limit).map(d => {
    const name = d.trackName || d.collectionName;
    const genres = (d.genres || [d.primaryGenreName]).filter(g => g && g.toLowerCase() !== "books" && g.toLowerCase() !== "audiobooks");
    return { title: name, main_title: appleTitle(name), authors: (d.artistName || "").replace(/ & /g, ", "),
      year: (d.releaseDate || "").slice(0, 4), publisher: "", pages: null, isbn: isbn ? isbn13(isbn) : "",
      subjects: cleanSubjects(genres), evidence: genres.join(" | "),
      cover_url: (d.artworkUrl100 || d.artworkUrl60 || "").replace(/\/\d+x\d+bb\./, "/600x600bb."), found_in: media === "audiobook" ? "Apple Books (audiobook)" : "Apple Books" };
  });
}
const SOURCES = [searchOpenLibrary, searchGoogle, searchApple];
async function findMetadata(args) {
  const all = await Promise.allSettled(SOURCES.map(fn => fn(args)));
  const ok = all.filter(r => r.status === "fulfilled");
  if (!ok.length) throw new Error("Couldn't reach the book databases. Check your internet connection.");
  return ok.flatMap(r => r.value);
}
const sameBook = (book, r) => { const want = normTitle(book.title); return (!want || titlesMatch(want, r.title)) && authorsMatch(book.authors, r.authors); };

/* ---------------- covers: searched wider and wider until something turns up ---------------- */
function isbn10of(i13) {
  if (!/^978\d{10}$/.test(i13 || "")) return "";
  const core = i13.slice(3, 12), sum = [...core].reduce((t, c, i) => t + (+c) * (10 - i), 0), chk = (11 - sum % 11) % 11;
  return core + (chk === 10 ? "X" : chk);
}
const isbnCovers = i => [`https://covers.openlibrary.org/b/isbn/${i}-L.jpg?default=false`].concat(isbn10of(i) ? [`https://images-na.ssl-images-amazon.com/images/P/${isbn10of(i)}.01.LZZZZZZZ.jpg`] : []);
async function getJsonTimed(url, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); }
}
/* Goodreads covers, through the free bookcover API (github.com/w3slley/bookcover-api) */
async function goodreadsCover(book) {
  const i13 = isbn13(book.isbn), base = "https://bookcover.longitood.com/bookcover";
  const tries = [];
  if (i13) tries.push(`${base}?isbn=${i13}`);
  if (book.title) tries.push(`${base}?book_title=${encodeURIComponent(searchTitle(book.title))}&author_name=${encodeURIComponent(firstAuthor(book.authors) || "")}`);
  for (const u of tries) { try { const j = await getJsonTimed(u); if (j && j.url) return j.url; } catch (e) { /* not found or unavailable */ } }
  return "";
}
/* Yields possible cover pictures, best guesses first:
   1. the book's own ISBN (Open Library, Amazon)  2. Open Library, Google Books and Apple Books for this title and author
   3. other editions' ISBNs  4. wider searches (plain keywords, title only, audiobooks, US and UK stores)  5. Goodreads */
async function* coverCandidates(book) {
  const want = normTitle(book.title), i13 = isbn13(book.isbn), title = searchTitle(book.title), author = firstAuthor(book.authors);
  const surname = (author || "").split(/\s+/).pop() || "";
  const isbns = new Set(), olids = new Set(), seen = new Set();
  const fresh = u => u && !seen.has(u) && seen.add(u);
  const strict = r => sameBook(book, r);
  const loose = r => titlesMatch(want, r.title) && (!book.authors || !r.authors || authorsMatch(book.authors, r.authors));
  const run = async calls => (await Promise.allSettled(calls)).flatMap(x => x.status === "fulfilled" ? x.value : []);
  /* every edition of the matching books: their ISBNs (Open Library, Amazon) and Open Library edition pictures */
  const editions = function* (list, cap = 25) {
    for (const r of list) {
      for (const id of r.olids || []) if (!olids.has(id) && olids.size < cap) { olids.add(id); yield `https://covers.openlibrary.org/b/olid/${id}-L.jpg?default=false`; }
      for (const x of [r.isbn].concat(r.all_isbns || [])) { const i = isbn13(x); if (i && !isbns.has(i) && isbns.size < cap) { isbns.add(i); yield* isbnCovers(i); } }
    }
  };
  // 1. the book's own ISBN
  if (i13) { isbns.add(i13); for (const u of isbnCovers(i13)) if (fresh(u)) yield u; }
  let rs = [];
  if (i13) { rs = await run([searchOpenLibrary({ isbn: i13 }), searchGoogle({ isbn: i13 }), searchApple({ isbn: i13 })]); for (const r of rs) if (fresh(r.cover_url)) yield r.cover_url; }
  // 2. title and author on Open Library, Google Books and Apple Books
  if (title) {
    const more = await run([searchOpenLibrary({ title, author }), searchGoogle({ title, author }), searchApple({ title, author })]);
    rs = rs.concat(more);
    for (const r of more.filter(strict)) if (fresh(r.cover_url)) yield r.cover_url;
  }
  // 3. other editions of the same book
  for (const u of editions(rs.filter(strict))) if (fresh(u)) yield u;
  if (!title) { const gr = await goodreadsCover(book); if (fresh(gr)) yield gr; return; }
  // 4. wider: plain keywords, title only, surname only, audiobooks, other countries' stores
  const kw = [title, author].filter(Boolean).join(" ");
  const wide = await run([searchGoogle({ query: kw, limit: 20 }), searchGoogle({ query: `${title} ${surname}`, limit: 20 }), searchGoogle({ title, limit: 20 }),
    searchOpenLibrary({ query: kw, limit: 20 }), searchOpenLibrary({ title, limit: 20 }), searchOpenLibrary({ title, author: surname, limit: 20 }),
    searchApple({ title, author, media: "audiobook" }), searchApple({ title, author, media: "audiobook", country: "us" }),
    searchApple({ title, author, country: "us" }), searchApple({ title, author, country: "gb" }), searchApple({ title, author, country: "ca" }), searchApple({ title, author, country: "nz" })]);
  for (const r of wide.filter(loose)) if (fresh(r.cover_url)) yield r.cover_url;
  for (const u of editions(wide.filter(loose), 40)) if (fresh(u)) yield u;
  // 5. Goodreads
  const gr = await goodreadsCover(book);
  if (fresh(gr)) yield gr;
  if (!gr && author) { const g2 = await goodreadsCover({ title: book.title, authors: "" }); if (fresh(g2)) yield g2; }
}
function imageOk(url, ms = 12000) {
  return new Promise(res => {
    const im = new Image(), t = setTimeout(() => res(false), ms);
    im.onload = () => { clearTimeout(t); res(im.naturalWidth > 40 && im.naturalHeight > 40); };
    im.onerror = () => { clearTimeout(t); res(false); };
    im.src = url;
  });
}
const coverUrlToKeep = u => u.replace("?default=false", "");
async function findCoverUrl(book) {
  try { for await (const u of coverCandidates(book)) if (await imageOk(u)) return coverUrlToKeep(u); } catch (e) { /* offline */ }
  return "";
}
/* several working covers to choose from (for Find a cover on one book) */
async function findCoverChoices(book, max = 9) {
  const found = [], checks = [];   // [rank, url]: best guesses keep their place in the list
  try {
    for await (const u of coverCandidates(book)) {
      const rank = checks.length;
      checks.push(imageOk(u, 10000).then(ok => { if (ok) found.push([rank, coverUrlToKeep(u)]); }));
      if (checks.length % 6 === 0) await Promise.all(checks);
      if (found.length >= max) break;
    }
  } catch (e) { /* offline */ }
  await Promise.all(checks);
  return found.sort((a, b) => a[0] - b[0]).slice(0, max).map(x => x[1]);
}
async function gatherEvidence(book, results, deep = true) {
  const same = results.filter(r => sameBook(book, r));
  let ev = same.map(r => r.evidence || r.subjects || "").filter(Boolean).join(" | ");
  if (deep && ["", "literary"].includes(suggestGenres(ev))) {
    const g = same.find(r => r.gid);
    if (g) { try { ev += " | " + (await googleCategories(g.gid)).join(" | "); } catch (e) { /* offline */ } }
  }
  return ev;
}
async function genreEvidence(book) {
  const args = book.isbn ? { isbn: cleanIsbn(book.isbn) } : { title: searchTitle(book.title), author: firstAuthor(book.authors) };
  let results = [];
  try { results = await findMetadata(args); } catch (e) { return ""; }
  return gatherEvidence(book, results);
}

/* ---------------- sync (same rules as the Windows app) ---------------- */
function mergeBook(a, b) {
  const out = { uid: a.uid, field_times: {} };
  const ta = a.field_times || {}, tb = b.field_times || {};
  SYNC_FIELDS.forEach(f => {
    const x = ta[f] || BASE_TIME, y = tb[f] || BASE_TIME;
    out[f] = (y > x ? b : a)[f];
    out.field_times[f] = x > y ? x : y;
  });
  const coverSrc = (tb.cover_url || BASE_TIME) > (ta.cover_url || BASE_TIME) ? b : a;
  if (out.cover_url === "own:") out.own_cover = coverSrc.own_cover || (coverSrc === b ? a : b).own_cover || null;
  return out;
}
function mergeStates(states) {
  const books = {}, deleted = {}, trophies = {}, goals = {};
  states.forEach(st => {
    Object.entries(st.deleted || {}).forEach(([u, ts]) => { if (ts > (deleted[u] || "")) deleted[u] = ts; });
    (st.books || []).forEach(b => { if (b.uid) books[b.uid] = books[b.uid] ? mergeBook(books[b.uid], b) : Object.assign({}, b); });
    Object.entries(st.trophies || {}).forEach(([id, t]) => {
      if (!trophies[id] || (t.earned_at || "~") < (trophies[id].earned_at || "~")) trophies[id] = t;
    });
    Object.entries(st.goals || {}).forEach(([y, g]) => { if (!goals[y] || (g.set_at || "") > (goals[y].set_at || "")) goals[y] = g; });
  });
  const kept = Object.values(books).filter(b => {
    const last = Object.values(b.field_times || {}).reduce((m, x) => x > m ? x : m, BASE_TIME);
    return (deleted[b.uid] || "") < last;
  }).sort((a, b) => (a.added_at || "") < (b.added_at || "") ? -1 : 1);
  return { app: "Spine Hunter", version: 1, saved_at: nowIso(), books: kept, deleted, trophies, goals };
}
function exportState() {
  const books = S.books.map(b => {
    const out = { uid: b.uid, field_times: Object.fromEntries(SYNC_FIELDS.map(f => [f, (b.field_times || {})[f] || BASE_TIME])) };
    SYNC_FIELDS.forEach(f => { out[f] = b[f] === undefined ? null : b[f]; });
    if (b.cover_url === "own:" && b.own_cover) out.own_cover = b.own_cover;
    return out;
  });
  return { app: "Spine Hunter", version: 1, books, deleted: S.deleted, trophies: S.trophies, goals: S.goals };
}
async function applyMerged(m) {
  const before = new Map(S.books.map(b => [b.uid, JSON.stringify(b.field_times)]));
  let added = 0, updated = 0;
  m.books.forEach(b => { if (!before.has(b.uid)) added++; else if (before.get(b.uid) !== JSON.stringify(b.field_times)) updated++; });
  const removed = S.books.filter(b => !m.books.some(x => x.uid === b.uid)).length;
  const gone = S.books.filter(b => !m.books.some(x => x.uid === b.uid)).map(b => b.uid);
  const changed = new Set(m.books.filter(b => !before.has(b.uid) || before.get(b.uid) !== JSON.stringify(b.field_times)).map(b => b.uid));
  S.books = m.books.map(b => Object.assign(newBook(), b, { pages: b.pages === "" ? null : b.pages, rating: +b.rating || 0 }));
  S.deleted = m.deleted; S.trophies = m.trophies; S.goals = m.goals;
  await Store.putBooks(S.books.filter(b => changed.has(b.uid)));
  gone.forEach(uid => Store.delBook(uid));
  await saveMeta();
  return { added, updated, removed };
}

/* ---------------- trophies (same challenges as the Windows app) ---------------- */
const TROPHY_BY_ID = Object.fromEntries(TROPHY_META.map(t => [t.id, t]));
const TIERS = SHARED.TIERS;
const res = (done, books = [], when = "", progress = null) => ({ done, books, when: when || "", progress });
const dkey = d => !d ? "0000-00-00" : d.length === 4 ? d + "-12-31" : d.length === 7 ? d + "-28" : d;
const pubYear = b => { const m = String(b.year || "").trim().match(/^-?\d{3,4}/); return m ? parseInt(m[0], 10) : null; };
const finYear = b => b.end_date ? +b.end_date.slice(0, 4) : new Date().getFullYear();
function makeCtx(books, goals) {
  const finished = books.filter(b => b.status === "Finished").slice().sort((a, b) => dkey(a.end_date) < dkey(b.end_date) ? -1 : dkey(a.end_date) > dkey(b.end_date) ? 1 : 0);
  const byYear = {};
  finished.forEach(b => { if (b.end_date) (byYear[+b.end_date.slice(0, 4)] = byYear[+b.end_date.slice(0, 4)] || []).push(b); });
  return { all: books, finished, goals, byYear };
}
const rCount = (n, pred, pool = "finished") => c => {
  const items = (pool === "finished" ? c.finished : c.all).filter(b => !pred || pred(b));
  return items.length >= n ? res(true, items.slice(0, n), pool === "finished" ? items[n - 1].end_date : "", [n, n]) : res(false, items, "", [items.length, n]);
};
const rPages = total => c => {
  let run = 0; const used = [];
  for (const b of c.finished) if (b.pages) { run += +b.pages; used.push(b); if (run >= total) return res(true, used, b.end_date, [total, total]); }
  return res(false, used, "", [run, total]);
};
const uniq = list => [...new Map(list.map(b => [b.uid, b])).values()];
const rDistinct = (keyfn, n) => c => {
  const firsts = new Map();
  for (const b of c.finished) for (const k of keyfn(b)) {
    if (k !== null && k !== undefined && k !== "" && !firsts.has(k)) { firsts.set(k, b); if (firsts.size >= n) return res(true, uniq([...firsts.values()]), b.end_date, [n, n]); }
  }
  return res(false, uniq([...firsts.values()]), "", [firsts.size, n]);
};
const rSameAuthor = n => c => {
  const g = {}; let best = [];
  for (const b of c.finished) { const k = nameKey(firstAuthor(b.authors)); if (!k) continue; (g[k] = g[k] || []).push(b); if (g[k].length === n) return res(true, g[k], b.end_date, [n, n]); if (g[k].length > best.length) best = g[k]; }
  return res(false, best, "", [best.length, n]);
};
const rInMonth = n => c => {
  const m = {}; let best = [];
  for (const b of c.finished) if ((b.end_date || "").length >= 7) { const k = b.end_date.slice(0, 7); (m[k] = m[k] || []).push(b); if (m[k].length === n) return res(true, m[k], b.end_date, [n, n]); if (m[k].length > best.length) best = m[k]; }
  return res(false, best, "", [best.length, n]);
};
const rStreak = n => c => {
  const firsts = {};
  c.finished.forEach(b => { if ((b.end_date || "").length >= 7 && !firsts[b.end_date.slice(0, 7)]) firsts[b.end_date.slice(0, 7)] = b; });
  let run = [], best = [];
  for (const m of Object.keys(firsts).sort()) {
    run = run.length && addMonths(run[run.length - 1], 1) === m ? run.concat([m]) : [m];
    if (run.length > best.length) best = run;
    if (run.length === n) { const bs = run.map(x => firsts[x]); return res(true, bs, bs[bs.length - 1].end_date, [n, n]); }
  }
  return res(false, best.map(x => firsts[x]), "", [best.length, n]);
};
const rSeason = (months, n, pred) => c => {
  const g = {}; let best = [];
  for (const b of c.finished) {
    const d = b.end_date || ""; if (d.length < 7) continue;
    const mo = +d.slice(5, 7); if (!months.includes(mo) || (pred && !pred(b))) continue;
    const sid = mo === 12 ? +d.slice(0, 4) + 1 : +d.slice(0, 4);
    (g[sid] = g[sid] || []).push(b); if (g[sid].length === n) return res(true, g[sid], d, [n, n]); if (g[sid].length > best.length) best = g[sid];
  }
  return res(false, best, "", [best.length, n]);
};
const need = (kind, target) => ({ hit: target, beat: Math.ceil(target * 5 / 4), double: target * 2 }[kind] || target);
const rGoal = kind => c => {
  const years = Object.keys(c.goals).map(Number).sort((a, b) => a - b);
  if (kind === "set") return res(years.length > 0, [], "", [years.length ? 1 : 0, 1]);
  const hits = [];
  years.forEach(y => { const t = c.goals[y], books = c.byYear[y] || [], nd = need(kind, t); if (t && books.length >= nd) hits.push([y, books.slice(0, nd)]); });
  if (kind === "three") return hits.length >= 3 ? res(true, hits.slice(0, 3).map(h => h[1][h[1].length - 1]), hits[2][1][hits[2][1].length - 1].end_date, [3, 3]) : res(false, hits.map(h => h[1][h[1].length - 1]), "", [hits.length, 3]);
  if (hits.length) return res(true, hits[0][1], hits[0][1][hits[0][1].length - 1].end_date, [1, 1]);
  const y = new Date().getFullYear();
  return c.goals[y] ? res(false, c.byYear[y] || [], "", [(c.byYear[y] || []).length, need(kind, c.goals[y])]) : res(false, [], "", [0, 1]);
};
const rYearCount = n => c => {
  let best = [];
  for (const y of Object.keys(c.byYear).map(Number).sort((a, b) => a - b)) { const bs = c.byYear[y]; if (bs.length >= n) return res(true, bs.slice(0, n), bs[n - 1].end_date, [n, n]); if (bs.length > best.length) best = bs; }
  return res(false, best, "", [best.length, n]);
};
const rFiveStarRun = n => c => {
  let run = [];
  for (const b of c.finished) { if (!b.rating) continue; run = +b.rating === 5 ? run.concat([b]) : []; if (run.length === n) return res(true, run, b.end_date, [n, n]); }
  return res(false, run, "", [run.length, n]);
};
const rSameDay = c => {
  const seen = {};
  for (const b of c.finished) { const d = b.end_date || ""; if (d.length === 10) { if (seen[d]) return res(true, [seen[d], b], d, [1, 1]); seen[d] = b; } }
  return res(false, [], "", [0, 1]);
};
const genresOf = b => parseGenres(b.genres);
const combosOf = b => { const gs = genresOf(b); return COMBOS.filter(c => c[2].every(g => gs.includes(g))).map(c => c[0]); };
const hasGenre = g => b => genresOf(b).includes(g);
const hasCombo = k => b => combosOf(b).includes(k);
const took = (lo, hi) => b => { const d = daysBetween(b.start_date, b.end_date); return d !== null && (lo == null || d >= lo) && (hi == null || d <= hi); };
const pagesAtLeast = n => b => (+b.pages || 0) >= n;
const finishedOn = md => b => (b.end_date || "").length === 10 && b.end_date.slice(5) === md;
const ageAtLeast = y => b => pubYear(b) !== null && finYear(b) - pubYear(b) >= y;
const authorKey = b => [nameKey(firstAuthor(b.authors)) || null];
const RULES = {
  books_1: rCount(1), books_5: rCount(5), books_10: rCount(10), books_25: rCount(25), books_50: rCount(50), books_75: rCount(75),
  books_100: rCount(100), books_150: rCount(150), books_200: rCount(200), books_250: rCount(250), books_365: rCount(365), books_500: rCount(500),
  pages_1k: rPages(1000), pages_5k: rPages(5000), pages_10k: rPages(10000), pages_25k: rPages(25000), pages_50k: rPages(50000),
  pages_100k: rPages(100000), pages_150k: rPages(150000), pages_250k: rPages(250000),
  big_500: rCount(1, pagesAtLeast(500)), big_700: rCount(1, pagesAtLeast(700)), big_1000: rCount(1, pagesAtLeast(1000)),
  big_trio: rCount(3, pagesAtLeast(600)), small_150: rCount(1, b => (+b.pages || 0) > 0 && +b.pages < 150),
  small_five: rCount(5, b => (+b.pages || 0) > 0 && +b.pages < 200),
  col_5genres: rDistinct(genresOf, 5), col_all_genres: rDistinct(genresOf, 13), col_5combos: rDistinct(combosOf, 5), col_all_combos: rDistinct(combosOf, 10),
  speed_day: rCount(1, took(null, 0)), speed_3: rCount(1, took(null, 3)), speed_week500: rCount(1, b => (+b.pages || 0) >= 500 && took(null, 7)(b)),
  month_4: rInMonth(4), month_6: rInMonth(6), month_10: rInMonth(10), streak_3: rStreak(3), streak_6: rStreak(6), streak_12: rStreak(12),
  goal_set: rGoal("set"), goal_hit: rGoal("hit"), goal_beat: rGoal("beat"), goal_double: rGoal("double"), goal_three: rGoal("three"), year_52: rYearCount(52),
  auth_3: rSameAuthor(3), auth_5: rSameAuthor(5), auth_10: rDistinct(authorKey, 10), auth_25: rDistinct(authorKey, 25),
  auth_50: rDistinct(authorKey, 50), auth_100: rDistinct(authorKey, 100),
  time_100: rCount(1, ageAtLeast(100)), time_200: rCount(1, ageAtLeast(200)), time_1000: rCount(1, ageAtLeast(1000)),
  time_new: rCount(1, b => b.end_date && pubYear(b) === +b.end_date.slice(0, 4)),
  time_decades: rDistinct(b => pubYear(b) ? [Math.floor(pubYear(b) / 10)] : [], 5),
  time_centuries: rDistinct(b => pubYear(b) ? [Math.floor(pubYear(b) / 100)] : [], 3),
  notes_10: rCount(10, b => (b.notes || "").trim(), "all"), notes_50: rCount(50, b => (b.notes || "").trim(), "all"),
  rate_25: rCount(25, b => +b.rating, "all"), five_star: rCount(1, b => +b.rating === 5),
  dates_10: rCount(10, b => daysBetween(b.start_date, b.end_date) !== null), toread_10: rCount(10, b => b.status === "To read", "all"),
  s_october: rCount(1, b => genresOf(b).includes("horror") && (b.end_date || "").slice(5, 7) === "10"),
  s_february: rCount(1, b => genresOf(b).includes("romance") && (b.end_date || "").slice(5, 7) === "02"),
  s_newyear: rCount(1, finishedOn("01-01")), s_christmas: rCount(1, finishedOn("12-25")),
  s_summer: rSeason([12, 1, 2], 5), s_winter: rSeason([6, 7, 8], 5),
  x_dnf: rCount(1, b => b.status === "Did not finish", "all"), x_onestar: rCount(1, b => +b.rating === 1), x_sameday: rSameDay,
  x_slow: rCount(1, took(180, null)), x_oneword: rCount(1, b => (stripSeries(b.title).match(/[\w'-]+/g) || []).length === 1),
  x_bookish: rCount(1, b => /\b(books?|librar(y|ies|ian)|readers?)\b/.test((b.title || "").toLowerCase())),
  x_fivestar_run: rFiveStarRun(3),
};
GENRE_KEYS.forEach(g => { RULES["g_" + g] = rCount(1, hasGenre(g)); });
COMBOS.forEach(([k]) => { RULES["c_" + k] = rCount(1, hasCombo(k)); });

function evaluateTrophies() {
  const goals = Object.fromEntries(Object.entries(S.goals).map(([y, g]) => [+y, +g.target]));
  const ctx = makeCtx(S.books, goals), out = {};
  TROPHY_META.forEach(t => { if (RULES[t.id]) { try { out[t.id] = RULES[t.id](ctx); } catch (e) { out[t.id] = res(false); } } });
  return out;
}
async function awardTrophies() {
  const results = evaluateTrophies(), fresh = [], today = todayIso();
  TROPHY_META.forEach(t => {
    if (S.trophies[t.id]) return;
    let r;
    if (t.id === "platinum") r = res(TROPHY_META.every(x => x.id === "platinum" || S.trophies[x.id] || fresh.includes(x.id)));
    else r = results[t.id];
    if (r && r.done) { S.trophies[t.id] = { earned_at: today, when_text: r.when, book_uids: r.books.map(b => b.uid) }; fresh.push(t.id); }
  });
  if (fresh.length) await saveMeta();
  return { fresh, results };
}
