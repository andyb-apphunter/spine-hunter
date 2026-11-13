"use strict";
/* Spine Hunter - Google sign-in and your journal in the cloud (Firebase).
   Data: users/{uid}/books/{bookId} and users/{uid}/meta/journal (trophies, goals, settings).
   Each device keeps an offline copy, so the app works without a connection and catches up later.
   Only you can read or write your own journal (see the Firestore rules in the setup notes). */

const APP_VERSION = "0.9.1";
const Cloud = { app: null, auth: null, db: null, user: null, unsub: [], ready: false };

function cleanForCloud(o) {
  // Firestore can't store 'undefined'
  const out = {};
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out;
}
const bookRef = uid => FB.doc(Cloud.db, "users", Cloud.user.uid, "books", uid);
const metaRef = () => FB.doc(Cloud.db, "users", Cloud.user.uid, "meta", "journal");
function cloudError(e) { console.error(e); toast("Couldn't save to your account. It'll retry when you're online."); }

/* Writes go into the offline copy straight away and reach the cloud when there's a connection,
   so they're never awaited (an unanswered network call would freeze the app offline). */
const Store = {
  putBook(book, changed) {
    if (!Cloud.user) return;
    let data;
    if (!changed || changed.length >= SYNC_FIELDS.length) data = cleanForCloud(Object.assign({}, book));
    else {
      data = { uid: book.uid, field_times: book.field_times || {} };
      changed.forEach(f => { data[f] = book[f] === undefined ? null : book[f]; });
      if (changed.includes("cover_url")) data.own_cover = book.own_cover || null;
    }
    FB.setDoc(bookRef(book.uid), data, { merge: true }).catch(cloudError);
  },
  delBook(uid) { if (Cloud.user) FB.deleteDoc(bookRef(uid)).catch(cloudError); },
  async putBooks(list) {
    if (!Cloud.user) return;
    for (let i = 0; i < list.length; i += 400) {
      const batch = FB.writeBatch(Cloud.db);
      list.slice(i, i + 400).forEach(b => batch.set(bookRef(b.uid), cleanForCloud(Object.assign({}, b))));
      batch.commit().catch(cloudError);
    }
  },
  putMeta() {
    if (!Cloud.user) return;
    FB.setDoc(metaRef(), { trophies: S.trophies || {}, goals: S.goals || {}, settings: cleanForCloud(S.settings || {}) }, { merge: true }).catch(cloudError);
  },
};

/* ---------------- sign-in screen ---------------- */
function showSignIn(message) {
  document.body.classList.add("signed-out");
  $("#signin").classList.remove("hidden");
  $("#signin-msg").textContent = message || "";
}
function hideSignIn() { document.body.classList.remove("signed-out"); $("#signin").classList.add("hidden"); }
async function signIn() {
  const provider = new FB.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  $("#signin-msg").textContent = "Opening Google…";
  try { await FB.signInWithPopup(Cloud.auth, provider); }
  catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
      try { await FB.signInWithRedirect(Cloud.auth, provider); return; } catch (e2) { e = e2; }
    }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") { $("#signin-msg").textContent = ""; return; }
    if (e.code === "auth/unauthorized-domain") { $("#signin-msg").textContent = "This web address isn't allowed to sign in yet. Add it under Firebase › Authentication › Settings › Authorised domains."; return; }
    if (e.code === "auth/network-request-failed") { $("#signin-msg").textContent = "No internet connection. Connect once to sign in; after that Spine Hunter also works offline."; return; }
    $("#signin-msg").textContent = "Sign-in didn't work: " + (e.message || e.code);
  }
}
async function signOutNow() {
  if (!(await ask("Sign out", "Sign out of Spine Hunter on this device? Your journal stays safe in your account. Sign in again to see it.", "Sign out"))) return;
  await FB.signOut(Cloud.auth);
}

/* ---------------- loading your journal and keeping it up to date ---------------- */
let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    // don't redraw under someone typing in the search box
    if (document.activeElement && document.activeElement.id === "q") return scheduleRender();
    render();
  }, 150);
}
function startData(user) {
  Cloud.user = user; Cloud.ready = false;
  S.books = []; S.trophies = {}; S.goals = {}; S.settings = {}; S.deleted = {};
  let gotBooks = false, gotMeta = false;
  const firstLoad = () => { if (gotBooks && gotMeta && !Cloud.ready) { Cloud.ready = true; afterFirstLoad(); } };
  Cloud.unsub.push(FB.onSnapshot(FB.collection(Cloud.db, "users", user.uid, "books"), snap => {
    S.books = snap.docs.map(d => Object.assign(newBook(), d.data(), { uid: d.id }));
    gotBooks = true; firstLoad(); if (Cloud.ready) scheduleRender();
  }, e => { console.error(e); toast("Couldn't load your books: " + (e.code || e.message)); }));
  Cloud.unsub.push(FB.onSnapshot(metaRef(), snap => {
    const m = snap.exists() ? snap.data() : {};
    S.trophies = m.trophies || {}; S.goals = m.goals || {}; S.settings = m.settings || {};
    gotMeta = true; firstLoad(); if (Cloud.ready) scheduleRender();
  }, e => console.error(e)));
}
async function afterFirstLoad() {
  render();
  if (!S.books.length) await offerOldBooks();
  if (S.books.length) checkTrophies();
  else if (!Array.isArray(S.settings.met)) { S.settings.met = []; saveMeta(); }   // new journal: every creature is a discovery
}
async function offerOldBooks() {
  // books saved in this browser by the earlier (pre-sign-in) version of Spine Hunter
  const old = await loadOldLocal();
  if (!old.books.length || S.settings.movedLocal) return;
  if (!(await ask("Bring your books across?", `This browser has ${old.books.length} books from the earlier version of Spine Hunter. Move them into your account so they're on all your devices?`, "Move them"))) return;
  const merged = mergeStates([exportState(), { books: old.books, trophies: old.trophies, goals: old.goals, deleted: {} }]);
  const counts = await applyMerged(merged);
  S.settings.movedLocal = nowIso(); Store.putMeta();
  render();
  await notify("Done", `${counts.added} books are now in your account.`);
}

/* ---------------- start ---------------- */
function startCloud() {
  if (!window.FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith("PASTE")) {
    showSignIn("Setup needed: the Firebase settings haven't been added to config.js yet.");
    $("#signin-btn").disabled = true;
    return;
  }
  Cloud.app = FB.initializeApp(FIREBASE_CONFIG);
  Cloud.auth = FB.getAuth(Cloud.app);
  Cloud.db = FB.initializeFirestore(Cloud.app, { localCache: FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }) });
  if (location.hostname === "localhost" && new URLSearchParams(location.search).has("emulator")) {
    FB.connectAuthEmulator(Cloud.auth, "http://localhost:9099", { disableWarnings: true });
    FB.connectFirestoreEmulator(Cloud.db, "localhost", 8080);
  }
  FB.getRedirectResult(Cloud.auth).catch(() => {});
  FB.onAuthStateChanged(Cloud.auth, user => {
    Cloud.unsub.forEach(u => u()); Cloud.unsub = [];
    if (!user) { Cloud.user = null; S.books = []; closeScreen(); closeSheet(); showSignIn(); render(); return; }
    hideSignIn();
    startData(user);
  });
}
