# Forja de Linhagens — Extrator de animações de inimigos
# Uso:
#   .\tools\anim.ps1              (processa todos os inimigos encontrados em anim/)
#   .\tools\anim.ps1 -Id e_g      (processa apenas o goblin e_g)
param(
  [string]$Id = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

$pyExe = $null
$cand = @(
  (Join-Path $env:LOCALAPPDATA "Python\bin\python.exe"),
  (Get-Command python -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike "*WindowsApps*" } | Select-Object -First 1 -ExpandProperty Source)
) | Where-Object { $_ -and (Test-Path $_) }
if ($cand.Count -gt 0) { $pyExe = $cand[0] }
if (-not $pyExe) {
  Write-Error "Python nao encontrado. Instale Python 3 com Pillow (pip install pillow)."
  exit 1
}

$worker = Join-Path $repoRoot "tools\anim_worker.py"
if ($Id) {
  & $pyExe $worker --id $Id
} else {
  & $pyExe $worker
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
