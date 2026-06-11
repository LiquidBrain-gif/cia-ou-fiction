/* =========================================================================
   CIA ou Fiction ? — logique du jeu (JavaScript vanilla, aucune dépendance)
   Auteurs : Lucien VALVERDE & Rafik ZEMOURI — Master Cybersécurité IPSSI

   Mode de jeu : ARCADE À 3 VIES.
   Le joueur enchaîne les phrases (ordre mélangé). Chaque mauvaise réponse coûte
   une vie ; tant qu'il reste des vies, on continue. À 0 vie (ou après avoir
   passé toutes les questions), la partie se termine. Le meilleur score est
   conservé. On peut rejouer à volonté.
   ========================================================================= */

"use strict";

const STORAGE_KEY = "cia-or-fiction:v2"; // v2 : nouvelle mécanique (vies)
const BEST_KEY = "cia-or-fiction:best";
const START_LIVES = 3;

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
  finalTitle: document.getElementById("final-title"),
  finalScore: document.getElementById("final-score"),
  finalMessage: document.getElementById("final-message"),
  finalBest: document.getElementById("final-best"),
  btnReplay: document.getElementById("btn-replay"),
  btnMute: document.getElementById("btn-mute"),
};

/* État courant en mémoire */
let pool = [];        // les 40 questions chargées depuis questions.json
let state = null;     // l'état de la partie (persisté dans localStorage)
let best = 0;         // meilleur score conservé
let persist = true;   // false en mode test : aucune écriture/lecture localStorage
let testCfg = { enabled: false, all: false, pick: null };

/* -------------------------------------------------------------------------
   1) Sons (Web Audio API — générés à la volée, aucun fichier audio)
   ------------------------------------------------------------------------- */
const MUTE_KEY = "cia-or-fiction:muted";
let audioCtx = null; // null = pas encore créé, false = non supporté
let muted = false;

function loadMutePref() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; }
}
function saveMutePref() {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) { /* ignore */ }
}

function getAudioCtx() {
  if (audioCtx === null) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = Ctx ? new Ctx() : false;
  }
  return audioCtx || null;
}

// Note simple (oscillateur + enveloppe douce pour éviter les « clics »).
function beep(freq, start, duration, type, peak) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function ensureAudioRunning() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Réponse : bip ascendant joyeux si correct, note grave si incorrect.
function playAnswerSound(correct) {
  if (muted) return;
  const ctx = ensureAudioRunning();
  if (!ctx) return;
  const t = ctx.currentTime;
  if (correct) {
    beep(659.25, t, 0.12, "sine", 0.2);
    beep(987.77, t + 0.1, 0.22, "sine", 0.2);
  } else {
    beep(196, t, 0.28, "square", 0.12);
    beep(146.83, t + 0.09, 0.3, "square", 0.1);
  }
}

// Fin victorieuse (toutes les questions passées) : fanfare « espion ».
function playFanfare() {
  if (muted) return;
  const ctx = ensureAudioRunning();
  if (!ctx) return;
  const t = ctx.currentTime + 0.03;
  const step = 0.16;
  const riff = [82.41, 82.41, 98.0, 82.41, 110.0, 82.41, 98.0, 116.54];
  riff.forEach((f, i) => beep(f, t + i * step, 0.14, "sawtooth", 0.12));
  const s = t + riff.length * step + 0.05;
  beep(82.41, s, 0.6, "sawtooth", 0.12);
  beep(329.63, s, 0.6, "triangle", 0.16);
  beep(392.0, s, 0.6, "triangle", 0.14);
  beep(493.88, s, 0.6, "triangle", 0.12);
}

// Game over (plus de vies) : descente sombre.
function playGameOver() {
  if (muted) return;
  const ctx = ensureAudioRunning();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  beep(196.0, t, 0.25, "sawtooth", 0.12);
  beep(164.81, t + 0.18, 0.28, "sawtooth", 0.12);
  beep(130.81, t + 0.38, 0.5, "sawtooth", 0.12);
  beep(98.0, t + 0.62, 0.75, "triangle", 0.12);
}

function updateMuteButton() {
  if (!els.btnMute) return;
  els.btnMute.textContent = muted ? "🔇" : "🔊";
  els.btnMute.setAttribute("aria-pressed", muted ? "true" : "false");
}
function toggleMute() {
  muted = !muted;
  saveMutePref();
  updateMuteButton();
}

/* -------------------------------------------------------------------------
   2) Persistance localStorage (avec try/catch contre les données corrompues)
   ------------------------------------------------------------------------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      typeof p !== "object" ||
      !Array.isArray(p.order) ||
      typeof p.pos !== "number" ||
      typeof p.lives !== "number" ||
      typeof p.score !== "number"
    ) {
      return null;
    }
    return p;
  } catch (e) {
    console.warn("État localStorage corrompu, réinitialisation.", e);
    return null;
  }
}
function saveState() {
  if (!persist) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn("Impossible d'écrire dans localStorage.", e); }
}
function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; }
  catch (e) { return 0; }
}
function saveBest() {
  if (!persist) return;
  try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
}

/* -------------------------------------------------------------------------
   3) Construction d'une partie
   ------------------------------------------------------------------------- */
// Mélange de Fisher-Yates (ordre aléatoire des questions à chaque partie).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ordre des questions selon le mode (test ?pick / ?all, sinon mélange complet).
function buildOrder() {
  const allIdx = pool.map((_, i) => i);
  if (testCfg.pick && testCfg.pick.length) {
    const idx = testCfg.pick
      .map((id) => pool.findIndex((q) => q.id === id))
      .filter((i) => i >= 0);
    if (idx.length) return idx;
  }
  if (testCfg.all) return allIdx; // ordre du fichier, pour relire
  return shuffle(allIdx);
}

function newGameState() {
  return {
    order: buildOrder(),
    pos: 0,
    lives: START_LIVES,
    score: 0,
    answered: null, // réponse donnée à la question courante (pour la reprise)
    finished: false,
  };
}

/* -------------------------------------------------------------------------
   4) Rendu
   ------------------------------------------------------------------------- */
function currentQuestion() {
  return pool[state.order[state.pos]];
}

function updateStatusBar() {
  const full = "♥".repeat(Math.max(0, state.lives));
  const empty = "♡".repeat(Math.max(0, START_LIVES - state.lives));
  // Les cœurs sont isolés dans un span pour pouvoir les agrandir en CSS.
  els.progress.innerHTML = `<span class="lives">${full}${empty}</span> · SCORE ${state.score}`;
}

function renderQuestion() {
  const q = currentQuestion();
  updateStatusBar();
  els.phrase.textContent = q.phrase;

  els.result.hidden = true;
  for (const btn of [els.btnCia, els.btnFiction]) {
    btn.disabled = false;
    btn.classList.remove("is-correct", "is-wrong");
  }

  // Reprise : si la question courante a déjà reçu une réponse, on la réaffiche.
  if (state.answered) {
    lockAndReveal(state.answered, q);
  }
}

function lockAndReveal(given, q) {
  const isCorrect = given === q.type;

  els.btnCia.disabled = true;
  els.btnFiction.disabled = true;

  const correctBtn = q.type === "cia" ? els.btnCia : els.btnFiction;
  correctBtn.classList.add("is-correct");
  if (!isCorrect) {
    (given === "cia" ? els.btnCia : els.btnFiction).classList.add("is-wrong");
  }

  els.verdict.textContent = isCorrect ? "✓ EXACT" : "✗ ERREUR";
  els.verdict.className = "verdict " + (isCorrect ? "correct" : "incorrect");

  els.explication.textContent = q.explication;

  if (/^https?:\/\//i.test(q.source)) {
    els.source.href = q.source;
    els.source.textContent = "Consulter la source ↗";
  } else {
    els.source.removeAttribute("href");
    els.source.textContent = "Source : " + q.source;
  }

  // Étiquette du bouton : fin de partie si plus de vie ou plus de question.
  const isLast = state.pos >= state.order.length - 1;
  els.btnNext.textContent =
    state.lives <= 0 || isLast ? "RAPPORT FINAL →" : "PIÈCE SUIVANTE →";

  els.result.hidden = false;
}

function showFinalScreen() {
  els.gameScreen.hidden = true;
  els.finalScreen.hidden = false;

  const survived = state.lives > 0; // a passé toutes les questions sans tomber à 0
  els.progress.textContent = survived ? "DOSSIER ÉPUISÉ" : "CAPTURÉ";
  els.finalTitle.textContent = survived ? "Dossier épuisé" : "Mission terminée";
  els.finalScore.textContent = `SCORE ${state.score}`;
  els.finalBest.textContent = `Record : ${best}`;

  let msg;
  if (survived) {
    msg = "Vous avez parcouru tout le dossier sans tomber. Maître-espion !";
  } else if (state.score === 0) {
    msg = "Démasqué d'entrée. L'Agence ne retiendra pas votre nom.";
  } else if (state.score < 5) {
    msg = "Couverture grillée un peu vite, agent.";
  } else if (state.score < 10) {
    msg = "Belle infiltration, mais le terrain a eu raison de vous.";
  } else if (state.score < 20) {
    msg = "Agent confirmé : vous avez tenu un long moment.";
  } else {
    msg = "Légende du renseignement — un sang-froid remarquable.";
  }
  els.finalMessage.textContent = msg;
}

/* -------------------------------------------------------------------------
   5) Interactions
   ------------------------------------------------------------------------- */
function onChoice(given) {
  if (state.answered) return; // déjà répondu à cette question

  const q = currentQuestion();
  const isCorrect = given === q.type;

  state.answered = given;
  if (isCorrect) state.score++;
  else state.lives--;
  saveState();

  updateStatusBar(); // reflète immédiatement la vie perdue / le score gagné
  playAnswerSound(isCorrect);
  lockAndReveal(given, q);
}

function endGame() {
  state.finished = true;
  if (persist && state.score > best) {
    best = state.score;
    saveBest();
  }
  saveState();
  if (state.lives > 0) playFanfare();
  else playGameOver();
  showFinalScreen();
}

function onNext() {
  const isLast = state.pos >= state.order.length - 1;
  if (state.lives <= 0 || isLast) {
    endGame();
    return;
  }
  state.pos++;
  state.answered = null;
  saveState();
  renderQuestion();
}

function onReplay() {
  state = newGameState();
  saveState();
  els.finalScreen.hidden = true;
  els.gameScreen.hidden = false;
  renderQuestion();
}

/* -------------------------------------------------------------------------
   6) Mode test (piloté par l'URL — sans effet pour les joueurs normaux)
     ?all=1                  → joue toutes les questions dans l'ordre du fichier
     ?pick=cia-007,fic-003   → ne joue que ces questions (dans cet ordre)
     ?test                   → partie fraîche sans sauvegarde
   Active le mode test : aucune lecture/écriture localStorage + bannière.
   ------------------------------------------------------------------------- */
function getTestConfig() {
  const p = new URLSearchParams(location.search);
  const all = p.has("all");
  const pickRaw = p.get("pick");
  const pick = pickRaw
    ? pickRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const enabled = all || (pick && pick.length > 0) || p.has("test");
  return { enabled, all, pick };
}

function showTestBanner(label) {
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:sticky;top:0;z-index:50;background:#7c2d12;color:#fff;" +
    "padding:.5rem .75rem;font-size:.8rem;text-align:center;border-bottom:2px solid #ea580c;";
  const a = (href, l) =>
    `<a style="color:#fde68a;text-decoration:underline" href="${href}">${l}</a>`;
  bar.innerHTML =
    `🧪 <strong>MODE TEST</strong> — ${label} · ` +
    `${a("?all=1", "toutes")} · ${a(location.pathname, "quitter")} ` +
    `<span style="opacity:.8">(aucune sauvegarde)</span>`;
  document.body.insertBefore(bar, document.body.firstChild);
}

/* -------------------------------------------------------------------------
   7) Démarrage
   ------------------------------------------------------------------------- */
function startApp() {
  testCfg = getTestConfig();

  // Préférences persistantes
  muted = loadMutePref();
  updateMuteButton();
  best = loadBest();

  // Écouteurs
  if (els.btnMute) els.btnMute.addEventListener("click", toggleMute);
  els.btnCia.addEventListener("click", () => onChoice("cia"));
  els.btnFiction.addEventListener("click", () => onChoice("fiction"));
  els.btnNext.addEventListener("click", onNext);
  if (els.btnReplay) els.btnReplay.addEventListener("click", onReplay);

  if (testCfg.enabled) {
    persist = false;
    state = newGameState();
    const label = testCfg.pick && testCfg.pick.length
      ? "sélection (" + state.order.length + ")"
      : "toutes les questions";
    showTestBanner(label);
  } else {
    const saved = loadState();
    if (saved) {
      state = saved; // reprise (en cours ou terminée)
    } else {
      state = newGameState();
      saveState();
    }
  }

  if (state.finished) showFinalScreen();
  else renderQuestion();
}

async function init() {
  try {
    const res = await fetch("data/questions.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    pool = await res.json();
    if (!Array.isArray(pool) || pool.length === 0) {
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
