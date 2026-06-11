/* =========================================================================
   CIA ou Fiction ? — logique du jeu (JavaScript vanilla, aucune dépendance)
   Auteurs : Lucien VALVERDE & Rafik ZEMOURI — Master Cybersécurité IPSSI
   ========================================================================= */

"use strict";

const STORAGE_KEY = "cia-or-fiction:v1";
const QUESTIONS_PER_DAY = 3;

/* --- Éléments du DOM --- */
const els = {
  progress: document.getElementById("progress"),
  gameScreen: document.getElementById("game-screen"),
  finalScreen: document.getElementById("final-screen"),
  phrase: document.getElementById("phrase"),
  choices: document.getElementById("choices"),
  btnCia: document.getElementById("btn-cia"),
  btnFiction: document.getElementById("btn-fiction"),
  result: document.getElementById("result"),
  verdict: document.getElementById("verdict"),
  explication: document.getElementById("explication"),
  source: document.getElementById("source"),
  btnNext: document.getElementById("btn-next"),
  finalScore: document.getElementById("final-score"),
  finalMessage: document.getElementById("final-message"),
};

/* État courant en mémoire */
let pool = [];          // les 40 questions chargées depuis questions.json
let todaysQuestions = []; // les 3 questions du jour (sous-ensemble de pool)
let state = null;       // l'état de la partie (persisté dans localStorage)
let sessionCount = QUESTIONS_PER_DAY; // nb de questions de la session (varie en mode test)
let persist = true;     // false en mode test : aucune écriture/lecture localStorage

/* -------------------------------------------------------------------------
   1) PRNG déterministe : mulberry32
   Choix : générateur 32 bits, rapide, sans dépendance, qui produit toujours
   la même suite pour une même graine. On le seede avec le numéro du jour
   (dayIndex) pour que les 3 questions soient identiques pour tous les
   joueurs un jour donné, et qu'elles changent chaque jour.
   ------------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Numéro du jour en UTC : nombre de jours écoulés depuis l'epoch Unix.
   Le jeu bascule donc à minuit UTC. */
function getDayIndex() {
  return Math.floor(Date.now() / 86400000);
}

/* Tire QUESTIONS_PER_DAY index DISTINCTS parmi [0, pool.length[ de manière
   déterministe via un mélange de Fisher-Yates partiel seedé par dayIndex.
   Le mélange (plutôt qu'un simple modulo) assure une bonne couverture du
   pool et évite des triplets adjacents toujours identiques. */
function pickDailyIndices(dayIndex, total, count) {
  const rand = mulberry32(dayIndex);
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (total - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

/* -------------------------------------------------------------------------
   2) Persistance localStorage (avec try/catch contre les données corrompues)
   ------------------------------------------------------------------------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validation minimale de la forme attendue
    if (
      typeof parsed !== "object" ||
      typeof parsed.dayIndex !== "number" ||
      !Array.isArray(parsed.answers)
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    // Données illisibles : on repart proprement.
    console.warn("État localStorage corrompu, réinitialisation.", e);
    return null;
  }
}

function saveState() {
  if (!persist) return; // mode test : on ne sauvegarde rien
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // En cas d'échec (mode privé, quota...), le jeu reste jouable en mémoire.
    console.warn("Impossible d'écrire dans localStorage.", e);
  }
}

function newGameState(dayIndex) {
  return {
    dayIndex: dayIndex,
    current: 0,        // index de la question courante (0..2)
    answers: [],       // [{ id, given, correct }]
    score: 0,
    finished: false,
  };
}

/* -------------------------------------------------------------------------
   3) Rendu de l'interface
   ------------------------------------------------------------------------- */
function showFinalScreen() {
  els.gameScreen.hidden = true;
  els.finalScreen.hidden = false;
  els.progress.textContent = "Terminé";
  els.finalScore.textContent = `Score : ${state.score} / ${sessionCount}`;

  const messages = [
    "Aïe… les services secrets ne vous recruteront pas tout de suite.",
    "Pas mal, mais le réel dépasse parfois la fiction !",
    "Beau score, vous démêlez bien le vrai du faux.",
    "Sans faute ! Vous avez l'œil d'un véritable analyste.",
  ];
  els.finalMessage.textContent = messages[state.score] || "";
}

function renderQuestion() {
  const q = todaysQuestions[state.current];

  els.progress.textContent = `Question ${state.current + 1} / ${sessionCount}`;
  els.phrase.textContent = q.phrase;

  // Réinitialise les boutons de choix
  els.result.hidden = true;
  for (const btn of [els.btnCia, els.btnFiction]) {
    btn.disabled = false;
    btn.classList.remove("is-correct", "is-wrong");
  }

  // Si cette question a déjà été répondue (reprise de partie), on réaffiche
  // le résultat verrouillé.
  const previous = state.answers[state.current];
  if (previous) {
    lockAndReveal(previous.given, q);
  }
}

function lockAndReveal(given, q) {
  const isCorrect = given === q.type;

  // Verrouille les deux boutons
  els.btnCia.disabled = true;
  els.btnFiction.disabled = true;

  // Marque visuellement la bonne réponse et, si erreur, le mauvais choix
  const correctBtn = q.type === "cia" ? els.btnCia : els.btnFiction;
  correctBtn.classList.add("is-correct");
  if (!isCorrect) {
    const chosenBtn = given === "cia" ? els.btnCia : els.btnFiction;
    chosenBtn.classList.add("is-wrong");
  }

  // Verdict (couleur + texte/icône pour ne pas dépendre que de la couleur)
  els.verdict.textContent = isCorrect ? "✅ Correct" : "❌ Incorrect";
  els.verdict.className = "verdict " + (isCorrect ? "correct" : "incorrect");

  els.explication.textContent = q.explication;

  // Source : lien cliquable si c'est une URL, sinon simple texte
  if (/^https?:\/\//i.test(q.source)) {
    els.source.href = q.source;
    els.source.textContent = "Voir la source ↗";
    els.source.style.display = "";
  } else {
    els.source.removeAttribute("href");
    els.source.textContent = "Source : " + q.source;
    els.source.style.display = "";
  }

  // Bouton suivant ou fin
  els.btnNext.textContent =
    state.current >= sessionCount - 1 ? "Voir mon score →" : "Suivant →";

  els.result.hidden = false;
}

/* -------------------------------------------------------------------------
   4) Interactions
   ------------------------------------------------------------------------- */
function onChoice(given) {
  // Empêche un double-clic / une réponse déjà enregistrée
  if (state.answers[state.current]) return;

  const q = todaysQuestions[state.current];
  const isCorrect = given === q.type;

  state.answers[state.current] = { id: q.id, given: given, correct: isCorrect };
  if (isCorrect) state.score++;
  saveState();

  lockAndReveal(given, q);
}

function onNext() {
  if (state.current >= sessionCount - 1) {
    state.finished = true;
    saveState();
    showFinalScreen();
    return;
  }
  state.current++;
  saveState();
  renderQuestion();
}

/* -------------------------------------------------------------------------
   5) Mode test (piloté par l'URL — sans effet pour les joueurs normaux)

   Paramètres reconnus :
     ?all=1                  → défile TOUTES les questions du pool (relecture)
     ?day=12345              → force un dayIndex précis (voir le triplet du jour)
     ?pick=cia-007,fic-003   → ne teste que ces questions (dans cet ordre)
   La présence de l'un d'eux active le mode test : aucune lecture/écriture
   localStorage, et une bannière d'info s'affiche. Sans paramètre, le jeu se
   comporte exactement comme en production.
   ------------------------------------------------------------------------- */
function getTestConfig() {
  const p = new URLSearchParams(location.search);
  const all = p.has("all");
  const pickRaw = p.get("pick");
  const dayRaw = p.get("day");
  const pick = pickRaw
    ? pickRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const day =
    dayRaw !== null && dayRaw.trim() !== "" && Number.isFinite(Number(dayRaw))
      ? Math.floor(Number(dayRaw))
      : null;
  const enabled = all || (pick && pick.length > 0) || day !== null || p.has("test");
  return { enabled, all, pick, day };
}

function showTestBanner(mode, dayIndex) {
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:sticky;top:0;z-index:50;background:#7c2d12;color:#fff;" +
    "padding:.5rem .75rem;font-size:.8rem;text-align:center;border-bottom:2px solid #ea580c;";
  const a = (href, label) =>
    `<a style="color:#fde68a;text-decoration:underline" href="${href}">${label}</a>`;
  bar.innerHTML =
    `🧪 <strong>MODE TEST</strong> — ${mode} · jour ${dayIndex} · ` +
    `${a("?all=1", "toutes")} · ${a("?day=" + (dayIndex + 1), "jour +1")} · ` +
    `${a("?day=" + dayIndex, "ce triplet")} · ${a(location.pathname, "quitter")} ` +
    `<span style="opacity:.8">(aucune sauvegarde)</span>`;
  document.body.insertBefore(bar, document.body.firstChild);
}

/* -------------------------------------------------------------------------
   6) Démarrage
   ------------------------------------------------------------------------- */
function startApp() {
  const test = getTestConfig();
  const dayIndex = test.day !== null ? test.day : getDayIndex();

  // Sélection des questions selon le mode
  if (test.all) {
    todaysQuestions = pool.slice(); // toutes, dans l'ordre du fichier
  } else if (test.pick && test.pick.length) {
    todaysQuestions = test.pick
      .map((id) => pool.find((q) => q.id === id))
      .filter(Boolean);
    if (!todaysQuestions.length) {
      // aucun id valide → repli sur le triplet du jour
      todaysQuestions = pickDailyIndices(dayIndex, pool.length, QUESTIONS_PER_DAY).map(
        (i) => pool[i]
      );
    }
  } else {
    const idx = pickDailyIndices(dayIndex, pool.length, QUESTIONS_PER_DAY);
    todaysQuestions = idx.map((i) => pool[i]);
  }
  sessionCount = todaysQuestions.length;

  if (test.enabled) {
    // Mode test : pas de persistance, partie toujours fraîche, bannière visible
    persist = false;
    state = newGameState(dayIndex);
    const label = test.all
      ? "toutes les questions"
      : test.pick && test.pick.length
      ? "sélection (" + sessionCount + ")"
      : "jour forcé";
    showTestBanner(label, dayIndex);
  } else {
    // Mode normal : reprise / nouvelle partie via localStorage
    const saved = loadState();
    if (saved && saved.dayIndex === dayIndex) {
      state = saved;
    } else {
      state = newGameState(dayIndex);
      saveState();
    }
  }

  // Branche les écouteurs
  els.btnCia.addEventListener("click", () => onChoice("cia"));
  els.btnFiction.addEventListener("click", () => onChoice("fiction"));
  els.btnNext.addEventListener("click", onNext);

  // Affiche le bon écran
  if (state.finished) {
    showFinalScreen();
  } else {
    renderQuestion();
  }
}

async function init() {
  try {
    const res = await fetch("data/questions.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    pool = await res.json();
    if (!Array.isArray(pool) || pool.length < QUESTIONS_PER_DAY) {
      throw new Error("Pool de questions invalide");
    }
    startApp();
  } catch (e) {
    console.error(e);
    els.phrase.textContent =
      "Erreur de chargement des questions. Rechargez la page.";
    els.choices.style.display = "none";
  }
}

init();
