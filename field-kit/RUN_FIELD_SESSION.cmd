@echo off
setlocal
if "%~1"=="" (
  echo Drag a CSV/XLSX file onto RUN_FIELD_SESSION.cmd, or run:
  echo RUN_FIELD_SESSION.cmd "C:\path\to\sales.xlsx"
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\run-field-session.ps1" -File "%~1"
endlocal
