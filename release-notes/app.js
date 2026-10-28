const CATEGORIES = [
  "Projects",
  "Shipments",
  "Inspections",
  "Tasks",
  "Quoting",
  "Clients",
  "Finance",
  "Astra AI",
];
const TYPES = ["New", "Improved", "Fixed"];
const READ_KEY = "silq-release-notes-read-v1";
const FEEDBACK_KEY = "silq-release-notes-feedback-v1";

const state = {
  notes: [],
  read: new Set(),
  feedback: {},
  loading: true,
  searchDraft: "",
  openFilter: null,
  popover: false,
  path: "/release-notes",
  slug: null,
  params: new URLSearchParams(),
};

let lastUrl = location.href;
let writingUrl = false;
let searchTimer = 0;
let toastTimer = 0;

const CHEVRON = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>';
const CALLOUT_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/></svg>';

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function isoFromDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function longDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthLabel(iso) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function presetRange(id) {
  const today = new Date();
  const to = isoFromDate(today);
  if (id === "year") return { from: `${today.getFullYear()}-01-01`, to };
  const from = new Date(today);
  from.setDate(today.getDate() - (id === "90" ? 89 : 29));
  return { from: isoFromDate(from), to };
}

function activePreset() {
  const from = state.params.get("from");
  const to = state.params.get("to");
  if (!from || !to) return null;
  return ["30", "90", "year"].find((id) => {
    const range = presetRange(id);
    return range.from === from && range.to === to;
  }) || null;
}

function readLocation() {
  const hash = location.hash.replace(/^#/, "");
  let path = "/release-notes";
  const hashParams = new URLSearchParams();
  if (hash.startsWith("/release-notes")) {
    const queryAt = hash.indexOf("?");
    path = queryAt === -1 ? hash : hash.slice(0, queryAt);
    if (queryAt !== -1) {
      new URLSearchParams(hash.slice(queryAt + 1)).forEach((value, key) => {
        hashParams.set(key, value);
      });
    }
  }
  const params = new URLSearchParams(location.search);
  hashParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  const match = path.match(/^\/release-notes\/([^/]+)\/?$/);
  return {
    path: match ? `/release-notes/${decodeURIComponent(match[1])}` : "/release-notes",
    slug: match ? decodeURIComponent(match[1]) : null,
    params,
  };
}

function applyLocation() {
  const loc = readLocation();
  state.path = loc.path;
  state.slug = loc.slug;
  state.params = loc.params;
  state.searchDraft = loc.params.get("q") || "";
}

function writeUrl(path, params, replace) {
  const clean = new URLSearchParams();
  params.forEach((value, key) => {
    if (value) clean.set(key, value);
  });
  const qs = clean.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}#${path}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next === current) return;
  writingUrl = true;
  history[replace ? "replaceState" : "pushState"](null, "", next);
  lastUrl = location.href;
  writingUrl = false;
}

function go(path, params, replace) {
  state.popover = false;
  state.openFilter = null;
  writeUrl(path, params, replace);
  applyLocation();
  document.getElementById("app").classList.remove("nav-open");
  paint({ resetScroll: true });
}

async function loadNotes() {
  try {
    const response = await fetch("notes.json", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) return data;
    }
  } catch (error) {
    /* file:// cannot fetch the sibling JSON; notes.js is the fallback */
  }
  return Array.isArray(window.RELEASE_NOTES) ? window.RELEASE_NOTES : [];
}

function initRead() {
  const raw = localStorage.getItem(READ_KEY);
  if (raw == null) {
    state.read = new Set(state.notes.filter((note) => note.date < "2026-10-01").map((note) => note.id));
    localStorage.setItem(READ_KEY, JSON.stringify([...state.read]));
    return;
  }
  try {
    state.read = new Set(JSON.parse(raw));
  } catch (error) {
    state.read = new Set();
  }
}

function initFeedback() {
  try {
    const saved = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "{}");
    state.feedback = saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    state.feedback = {};
  }
}

function markRead(id) {
  if (!id || state.read.has(id)) return;
  state.read.add(id);
  localStorage.setItem(READ_KEY, JSON.stringify([...state.read]));
}

function findNote(slug) {
  return state.notes.find((note) => note.slug === slug);
}

function filteredNotes() {
  const query = state.searchDraft.trim().toLowerCase();
  const category = state.params.get("category");
  const type = state.params.get("type");
  const from = state.params.get("from");
  const to = state.params.get("to");
  return state.notes.filter((note) => {
    if (category && !(note.category || []).includes(category)) return false;
    if (type && note.type !== type) return false;
    if (from && note.date < from) return false;
    if (to && note.date > to) return false;
    if (!query) return true;
    const haystack = [note.title, note.summary, note.body, note.type, ...(note.category || [])]
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function relatedNotes(note) {
  return state.notes
    .filter((item) => item.id !== note.id)
    .map((item) => ({
      item,
      score: (item.category || []).filter((category) => note.category.includes(category)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
    .slice(0, 3)
    .map((entry) => entry.item);
}

function shot(kind, alt, variant) {
  const scenes = {
    map: '<rect width="320" height="180" fill="#E7F5FF"/><path d="M24 132C78 120 96 48 154 78s78 62 142-18" fill="none" stroke="#308268" stroke-width="3"/><circle cx="52" cy="124" r="6" fill="#308268"/><circle cx="154" cy="78" r="6" fill="#308268"/><circle cx="236" cy="108" r="7" fill="#F5A731"/><circle cx="292" cy="62" r="6" fill="#308268"/>',
    documents: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="78" y="22" width="164" height="136" rx="6" fill="#fff" stroke="#E0E0E0"/><rect x="96" y="40" width="88" height="8" rx="2" fill="#D5D5D5"/><rect x="96" y="58" width="128" height="6" rx="2" fill="#EBEBEB"/><rect x="96" y="72" width="116" height="6" rx="2" fill="#EBEBEB"/><rect x="96" y="94" width="128" height="28" rx="4" fill="#EBEDFF"/>',
    table: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="28" y="28" width="264" height="22" fill="#EBEBEB"/><rect x="28" y="58" width="264" height="18" fill="#fff"/><rect x="28" y="80" width="264" height="18" fill="#EAF3F0"/><rect x="28" y="102" width="264" height="18" fill="#fff"/><rect x="28" y="124" width="264" height="18" fill="#fff"/><rect x="40" y="64" width="70" height="6" rx="2" fill="#B1B1B1"/>',
    astra: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="36" y="36" width="150" height="36" rx="8" fill="#fff" stroke="#E0E0E0"/><rect x="124" y="88" width="160" height="48" rx="8" fill="#EBEDFF"/><circle cx="52" cy="54" r="8" fill="#334BFA"/>',
    rates: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="36" y="40" width="120" height="10" rx="2" fill="#308268"/><rect x="36" y="64" width="180" height="10" rx="2" fill="#334BFA"/><rect x="36" y="88" width="90" height="10" rx="2" fill="#F5A731"/><rect x="36" y="112" width="150" height="10" rx="2" fill="#909090"/>',
    timeline: '<rect width="320" height="180" fill="#F8F8F8"/><path d="M48 24v132" stroke="#D5D5D5" stroke-width="2"/><circle cx="48" cy="46" r="6" fill="#308268"/><circle cx="48" cy="90" r="6" fill="#334BFA"/><circle cx="48" cy="134" r="6" fill="#909090"/><rect x="68" y="38" width="120" height="8" rx="2" fill="#464646"/><rect x="68" y="82" width="150" height="8" rx="2" fill="#464646"/><rect x="68" y="126" width="100" height="8" rx="2" fill="#464646"/>',
    tasks: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="40" y="36" width="16" height="16" rx="3" fill="#308268"/><path d="M44 44l3 3 6-7" stroke="#fff" stroke-width="1.6" fill="none"/><rect x="68" y="40" width="140" height="8" rx="2" fill="#464646"/><rect x="40" y="70" width="16" height="16" rx="3" stroke="#B1B1B1" fill="#fff"/><rect x="68" y="74" width="110" height="8" rx="2" fill="#909090"/><rect x="40" y="104" width="16" height="16" rx="3" stroke="#B1B1B1" fill="#fff"/><rect x="68" y="108" width="160" height="8" rx="2" fill="#909090"/>',
    invoice: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="70" y="24" width="180" height="132" rx="6" fill="#fff" stroke="#E0E0E0"/><rect x="88" y="40" width="80" height="8" rx="2" fill="#D5D5D5"/><rect x="88" y="64" width="144" height="6" rx="2" fill="#EBEBEB"/><rect x="88" y="80" width="144" height="6" rx="2" fill="#EBEBEB"/><rect x="88" y="112" width="144" height="24" rx="4" fill="#FEF5E8"/>',
    share: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="36" y="64" width="248" height="36" rx="6" fill="#fff" stroke="#D5D5D5"/><rect x="48" y="78" width="150" height="8" rx="2" fill="#334BFA"/><rect x="214" y="72" width="56" height="20" rx="4" fill="#308268"/>',
    pdf: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="96" y="16" width="128" height="148" rx="4" fill="#fff" stroke="#E0E0E0"/><rect x="110" y="32" width="60" height="8" rx="2" fill="#052868"/><rect x="110" y="56" width="100" height="6" rx="2" fill="#EBEBEB"/><rect x="110" y="70" width="100" height="6" rx="2" fill="#EBEBEB"/><rect x="110" y="84" width="100" height="6" rx="2" fill="#FEF5E8"/><rect x="110" y="110" width="100" height="10" rx="2" fill="#202020"/>',
    utilization: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="36" y="48" width="200" height="8" rx="2" fill="#464646"/><rect x="36" y="78" width="248" height="12" rx="6" fill="#EBEBEB"/><rect x="36" y="78" width="176" height="12" rx="6" fill="#0B5394"/><rect x="36" y="108" width="90" height="8" rx="2" fill="#909090"/>',
    route: '<rect width="320" height="180" fill="#F8F8F8"/><path d="M40 90h240" stroke="#D5D5D5" stroke-width="2"/><circle cx="48" cy="90" r="8" fill="#308268"/><circle cx="160" cy="90" r="8" fill="#fff" stroke="#334BFA" stroke-width="3"/><circle cx="272" cy="90" r="8" fill="#334BFA"/><rect x="28" y="108" width="48" height="8" rx="2" fill="#909090"/><rect x="248" y="108" width="48" height="8" rx="2" fill="#909090"/>',
    network: '<rect width="320" height="180" fill="#F8F8F8"/><path d="M80 90h160M160 50v80" stroke="#D5D5D5" stroke-width="2"/><circle cx="80" cy="90" r="16" fill="#EBEDFF"/><circle cx="160" cy="50" r="16" fill="#EAF3F0"/><circle cx="240" cy="90" r="16" fill="#FEF5E8"/><circle cx="160" cy="130" r="16" fill="#E7F5FF"/>',
    queue: '<rect width="320" height="180" fill="#F8F8F8"/><rect x="28" y="32" width="264" height="28" rx="4" fill="#fff"/><circle cx="48" cy="46" r="5" fill="#F5A731"/><rect x="64" y="42" width="120" height="8" rx="2" fill="#464646"/><rect x="28" y="72" width="264" height="28" rx="4" fill="#fff"/><circle cx="48" cy="86" r="5" fill="#F5A731"/><rect x="64" y="82" width="90" height="8" rx="2" fill="#464646"/><rect x="28" y="112" width="264" height="28" rx="4" fill="#fff"/><circle cx="48" cy="126" r="5" fill="#CF222E"/><rect x="64" y="122" width="140" height="8" rx="2" fill="#464646"/>',
  };
  const scene = scenes[kind] || scenes.map;
  const hero = variant === "hero" ? " shot-hero" : "";
  return `<div class="shot${hero}" role="img" aria-label="${esc(alt)}"><div class="shot-chrome"><i></i><i></i><i></i></div><svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${scene}</svg></div>`;
}

function media(src, alt, variant) {
  if (typeof src === "string" && src.startsWith("placeholder:")) {
    return shot(src.slice("placeholder:".length), alt, variant);
  }
  if (typeof src === "string" && /^https:\/\//.test(src)) {
    return `<img src="${esc(src)}" alt="${esc(alt)}" />`;
  }
  return shot("map", alt, variant);
}

function inline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const image = line.match(/^!\[(.*)]\(([^)]+)\)\s*$/);
    if (image) {
      html.push(media(image[2], image[1], "inline"));
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
      index += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const parts = [];
      while (index < lines.length && lines[index].startsWith("> ")) {
        parts.push(lines[index].slice(2));
        index += 1;
      }
      const text = parts.join(" ");
      const tone = /^\*\*Heads up:\*\*/.test(text) ? "warning" : /^\*\*Tip:\*\*/.test(text) ? "tip" : "";
      html.push(`<div class="callout ${tone}">${CALLOUT_ICON}<p>${inline(text)}</p></div>`);
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(`<li>${inline(lines[index].slice(2))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(## |### |- |> |!\[)/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return html.join("");
}

function typePill(type) {
  const name = type === "Fixed" ? "fixed" : type === "Improved" ? "improved" : "new";
  return `<span class="pill pill-${name}">${esc(type)}</span>`;
}

function statusPill(status) {
  if (status !== "Beta" && status !== "GA") return "";
  return `<span class="pill pill-${status === "Beta" ? "beta" : "ga"}">${esc(status)}</span>`;
}

function tags(categories) {
  return (categories || []).map((category) => `<span class="tag">${esc(category)}</span>`).join("");
}

function thumb(direction) {
  const path = direction === "up"
    ? "M7 11v9H4v-9h3zm0 0 4.2-7.2a2 2 0 0 1 1.8-1.1L14 11h5.2a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18.2 21H7"
    : "M7 13V4H4v9h3zm0 0 4.2 7.2a2 2 0 0 0 1.8 1.1L14 13h5.2a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 18.2 3H7";
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${path}"/></svg>`;
}

function dateChipValue() {
  const preset = activePreset();
  if (preset === "30") return "Last 30 days";
  if (preset === "90") return "Last 90 days";
  if (preset === "year") return "This year";
  const from = state.params.get("from");
  const to = state.params.get("to");
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  if (from) return `after ${shortDate(from)}`;
  if (to) return `before ${shortDate(to)}`;
  return "";
}

function chipButton(filter, label, value) {
  const selected = value ? " is-selected" : "";
  const body = value
    ? `${esc(label)} <span class="is">is</span> ${esc(value)}`
    : esc(label);
  return `<button class="chip${selected}" type="button" data-action="filter" data-filter="${filter}" aria-expanded="${state.openFilter === filter}">${body} ${CHEVRON}</button>`;
}

function optionButton(filter, value, selected) {
  return `<button type="button" class="${selected ? "is-selected" : ""}" data-action="select" data-filter="${esc(filter)}" data-value="${esc(value)}"><span>${esc(value)}</span>${selected ? CHECK : ""}</button>`;
}

function chipsHtml() {
  const category = state.params.get("category") || "";
  const type = state.params.get("type") || "";
  const dateValue = dateChipValue();
  const categoryMenu = state.openFilter === "category"
    ? `<div class="menu" role="listbox">${CATEGORIES.map((item) => optionButton("category", item, item === category)).join("")}${category ? `<button class="menu-clear" type="button" data-action="clear-one" data-filter="category">Clear</button>` : ""}</div>`
    : "";
  const typeMenu = state.openFilter === "type"
    ? `<div class="menu" role="listbox">${TYPES.map((item) => optionButton("type", item, item === type)).join("")}${type ? `<button class="menu-clear" type="button" data-action="clear-one" data-filter="type">Clear</button>` : ""}</div>`
    : "";
  const preset = activePreset();
  const dateMenu = state.openFilter === "date"
    ? `<div class="menu menu-date">
        <button type="button" class="${preset === "30" ? "is-selected" : ""}" data-action="preset" data-preset="30"><span>Last 30 days</span>${preset === "30" ? CHECK : ""}</button>
        <button type="button" class="${preset === "90" ? "is-selected" : ""}" data-action="preset" data-preset="90"><span>Last 90 days</span>${preset === "90" ? CHECK : ""}</button>
        <button type="button" class="${preset === "year" ? "is-selected" : ""}" data-action="preset" data-preset="year"><span>This year</span>${preset === "year" ? CHECK : ""}</button>
        <div class="date-fields">
          <label>From<input id="date-from" type="date" value="${esc(state.params.get("from") || "")}"></label>
          <label>To<input id="date-to" type="date" value="${esc(state.params.get("to") || "")}"></label>
        </div>
        ${dateValue ? `<button class="menu-clear" type="button" data-action="clear-one" data-filter="date">Clear</button>` : ""}
      </div>`
    : "";
  const dirty = state.searchDraft || category || type || dateValue;
  return `<div class="chip-wrap">${chipButton("category", "Category", category)}${categoryMenu}</div>
    <div class="chip-wrap">${chipButton("type", "Type", type)}${typeMenu}</div>
    <div class="chip-wrap">${chipButton("date", "Date range", dateValue)}${dateMenu}</div>
    ${dirty ? `<button class="clear-all" type="button" data-action="clear-all">Clear all</button>` : ""}`;
}

function cardHtml(note, compact) {
  const unread = !state.read.has(note.id);
  const mediaHtml = media(note.imageUrl, note.title, compact ? "thumb" : "thumb");
  if (compact) {
    return `<button class="related-card" type="button" data-action="detail" data-slug="${esc(note.slug)}">
      ${mediaHtml}
      <span class="note-body">
        <span class="note-title">${esc(note.title)}</span>
        <span class="note-tags">${tags(note.category)}${typePill(note.type)}</span>
      </span>
    </button>`;
  }
  return `<button class="note-card" type="button" data-action="detail" data-slug="${esc(note.slug)}">
    ${mediaHtml}
    <span class="note-body">
      <span class="note-title">${unread ? '<span class="unread-dot" aria-label="Unread"></span>' : ""}${esc(note.title)}</span>
      <span class="summary">${esc(note.summary)}</span>
      <span class="note-meta">
        <span class="note-tags">${tags(note.category)}${typePill(note.type)}${statusPill(note.status)}</span>
        <span class="note-date">${esc(longDate(note.date))}</span>
      </span>
    </span>
  </button>`;
}

function feedHtml() {
  const notes = filteredNotes();
  if (!notes.length) {
    return `<div class="no-results">
      <div class="no-results-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg></div>
      <h2>No matching release notes</h2>
      <p>Nothing matches this search and these filters. Clear them to see the full list.</p>
      <button class="btn btn-secondary" type="button" data-action="clear-all">Clear filters</button>
    </div>`;
  }
  const groups = [];
  notes.forEach((note) => {
    const key = note.date.slice(0, 7);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, label: monthLabel(note.date), notes: [] };
      groups.push(group);
    }
    group.notes.push(note);
  });
  return groups.map((group) => `<section class="month"><h2>${esc(group.label)}</h2><div class="stack">${group.notes.map((note) => cardHtml(note)).join("")}</div></section>`).join("");
}

function skeletonHtml() {
  const card = `<div class="skel-card"><div class="bone skel-thumb"></div><div class="skel-lines"><span class="bone" style="width:46%"></span><span class="bone" style="width:92%"></span><span class="bone" style="width:70%"></span><span class="bone" style="width:40%"></span></div></div>`;
  return `<div class="page" aria-busy="true" aria-live="polite">
    <div class="toolbar"><div class="bone skel-search" style="flex:1"></div><div class="bone skel-chip"></div><div class="bone skel-chip"></div><div class="bone skel-chip"></div></div>
    <div class="stack">${card}${card}${card}${card}</div>
  </div>`;
}

function emptyHtml() {
  return `<div class="page"><div class="empty">
    <div class="empty-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 13.4 8 18 9.4 13.4 10.8 12 15.2 10.6 10.8 6 9.4 10.6 8 12 3.5Z"/></svg></div>
    <h2>No release notes yet</h2>
    <p>When a product update ships, it will show up here for your team to read.</p>
  </div></div>`;
}

function listHtml() {
  if (state.loading || state.params.get("demo") === "loading") return skeletonHtml();
  if (state.params.get("demo") === "empty" || state.notes.length === 0) return emptyHtml();
  const draft = esc(state.searchDraft);
  return `<div class="page">
    <div class="toolbar">
      <div class="search${state.searchDraft ? " has-value" : ""}" id="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="release-search" type="search" placeholder="Search release notes" value="${draft}" autocomplete="off" aria-label="Search release notes">
        <div class="search-actions">
          <button class="search-clear" type="button" data-action="clear-search" aria-label="Clear search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
          <button class="search-go" type="button" data-action="search-go" aria-label="Search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg></button>
        </div>
      </div>
      <div class="chips" id="chips">${chipsHtml()}</div>
    </div>
    <div id="feed">${feedHtml()}</div>
  </div>`;
}

function detailHtml() {
  const note = findNote(state.slug);
  if (!note) {
    return `<div class="page"><div class="empty missing">
      <h2>This release note is unavailable</h2>
      <p>The link may be out of date. Head back to the list to see current updates.</p>
      <button class="btn btn-secondary" type="button" data-action="list">Back to release notes</button>
    </div></div>`;
  }
  markRead(note.id);
  const vote = state.feedback[note.id] || "";
  const related = relatedNotes(note);
  const href = typeof note.ctaHref === "string" && note.ctaHref.startsWith("/") && !note.ctaHref.startsWith("//")
    ? note.ctaHref
    : "/projects?config=active";
  return `<div class="page">
    <article class="article">
      <h1>${esc(note.title)}</h1>
      <div class="article-meta">
        <span class="note-date">${esc(longDate(note.date))}</span>
        ${tags(note.category)}
        ${typePill(note.type)}
        ${statusPill(note.status)}
      </div>
      ${media(note.imageUrl, note.title, "hero")}
      <div class="prose">${renderMarkdown(note.body)}</div>
      <div><a class="btn btn-primary" href="${esc(href)}" data-action="deeplink" data-href="${esc(href)}">${esc(note.ctaLabel || "Try it")}</a></div>
    </article>
    ${related.length ? `<section class="related"><h2>Related updates</h2>${related.map((item) => cardHtml(item, true)).join("")}</section>` : ""}
    <div class="feedback">
      <p>Was this helpful?</p>
      <button class="vote${vote === "up" ? " is-selected" : ""}" type="button" data-action="feedback" data-id="${esc(note.id)}" data-vote="up" aria-pressed="${vote === "up"}" aria-label="Yes, this was helpful">${thumb("up")}</button>
      <button class="vote${vote === "down" ? " is-selected" : ""}" type="button" data-action="feedback" data-id="${esc(note.id)}" data-vote="down" aria-pressed="${vote === "down"}" aria-label="No, this was not helpful">${thumb("down")}</button>
      ${vote ? '<span class="thanks">Thanks, this helps us improve release notes.</span>' : ""}
    </div>
  </div>`;
}

function updateUnread() {
  const count = state.notes.filter((note) => !state.read.has(note.id)).length;
  document.querySelectorAll("[data-unread-count]").forEach((node) => {
    node.hidden = count === 0;
    node.textContent = count > 9 ? "9+" : String(count);
  });
  document.querySelectorAll("[data-unread-dot]").forEach((node) => {
    node.hidden = count === 0;
  });
}

function renderTitle() {
  const title = document.getElementById("page-title");
  if (state.loading || !state.slug) {
    title.textContent = "Release Notes";
    document.title = "Release Notes · Silq";
    return;
  }
  const note = findNote(state.slug);
  const current = note ? note.title : "Not found";
  title.innerHTML = `<button class="crumb" type="button" data-action="list">Release Notes</button><svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.5 5 12.5 10 7.5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="current">${esc(current)}</div>`;
  document.title = `${current} · Release Notes · Silq`;
}

function renderPopover() {
  const pop = document.getElementById("whats-new-pop");
  const button = document.getElementById("whats-new-btn");
  button.classList.toggle("is-open", state.popover);
  button.setAttribute("aria-expanded", String(state.popover));
  pop.hidden = !state.popover;
  if (!state.popover) return;
  const latest = state.notes.slice(0, 3);
  const items = latest.map((note) => `<button class="pop-item" type="button" data-action="detail" data-slug="${esc(note.slug)}">
      <span class="pop-dot${state.read.has(note.id) ? "" : " is-unread"}"></span>
      <span>
        <span class="pop-title">${esc(note.title)}</span>
        <span class="pop-summary">${esc(note.summary)}</span>
        <span class="pop-date">${esc(longDate(note.date))}</span>
      </span>
    </button>`).join("");
  pop.innerHTML = `<p class="pop-kicker">What's new</p>${items || "<p class=\"pop-summary\">No release notes yet.</p>"}<button class="pop-foot" type="button" data-action="view-all">View all</button>`;
}

function renderFeed() {
  const feed = document.getElementById("feed");
  const chips = document.getElementById("chips");
  if (!feed || !chips) {
    paint();
    return;
  }
  const view = document.getElementById("view");
  const scroll = view.scrollTop;
  feed.innerHTML = feedHtml();
  chips.innerHTML = chipsHtml();
  view.scrollTop = scroll;
}

function paint({ resetScroll = false } = {}) {
  renderTitle();
  updateUnread();
  renderPopover();
  const view = document.getElementById("view");
  const scroll = view.scrollTop;
  view.innerHTML = state.loading ? skeletonHtml() : state.slug ? detailHtml() : listHtml();
  view.scrollTop = resetScroll ? 0 : scroll;
  updateUnread();
}

function syncSearchUrl() {
  const params = new URLSearchParams(state.params);
  const query = state.searchDraft.trim();
  if (query) params.set("q", query);
  else params.delete("q");
  writeUrl("/release-notes", params, true);
  applyLocation();
  state.searchDraft = query;
}

function showToast(href) {
  const toast = document.getElementById("toast");
  toast.hidden = false;
  toast.innerHTML = `<strong>Opens in Silq</strong><span>${esc(href)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function onClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    let changed = false;
    if (state.openFilter && !event.target.closest(".chip-wrap")) {
      state.openFilter = null;
      changed = true;
    }
    if (state.popover && !event.target.closest(".whats-new-wrap")) {
      state.popover = false;
      changed = true;
    }
    if (changed) paint();
    return;
  }
  const action = actionEl.dataset.action;
  if (action === "deeplink") event.preventDefault();
  if (action === "collapse") {
    const app = document.getElementById("app");
    if (window.innerWidth <= 960) {
      app.classList.remove("nav-open");
      return;
    }
    app.classList.toggle("is-collapsed");
    return;
  }
  if (action === "toggle") {
    const app = document.getElementById("app");
    if (app.classList.contains("is-collapsed") && window.innerWidth > 960) {
      app.classList.remove("is-collapsed");
    }
    actionEl.closest(".nav-block").classList.toggle("is-open");
    return;
  }
  if (action === "open-nav") {
    document.getElementById("app").classList.add("nav-open");
    return;
  }
  if (action === "close-nav") {
    document.getElementById("app").classList.remove("nav-open");
    return;
  }
  if (action === "popover") {
    state.popover = !state.popover;
    renderPopover();
    return;
  }
  if (action === "filter") {
    const name = actionEl.dataset.filter;
    state.openFilter = state.openFilter === name ? null : name;
    state.popover = false;
    renderPopover();
    renderFeed();
    return;
  }
  if (action === "select") {
    const params = new URLSearchParams(state.params);
    const key = actionEl.dataset.filter;
    if (params.get(key) === actionEl.dataset.value) params.delete(key);
    else params.set(key, actionEl.dataset.value);
    go("/release-notes", params);
    return;
  }
  if (action === "preset") {
    const params = new URLSearchParams(state.params);
    const range = presetRange(actionEl.dataset.preset);
    params.set("from", range.from);
    params.set("to", range.to);
    go("/release-notes", params);
    return;
  }
  if (action === "clear-one") {
    const params = new URLSearchParams(state.params);
    if (actionEl.dataset.filter === "date") {
      params.delete("from");
      params.delete("to");
    } else params.delete(actionEl.dataset.filter);
    go("/release-notes", params);
    return;
  }
  if (action === "clear-all" || action === "view-all") {
    state.searchDraft = "";
    go("/release-notes", new URLSearchParams());
    return;
  }
  if (action === "clear-search") {
    state.searchDraft = "";
    const params = new URLSearchParams(state.params);
    params.delete("q");
    go("/release-notes", params, true);
    return;
  }
  if (action === "search-go") {
    clearTimeout(searchTimer);
    syncSearchUrl();
    renderFeed();
    return;
  }
  if (action === "list") {
    go("/release-notes", state.params);
    return;
  }
  if (action === "detail") {
    go(`/release-notes/${actionEl.dataset.slug}`, state.params);
    return;
  }
  if (action === "deeplink") {
    showToast(actionEl.dataset.href || actionEl.getAttribute("href") || "");
    return;
  }
  if (action === "feedback") {
    const id = actionEl.dataset.id;
    const vote = actionEl.dataset.vote;
    if (state.feedback[id] === vote) delete state.feedback[id];
    else state.feedback[id] = vote;
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(state.feedback));
    paint();
  }
}

function onInput(event) {
  if (event.target.id !== "release-search") return;
  state.searchDraft = event.target.value;
  document.getElementById("search")?.classList.toggle("has-value", Boolean(state.searchDraft));
  renderFeed();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(syncSearchUrl, 250);
}

function onChange(event) {
  if (event.target.id !== "date-from" && event.target.id !== "date-to") return;
  const params = new URLSearchParams(state.params);
  const from = document.getElementById("date-from")?.value || "";
  const to = document.getElementById("date-to")?.value || "";
  if (from) params.set("from", from);
  else params.delete("from");
  if (to) params.set("to", to);
  else params.delete("to");
  state.openFilter = "date";
  writeUrl("/release-notes", params, true);
  applyLocation();
  state.openFilter = "date";
  paint();
}

function onKeydown(event) {
  if (event.key === "Enter" && event.target.id === "release-search") {
    event.preventDefault();
    clearTimeout(searchTimer);
    syncSearchUrl();
  }
  if (event.key !== "Escape") return;
  const app = document.getElementById("app");
  if (!state.popover && !state.openFilter && !app.classList.contains("nav-open")) return;
  state.popover = false;
  state.openFilter = null;
  app.classList.remove("nav-open");
  paint();
}

function onUrlChange() {
  if (writingUrl || location.href === lastUrl) return;
  lastUrl = location.href;
  state.openFilter = null;
  state.popover = false;
  applyLocation();
  paint();
}

document.body.addEventListener("click", onClick);
document.body.addEventListener("input", onInput);
document.body.addEventListener("change", onChange);
document.body.addEventListener("keydown", onKeydown);
window.addEventListener("popstate", onUrlChange);
window.addEventListener("hashchange", onUrlChange);

applyLocation();
if (!location.hash.startsWith("#/release-notes")) {
  writeUrl("/release-notes", state.params, true);
  applyLocation();
}
paint();

loadNotes().then(async (notes) => {
  state.notes = notes.slice().sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  initRead();
  initFeedback();
  await new Promise((resolve) => setTimeout(resolve, 600));
  state.loading = false;
  paint({ resetScroll: true });
});
