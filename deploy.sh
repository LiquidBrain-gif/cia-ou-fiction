#!/usr/bin/env bash
#
# deploy.sh — Déploiement en une commande du jeu « CIA ou Fiction ? »
#
# Pré-requis :
#   - Terraform et AWS CLI installés
#   - Credentials AWS Academy à jour dans ~/.aws/credentials (section [default]) :
#       aws_access_key_id, aws_secret_access_key, aws_session_token
#     (Ces credentials expirent toutes les ~4 h : il suffit de recopier les 3
#      lignes fournies par AWS Academy « AWS Details » puis de relancer ce script.)
#
# AUCUN credential n'est stocké ici.

set -euo pipefail

# Se place dans le dossier du script (racine du dépôt), quel que soit l'appelant.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> 1/4 · Initialisation et application de l'infrastructure Terraform"
cd infra
terraform init -input=false
terraform apply -auto-approve

echo "==> 2/4 · Récupération des sorties Terraform"
BUCKET_NAME="$(terraform output -raw bucket_name)"
WEBSITE_URL="$(terraform output -raw website_url)"
cd "$ROOT_DIR"

echo "    Bucket : $BUCKET_NAME"

echo "==> 3/4 · Synchronisation du site vers S3 (s3 sync --delete)"
aws s3 sync ./src "s3://${BUCKET_NAME}" --delete

echo "==> 4/4 · Déploiement terminé."
echo ""
echo "    🌐 URL du site : ${WEBSITE_URL}"
echo ""
