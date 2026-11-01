<#
.SYNOPSIS
  Deploys the React frontend (frontend/) to Vercel, pointed at the Cloud Run API.

.EXAMPLE
  .\deploy\deploy-frontend.ps1 -ApiUrl https://weather-aware-truck-routing-api-123456.us-central1.run.app

.NOTES
  First time only: log in with   npx vercel login
  The API URL is baked in at build time (VITE_API_URL), so re-run this if the API URL ever changes.
#>
param(
  [Parameter(Mandatory = $true)][string]$ApiUrl
)

$ErrorActionPreference = "Stop"
$frontend = Join-Path (Split-Path -Parent $PSScriptRoot) "frontend"
$ApiUrl = $ApiUrl.TrimEnd("/")

if ($ApiUrl -notmatch "^https://") { throw "ApiUrl must be the https:// address of the deployed API." }

Push-Location $frontend
try {
  Write-Host "`n==> Checking the Vercel login" -ForegroundColor Cyan
  & npx --yes vercel@latest whoami
  if ($LASTEXITCODE -ne 0) { throw "Not logged in to Vercel. Run:  npx vercel login   then run this script again." }

  Write-Host "`n==> Building and deploying to production (VITE_API_URL = $ApiUrl)" -ForegroundColor Cyan
  & npx --yes vercel@latest --prod --yes --build-env "VITE_API_URL=$ApiUrl"
  if ($LASTEXITCODE -ne 0) { throw "Vercel deployment failed (exit code $LASTEXITCODE)" }
}
finally { Pop-Location }

Write-Host @"

Frontend deployed. Last step: allow your Vercel address to call the API (use the Production address printed above):
  .\deploy\set-cors.ps1 -ProjectId <your-gcp-project> -FrontendUrl https://<your-site>.vercel.app
"@ -ForegroundColor Green
