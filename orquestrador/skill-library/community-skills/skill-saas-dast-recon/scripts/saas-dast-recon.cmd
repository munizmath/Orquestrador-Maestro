@echo off
setlocal EnableExtensions

set "TARGET=%~1"
set "CONFIRM=%~2"
set "OUT=%CD%\security-reports\dast"
set "GATE_FAILED=0"

if "%TARGET%"=="" (
  echo Usage: saas-dast-recon.cmd https://staging.example.com --i-own-this-target
  exit /b 2
)

if /I not "%CONFIRM%"=="--i-own-this-target" (
  echo Refusing to scan without explicit authorization flag.
  echo Usage: saas-dast-recon.cmd %TARGET% --i-own-this-target
  exit /b 3
)

powershell -NoProfile -Command "$u = $env:TARGET; if ($u -match '^https?://') { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Refusing to scan because target must start with http:// or https://
  exit /b 4
)

if not exist "%OUT%" mkdir "%OUT%" >nul 2>nul

echo Authorized DAST/recon started: %DATE% %TIME%
echo Target: %TARGET%
echo Authorization: explicit target ownership flag present
echo Reports: %OUT%
echo.

call :run_nuclei
call :run_katana
call :run_zap

echo.
if "%GATE_FAILED%"=="1" (
  echo DAST/recon finished with blocking findings or tool failures. Review files in:
  echo %OUT%
  exit /b 1
)

echo DAST/recon finished without blocking scanner exit codes. Review files in:
echo %OUT%
exit /b 0

:run_nuclei
where nuclei >nul 2>nul
if errorlevel 1 (
  echo Skipping nuclei: tool not installed or not on PATH.
  exit /b 0
)
echo Running nuclei with conservative scope and rate limits...
nuclei -u "%TARGET%" -severity medium,high,critical -rate-limit 5 -retries 1 -timeout 8 -jsonl -o "%OUT%\nuclei.jsonl"
if errorlevel 1 (
  echo Gate failed: nuclei reported findings or failed to complete.
  set "GATE_FAILED=1"
)
exit /b 0

:run_katana
where katana >nul 2>nul
if errorlevel 1 (
  echo Skipping katana: tool not installed or not on PATH.
  exit /b 0
)
echo Running katana within the provided URL scope...
katana -u "%TARGET%" -silent -rate-limit 5 -depth 2 -o "%OUT%\katana.txt"
if errorlevel 1 (
  echo Katana failed to complete; review output manually.
)
exit /b 0

:run_zap
where docker >nul 2>nul
if errorlevel 1 (
  echo Skipping ZAP baseline: docker not installed or not on PATH.
  exit /b 0
)
if "%ZAP_DOCKER_IMAGE%"=="" (
  echo Skipping ZAP baseline: set ZAP_DOCKER_IMAGE to a pinned or explicitly approved image first.
  exit /b 0
)
echo Running ZAP baseline with configured image: %ZAP_DOCKER_IMAGE%
docker run --rm -v "%OUT%:/zap/wrk:rw" "%ZAP_DOCKER_IMAGE%" zap-baseline.py -t "%TARGET%" -r zap-baseline.html -J zap-baseline.json
if errorlevel 1 (
  echo Gate failed: ZAP baseline reported warnings/failures. Triage zap-baseline outputs.
  set "GATE_FAILED=1"
)
exit /b 0
