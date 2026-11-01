<#
.SYNOPSIS
  Deploys the Django API to Google Cloud Run (free-tier friendly: scales to zero).

.EXAMPLE
  .\deploy\deploy-backend.ps1 -ProjectId my-gcp-project
  .\deploy\deploy-backend.ps1 -ProjectId my-gcp-project -FrontendUrl https://my-app.vercel.app

.NOTES
  Needs the Google Cloud SDK and a login:  gcloud auth login
  The project must have billing enabled (Cloud Run and Cloud Build require it; usage within the free tier costs nothing).
  Safe to re-run: it reuses the secret and updates the service in place.
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Region = "us-central1",
  [string]$Service = "weather-aware-truck-routing-api",
  # The Vercel site that may call this API. Re-run (or use set-cors.ps1) once you know the real URL.
  [string]$FrontendUrl = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$secretName = "django-secret-key"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Run {
  # Runs gcloud and stops the script on a non-zero exit code.
  & gcloud @args
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ') failed (exit code $LASTEXITCODE)" }
}

Step "Project $ProjectId, region $Region"
Run config set project $ProjectId --quiet | Out-Null

Step "Enabling the Google Cloud APIs this needs (first run takes about a minute)"
Run services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project $ProjectId

Step "Django secret key in Secret Manager"
$ErrorActionPreference = "Continue"
& gcloud secrets describe $secretName --project $ProjectId *> $null
$secretExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Stop"
if (-not $secretExists) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $key = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  $tmp = New-TemporaryFile
  try {
    Set-Content -Path $tmp -Value $key -NoNewline -Encoding ascii
    Run secrets create $secretName --data-file $tmp --replication-policy automatic --project $ProjectId
  }
  finally { Remove-Item $tmp -Force }
  Write-Host "Created secret $secretName"
}
else { Write-Host "Secret $secretName already exists, reusing it" }

# Cloud Run runs as the project's default compute service account unless told otherwise.
$projectNumber = (& gcloud projects describe $ProjectId --format "value(projectNumber)").Trim()
$runtimeAccount = "$projectNumber-compute@developer.gserviceaccount.com"
Run secrets add-iam-policy-binding $secretName --member "serviceAccount:$runtimeAccount" --role roles/secretmanager.secretAccessor --project $ProjectId --quiet | Out-Null

Step "Building and deploying (Cloud Build compiles the Dockerfile in backend/; takes 2-4 minutes)"
# "^@^" switches the list separator to @ so the comma-separated values below survive.
$envVars = "^@^DJANGO_DEBUG=0@DJANGO_ALLOWED_HOSTS=.run.app@DJANGO_SECURE_SSL_REDIRECT=1@NUM_PROXIES=1@CORS_ALLOWED_ORIGINS=$FrontendUrl@HTTP_USER_AGENT=WeatherAwareTruckRouting/1.0 (+https://github.com/atifkhan23)"
Run run deploy $Service `
  --project $ProjectId --region $Region `
  --source (Join-Path $repoRoot "backend") `
  --allow-unauthenticated `
  --port 8080 --cpu 1 --memory 512Mi `
  --min-instances 0 --max-instances 3 --concurrency 40 --timeout 60 `
  --set-env-vars $envVars `
  --set-secrets "DJANGO_SECRET_KEY=${secretName}:latest" `
  --quiet

$url = (& gcloud run services describe $Service --project $ProjectId --region $Region --format "value(status.url)").Trim()

Step "Smoke test"
$health = Invoke-RestMethod -Uri "$url/api/health/" -TimeoutSec 60
Write-Host ("GET /api/health/ -> " + ($health | ConvertTo-Json -Compress))

Write-Host "`nBackend is live:  $url" -ForegroundColor Green
Write-Host "CORS currently allows: $FrontendUrl"
Write-Host @"

Next: deploy the frontend to Vercel with this URL:
  .\deploy\deploy-frontend.ps1 -ApiUrl $url
Then allow the Vercel site to call the API:
  .\deploy\set-cors.ps1 -ProjectId $ProjectId -FrontendUrl https://<your-site>.vercel.app
"@
