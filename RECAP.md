# 📋 Récapitulatif du projet — « CIA ou Fiction ? »

> Document de synthèse : ce qui a été réalisé, comment, et ce qu'il reste à faire.
> Auteurs : Lucien VALVERDE & Rafik ZEMOURI — Master Cybersécurité IPSSI.

---

## 1. En une phrase

Un jeu web **arcade** type *Wordle* — deviner si un plan est un **vrai projet de la
CIA** ou une **fiction**, avec un système de **3 vies** — entièrement statique,
hébergé sur **AWS S3**, provisionné avec **Terraform** et déployé par un
**script bash**.

**🌐 Site en ligne :** http://cia-or-fiction-36efcf95.s3-website-us-east-1.amazonaws.com
**📦 Dépôt GitHub :** https://github.com/LiquidBrain-gif/cia-ou-fiction

---

## 2. Ce qui a été réalisé

### a) Le jeu (front-end statique)
- **HTML / CSS / JavaScript vanilla**, une seule page, **aucun framework ni build**.
- **Mode arcade à 3 vies** : les questions s'enchaînent en **ordre mélangé**
  (Fisher-Yates), chaque erreur coûte **une vie** ; on continue tant qu'il reste
  des vies. Fin → **score + record + bouton Rejouer**.
- **Persistance via `localStorage`** : reprise de partie en cours, **record**
  conservé, gestion des données corrompues (`try/catch`).
- **UI** « dossier déclassifié » responsive, barre de **vies (cœurs) + score**,
  correct/incorrect distingués par **couleur + texte/tampon** (accessibilité).
- **Sons** (Web Audio API, aucun fichier) : bons/mauvais coups, fanfare de
  victoire, descente « game over ». **Polices embarquées** (zéro dépendance).

### b) Les données — `src/data/questions.json`
- **148 questions** : 74 « CIA » + 74 « fiction » (pool équilibré).
- **20 opérations CIA réelles** et documentées, chacune avec un lien Wikipédia (FR
  privilégié).
- **20 plans fictifs** formulés en style « fiche d'opération » sobre, **sans nom de
  film dans la phrase** — pour qu'on puisse les confondre avec de vraies opérations.

### c) L'infrastructure — Terraform (`infra/`)
- Provider **AWS**, région **us-east-1**.
- Bucket S3 + website configuration + public access (lecture publique) + bucket policy
  `s3:GetObject`. Nom de bucket unique via `random_id`.
- **Aucun IAM créé** (interdit en AWS Academy). State **local**, versions épinglées.

### d) Le déploiement — `deploy.sh`
- Déploiement **en une commande** : `terraform apply` → `aws s3 sync ./src --delete`.
- **Aucun credential dans le code** : lecture de `~/.aws/credentials`.

### e) Outils dev
- **Mode test** par URL (`?all=1`, `?pick=ids`) : relit les phrases sans
  déployer, sans écrire dans `localStorage`. Invisible pour les joueurs.
- **`serve.ps1`** : mini-serveur HTTP local (PowerShell, zéro dépendance).
- **Sons** (Web Audio API) + bouton mute.

### f) Documentation
- **`README.md`** (doc utilisateur), **`CLAUDE.md`** (historique/contexte technique),
  **`RECAP.md`** (ce document).

---

## 3. Architecture

```
Navigateur (HTML/CSS/JS + localStorage)
        │  (HTTP)
        ▼
S3 bucket (static website hosting, us-east-1, lecture publique)
        ▲
        │  terraform apply + aws s3 sync
   deploy.sh  (lit ~/.aws/credentials)
```

---

## 4. Choix techniques & justifications (pour l'oral)

| Choix | Pourquoi |
| --- | --- |
| **JS vanilla, pas de framework** | Simplicité, maintenabilité, facile à expliquer ; aucun build. |
| **S3 static website hosting** | Hébergement statique simple et quasi gratuit ; pas de serveur. |
| **Terraform (state local)** | Infrastructure reproductible (IaC) ; state local assumé. |
| **Script bash, pas de CI/CD** | Credentials Academy renouvelés toutes les ~4 h → secrets de pipeline ingérables. |
| **`localStorage`, pas de backend** | Aucune donnée sensible, aucun serveur ; état + record chez le joueur. |
| **Mode arcade à 3 vies** | Plus rejouable et nerveux qu'un quiz figé ; ordre mélangé à chaque partie. |

---

## 5. Limites assumées

- **Pas de HTTPS** (S3 website seul ; HTTPS via Cloudflare = hors scope).
- **State Terraform local**, **pas de CI/CD**, **pas d'IAM/CloudFront/Route 53/ACM**
  (non disponibles en AWS Academy).

---

## 6. Sécurité & coûts

- Bucket en **lecture publique uniquement** (`s3:GetObject`).
- **Aucune donnée sensible** ; état joueur local.
- **Aucun credential** dans le dépôt.
- **Coûts quasi nuls** (quelques Ko servis depuis S3).

---

## 7. Déployer / mettre à jour (mémo)

```bash
# 1. Rafraîchir les credentials Academy dans ~/.aws/credentials (3 lignes)
aws sts get-caller-identity          # vérifier
./deploy.sh                          # déploiement complet (Git Bash)
# ou, bucket déjà créé, synchro rapide :
aws s3 sync ./src s3://cia-or-fiction-36efcf95 --delete
```
Versionner : `git add -A && git commit -m "..." && git push`
