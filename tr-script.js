// ===== CONFIG =====
const SHEET_ID = "1evNm8Cyj-P2_ful3lt5mT5Bu0aLZWaCYIKNmFtO_PSw"; 
const SHEET_GID = "0"; 
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1evNm8Cyj-P2_ful3lt5mT5Bu0aLZWaCYIKNmFtO_PSw/gviz/tq?tqx=out:csv&gid=0";

let verbs = [];            // all verbs from Excel
let pool = [];             // filtered by CEFR
let currentVerb = {};
let promptIndex = 0;       // which form is shown: 0=inf,1=past,2=participle
let savedVerbs = [];

let timerInterval;
let remainingTime = 0;

// ===== DOM =====
const timeSelect = document.getElementById("timeSelect");
const nextBtn = document.getElementById("nextBtn");
const checkBtn = document.getElementById("checkBtn");
const saveBtn = document.getElementById("saveBtn");
const warnEl = document.getElementById("warn");
const savedGrid = document.getElementById("savedGrid");

// CEFR checkboxes
const cefrGroup = document.getElementById("cefrGroup");
const cefrAllCb = document.getElementById("cefrAll");
const cefrLevelsSpan = document.getElementById("cefrLevels");
let allLevels = [];            // ["A1","A2","B1",...]
let selectedLevels = new Set();

// ===== UTIL =====
const norm = (s) => String(s ?? "").trim().toLowerCase();

const savedTrack = document.getElementById("savedTrack");
const scViewport = document.querySelector(".sc-viewport");
const scPrev = document.querySelector(".sc-prev");
const scNext = document.querySelector(".sc-next");


function parseCefrCell(val) {
  if (val == null) return [];
  const s = String(val).trim();
  if (!s) return [];
  // split on common separators and whitespace
  return s.split(/[,;\/|]+|\s+\&\s+|\s+/).map(x => x.trim()).filter(Boolean);
}

// ===== CEFR UI =====
function renderCefrCheckboxes(levels) {
  const order = { A1:1, A2:2, B1:3, B2:4, C1:5, C2:6 };
  levels = [...levels].sort((a,b) => (order[a] ?? 99) - (order[b] ?? 99) || a.localeCompare(b));
  allLevels = levels;

  cefrLevelsSpan.innerHTML = "";
  levels.forEach(lvl => {
    const id = `cefr_${lvl}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.innerHTML = `<input type="checkbox" id="${id}" value="${lvl}" checked /> ${lvl}`;
    cefrLevelsSpan.appendChild(label);
  });

  // default: all selected
  selectedLevels = new Set(levels);
  cefrAllCb.checked = true;
}

function getSelectedLevels() {
  const boxes = cefrLevelsSpan.querySelectorAll('input[type="checkbox"]');
  const picked = [];
  boxes.forEach(cb => cb.checked && picked.push(cb.value));
  return picked;
}

function applyFilter() {
  const picked = getSelectedLevels();
  selectedLevels = new Set(picked);

  if (selectedLevels.size === 0) {
    pool = [];
  } else if (selectedLevels.size === allLevels.length) {
    pool = [...verbs];
  } else {
    pool = verbs.filter(v => v.cefrTokens.some(tok => selectedLevels.has(tok)));
  }
}

// ===== TRAINER UI RESET (prevents “stacking”) =====
function resetTrainerUI() {
  // stop any old timer
  clearInterval(timerInterval);

  // clear inputs + hide all “shown” pills + RESET STYLŮ
  for (let i = 0; i < 3; i++) {
    const showEl = document.getElementById(`show${i}`);
    const inputEl = document.getElementById(`input${i}`);

    showEl.textContent = "";
    showEl.hidden = true;

    // 🔧 DŮLEŽITÉ: reset barvy a tučnosti, aby po Next nebyly zelené
    showEl.style.color = "black";
    showEl.style.fontWeight = "800";

    inputEl.value = "";
    inputEl.hidden = false;
  }

  // clear result
  const result = document.getElementById("result");
  result.innerText = "";
  result.style.color = "inherit";

  // reset timer display to current selection
  remainingTime = parseInt(timeSelect.value, 10);
  updateTimerDisplay();
}

async function loadExcel() {
  try {
    warnEl.textContent = "Loading verbs…";

    const res = await fetch(GOOGLE_SHEET_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();

    const wb = XLSX.read(csvText, { type: "string" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    const required = ["Infinitive", "Past simple", "Past participle", "CEFR"];
    const hasAll = required.every(k => Object.prototype.hasOwnProperty.call(rows[0] || {}, k));
    if (!hasAll) throw new Error(`Missing required columns: ${required.join(", ")}`);

    verbs = rows.map(r => ({
      base: norm(r["Infinitive"]),
      past: norm(r["Past simple"]),
      participle: norm(r["Past participle"]),
      categories: r["Categories"] ?? null,
      cefrRaw: r["CEFR"],
      cefrTokens: parseCefrCell(r["CEFR"]).map(x => x.toUpperCase()),
    })).filter(v => v.base && v.past && v.participle);

    const levelSet = new Set();
    verbs.forEach(v => v.cefrTokens.forEach(tok => levelSet.add(tok)));
    renderCefrCheckboxes(Array.from(levelSet));

    applyFilter();
    warnEl.textContent = "";

    resetTrainerUI();
    nextVerb();
  } catch (err) {
    console.error(err);
    warnEl.textContent = "Could not load the database";

    // fallback data
    verbs = [
      { base: "write", past: "wrote", participle: "written", cefrTokens: ["B1"] },
      { base: "hit", past: "hit", participle: "hit", cefrTokens: ["A2"] },
      { base: "remember", past: "remembered", participle: "remembered", cefrTokens: ["A2"] },
    ];
    renderCefrCheckboxes(["A2","B1"]);
    applyFilter();
    resetTrainerUI();
    nextVerb();
  }
}

// ===== TRAINER RENDERING =====
function renderSlots() {
  const values = [currentVerb.base, currentVerb.past, currentVerb.participle];
  for (let i = 0; i < 3; i++) {
    const showEl = document.getElementById(`show${i}`);
    const inputEl = document.getElementById(`input${i}`);

    if (i === promptIndex) {
      showEl.textContent = values[i] ?? "";
      showEl.hidden = false;
      inputEl.value = "";
      inputEl.hidden = true;
    } else {
      showEl.hidden = true;
      inputEl.value = "";
      inputEl.hidden = false;
      inputEl.placeholder = i === 0 ? "Infinitive" : i === 1 ? "Past simple" : "Past participle";
    }
  }
  const result = document.getElementById("result");
  result.innerText = "";
  result.style.color = "inherit";
}

function nextVerb() {
  if (!pool.length) {
    // clean UI + message
    resetTrainerUI();
    document.getElementById("show0").hidden = false;
    document.getElementById("show0").textContent = "—";
    document.getElementById("result").innerText = "No verbs for the selected CEFR levels.";
    return;
  }
  currentVerb = pool[Math.floor(Math.random() * pool.length)];
  promptIndex = Math.floor(Math.random() * 3); // which form is shown
  renderSlots();
  startTimer();
}

function checkAnswer() {
  clearInterval(timerInterval);
  const answers = [
    norm(document.getElementById("input0").value),
    norm(document.getElementById("input1").value),
    norm(document.getElementById("input2").value),
  ];
  const expected = [currentVerb.base, currentVerb.past, currentVerb.participle];

  let ok = true;
  for (let i = 0; i < 3; i++) {
    if (i === promptIndex) continue;
    if (answers[i] !== expected[i]) { ok = false; break; }
  }

  const result = document.getElementById("result");
  if (ok) {
    result.innerText = "Correct";
    result.style.color = "var(--right, #1a7f37)";
  } else {
      result.innerText = "Wrong";
      result.style.color = "var(--wrong, #b00020)";

      for (let i = 0; i < 3; i++) {
        if (i === promptIndex) continue;
        if (answers[i] !== expected[i]) {
          const showEl = document.getElementById(`show${i}`);
          const inputEl = document.getElementById(`input${i}`);

          // zobrazíme správné sloveso v šedém poli
          showEl.textContent = expected[i];
          showEl.hidden = false;
          showEl.style.color = "var(--right, green)";
          showEl.style.fontWeight = "bold";

          // schováme input
          inputEl.hidden = true;
        }
      }
  }


}

// ===== SAVED GRID =====
// function saveVerb() {
//   if (!currentVerb.base) return;
//   if (!savedVerbs.some(v => v.base === currentVerb.base)) {
//     savedVerbs.push({ ...currentVerb });
//     updateSavedGrid();
//   }
// }

function saveVerb() {
  if (!currentVerb.base) return;
  if (!savedVerbs.some(v => v.base === currentVerb.base)) {
    savedVerbs.push({ ...currentVerb });
    updateSavedGrid();
    saveToFirebase();  // << PŘIDAT TOTO
  }
}

function updateSavedGrid() {
  if (!savedTrack) return;
  savedTrack.innerHTML = "";

  savedVerbs.forEach((v, i) => {
    const wrap = document.createElement("div");
    wrap.className = "sc-card";

    const card = document.createElement("div");
    card.className = "saved-card";

    // Hlavička s číslem a názvem slovesa
    const head = document.createElement("div");
    head.className = "saved-head";

    const idx = document.createElement("span");
    idx.className = "saved-index";
    idx.textContent = String(i + 1);

    const title = document.createElement("div");
    title.className = "saved-verb";
    title.textContent = v.base;

    head.appendChild(idx);
    head.appendChild(title);

    const btn = document.createElement("button");
    btn.className = "learn-btn";
    btn.textContent = "Learn";
    btn.dataset.base = v.base;

    card.appendChild(head);
    card.appendChild(btn);
    wrap.appendChild(card);
    savedTrack.appendChild(wrap);
  });

  initSavedCarouselLoop();
}


document.addEventListener("click", (e) => {
  const btn = e.target.closest(".learn-btn");
  if (!btn) return;
  const base = btn.dataset.base;
  const match = savedVerbs.find(v => v.base === base) || pool.find(v => v.base === base) || verbs.find(v => v.base === base);
  if (match) {
    resetTrainerUI();
    currentVerb = { ...match };
    promptIndex = Math.floor(Math.random() * 3);
    renderSlots();
    startTimer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

function startTimer() {
  clearInterval(timerInterval);
  remainingTime = parseInt(timeSelect.value, 10);
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    remainingTime--;
    updateTimerDisplay();
    if (remainingTime <= 0) {
      clearInterval(timerInterval);
      const result = document.getElementById("result");
      result.innerText = "Time's up!";
      result.style.color = "var(--out-of-time, #ff8c00)";
    }
  }, 1000);
}

function updateTimerDisplay() {
  document.querySelector(".timer").textContent = `Remaining time: ${remainingTime}s`;
}

nextBtn.addEventListener("click", () => {
  resetTrainerUI();
  nextVerb();
});
checkBtn.addEventListener("click", checkAnswer);
saveBtn.addEventListener("click", saveVerb);

// CEFR checkbox interactions — ALWAYS restart cleanly, then re-filter and pick a new verb
cefrGroup.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "cefrAll") {
    const check = t.checked;
    cefrLevelsSpan.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = check);
  } else if (t.type === "checkbox") {
    const boxes = cefrLevelsSpan.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(boxes).every(cb => cb.checked);
    cefrAllCb.checked = allChecked;
  }
  applyFilter();
  resetTrainerUI();
  nextVerb();
});

function getCardStep() {
  const first = savedTrack?.querySelector(".sc-card");
  if (!first) return 160;
  const style = getComputedStyle(savedTrack);
  const gap = parseFloat(style.columnGap || style.gap || "8");
  return first.offsetWidth + gap;
}

function scrollByOne(forward = true) {
  const step = getCardStep();
  if (!scViewport) return;
  scViewport.scrollBy({ left: forward ? step : -step, behavior: "smooth" });
}

function atEnd() {
  if (!scViewport || !savedTrack) return false;
  const tolerance = 2;
  return scViewport.scrollLeft + scViewport.clientWidth >= savedTrack.scrollWidth - tolerance;
}

function atStart() {
  if (!scViewport) return false;
  const tolerance = 2;
  return scViewport.scrollLeft <= tolerance;
}


function getCardStep() {
  const first = savedTrack?.querySelector(".sc-card");
  if (!first) return 160;
  const style = getComputedStyle(savedTrack);
  const gap = parseFloat(style.gap || "8");
  return first.offsetWidth + gap;
}

function jumpToStart() {
  if (!scViewport) return;
  const prev = scViewport.style.scrollBehavior;
  scViewport.style.scrollBehavior = "auto"; 
  scViewport.scrollLeft = 0;
  void scViewport.offsetHeight;
  scViewport.style.scrollBehavior = prev || "smooth";
}

function jumpToEnd() {
  if (!scViewport || !savedTrack) return;
  const prev = scViewport.style.scrollBehavior;
  scViewport.style.scrollBehavior = "auto";
  scViewport.scrollLeft = savedTrack.scrollWidth - scViewport.clientWidth;
  void scViewport.offsetHeight;
  scViewport.style.scrollBehavior = prev || "smooth";
}

function initSavedCarouselLoop() {
  if (!scViewport || !savedTrack) return;

  scViewport.style.scrollBehavior = "auto";
  scViewport.scrollLeft = 0;
  void scViewport.offsetHeight;
  scViewport.style.scrollBehavior = "smooth";

  const step = getCardStep();

  scPrev && (scPrev.onclick = () => {
    const nearStart = scViewport.scrollLeft <= 2;
    if (nearStart) {
      jumpToEnd();
      requestAnimationFrame(() => scViewport.scrollBy({ left: -step, behavior: "smooth" }));
    } else {
      scViewport.scrollBy({ left: -step, behavior: "smooth" });
    }
  });

  scNext && (scNext.onclick = () => {
    const nearEnd = scViewport.scrollLeft + scViewport.clientWidth >= savedTrack.scrollWidth - step - 2;
    if (nearEnd) {
      jumpToStart();
      requestAnimationFrame(() => scViewport.scrollBy({ left: step, behavior: "smooth" }));
    } else {
      scViewport.scrollBy({ left: step, behavior: "smooth" });
    }
  });
}

// function saveToFirebase() {
//   if (!window.firebaseUserId || !window.firebaseDb) return;
//   const userRef = window.firebaseDb.ref(`users/${window.firebaseUserId}/savedVerbs`);
//   window.firebaseDb.ref(`users/${window.firebaseUserId}/savedVerbs`).set(savedVerbs);
// }

// function loadFromFirebase() {
//   if (!window.firebaseUserId || !window.firebaseDb) return;
//   const dbRef = window.firebaseDb.ref(`users/${window.firebaseUserId}/savedVerbs`);
//   dbRef.get().then((snapshot) => {
//     if (snapshot.exists()) {
//       savedVerbs = snapshot.val();
//       updateSavedGrid();
//     }
//   });
// }

// document.addEventListener("firebaseReady", () => {
//   loadFromFirebase();
// });

function saveToFirebase() {
  if (!window.firebaseUserId || !window.firebaseDb) return;
  const path = `users/${window.firebaseUserId}/savedVerbs`;
  const dbRef = window.firebaseRef(window.firebaseDb, path);
  window.firebaseSet(dbRef, savedVerbs);
}

function loadFromFirebase() {
  if (!window.firebaseUserId || !window.firebaseDb) return;
  const path = `users/${window.firebaseUserId}/savedVerbs`;
  const dbRef = window.firebaseRef(window.firebaseDb, path);
  window.firebaseGet(dbRef).then(snapshot => {
    if (snapshot.exists()) {
      savedVerbs = snapshot.val();
      updateSavedGrid();
    } else {
      console.log("No saved verbs yet.");
    }
  }).catch(err => {
    console.error("Firebase load error:", err);
  });
}

function loadFromFirebase() {
  if (!window.firebaseUserId || !window.firebaseDb) return;
  const path = `users/${window.firebaseUserId}/savedVerbs`;
  const dbRef = window.firebaseRef(window.firebaseDb, path);
  
  window.firebaseGet(dbRef).then(snapshot => {
    if (snapshot.exists()) {
      savedVerbs = snapshot.val();
      updateSavedGrid(); // stávající výpis do carouselu

      // nový výpis do divu
      const outEl = document.getElementById("firebase-verb-list");
      outEl.innerHTML = `<h3>Your saved verbs:</h3>`;

      savedVerbs.forEach((v, i) => {
        const line = document.createElement("div");
        line.textContent = `${i + 1}. ${v.base} – ${v.past} – ${v.participle}`;
        outEl.appendChild(line);
      });

      outEl.style.display = "block"; // zobrazit
      outEl.scrollIntoView({ behavior: "smooth" }); // přehledně skočit na seznam
    } else {
      alert("You have no saved verbs yet.");
    }
  }).catch(err => {
    console.error("Firebase load error:", err);
  });
}


document.querySelector(".quickAccessLearn").addEventListener("click", () => {
  const win = window.open("", "_blank"); // otevře novou kartu

  if (!window.firebaseUserId || !window.firebaseDb) {
    win.document.write("<p>Firebase not ready.</p>");
    return;
  }

  const path = `users/${window.firebaseUserId}/savedVerbs`;
  const dbRef = window.firebaseRef(window.firebaseDb, path);

  window.firebaseGet(dbRef).then(snapshot => {
    if (snapshot.exists()) {
      const savedVerbs = snapshot.val();

      let html = `
        <html>
          <head>
            <title>My Learning List</title>
            <style>
              body { font-family: sans-serif; padding: 20px; }
              h2 { color: #66023c; }
              li { margin-bottom: 5px; font-size: 1rem; }
            </style>
          </head>
          <body>
            <h2>Your Saved Verbs</h2>
            <ul>
              ${savedVerbs.map(v => `<li>${v.base} – ${v.past} – ${v.participle}</li>`).join("")}
            </ul>
          </body>
        </html>
      `;

      win.document.open();
      win.document.write(html);
      win.document.close();
    } else {
      win.document.write("<p>No saved verbs found.</p>");
    }
  }).catch(err => {
    console.error("Firebase load error:", err);
    win.document.write("<p>Error loading data from Firebase.</p>");
  });
});


document.addEventListener("firebaseReady", () => {
  console.log("Firebase ready, user:", window.firebaseUserId);
});


loadExcel();
