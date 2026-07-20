[CmdletBinding()]
param(
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
$grokRoot = Join-Path $HomePath ".grok"
New-Item -ItemType Directory -Force -Path $grokRoot | Out-Null
$template = Join-Path $RepoRoot "tool-profiles\grok\config.toml"
Copy-Item -LiteralPath $template -Destination (Join-Path $grokRoot "config.toml") -Force
$agentsRoot = Join-Path $HomePath ".agents"
New-Item -ItemType Directory -Force -Path $agentsRoot | Out-Null
$globalAgents = Join-Path $HomePath "AGENTS.md"
if (-not (Test-Path -LiteralPath $globalAgents)) {
  @("# Global Orquestrador Maestro", "", "Read $HomePath/.orquestrador/rules.md and $HomePath/.orquestrador/maestro.md before substantive work.") | Set-Content -LiteralPath $globalAgents -Encoding UTF8
}
[pscustomobject]@{ Config = (Join-Path $grokRoot "config.toml"); Skills = (Join-Path $HomePath ".agents\skills"); GlobalAgents = $globalAgents }
