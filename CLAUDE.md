# CLAUDE.md — Contexte & historique du projet « CIA ou Fiction ? »

> Fichier d'historique pour les futures sessions Claude Code. Lis-le en premier.
> Auteurs : **Lucien VALVERDE & Rafik ZEMOURI** — Master Cybersécurité IPSSI.
> Échéance de rendu : **vendredi 12 juin** (priorité : une URL publique qui marche).

---

## 1. Le projet en bref

Jeu web type *Wordle* : le joueur lit une phrase décrivant un plan et devine si
c'est un **vrai projet de la CIA** ou un **plan de fiction** (film/série).
**Mode arcade à 3 vies** : questions en ordre mélangé, chaque erreur coûte une
vie, on continue tant qu'il reste des vies (sinon fin + record + rejouer).
Score = bonnes réponses. État + record en `localStorage`. **100 % statique**,
hébergé sur **AWS S3**, provisionné par **Terraform**, déployé par **script bash**.
Aucun backend, aucune base de données.

> ⚠️ Historique : le jeu utilisait au départ « 3 phrases/jour identiques pour
> tous, rotation déterministe à minuit UTC ». Lucien a fait évoluer ça vers le
> **mode arcade à 3 vies** (décision assumée, s'écarte du cahier des charges initial).

- **URL en ligne :** http://cia-or-fiction-36efcf95.s3-website-us-east-1.amazonaws.com
- **GitHub :** https://github.com/LiquidBrain-gif/cia-ou-fiction (branche `main`)
- **Bucket S3 :** `cia-or-fiction-36efcf95` · région **us-east-1**

## 2. Contraintes imposées (NE PAS violer)

- HTML/CSS/JS **vanilla**, une page, **aucun framework, aucun build/bundler**.
- **Aucun credential hardcodé** nulle part.
- **Pas de** CloudFront / Route 53 / ACM / utilisateur IAM (interdits en AWS Academy).
- **Pas de CI/CD** (creds Academy expirent ~4 h → secrets de pipeline ingérables).
- State Terraform **local** (limite assumée). Pas de HTTPS (S3 website seul).
- **Ne jamais inventer** de faits CIA ni d'URL Wikipédia.

## 3. Structure du dépôt

```
/
├── CLAUDE.md            # ce fichier
├── README.md           # doc utilisateur complète
├── RECAP.md            # synthèse projet (pour l'oral)
├── .gitignore / .gitattributes   # .sh en LF ; .claude/ ignoré
├── deploy.sh           # terraform apply + aws s3 sync --delete
├── serve.ps1           # serveur HTTP local de test (dev, hors src/)
├── src/                # CE QUI EST DÉPLOYÉ sur S3
│   ├── index.html
│   ├── style.css       # thème « DOSSIER DÉCLASSIFIÉ »
│   ├── app.js          # logique + mode test + sons
│   └── data/questions.json   # 148 questions (74 cia + 74 fiction)
└── infra/              # Terraform (main/variables/outputs/versions)
```

## 4. Logique clé (app.js)

- **Mode arcade à 3 vies** : ordre des questions mélangé (Fisher-Yates
  `Math.random`, aléatoire à chaque partie). État : `{ order, pos, lives, score,
  answered, finished }`. Bonne réponse → `score++` ; erreur → `lives--`. Fin quand
  `lives==0` ou toutes les questions passées. Bouton **Rejouer** (`#btn-replay`).
- **Persistance** : `cia-or-fiction:v2` (état partie), `cia-or-fiction:best`
  (record), `cia-or-fiction:muted` (son). `try/catch` partout. Flag `persist`
  (false en mode test → aucune lecture/écriture).
- **Mode test (URL, sans effet pour les joueurs, AUCUNE sauvegarde)** :
  `?all=1` → joue les 40 dans l'ordre du fichier ; `?pick=cia-007,fic-003` →
  questions précises ; `?test` → partie fraîche. Bannière « 🧪 MODE TEST ».
- **Sons** : Web Audio API (oscillateurs générés, aucun fichier). Bip ascendant si
  correct, grave si faux, **fanfare espion** si on survit à tout, **descente
  game-over** à 0 vie. Bouton mute 🔊/🔇 (`#btn-mute`).

## 5. Données — src/data/questions.json

- 148 objets : `cia-001..074` (type `cia`) + `fic-001..074` (type `fiction`).
  Pool **équilibré 50/50** ; toutes les opérations CIA sont réelles, à URL Wikipédia
  **vérifiée en HTTP** (FR priorité). Pour en ajouter : vérifier l'existence de la
  page avant de committer ; ne jamais inventer.
- Schéma : `{ id, type, phrase, explication, source, _example? }`.
- **20 opérations CIA réelles** (sources Wikipédia, FR privilégié) ; **20 plans
  fictifs** formulés en style sobre/clinique **sans nom de film dans la phrase**
  (confondables avec du vrai) — l'œuvre n'est révélée que dans `explication`.
- `_example: true` marque les entrées rédigées par l'IA (à relire par Lucien).
- ⚠️ Pour toute opération CIA : **fait réel + URL réelle uniquement**, jamais inventé.

## 6. Déploiement — POINTS OPÉRATIONNELS IMPORTANTS

> ⚠️ **Particularité machine** : les commandes de l'agent tournent sous le compte
> Windows **`dr\adm_lva`**, alors que l'utilisateur est **`Lucien`**
> (`C:\Users\Lucien\Desktop\Projet_jeu`). Conséquences vérifiées :
> - L'auth GitHub (`gh`) et les credentials AWS sont accessibles **dans le
>   contexte adm_lva** → l'agent PEUT faire `git push` et `aws s3 sync`.
> - `git` n'est pas dans le PATH par défaut : utiliser
>   `"C:\Program Files\Git\cmd\git.exe"`. Terraform : `C:\Terraform\terraform.exe`.
>   AWS CLI : `C:\Program Files\Amazon\AWSCLIV2\aws.exe`. Node/Python **absents**.
> - Le `.git` a été créé sous adm_lva → si Lucien a un souci « dubious ownership »,
>   faire `git config --global --add safe.directory C:/Users/Lucien/Desktop/Projet_jeu`.

**Mettre à jour le site (méthode rapide, bucket déjà créé) :**
```powershell
# creds AWS Academy valides dans ~/.aws/credentials (3 lignes, expirent ~4 h)
& "C:\Program Files\Amazon\AWSCLIV2\aws.exe" s3 sync ./src s3://cia-or-fiction-36efcf95 --delete
```
**Déploiement complet (recréation infra) :** `./deploy.sh` en **Git Bash** (l'utilisateur
le lance « en admin »). **Pousser le code :** `git push` (auth `gh` déjà en place).

## 7. Design — direction artistique

Thème **« DOSSIER DÉCLASSIFIÉ »** (Guerre Froide) : papier kraft sur bureau sombre,
machine à écrire, tampons encreurs (verdict « EXACT » vert / « ERREUR » rouge),
accents ambre, grain de pellicule (SVG en data-URI). Typo **Special Elite** +
**IBM Plex Mono**, **polices embarquées** dans `src/fonts/` (`@font-face`, aucune
dépendance Google/réseau). Barre de vies en cœurs rouges agrandis. Accessibilité
conservée : focus-visible, contraste, `prefers-reduced-motion`, info jamais portée
par la seule couleur.
Le skill **frontend-design officiel d'Anthropic** est installé dans
`.claude/skills/frontend-design/` (local, non commité car `.claude/` est gitignore).

⚠️ **Classes/IDs à ne pas casser** (utilisés par app.js) : `#progress` (vies+score,
contient `.lives`), `#phrase`, `#choices`, `#btn-cia`, `#btn-fiction`, `#result`,
`#verdict` (+ `.correct/.incorrect`), `#explication`, `#source`, `#btn-next`,
`#game-screen`, `#final-screen`, `#final-title`, `#final-score`, `#final-message`,
`#final-best`, `#btn-replay`, `#btn-mute`, et `.btn-choice` (+ `.is-correct/.is-wrong`).

## 8. État d'avancement

- [x] Front complet (jeu 3 vies, persistance + record, mode test, sons).
- [x] 148 questions (74 CIA réelles à URL vérifiée + 74 fictions confondables), pool 50/50.
- [x] Infra Terraform + deploy.sh + serve.ps1.
- [x] README.md + RECAP.md.
- [x] Dépôt GitHub + site S3 en ligne.
- [x] Redesign « dossier déclassifié ».
- [ ] (Si besoin) redéployer après le redesign : `git push` + `aws s3 sync`.
- [ ] Vérifications de contenu finales au gré de Lucien.

## 9. Conseils pour la prochaine session

- Toujours **valider `questions.json`** après édition (JSON + 20/20 + pas de placeholder).
- Après toute modif de `src/`, rappeler à l'utilisateur : `git push` **puis**
  `aws s3 sync ... --delete` (le push GitHub ne déploie pas le site).
- Tester en local via `serve.ps1` (Node/Python indisponibles) + `?all=1`.
