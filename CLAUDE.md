# CLAUDE.md — Contexte & historique du projet « CIA ou Fiction ? »

> Fichier d'historique pour les futures sessions Claude Code. Lis-le en premier.
> Auteurs : **Lucien VALVERDE & Rafik ZEMOURI** — Master Cybersécurité IPSSI.
> Échéance de rendu : **vendredi 12 juin** (priorité : une URL publique qui marche).

---

## 1. Le projet en bref

Jeu web quotidien type *Wordle* : le joueur lit une phrase décrivant un plan et
devine si c'est un **vrai projet de la CIA** ou un **plan de fiction** (film/série).
3 phrases par jour, identiques pour tous, rotation à minuit UTC. Score /3, état en
`localStorage`. **100 % statique**, hébergé sur **AWS S3**, provisionné par
**Terraform**, déployé par **script bash**. Aucun backend, aucune base de données.

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
│   └── data/questions.json   # 40 questions (20 cia + 20 fiction)
└── infra/              # Terraform (main/variables/outputs/versions)
```

## 4. Logique clé (app.js)

- **Rotation déterministe** : `dayIndex = floor(Date.now()/86400000)` → PRNG
  **mulberry32** seedé par `dayIndex` → Fisher-Yates partiel pour tirer 3 index
  distincts parmi 40. Même triplet pour tous chaque jour.
- **Persistance** : clé `cia-or-fiction:v1` (état partie) ; clé `cia-or-fiction:muted`
  (préférence son). `try/catch` partout.
- **Mode test (URL, sans effet pour les joueurs, AUCUNE sauvegarde)** :
  - `?all=1` → défile les 40 questions ; `?day=N` → force un jour ;
    `?pick=cia-007,fic-003` → questions précises. Bannière « 🧪 MODE TEST ».
  - Implémenté via `sessionCount` (nb variable) + flag `persist`.
- **Sons** : Web Audio API (oscillateurs générés à la volée, aucun fichier).
  Bip ascendant si correct, grave si faux. Bouton mute 🔊/🔇 (`#btn-mute`).

## 5. Données — src/data/questions.json

- 40 objets : `cia-001..020` (type `cia`) + `fic-001..020` (type `fiction`).
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
**IBM Plex Mono** (Google Fonts). Accessibilité conservée : focus-visible, contraste,
`prefers-reduced-motion`, info jamais portée par la seule couleur.
Le skill **frontend-design officiel d'Anthropic** est installé dans
`.claude/skills/frontend-design/` (local, non commité car `.claude/` est gitignore).

⚠️ **Classes/IDs à ne pas casser** (utilisés par app.js) : `#progress`, `#phrase`,
`#choices`, `#btn-cia`, `#btn-fiction`, `#result`, `#verdict` (+ `.correct/.incorrect`),
`#explication`, `#source`, `#btn-next`, `#game-screen`, `#final-screen`, `#final-score`,
`#final-message`, `#btn-mute`, et `.btn-choice` (+ `.is-correct/.is-wrong`).

## 8. État d'avancement

- [x] Front complet (jeu, rotation, persistance, mode test, sons).
- [x] 40 questions remplies (CIA réelles vérifiées par Lucien + fictions confondables).
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
