# Provider AWS — aucune credential ici : Terraform lit ~/.aws/credentials
# (ou les variables d'environnement AWS_*). Adapté aux creds temporaires
# AWS Academy (access key + secret key + session token).
provider "aws" {
  region = var.aws_region
}

# Suffixe aléatoire pour garantir l'unicité globale du nom de bucket S3.
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket_name = "${var.bucket_prefix}-${random_id.suffix.hex}"
}

# Bucket qui hébergera le site statique.
resource "aws_s3_bucket" "site" {
  bucket = local.bucket_name

  tags = {
    Project = "CIA ou Fiction"
    Course  = "Master Cybersecurite IPSSI"
  }
}

# Configuration du static website hosting.
resource "aws_s3_bucket_website_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }

  # Application monopage : on renvoie index.html aussi en cas d'erreur 404.
  error_document {
    key = "index.html"
  }
}

# Contrôle de propriété des objets (évite les soucis liés aux ACL).
resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# Lecture publique nécessaire pour un site statique : on lève tous les blocages.
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Politique : autorise uniquement la LECTURE (s3:GetObject) à tout le monde.
resource "aws_s3_bucket_policy" "public_read" {
  bucket = aws_s3_bucket.site.id

  # On dépend explicitement du public access block pour éviter une erreur
  # "policy blocked" lors de l'application.
  depends_on = [aws_s3_bucket_public_access_block.site]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
      }
    ]
  })
}
