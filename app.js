"use strict";

// SitterCircle: a static prototype. There is no backend: people are invented,
// replies are simulated with timers, and bookings/swap hours live in localStorage.

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

const KIDS = [
  { id: "mia", name: "Mia", age: 4 },
  { id: "noah", name: "Noah", age: 7 },
];

// Trust is the core idea of the brief ("someone they've never actually vetted"),
// so people are grouped by how the parent knows them, never by a public rating.
const TIERS = [
  { id: "used", title: "Have looked after your kids", hint: "You know them. The safest choice." },
  { id: "vouched", title: "Vouched for by your circle", hint: "You haven't used them yet, but parents you trust have." },
  { id: "verified", title: "Verified, but nobody you know has used them", hint: "ID checked by SitterCircle. Consider a short meet-up first." },
];

// kind: "swap" = another parent, paid in swap hours; "paid" = sitter with an hourly rate.
// freeDays uses JS weekday numbers (0 = Sunday); freeFrom/freeTo are hours, 24 = midnight.
const PEOPLE = [
  { id: "anna", name: "Anna Weber", kind: "swap", about: "Mum of Lea (5). Lives on your street.", trust: "used", sitsForYou: 4, vouchedBy: [], firstAid: true, idChecked: true, distanceKm: 0.3, freeDays: [1, 2, 3, 4, 6], freeFrom: 18, freeTo: 23 },
  { id: "lena", name: "Lena Fischer", kind: "paid", rate: 14, about: "Education student. Has sat for you since spring.", trust: "used", sitsForYou: 6, vouchedBy: [], firstAid: true, idChecked: true, distanceKm: 0.8, freeDays: [1, 2, 3, 4, 5], freeFrom: 15, freeTo: 22 },
  { id: "mehmet", name: "Mehmet Yılmaz", kind: "swap", about: "Dad of twins (6), same Kita as Mia.", trust: "used", sitsForYou: 2, vouchedBy: [], firstAid: false, idChecked: true, distanceKm: 1.1, freeDays: [0, 5, 6], freeFrom: 16, freeTo: 23 },
  { id: "sofia", name: "Sofia Rossi", kind: "paid", rate: 13, about: "Nursing student who loves board games.", trust: "vouched", sitsForYou: 0, vouchedBy: ["anna", "lena"], firstAid: true, idChecked: true, distanceKm: 1.6, freeDays: [0, 1, 2, 3, 4, 5, 6], freeFrom: 17, freeTo: 24 },
  { id: "jonas", name: "Jonas Becker", kind: "swap", about: "Dad of Emil (4), in Mia's Kita group.", trust: "vouched", sitsForYou: 0, vouchedBy: ["mehmet"], firstAid: true, idChecked: false, distanceKm: 0.6, freeDays: [3, 4, 6], freeFrom: 18, freeTo: 22 },
  { id: "priya", name: "Priya Nair", kind: "paid", rate: 18, about: "Professional nanny, 8 years' experience.", trust: "vouched", sitsForYou: 0, vouchedBy: ["anna"], firstAid: true, idChecked: true, distanceKm: 2.3, freeDays: [0, 2, 3, 4, 5, 6], freeFrom: 8, freeTo: 20 },
  { id: "tomas", name: "Tomás García", kind: "paid", rate: 12, about: "Sports student, coaches kids' football.", trust: "verified", sitsForYou: 0, vouchedBy: [], firstAid: true, idChecked: true, distanceKm: 0.9, freeDays: [0, 1, 2, 3, 4, 5, 6], freeFrom: 18, freeTo: 24 },
  { id: "clara", name: "Clara Neumann", kind: "paid", rate: 15, about: "Retired primary-school teacher.", trust: "verified", sitsForYou: 0, vouchedBy: [], firstAid: false, idChecked: true, distanceKm: 3.1, freeDays: [1, 2, 3, 4, 5, 6], freeFrom: 7, freeTo: 19 },
];

const PEOPLE_BY_ID = new Map(PEOPLE.map((p) => [p.id, p]));
const TIER_ORDER = TIERS.map((t) => t.id);
const STORAGE_KEY = "sittercircle.v1";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const $ = (selector) => document.querySelector(selector);

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toISODate(date) {
  // Built from local parts: toISOString() would shift to UTC and can land on the wrong day.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toISODate(d);
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const shortDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function formatDate(iso) {
  return dateFormat.format(parseISODate(iso));
}

function parseTime(value) {
  const [h, m] = value.split(":").map(Number);
  return h + m / 60;
}

function formatHour(hours) {
  const wrapped = hours % 24;
  const h = Math.floor(wrapped);
  const m = Math.round((wrapped - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatHours(n) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

function hueFor(id) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function firstName(person) {
  return person.name.split(" ")[0];
}

function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function listNames(personIds) {
  return joinNames(personIds.map((id) => firstName(PEOPLE_BY_ID.get(id))));
}

function kidNames(kidIds) {
  return joinNames(kidIds.map((id) => KIDS.find((k) => k.id === id).name));
}

let toastTimer = null;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

// ---------------------------------------------------------------------------
// Persistent state (bookings + swap ledger)
// ---------------------------------------------------------------------------

function seedState() {
  return {
    bookings: [],
    ledger: [
      { id: "seed-1", date: daysFromToday(-26), personId: "anna", hours: 3, note: "You looked after Lea" },
      { id: "seed-2", date: daysFromToday(-19), personId: "mehmet", hours: -2.5, note: "Mehmet looked after Mia & Noah" },
      { id: "seed-3", date: daysFromToday(-12), personId: "anna", hours: 4, note: "You looked after Lea" },
      { id: "seed-4", date: daysFromToday(-5), personId: "anna", hours: -2, note: "Anna looked after Mia & Noah" },
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.bookings) && Array.isArray(parsed.ledger)) return parsed;
    }
  } catch (err) {
    // Private windows or blocked storage: the app still works, it just forgets on reload.
    console.warn("SitterCircle: could not read saved data", err);
  }
  return seedState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("SitterCircle: could not save data", err);
  }
}

const state = loadState();

function swapBalance() {
  return state.ledger.reduce((sum, entry) => sum + entry.hours, 0);
}

// ---------------------------------------------------------------------------
// Availability + search
// ---------------------------------------------------------------------------

// The current search: { date, weekday, from, to, kids, note } or null.
let search = null;
// personId -> { status: "pending" | "accepted" | "declined" | "withdrawn", message }
let requests = new Map();
const replyTimers = new Map();

function availabilityFor(person, slot) {
  if (!person.freeDays.includes(slot.weekday)) return { status: "busy", label: "Not free that day" };
  if (slot.from >= person.freeFrom && slot.to <= person.freeTo) {
    return { status: "free", label: "Free the whole time" };
  }
  const overlap = Math.min(slot.to, person.freeTo) - Math.max(slot.from, person.freeFrom);
  if (overlap > 0) {
    return { status: "partial", label: `Only free ${formatHour(person.freeFrom)}–${formatHour(person.freeTo)}` };
  }
  return { status: "busy", label: "Not free at that time" };
}

function rankedMatches(slot) {
  const availabilityRank = { free: 0, partial: 1, busy: 2 };
  return PEOPLE
    .map((person) => ({ person, availability: availabilityFor(person, slot) }))
    .sort((a, b) =>
      TIER_ORDER.indexOf(a.person.trust) - TIER_ORDER.indexOf(b.person.trust) ||
      availabilityRank[a.availability.status] - availabilityRank[b.availability.status] ||
      a.person.distanceKm - b.person.distanceKm);
}

function readSearch(form) {
  const data = new FormData(form);
  const when = data.get("when");
  let date;
  if (when === "tonight") date = daysFromToday(0);
  else if (when === "tomorrow") date = daysFromToday(1);
  else date = data.get("date");

  if (!date) return { error: "Pick a date." };
  if (date < daysFromToday(0)) return { error: "That date has already passed." };
  if (!data.get("from") || !data.get("to")) return { error: "Fill in both times." };

  const from = parseTime(data.get("from"));
  let to = parseTime(data.get("to"));
  if (to === from) return { error: "Start and end time are the same." };
  if (to < from) to += 24; // e.g. 20:00 until 01:00 runs past midnight

  if (date === daysFromToday(0)) {
    const now = new Date();
    if (from < now.getHours() + now.getMinutes() / 60) {
      return { error: `It's already past ${formatHour(from)} today. Pick a later time or another day.` };
    }
  }

  const kids = data.getAll("kids");
  if (kids.length === 0) return { error: "Choose at least one child." };

  return {
    slot: {
      date,
      weekday: parseISODate(date).getDay(),
      from,
      to,
      kids,
      note: String(data.get("note") || "").trim(),
    },
  };
}

function cancelPendingReplies() {
  for (const timer of replyTimers.values()) clearTimeout(timer);
  replyTimers.clear();
}

function bookingFor(slot) {
  return state.bookings.find((b) => b.date === slot.date && b.from === slot.from && b.to === slot.to);
}

// ---------------------------------------------------------------------------
// Asking sitters (simulated replies)
// ---------------------------------------------------------------------------

function ask(personId) {
  const person = PEOPLE_BY_ID.get(personId);
  const availability = availabilityFor(person, search);
  if (availability.status === "busy" || requests.has(personId) || bookingFor(search)) return;

  requests.set(personId, { status: "pending", message: "Waiting for a reply…" });
  const slot = search;
  // Free people answer faster than half-free ones, like real people checking their calendar.
  const delay = availability.status === "free" ? 1500 + Math.random() * 1500 : 2500 + Math.random() * 1500;
  replyTimers.set(personId, setTimeout(() => receiveReply(person, availability, slot), delay));
  renderResults();
}

function askTopThree() {
  const candidates = rankedMatches(search)
    .filter(({ person, availability }) => availability.status === "free" && !requests.has(person.id))
    .slice(0, 3);
  if (candidates.length === 0) {
    toast("Nobody else is free for the whole time. Try a shorter time or another day.");
    return;
  }
  candidates.forEach(({ person }) => ask(person.id));
  toast(`Asked ${listNames(candidates.map((c) => c.person.id))}. The first to say yes gets the booking.`);
}

function receiveReply(person, availability, slot) {
  replyTimers.delete(person.id);
  if (slot !== search) return; // the parent started a new search meanwhile

  if (availability.status === "partial") {
    requests.set(person.id, {
      status: "declined",
      message: `“Sorry, I can only do ${formatHour(person.freeFrom)}–${formatHour(person.freeTo)}.”`,
    });
  } else if (bookingFor(slot)) {
    requests.set(person.id, { status: "withdrawn", message: "Request withdrawn: you're already covered." });
  } else {
    requests.set(person.id, { status: "accepted", message: "Said yes!" });
    confirmBooking(person, slot);
    // First yes wins; everyone still pending is told politely.
    for (const [id, req] of requests) {
      if (req.status === "pending") {
        clearTimeout(replyTimers.get(id));
        replyTimers.delete(id);
        requests.set(id, { status: "withdrawn", message: "Request withdrawn: you're already covered." });
      }
    }
  }
  renderResults();
}

function confirmBooking(person, slot) {
  const hours = slot.to - slot.from;
  const booking = {
    id: `b-${Date.now()}`,
    personId: person.id,
    date: slot.date,
    from: slot.from,
    to: slot.to,
    kids: slot.kids,
    note: slot.note,
  };
  state.bookings.push(booking);
  if (person.kind === "swap") {
    state.ledger.push({
      id: `l-${booking.id}`,
      bookingId: booking.id,
      date: slot.date,
      personId: person.id,
      hours: -hours,
      note: `${firstName(person)} looks after ${kidNames(slot.kids)}`,
    });
  }
  saveState();
  toast(`${person.name} is booked for ${formatDate(slot.date)}.`);
  renderAll();
}

function cancelBooking(bookingId) {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return;
  state.bookings = state.bookings.filter((b) => b.id !== bookingId);
  state.ledger = state.ledger.filter((entry) => entry.bookingId !== bookingId);
  saveState();
  if (search && search.date === booking.date && search.from === booking.from && search.to === booking.to) {
    requests = new Map();
  }
  toast("Booking cancelled.");
  renderAll();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function costText(person, hours) {
  if (person.kind === "swap") return `${formatHours(hours)} from your swap balance`;
  return `about €${Math.round(person.rate * hours)} (${formatHours(hours)} × €${person.rate})`;
}

function personBadges(person) {
  const badges = [];
  if (person.trust === "used") {
    badges.push(`<li class="badge badge-used">Sat for you ${person.sitsForYou}×</li>`);
  }
  if (person.vouchedBy.length) {
    badges.push(`<li class="badge badge-vouched">Vouched by ${escapeHtml(listNames(person.vouchedBy))}</li>`);
  }
  if (person.trust === "verified") badges.push(`<li class="badge badge-verified">No one you know has used them</li>`);
  if (person.firstAid) badges.push(`<li class="badge">First-aid trained</li>`);
  if (person.idChecked) badges.push(`<li class="badge">ID checked</li>`);
  badges.push(`<li class="badge">${person.distanceKm.toFixed(1)} km away</li>`);
  return `<ul class="badges">${badges.join("")}</ul>`;
}

function personCard(person, actionHtml = "") {
  const priceLabel = person.kind === "swap" ? "Swap parent" : `€${person.rate}/h`;
  return `
    <li class="person tier-${person.trust}">
      <div class="avatar" style="--hue:${hueFor(person.id)}" aria-hidden="true">${escapeHtml(initials(person.name))}</div>
      <div class="person-main">
        <h3>${escapeHtml(person.name)} <span class="price">${escapeHtml(priceLabel)}</span></h3>
        <p class="about">${escapeHtml(person.about)}</p>
        ${personBadges(person)}
      </div>
      ${actionHtml ? `<div class="person-action">${actionHtml}</div>` : ""}
    </li>`;
}

function actionFor(person, availability, booked) {
  const req = requests.get(person.id);
  const availabilityLine = `<p class="avail avail-${availability.status}">${escapeHtml(availability.label)}</p>`;
  if (req) {
    return `${availabilityLine}<p class="req req-${req.status}">${req.status === "pending" ? '<span class="spinner" aria-hidden="true"></span>' : ""}${escapeHtml(req.message)}</p>`;
  }
  if (availability.status === "busy" || booked) return availabilityLine;
  const name = escapeHtml(firstName(person));
  return `${availabilityLine}<button class="btn btn-small" type="button" data-ask="${person.id}">Ask ${name}</button>`;
}

function renderResults() {
  const container = $("#results");
  if (!search) {
    container.innerHTML = "";
    return;
  }
  const booked = bookingFor(search);
  const hours = search.to - search.from;
  const matches = rankedMatches(search);
  const freeCount = matches.filter((m) => m.availability.status === "free").length;

  let html = `
    <div class="results-head">
      <div>
        <h2>${escapeHtml(formatDate(search.date))}, ${formatHour(search.from)}–${formatHour(search.to)}</h2>
        <p class="muted">${escapeHtml(kidNames(search.kids))} · ${formatHours(hours)} · ${freeCount} of ${PEOPLE.length} free the whole time</p>
      </div>
      ${booked ? "" : '<button class="btn btn-primary" type="button" data-ask-top>Ask the 3 most trusted who are free</button>'}
    </div>`;

  if (booked) {
    const person = PEOPLE_BY_ID.get(booked.personId);
    html += `
      <div class="booked-banner">
        <p><strong>You're covered.</strong> ${escapeHtml(person.name)} will look after ${escapeHtml(kidNames(booked.kids))}. Cost: ${escapeHtml(costText(person, hours))}.</p>
      </div>`;
  }

  for (const tier of TIERS) {
    const inTier = matches.filter((m) => m.person.trust === tier.id);
    html += `
      <section class="tier">
        <h3 class="tier-title"><span class="tier-dot tier-${tier.id}"></span>${escapeHtml(tier.title)}</h3>
        <p class="tier-hint">${escapeHtml(tier.hint)}</p>
        <ul class="people">
          ${inTier.map(({ person, availability }) => personCard(person, actionFor(person, availability, Boolean(booked)))).join("")}
        </ul>
      </section>`;
  }
  html += '<p class="demo-note">Demo: replies arrive automatically after a few seconds.</p>';
  container.innerHTML = html;
}

function renderUpcoming() {
  const today = daysFromToday(0);
  const upcoming = state.bookings
    .filter((b) => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);
  const container = $("#upcoming");
  if (upcoming.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="card upcoming">
      <h2>Upcoming</h2>
      <ul class="upcoming-list">
        ${upcoming.map((b) => {
          const person = PEOPLE_BY_ID.get(b.personId);
          return `
            <li>
              <div>
                <strong>${escapeHtml(formatDate(b.date))}, ${formatHour(b.from)}–${formatHour(b.to)}</strong>
                <span class="muted">${escapeHtml(person.name)} with ${escapeHtml(kidNames(b.kids))}</span>
                ${b.note ? `<span class="muted note">Note: ${escapeHtml(b.note)}</span>` : ""}
              </div>
              <button class="btn btn-ghost btn-small" type="button" data-cancel="${b.id}">Cancel</button>
            </li>`;
        }).join("")}
      </ul>
    </div>`;
}

function renderCircle() {
  $("#circle-list").innerHTML = TIERS.map((tier) => {
    const people = PEOPLE.filter((p) => p.trust === tier.id);
    return `
      <section class="tier">
        <h2 class="tier-title"><span class="tier-dot tier-${tier.id}"></span>${escapeHtml(tier.title)} <span class="count">${people.length}</span></h2>
        <ul class="people">${people.map((p) => personCard(p)).join("")}</ul>
      </section>`;
  }).join("");
}

function renderSwap() {
  const balance = swapBalance();
  $("#swap-balance").textContent = Number.isInteger(balance) ? balance : balance.toFixed(1);
  $("#header-balance").textContent = formatHours(balance);
  const entries = [...state.ledger].sort((a, b) => b.date.localeCompare(a.date));
  $("#ledger").innerHTML = entries.map((entry) => `
    <li>
      <span class="ledger-date">${escapeHtml(shortDateFormat.format(parseISODate(entry.date)))}</span>
      <span class="ledger-note">${escapeHtml(entry.note)}</span>
      <span class="ledger-hours ${entry.hours >= 0 ? "plus" : "minus"}">${entry.hours >= 0 ? "+" : "−"}${formatHours(Math.abs(entry.hours))}</span>
    </li>`).join("");
}

function renderAll() {
  renderUpcoming();
  renderResults();
  renderSwap();
}

// ---------------------------------------------------------------------------
// Tabs (WAI-ARIA tabs pattern: arrow keys move between tabs)
// ---------------------------------------------------------------------------

function selectTab(tab) {
  document.querySelectorAll('[role="tab"]').forEach((t) => {
    const selected = t === tab;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
  });
}

function setUpTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function setUpFindForm() {
  const form = $("#request-form");
  $("#kid-options").innerHTML = KIDS.map((kid) => `
    <label class="chip"><input type="checkbox" name="kids" value="${kid.id}" checked> ${escapeHtml(kid.name)} (${kid.age})</label>`).join("");

  const dateInput = form.elements.date;
  dateInput.min = daysFromToday(0);
  dateInput.value = daysFromToday(2);

  form.addEventListener("change", (event) => {
    if (event.target.name === "when") $("#date-field").hidden = event.target.value !== "other";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = readSearch(form);
    $("#form-error").textContent = result.error || "";
    if (result.error) return;
    cancelPendingReplies();
    requests = new Map();
    search = result.slot;
    renderResults();
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#results").addEventListener("click", (event) => {
    const askButton = event.target.closest("[data-ask]");
    if (askButton) ask(askButton.dataset.ask);
    if (event.target.closest("[data-ask-top]")) askTopThree();
  });

  $("#upcoming").addEventListener("click", (event) => {
    const cancelButton = event.target.closest("[data-cancel]");
    if (cancelButton) cancelBooking(cancelButton.dataset.cancel);
  });
}

function setUpLogForm() {
  const form = $("#log-form");
  const swapParents = PEOPLE.filter((p) => p.kind === "swap");
  $("#log-family").innerHTML = swapParents
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  form.elements.date.value = daysFromToday(0);
  form.elements.date.max = daysFromToday(0);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const personId = form.elements.family.value;
    const date = form.elements.date.value;
    const hours = Number(form.elements.hours.value);
    let error = "";
    if (!date) error = "Pick the date you looked after them.";
    else if (date > daysFromToday(0)) error = "You can only log hours that already happened.";
    else if (!(hours >= 0.5 && hours <= 12)) error = "Hours must be between 0.5 and 12.";
    $("#log-error").textContent = error;
    if (error) return;

    const person = PEOPLE_BY_ID.get(personId);
    state.ledger.push({
      id: `l-${Date.now()}`,
      date,
      personId,
      hours,
      note: `You looked after ${firstName(person)}'s kids`,
    });
    saveState();
    renderSwap();
    toast(`Added ${formatHours(hours)}. Thanks for helping ${firstName(person)}!`);
  });
}

setUpTabs();
setUpFindForm();
setUpLogForm();
renderCircle();
renderAll();
