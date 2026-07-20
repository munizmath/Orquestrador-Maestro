@echo off
setlocal EnableExtensions

set "REPO=%~1"
set "CONFIRM=%~2"
if "%REPO%"=="" set "REPO=%CD%"

if /I not "%CONFIRM%"=="--authorized-local-repo" (
  echo Refusing to scan without explicit local repository authorization.
  echo Usage: saas-security-scan.cmd "C:\path\to\repo" --authorized-local-repo
  exit /b 3
)

if not exist "%REPO%\" (
  echo Repository path not found: %REPO%
  exit /b 2
)

pushd "%REPO%" >nul || exit /b 2
set "OUT=%CD%\security-reports"
if not exist "%OUT%" mkdir "%OUT%" >nul 2>nul

set "GATE_FAILED=0"

echo Security scan started: %DATE% %TIME%
echo Repository: %CD%
echo Authorization: explicit local repository authorization flag present
echo Reports: %OUT%
echo.

call :run_gitleaks
call :run_semgrep
call :run_osv
call :run_trivy
call :run_npm_audit

echo.
if "%GATE_FAILED%"=="1" (
  echo Security scan finished with blocking findings or tool failures. Review files in:
  echo %OUT%
  popd >nul
  exit /b 1
)

echo Security scan finished without blocking scanner exit codes. Review files in:
echo %OUT%
popd >nul
exit /b 0

:run_gitleaks
where gitleaks >nul 2>nul
if errorlevel 1 (
  echo Skipping gitleaks: tool not installed or not on PATH.
  exit /b 0
)
echo Running gitleaks...
gitleaks detect --source "." --redact --report-format json --report-path "%OUT%\gitleaks.json"
if errorlevel 1 (
  echo Gate failed: gitleaks reported possible secrets.
  set "GATE_FAILED=1"
)
exit /b 0

:run_semgrep
where semgrep >nul 2>nul
if errorlevel 1 (
  echo Skipping semgrep: tool not installed or not on PATH.
  exit /b 0
)
echo Running semgrep...
semgrep scan --config p/owasp-top-ten --config p/secrets --severity ERROR --error --json --output "%OUT%\semgrep.json" "."
if errorlevel 1 (
  echo Gate failed: semgrep reported blocking findings or failed to complete.
  set "GATE_FAILED=1"
)
exit /b 0

:run_osv
where osv-scanner >nul 2>nul
if errorlevel 1 (
  echo Skipping osv-scanner: tool not installed or not on PATH.
  exit /b 0
)
echo Running osv-scanner...
osv-scanner scan --recursive --format json --output "%OUT%\osv-scanner.json" "."
if errorlevel 1 (
  echo Gate failed: osv-scanner reported vulnerable dependencies.
  set "GATE_FAILED=1"
)
exit /b 0

:run_trivy
where trivy >nul 2>nul
if errorlevel 1 (
  echo Skipping trivy: tool not installed or not on PATH.
  exit /b 0
)
echo Running trivy...
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format json --output "%OUT%\trivy-fs.json" "."
if errorlevel 1 (
  echo Gate failed: trivy reported high or critical findings.
  set "GATE_FAILED=1"
)
exit /b 0

:run_npm_audit
if not exist package-lock.json (
  echo Skipping npm audit: package-lock.json not found.
  exit /b 0
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Skipping npm audit: npm not installed or not on PATH.
  exit /b 0
)
echo Running npm audit because package-lock.json exists.
npm audit --audit-level=high --json > "%OUT%\npm-audit.json" 2> "%OUT%\npm-audit.err"
if errorlevel 1 (
  echo Gate failed: npm audit reported high or critical vulnerable dependencies.
  set "GATE_FAILED=1"
)
exit /b 0
