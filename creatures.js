"use strict";
/* Spine Hunter - the genre creatures: who they are, the collection, and discovering new ones */

const CREATURE_INFO = {
  fantasy: ["Pip the Wizard Dragon", "Small, mossy and convinced every book is secretly a spellbook."],
  romance: ["Rosie the Heart Bunny", "Hugs every love story a little too tightly."],
  crime: ["Inspector Fennick", "A fox who's never without a magnifying glass. Or a hunch."],
  thriller: ["Hoot", "Peeks out from behind the curtain at every twist."],
  true_crime: ["Bristle", "A hedgehog who takes notes on everything, especially the alibis."],
  mystery: ["Shadow", "Half in the light, half in the dark, all curiosity."],
  scifi: ["Bolt", "A little robot who beeps happily at anything set in space."],
  horror: ["Wisp", "A shy ghost who scares easily, and reads by candlelight anyway."],
  historical: ["Sage", "A tortoise who's been around long enough to remember most of it."],
  nonfiction: ["Professor Squeak", "A mouse who believes every fact deserves a footnote."],
  literary: ["Bramble", "A bear who reads one beautiful sentence, then naps on it."],
  comedy: ["Fizz the Party Frog", "Laughs before you even get to the punchline."],
  adventure: ["Scout", "An otter who's packed for the next quest before finishing this one."],
  fantasy_romance: ["Pip & Rosie", "A dragon, a bunny and one shared heart."],
  romcom: ["Rosie, Party Edition", "Blowing kisses and cracking jokes in equal measure."],
  crime_thriller: ["Fennick & Hoot", "Two detectives, one magnifying glass."],
  historical_romance: ["Sage the Romantic", "Still writing love letters after a hundred years."],
  cosy_mystery: ["Shadow, Off Duty", "Curled up with a cup of tea, solving it from the armchair."],
  scifi_thriller: ["Bolt, On Alert", "Glowing eyes. Something isn't right on this ship."],
  dark_romance: ["Rosie & Wisp", "A bunny, a ghost and a heart that's turned a little dark."],
  historical_fiction: ["Sage by Lamplight", "Reading the past by a warm, steady lamp."],
  horror_comedy: ["Wisp at the Party", "Still spooky. Now with a party hat."],
  fantasy_adventure: ["Pip the Explorer", "Map in claw, backpack on, off to find a hoard."],
};
const CREATURE_KEYS = GENRE_KEYS.concat(COMBOS.map(c => c[0]));
const isCombo = k => COMBOS.some(c => c[0] === k);
const creatureName = k => (CREATURE_INFO[k] || [GENRE_NAMES[k]])[0];
function creatureGenreLabel(k) {
  const c = COMBOS.find(x => x[0] === k);
  return c ? `Rare combo · ${GENRES[c[2][0]]} + ${GENRES[c[2][1]]}` : GENRES[k];
}
function howToMeet(k) {
  const c = COMBOS.find(x => x[0] === k);
  return c ? `Finish a book that's both ${GENRES[c[2][0]]} and ${GENRES[c[2][1]]}.` : `Finish a ${GENRES[k].toLowerCase()} book.`;
}

/* creatures you've met: from finished books, earliest first */
function metCreatures() {
  const met = {};
  S.books.filter(b => b.status === "Finished").sort((a, b) => dkey(a.end_date).localeCompare(dkey(b.end_date))).forEach(b => {
    genreBadges(b.genres).forEach(([k]) => { (met[k] = met[k] || []).push(b); });
  });
  return met;
}

/* small pictures (list rows, previews) */
function creatureImg(k, size, extra = "") {
  return `<img src="creatures/${k}.png" alt="${esc(creatureName(k))}" title="${esc(creatureName(k) + " · " + creatureGenreLabel(k))}" style="width:${size}px;height:${size}px" ${extra}>`;
}
/* bigger, named creatures on a book's details */
function creatureChips(genres) {
  return genreBadges(genres).map(([k]) => `<button class="beast-chip ${isCombo(k) ? "rare" : ""}" data-action="creature" data-k="${k}">
      <img src="creatures/${k}.png" alt=""><span><b>${esc(creatureName(k))}</b><small>${esc(creatureGenreLabel(k))}</small></span></button>`).join("");
}

function openCreature(k) {
  const met = metCreatures()[k] || [];
  const known = met.length > 0;
  const books = met.slice().reverse();
  openSheet(`<div class="beast-hero ${known ? "" : "unmet"} ${isCombo(k) ? "rare" : ""}"><img src="creatures/${k}.png" alt=""></div>
    <div style="text-align:center">
      <div class="label" style="margin-top:12px">${esc(creatureGenreLabel(k))}</div>
      <h2 style="margin:4px 0">${known ? esc(creatureName(k)) : "Not met yet"}</h2>
      <p class="muted" style="margin:0 0 6px;line-height:1.45">${known ? esc(CREATURE_INFO[k][1]) : esc(howToMeet(k))}</p>
      ${known ? `<div class="small">Met on <b>${esc(prettyDate(met[0].end_date) || "your first " + GENRES[k] + " book")}</b> with <b>${esc(met[0].title)}</b> · ${met.length} book${met.length > 1 ? "s" : ""} together</div>` : ""}
    </div>
    ${known ? `<div class="label" style="margin:16px 0 6px">Books with ${esc(creatureName(k).split(" ")[0])}</div>
      ${books.slice(0, 30).map(b => `<div class="row" style="margin-bottom:8px;cursor:pointer" data-action="detail" data-uid="${b.uid}">${coverHtml(b, "xs")}<div><b>${esc(b.title)}</b>
        <div class="small muted">${esc([firstAuthor(b.authors), b.end_date && prettyDate(b.end_date)].filter(Boolean).join(" · "))}</div></div></div>`).join("")}` : ""}`);
}

function renderCreatures() {
  const met = metCreatures();
  const card = k => {
    const m = met[k], known = !!m;
    return `<button class="beast ${known ? "" : "unmet"} ${isCombo(k) ? "rare" : ""}" data-action="creature" data-k="${k}">
      <img src="creatures/${k}.png" alt="">
      <b>${known ? esc(creatureName(k)) : "???"}</b>
      <small>${esc(isCombo(k) ? creatureGenreLabel(k).replace("Rare combo · ", "") : GENRES[k])}</small>
      <small class="muted">${known ? `${m.length} book${m.length > 1 ? "s" : ""}` : "Not met yet"}</small></button>`;
  };
  const singles = GENRE_KEYS, combos = COMBOS.map(c => c[0]);
  const n = CREATURE_KEYS.filter(k => met[k]).length;
  return `<div class="pad" style="margin-bottom:6px"><div class="muted small">${n} of ${CREATURE_KEYS.length} creatures met · finish books in new genres to meet them all</div></div>
    <div class="pad"><div class="label" style="margin:8px 0">Genre creatures</div><div class="bestiary">${singles.map(card).join("")}</div>
    <div class="label" style="margin:18px 0 8px">Rare combo creatures ✦</div><div class="bestiary">${combos.map(card).join("")}</div></div><div style="height:30px"></div>`;
}

/* "New creature discovered!" - shown the first time a finished book brings a new creature */
async function checkCreatures() {
  const met = Object.keys(metCreatures());
  if (!Array.isArray(S.settings.met)) {           // first run of this version: remember who's already met, no fanfare
    S.settings.met = met; saveMeta(); return;
  }
  const fresh = met.filter(k => !S.settings.met.includes(k));
  if (!fresh.length) return;
  S.settings.met = S.settings.met.concat(fresh); saveMeta();
  const one = fresh.length === 1;
  const html = one
    ? `<div class="beast-hero ${isCombo(fresh[0]) ? "rare" : ""} pop"><img src="creatures/${fresh[0]}.png" alt=""></div>
       <div style="text-align:center"><div class="label" style="margin-top:12px">${esc(creatureGenreLabel(fresh[0]))}</div>
       <h2 style="margin:4px 0">${esc(creatureName(fresh[0]))}</h2><p class="muted">${esc(CREATURE_INFO[fresh[0]][1])}</p></div>`
    : `<div class="bestiary small-grid">${fresh.map(k => `<div class="beast pop ${isCombo(k) ? "rare" : ""}"><img src="creatures/${k}.png" alt=""><b>${esc(creatureName(k))}</b><small>${esc(isCombo(k) ? "Rare combo" : GENRES[k])}</small></div>`).join("")}</div>`;
  const go = await dialog({ title: one ? (isCombo(fresh[0]) ? "Rare creature discovered!" : "New creature discovered!") : `${fresh.length} new creatures discovered!`, html,
    buttons: [["Lovely!", false, "btn ghost"], ["See all creatures", true, "btn"]] });
  if (go) { UI.tab = "trophies"; UI.trophyView = "creatures"; closeScreen(); closeSheet(); render(); }
}
