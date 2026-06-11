# serve.ps1 — petit serveur HTTP local pour tester le jeu sans déployer.
# Sert le dossier ./src sur http://localhost:8000
# Usage :  pwsh -File serve.ps1   (ou clic droit > Exécuter avec PowerShell)
# Arrêt :  Ctrl + C
#
# Pourquoi un serveur ? Le jeu charge questions.json via fetch(), qui est
# bloqué quand on ouvre index.html en file://. Un simple serveur HTTP suffit.

$ErrorActionPreference = "Stop"
$port = 8000
$root = Join-Path $PSScriptRoot "src"

if (-not (Test-Path $root)) { throw "Dossier introuvable : $root" }

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host ""
Write-Host "  Jeu servi sur : http://localhost:$port/" -ForegroundColor Green
Write-Host "  Mode test     : http://localhost:$port/?all=1   (toutes les questions)" -ForegroundColor Cyan
Write-Host "                  http://localhost:$port/?day=20250    (forcer un jour)" -ForegroundColor Cyan
Write-Host "  Ctrl + C pour arreter." -ForegroundColor DarkGray
Write-Host ""

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }

    $path = Join-Path $root $rel
    # Empêche de sortir du dossier src/ (path traversal)
    $full = [System.IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) {
      $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue
    }

    if (Test-Path $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $ctx.Response.Headers["Cache-Control"] = "no-cache"
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("  200  /{0}" -f $rel) -ForegroundColor DarkGray
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - $rel introuvable")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      Write-Host ("  404  /{0}" -f $rel) -ForegroundColor Yellow
    }
    $ctx.Response.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host "Serveur arrete." -ForegroundColor DarkGray
}
