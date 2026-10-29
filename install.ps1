#Requires -Version 5.1
[CmdletBinding()]
param(
  # Install into this project's config instead of the global config.
  [string]$Project,
  # Skip the dependency install (useful for repeated runs).
  [switch]$SkipDeps,
  # Do not clone the repo automatically when run from a downloaded script.
  [switch]$NoClone
)

$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/MeanLesss/opencode-file-browser.git"
$TestedVersion = "1.19.5"

function Info($Message) { Write-Host "  $Message" -ForegroundColor Cyan }
function Good($Message) { Write-Host "  $Message" -ForegroundColor Green }
function Warn($Message) { Write-Host "  $Message" -ForegroundColor Yellow }
function Fail($Message) {
  Write-Host "x $Message" -ForegroundColor Red
  exit 1
}

# Run a native command without letting PowerShell treat its stderr output as a
# terminating error (spinners and package managers write ANSI to stderr). The
# exit code is stored in a script-scoped variable so native output can still
# stream to the console.
$script:LastNativeExitCode = 0
function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory
  )

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($WorkingDirectory) { Push-Location -LiteralPath $WorkingDirectory }
    try {
      & $Command @Arguments
      $script:LastNativeExitCode = $LASTEXITCODE
    } finally {
      if ($WorkingDirectory) { Pop-Location }
    }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Get-Version($Raw) {
  $match = [regex]::Match([string]$Raw, "(\d+)\.(\d+)\.(\d+)")
  if (-not $match.Success) { return $null }
  return [pscustomobject]@{
    Major = [int]$match.Groups[1].Value
    Minor = [int]$match.Groups[2].Value
    Patch = [int]$match.Groups[3].Value
    Text  = "$($match.Groups[1].Value).$($match.Groups[2].Value).$($match.Groups[3].Value)"
  }
}

Write-Host ""
Write-Host "opencode-file-browser installer" -ForegroundColor White
Write-Host ""

# 1. Locate the plugin. When this script is piped through iex, $PSScriptRoot is
# empty, so clone the repo to a predictable location instead.
$root = $PSScriptRoot
if (-not $root -or -not (Test-Path (Join-Path $root "package.json"))) {
  $root = Join-Path $HOME "opencode-file-browser"
}

if (-not (Test-Path (Join-Path $root "package.json"))) {
  if ($NoClone) {
    Fail "Could not find the plugin at '$root'. Clone the repo or run this script from inside it."
  }
  if (Test-Path -LiteralPath $root) {
    Fail "The folder '$root' already exists but does not contain package.json. Move it, or clone the repo elsewhere and run this script from there."
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "Git is required for the automatic download. Install Git, or clone the repo manually and run this script from there."
  }
  Info "Downloading opencode-file-browser to $root"
  Invoke-Native git @("clone", "--depth", "1", $RepoUrl, $root)
  if ($script:LastNativeExitCode -ne 0) { Fail "git clone failed." }
}

$root = (Resolve-Path -LiteralPath $root).Path

# 2. Detect opencode and check the major version.
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
  Fail "opencode was not found on PATH. Install opencode 1.x first: https://opencode.ai"
}

$raw = $null
$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $lines = & opencode --version 2>$null
  $versionCode = $LASTEXITCODE
  $raw = ($lines | Select-Object -First 1)
} finally {
  $ErrorActionPreference = $previous
}

if ($versionCode -ne 0 -or -not $raw) {
  Fail "Could not run 'opencode --version'."
}

$version = Get-Version $raw
if (-not $version) {
  Fail "Could not parse the opencode version from '$raw'."
}

if ($version.Major -ne 1) {
  Fail "Detected opencode $($version.Text). This plugin supports opencode 1.x only (1.19.5 or newer recommended)."
}

Good "Detected opencode $($version.Text)"

if ($version.Minor -lt 19 -or ($version.Minor -eq 19 -and $version.Patch -lt 5)) {
  Warn "This plugin is tested with opencode $TestedVersion. On $($version.Text) some actions may fall back to older behavior."
}

# 3. Install runtime dependencies.
if (-not $SkipDeps) {
  Info "Installing plugin dependencies..."
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    Invoke-Native npm @("install", "--omit=dev", "--no-audit", "--no-fund") $root
  } elseif (Get-Command bun -ErrorAction SilentlyContinue) {
    Invoke-Native bun @("install", "--production") $root
  } else {
    Fail "npm or bun is required once to install the plugin dependencies."
  }
  if ($script:LastNativeExitCode -ne 0) { Fail "Dependency install failed." }
  Good "Dependencies installed"
} else {
  Info "Skipping dependency install"
}

# 4. Register the plugin. opencode writes the server entry to opencode.jsonc
# and the TUI entry to tui.json for us, preserving existing JSONC content.
Info "Registering the plugin with opencode..."
if ($Project) {
  if (-not (Test-Path -LiteralPath $Project -PathType Container)) {
    Fail "Project folder not found: $Project"
  }
  $Project = (Resolve-Path -LiteralPath $Project).Path
  Invoke-Native opencode @("plugin", $root) $Project
  $scope = $Project
} else {
  Invoke-Native opencode @("plugin", $root, "-g")
  $scope = "global"
}

if ($script:LastNativeExitCode -ne 0) {
  Fail "opencode could not register the plugin. Add '$root' to opencode.jsonc and tui.json manually (see README.md)."
}

Good "Plugin registered ($scope)"
Write-Host ""
Good "Done. Restart opencode, then run /files."
Write-Host ""
