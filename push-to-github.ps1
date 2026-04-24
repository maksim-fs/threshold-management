# 将本目录推送到：git@github.com:maksim-fs/threshold-management.git
# 需已安装 Git for Windows，且已把 SSH 公钥添加到 GitHub。
$ErrorActionPreference = "Stop"
$Remote = "git@github.com:maksim-fs/threshold-management.git"
$Root = $PSScriptRoot

$git = @(
  "C:\Program Files\Git\cmd\git.exe",
  "C:\Program Files\Git\bin\git.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $git) {
  $c = Get-Command git -ErrorAction SilentlyContinue
  if ($c) { $git = $c.Source }
}
if (-not $git) {
  Write-Host "未找到 git.exe。请安装 Git for Windows：https://git-scm.com/download/win" -ForegroundColor Red
  Write-Host "安装后请重新打开终端，再运行本脚本。" -ForegroundColor Yellow
  exit 1
}

Set-Location $Root
& $git init
& $git add -A
if (& $git status --porcelain) {
  & $git commit -m "Add threshold management static site"
}
& $git branch -M main
if ((& $git remote) -match "origin") { & $git remote set-url origin $Remote } else { & $git remote add origin $Remote }

# 与远端已有提交（如 README）合并（无冲突时自动完成，不弹编辑器）
$null = & $git fetch origin 2>&1
if ($LASTEXITCODE -eq 0) {
  $hasOriginMain = $null
  $null = & $git rev-parse "origin/main" 2>&1
  if ($LASTEXITCODE -eq 0) { $hasOriginMain = $true }
  if ($hasOriginMain) {
    $null = & $git merge "origin/main" --allow-unrelated-histories -m "Merge remote main (e.g. README) with local project" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "合并未成功（可能有冲突）。解决冲突后执行: git add -A; git commit; git push -u origin main" -ForegroundColor Red
      exit 1
    }
  }
}

& $git push -u origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "完成。仓库：https://github.com/maksim-fs/threshold-management" -ForegroundColor Green
