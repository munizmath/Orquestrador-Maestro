param(
  [string]$Distro = "",
  [string]$ProjectPath = "~/Projetos/Orquestrador-Maestro",
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

function Invoke-Wsl {
  param([string]$Command)
  wsl -d $Distro -- bash -lc $Command
}

function Get-WslDistros {
  $raw = wsl -l -q
  return $raw | ForEach-Object { ($_ -replace "`0", "").Trim() } | Where-Object { $_ }
}

function Test-LocalPort {
  param([int]$PortToCheck)
  try {
    $client = New-Object Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $PortToCheck, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(500)
    if ($connected) { $client.EndConnect($async) }
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

$distros = Get-WslDistros
if (-not $Distro) {
  if ($distros -contains "Ubuntu") { $Distro = "Ubuntu" }
  elseif ($distros.Count -gt 0) { $Distro = $distros[0] }
}

if (-not $Distro) {
  throw "Nenhuma distro WSL encontrada. Instale ou habilite uma distro Ubuntu/WSL antes de continuar."
}

if ($distros -notcontains $Distro) {
  throw "Distro WSL '$Distro' nao encontrada. Disponiveis: $($distros -join ', ')"
}

Write-Host "Using WSL distro: $Distro"

$healthCommand = "cd $ProjectPath && node bin/orquestrador-maestro.js setup doctor --json >/tmp/orquestrador-setup-doctor.json && node bin/orquestrador-maestro.js health local"
Invoke-Wsl $healthCommand

if (Test-LocalPort -PortToCheck $Port) {
  Write-Host "Port $Port is already open. Reusing existing local server."
} else {
  $serverCommand = "cd $ProjectPath && node bin/orquestrador-maestro.js server start --port $Port"
  Write-Host "Starting local server on port $Port"
  Start-Process -FilePath "wsl.exe" -ArgumentList @("-d", $Distro, "--", "bash", "-lc", $serverCommand) | Out-Null
  Start-Sleep -Seconds 2
}

$url = "http://127.0.0.1:$Port/setup"
Write-Host "Opening $url"
Start-Process $url
