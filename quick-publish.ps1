param(
  [string]$Message
)

Set-Location -Path $PSScriptRoot

if (-not (Test-Path ".git")) {
  Write-Host "Not a git repository: $PSScriptRoot" -ForegroundColor Red
  exit 1
}

$statusLines = @(git status --porcelain)
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($statusLines.Count -eq 0) {
  Write-Host "No file changes found. Nothing to publish." -ForegroundColor Yellow
  exit 0
}

$files = @(
  $statusLines |
    ForEach-Object { $_.Substring(3).Trim() } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -Unique
)

$topFiles = @($files | Select-Object -First 4)
$summary = [string]::Join(", ", $topFiles)
if ($files.Count -gt 4) {
  $summary = "$summary, ..."
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $timeTag = Get-Date -Format "yyyy-MM-dd HH:mm"
  if ([string]::IsNullOrWhiteSpace($summary)) {
    $Message = "chore: update project files ($timeTag)"
  } else {
    $Message = "chore: update $summary ($timeTag)"
  }
}

Write-Host "Staging files..." -ForegroundColor Cyan
git add -A
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$authorName = (git log -1 --format="%an" 2>$null)
$authorEmail = (git log -1 --format="%ae" 2>$null)

Write-Host "Creating commit..." -ForegroundColor Cyan
if ([string]::IsNullOrWhiteSpace($authorName) -or [string]::IsNullOrWhiteSpace($authorEmail)) {
  git commit -m "$Message"
} else {
  git -c user.name="$authorName" -c user.email="$authorEmail" commit -m "$Message"
}
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Pushing to origin/main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Published successfully. Vercel will auto-deploy." -ForegroundColor Green
