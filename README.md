# 🕵️ CIA ou Fiction ?

Petit jeu web quotidien, type *Wordle*, entièrement **statique**, déployé sur
**AWS S3 (static website hosting)** via **Terraform**.

> **Auteurs :** Lucien VALVERDE & Rafik ZEMOURI — Master Cybersécurité IPSSI

---

## 🎯 Le jeu

Le site affiche une phrase décrivant un plan. Le joueur devine s'il s'agit :

- d'un **vrai projet de la CIA** ayant réellement existé, ou
- d'un **plan de méchant fictif** (film, série, dessin animé).

Après chaque choix, le site indique **Vrai / Faux**, affiche une **explication**
et une **source** (lien Wikipédia pour les opérations CIA).

Chaque jour, le joueur répond à **3 phrases**, une à la fois (on répond, on voit
le résultat, on passe à la suivante). À la fin, le **score sur 3** s'affiche.
Les 3 phrases du jour sont **identiques pour tous les joueurs** et **changent
chaque jour** (rotation à minuit UTC).

---

## 🧱 Stack technique

| Couche        | Choix                                                        |
| ------------- | ------------------------------------------------------------ |
| Front-end     | HTML5 + CSS + **JavaScript vanilla**, une seule page, **aucun framework, aucun build** |
| État joueur   | `localStorage` (pas de backend, pas de base de données)      |
| Hébergement   | **AWS S3** static website hosting, région `us-east-1`        |
| IaC           | **Terraform** (state **local**)                              |
| Déploiement   | Script bash `deploy.sh` (`terraform apply` + `aws s3 sync`)  |

### Schéma d'architecture

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

## 📁 Structure du dépôt

```
/
├── README.md
├── .gitignore
├── deploy.sh                 # déploiement en une commande
├── src/                      # site statique (synchronisé vers S3)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data/
│       └── questions.json    # les 40 questions
└── infra/                    # Terraform
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    └── versions.tf
```

---

## ✅ Prérequis

- [**Terraform**](https://developer.hashicorp.com/terraform/install) ≥ 1.5
- [**AWS CLI**](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2
- Un environnement **bash** (Linux/macOS, ou WSL/Git Bash sous Windows)
- Un compte **AWS Academy Learner Lab** (credentials temporaires)

Vérification rapide :

```bash
terraform -version
aws --version
```

---

## 🚀 Déploiement pas-à-pas

### 1. Mettre à jour les credentials AWS Academy (~ toutes les 4 h)

Les credentials du Learner Lab expirent toutes les ~4 heures. Pour les
rafraîchir :

1. Dans AWS Academy, cliquez sur **« AWS Details »** → bouton **« AWS CLI »** /
   **« Show »**.
2. Copiez le bloc fourni (3 lignes) dans le fichier `~/.aws/credentials`,
   sous la section `[default]` :

```ini
[default]
aws_access_key_id     = ASIA...
aws_secret_access_key = ...
aws_session_token     = ...
```

> ⚠️ Ces credentials ne sont **jamais** stockés dans le dépôt. Le code lit
> simplement `~/.aws/credentials`.

Test : `aws sts get-caller-identity` doit répondre sans erreur.

### 2. Lancer le déploiement

```bash
chmod +x deploy.sh   # une seule fois
./deploy.sh
```

Le script :

1. `terraform init` + `terraform apply -auto-approve` (crée le bucket S3) ;
2. récupère le nom du bucket via `terraform output -raw bucket_name` ;
3. `aws s3 sync ./src s3://<bucket> --delete` ;
4. affiche l'**URL finale** du site.

L'URL ressemblera à :

```
http://cia-or-fiction-XXXXXXXX.s3-website-us-east-1.amazonaws.com
```

### Re-déployer après expiration des credentials

Recopiez simplement les 3 nouvelles lignes dans `~/.aws/credentials`, puis
relancez `./deploy.sh`. C'est tout.

---

## ✏️ Ajouter / éditer des questions

Toutes les questions vivent dans **`src/data/questions.json`** : un tableau de
**40 objets** (20 `cia` + 20 `fiction`).

```json
{
  "id": "cia-001",
  "type": "cia",
  "phrase": "Texte court présenté au joueur, sans détail trop révélateur.",
  "explication": "Explication affichée après la réponse.",
  "source": "https://fr.wikipedia.org/wiki/..."
}
```

- `type` vaut `"cia"` ou `"fiction"`.
- `source` : pour une opération CIA, un **lien Wikipédia réel** ; pour une
  fiction, un titre d'œuvre (ou un lien). Les URLs (`http(s)://`) deviennent
  automatiquement des liens cliquables.
- Les 6 entrées d'exemple portent un champ `"_example": true` pour être
  repérées facilement.
- Les entrées `[À REMPLIR — …]` sont des **placeholders** à compléter.

> ⚠️ Pour les opérations CIA, n'utilisez que des faits **réellement documentés**
> avec une **URL Wikipédia exacte**. Ne fabriquez aucun fait ni aucun lien.

Après modification, relancez `./deploy.sh` (l'étape `aws s3 sync` pousse les
nouveaux fichiers).

---

## ⚠️ Limites assumées du projet

- **Pas de HTTPS** : S3 website hosting sert en HTTP seul. (Le HTTPS pourra être
  ajouté plus tard via Cloudflare — hors scope ici, et CloudFront/ACM/Route 53
  ne sont pas disponibles en AWS Academy.)
- **State Terraform local** : pas de backend distant (limite assumée).
- **Pas de CI/CD** : les credentials Academy tournant toutes les ~4 h rendraient
  les secrets de pipeline ingérables. Le script `deploy.sh` suffit.
- **Contenu en partie à compléter** : 6 questions réelles sont fournies pour la
  démo ; les 34 autres sont des placeholders.
- **Pas d'utilisateur IAM** : interdit en Academy ; on utilise les credentials
  temporaires de l'environnement.

---

## 🔐 Sécurité & coûts

- Le bucket est en **lecture publique uniquement** (`s3:GetObject`), comme requis
  pour un site statique. Aucune écriture publique.
- **Aucune donnée sensible** n'est stockée : l'état du joueur reste local
  (`localStorage`) dans son navigateur.
- **Coûts quasi nuls** : hébergement S3 statique d'un site de quelques Ko,
  largement dans le périmètre du Learner Lab.
- **Aucun credential** n'est présent dans le dépôt ; ils sont lus depuis
  `~/.aws/credentials` (ignoré par `.gitignore`).
