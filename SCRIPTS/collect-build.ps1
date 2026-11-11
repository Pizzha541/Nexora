param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace "NEXORA\src-tauri\target\release\bundle\nsis"
$destination = Join-Path $workspace "BUILD\installers"
$installer = Get-ChildItem -LiteralPath $source -Filter "*-setup.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) {
    throw "No se encontró un instalador NSIS compilado en $source"
}
$target = Join-Path $destination "NEXORA_${Version}_x64-setup.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $target -Force
Get-FileHash -Algorithm SHA256 -LiteralPath $target

