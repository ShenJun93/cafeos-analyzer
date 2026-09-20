@echo off
setlocal
if "%~1"=="" (
  echo Drag a field-session folder onto FINALIZE_FIELD_SESSION.cmd, or run:
  echo FINALIZE_FIELD_SESSION.cmd "C:\path\to\field-sessions\20260920-130000"
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\finalize-field-session.ps1" -SessionFolder "%~1"
endlocal
