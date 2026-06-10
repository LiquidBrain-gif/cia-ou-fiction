variable "aws_region" {
  description = "Région AWS pour l'hébergement statique S3 (imposée : us-east-1)."
  type        = string
  default     = "us-east-1"
}

variable "bucket_prefix" {
  description = "Préfixe du nom de bucket. Un suffixe aléatoire est ajouté pour garantir l'unicité globale du nom."
  type        = string
  default     = "cia-or-fiction"
}
