param(
  [string]$SourceRelease = "",
  [string]$DestinationRoot = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$version = $package.version

if (-not $SourceRelease) {
  $SourceRelease = Join-Path $projectRoot "release\MindFlow-win32-x64"
}
if (-not $DestinationRoot) {
  $DestinationRoot = Join-Path $projectRoot "delivery"
}

$source = [IO.Path]::GetFullPath($SourceRelease)
$destination = [IO.Path]::GetFullPath($DestinationRoot)
$folderName = "MindFlow-v$version-Windows"
$deliveryFolder = [IO.Path]::GetFullPath((Join-Path $destination $folderName))
$appFolder = [IO.Path]::GetFullPath((Join-Path $deliveryFolder "app"))
$zipPath = [IO.Path]::GetFullPath((Join-Path $destination "$folderName.zip"))

if (-not (Test-Path -LiteralPath (Join-Path $source "MindFlow.exe"))) {
  throw "Packaged MindFlow.exe was not found: $source"
}

$destinationPrefix = $destination.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $deliveryFolder.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Delivery folder is outside the destination root: $deliveryFolder"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
if (Test-Path -LiteralPath $deliveryFolder) {
  Remove-Item -LiteralPath $deliveryFolder -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
New-Item -ItemType Directory -Path $appFolder -Force | Out-Null

Get-ChildItem -LiteralPath $source -Force |
  Where-Object { $_.Name -ne "locales" } |
  Copy-Item -Destination $appFolder -Recurse -Force

$localeTarget = Join-Path $appFolder "locales"
New-Item -ItemType Directory -Path $localeTarget -Force | Out-Null
@("zh-CN.pak", "zh-TW.pak", "en-US.pak", "en-GB.pak") | ForEach-Object {
  $locale = Join-Path $source "locales\$_"
  if (Test-Path -LiteralPath $locale) {
    Copy-Item -LiteralPath $locale -Destination $localeTarget -Force
  }
}

Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\README.txt") -Destination (Join-Path $deliveryFolder "README.txt") -Force

$compiler = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $compiler)) {
  $compiler = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path -LiteralPath $compiler)) {
  throw "Windows C# compiler was not found."
}

$launcherSource = Join-Path $projectRoot "packaging\MindFlowLauncher.cs"
$launcherTarget = Join-Path $deliveryFolder "MindFlow.exe"
$icon = Join-Path $projectRoot "assets\mindflow-app-icon.ico"
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 /reference:System.Windows.Forms.dll "/win32icon:$icon" "/out:$launcherTarget" $launcherSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcherTarget)) {
  throw "MindFlow launcher compilation failed."
}

Compress-Archive -LiteralPath $deliveryFolder -DestinationPath $zipPath -CompressionLevel Optimal

[PSCustomObject]@{
  Folder = $deliveryFolder
  Zip = $zipPath
  Launcher = $launcherTarget
  Runtime = Join-Path $appFolder "MindFlow.exe"
  Locales = (Get-ChildItem -LiteralPath $localeTarget -File).Count
} | Format-List
