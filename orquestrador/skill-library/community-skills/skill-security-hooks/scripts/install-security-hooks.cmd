@echo off
setlocal EnableExtensions

set "REPO=%~1"
set "CONFIRM=%~2"
if "%REPO%"=="" set "REPO=%CD%"

if /I not "%CONFIRM%"=="--authorized-local-repo" (
  echo Refusing to install hooks without explicit local repository authorization.
  echo Usage: install-security-hooks.cmd "C:\path\to\repo" --authorized-local-repo
  exit /b 3
)

if not exist "%REPO%\.git\" (
  echo Git repository not found: %REPO%
  exit /b 2
)

set "HOOKS=%REPO%\.githooks"
if not exist "%HOOKS%" mkdir "%HOOKS%" >nul 2>nul

if exist "%HOOKS%\pre-commit" (
  echo Refusing to overwrite existing %HOOKS%\pre-commit
  exit /b 4
)

if exist "%HOOKS%\pre-push" (
  echo Refusing to overwrite existing %HOOKS%\pre-push
  exit /b 4
)

> "%HOOKS%\pre-commit" echo #!/bin/sh
>>"%HOOKS%\pre-commit" echo set -eu
>>"%HOOKS%\pre-commit" echo if command -v gitleaks ^> /dev/null 2^>^&1; then
>>"%HOOKS%\pre-commit" echo   gitleaks protect --staged --redact
>>"%HOOKS%\pre-commit" echo else
>>"%HOOKS%\pre-commit" echo   echo "gitleaks not installed; skipping local secret scan"
>>"%HOOKS%\pre-commit" echo fi

> "%HOOKS%\pre-push" echo #!/bin/sh
>>"%HOOKS%\pre-push" echo set -eu
>>"%HOOKS%\pre-push" echo cmd.exe /d /c "{{USER_HOME}}/.orquestrador\skills\skill-saas-security-scan\scripts\saas-security-scan.cmd" "." "--authorized-local-repo"

pushd "%REPO%" >nul || exit /b 2
for /f "delims=" %%H in ('git config --get core.hooksPath 2^>nul') do set "EXISTING_HOOKS_PATH=%%H"
if not "%EXISTING_HOOKS_PATH%"=="" if /I not "%EXISTING_HOOKS_PATH%"==".githooks" (
  echo Refusing to replace existing core.hooksPath: %EXISTING_HOOKS_PATH%
  popd >nul
  exit /b 5
)
git config core.hooksPath .githooks
popd >nul

echo Installed security hooks in %HOOKS%
echo Git core.hooksPath now points to .githooks
exit /b 0
