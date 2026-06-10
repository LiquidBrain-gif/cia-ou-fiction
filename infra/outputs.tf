output "bucket_name" {
  description = "Nom du bucket S3 créé (cible du `aws s3 sync`)."
  value       = aws_s3_bucket.site.bucket
}

output "website_url" {
  description = "URL publique du site statique S3 (HTTP)."
  value       = "http://${aws_s3_bucket_website_configuration.site.website_endpoint}"
}
