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
  els.finalScore.textContent = `Score : ${state.score} / ${QUESTIONS_PER_DAY}`;

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

  els.progress.textContent = `Question ${state.current + 1} / ${QUESTIONS_PER_DAY}`;
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
    state.current >= QUESTIONS_PER_DAY - 1 ? "Voir mon score →" : "Suivant →";

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
  if (state.current >= QUESTIONS_PER_DAY - 1) {
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
   5) Démarrage
   ------------------------------------------------------------------------- */
function startApp() {
  const dayIndex = getDayIndex();

  // Sélectionne les 3 questions du jour (déterministe)
  const idx = pickDailyIndices(dayIndex, pool.length, QUESTIONS_PER_DAY);
  todaysQuestions = idx.map((i) => pool[i]);

  // Charge l'état existant et décide quoi faire
  const saved = loadState();
  if (saved && saved.dayIndex === dayIndex) {
    state = saved; // reprise (en cours ou terminée)
  } else {
    state = newGameState(dayIndex); // nouveau jour (ou première visite)
    saveState();
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
