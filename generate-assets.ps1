# Gera asset-manifest.json com todos os recursos do jogo, tamanho e hash curto (SHA-256).
# Execute na pasta do repositório antes de cada publicação no Netlify:
#   powershell -ExecutionPolicy Bypass -File .\generate-assets.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$coreFiles = @(
  "index.html",
  "firebase-cloud.js",
  "asset-manager.js",
  "manifest.webmanifest"
)

$scanDirs = @("img", "videos", "video", "sfx", "audio")
$allowedExt = @(".html", ".js", ".json", ".webmanifest", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".mp4", ".webm", ".mp3", ".ogg", ".wav")

function Get-ShortHash([string]$filePath) {
  $h = Get-FileHash -Path $filePath -Algorithm SHA256
  return $h.Hash.Substring(0, 8).ToLowerInvariant()
}

function Classify-Asset([string]$relPath) {
  # Core, scripts, sons, ícones, menus, fx, inimigos, chefes, lacaios e heróis base (sem sufixo de raridade _C/_R/_E/_L)
  if ($coreFiles -contains $relPath) {
    return @{ pack = "essential"; realm = $null }
  }
  if ($relPath -match '^(sfx|audio)/') {
    return @{ pack = "essential"; realm = $null }
  }
  if ($relPath -match '^(videos|video)/') {
    return @{ pack = "complete"; realm = $null }
  }
  if ($relPath -match '^img/fundos/(bg|map)_([a-z]+)\.(jpg|jpeg|png|webp)$') {
    $realmName = $Matches[2]
    # Reino 1 (forest) faz parte do Essencial inicial; demais reinos ficam no Completo (ou baixados ao entrar no reino)
    $pk = if ($realmName -eq "forest") { "essential" } else { "complete" }
    return @{ pack = $pk; realm = $realmName }
  }
  if ($relPath -match '^img/fundos/menu_') {
    return @{ pack = "essential"; realm = $null }
  }
  if ($relPath -match '^img/menu_bg\.' -or $relPath -match '^img/icon-' -or $relPath -match '^img/fx/') {
    return @{ pack = "essential"; realm = $null }
  }
  # Artes de raridade das fusões (*_C.png, *_R.png, *_E.png, *_L.png) vão para o pacote Completo
  if ($relPath -match '^img/.+_[CREL]\.(png|jpg|webp)$') {
    return @{ pack = "complete"; realm = $null }
  }
  # Demais imagens em img/ (heróis base, inimigos e_*, chefes b_*, lacaios m_*, deuses *D.png) ficam no Essencial
  return @{ pack = "essential"; realm = $null }
}

$entries = New-Object System.Collections.Generic.List[object]

foreach ($cf in $coreFiles) {
  $full = Join-Path $root $cf
  if (Test-Path $full) {
    $fi = Get-Item $full
    $cls = Classify-Asset $cf
    $entries.Add([ordered]@{
      path = $cf
      size = [long]$fi.Length
      hash = (Get-ShortHash $full)
      pack = $cls.pack
    })
  }
}

foreach ($dir in $scanDirs) {
  $fullDir = Join-Path $root $dir
  if (-not (Test-Path $fullDir)) { continue }
  $files = Get-ChildItem -Path $fullDir -File -Recurse | Sort-Object FullName
  foreach ($f in $files) {
    $ext = $f.Extension.ToLowerInvariant()
    if ($allowedExt -notcontains $ext) { continue }
    $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    $cls = Classify-Asset $rel
    $obj = [ordered]@{
      path = $rel
      size = [long]$f.Length
      hash = (Get-ShortHash $f.FullName)
      pack = $cls.pack
    }
    if ($cls.realm) { $obj["realm"] = $cls.realm }
    $entries.Add($obj)
  }
}

# Ordena por path para determinismo
$sorted = @($entries | Sort-Object { $_.path })

$essFiles = @($sorted | Where-Object { $_["pack"] -eq "essential" })
$cmpFiles = @($sorted | Where-Object { $_["pack"] -eq "complete" })
[long]$essBytes = 0; foreach ($x in $essFiles) { $essBytes += [long]$x["size"] }
[long]$cmpBytes = 0; foreach ($x in $cmpFiles) { $cmpBytes += [long]$x["size"] }
[long]$totBytes = $essBytes + $cmpBytes

# Gera hash curto global para a versão dos recursos
$concat = ($sorted | ForEach-Object { "$($_.path):$($_.hash)" }) -join "`n"
$sha = [System.Security.Cryptography.SHA256]::Create()
$verBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($concat))
$verHash = ([BitConverter]::ToString($verBytes).Replace("-", "").ToLowerInvariant()).Substring(0, 6)
$dateTag = (Get-Date).ToString("yyyy.MM.dd")
$version = "$dateTag-$verHash"

$manifest = [ordered]@{
  version = $version
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  totals = [ordered]@{
    essentialCount = $essFiles.Count
    essentialBytes = $essBytes
    completeCount  = $cmpFiles.Count
    completeBytes  = $cmpBytes
    totalCount     = $sorted.Count
    totalBytes     = $totBytes
  }
  files = $sorted
}

$json = $manifest | ConvertTo-Json -Depth 5 -Compress
$outPath = Join-Path $root "asset-manifest.json"
[System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host "asset-manifest.json gerado com sucesso!"
Write-Host ("Versao:    {0}" -f $version)
Write-Host ("Essencial: {0} arquivos ({1:N2} MB)" -f $essFiles.Count, ($essBytes / 1MB))
Write-Host ("Completo:  +{0} arquivos (+{1:N2} MB)" -f $cmpFiles.Count, ($cmpBytes / 1MB))
Write-Host ("Total:     {0} arquivos ({1:N2} MB)" -f $sorted.Count, ($totBytes / 1MB))
