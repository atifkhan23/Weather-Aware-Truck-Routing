<#
.SYNOPSIS
  Lets your Vercel site call the Cloud Run API (updates CORS_ALLOWED_ORIGINS without rebuilding).

.EXAMPLE
  .\deploy\set-cors.ps1 -ProjectId my-gcp-project -FrontendUrl https://my-app.vercel.app

  Several sites (for example a custom domain as well):
  .\deploy\set-cors.ps1 -ProjectId my-gcp-project -FrontendUrl "https://my-app.vercel.app,https://trucks.example.com"
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$FrontendUrl,
  [string]$Region = "us-central1",
  [string]$Service = "weather-aware-truck-routing-api"
)

$ErrorActionPreference = "Stop"

# No trailing slash: browsers send the bare origin.
$origins = ($FrontendUrl -split "," | ForEach-Object { $_.Trim().TrimEnd("/") } | Where-Object { $_ }) -join ","

& gcloud run services update $Service --project $ProjectId --region $Region --update-env-vars "^@^CORS_ALLOWED_ORIGINS=$origins" --quiet
if ($LASTEXITCODE -ne 0) { throw "Could not update the service (exit code $LASTEXITCODE)" }

Write-Host "The API now accepts requests from: $origins" -ForegroundColor Green
