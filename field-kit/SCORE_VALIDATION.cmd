@echo off
setlocal
if not exist "%~dp0..\field-validation-registry.json" (
  echo No field-validation-registry.json exists yet.
  pause
  exit /b 2
)
node "%~dp0..\scripts\field-registry.mjs" score "%~dp0..\field-validation-registry.json"
pause
endlocal
