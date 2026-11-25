# PomeloLauncher GitHub 定时同步
# 用法：powershell -ExecutionPolicy Bypass -File scripts/sync-github.ps1 [-Message "自定义提交信息"]
# 行为：暂存全部改动 → 有改动则提交 → 推送到 origin/main；日志写入 .git/github-sync.log
param([string]$Message = "")

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$log = Join-Path $repo ".git\github-sync.log"

function Log([string]$m) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File -Append -Encoding utf8 $log
}

Log "=== sync start ==="
git add -A 2>&1 | Out-Null
$staged = git diff --cached --name-only
if (-not $staged) {
    Log "no changes, skip"
    exit 0
}
if (-not $Message) {
    $Message = "chore: auto sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
git -c user.name="PomeloLauncher Bot" -c user.email="bot@pomelo.invalid" commit -m $Message 2>&1 | Out-File -Append -Encoding utf8 $log
if ($LASTEXITCODE -ne 0) { Log "commit failed"; exit 1 }

git push origin main 2>&1 | Out-File -Append -Encoding utf8 $log
if ($LASTEXITCODE -ne 0) {
    Log "push failed (check remote/credentials or run: git pull --rebase origin main)"
    exit 2
}
Log "push ok"
