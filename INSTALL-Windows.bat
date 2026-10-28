@echo off
title WorkLab XC - Install
cd /d "%~dp0"
echo ============================================================
echo   WorkLab XC - installing everything this project needs
echo   (Python, Node.js, packages, settings file). Takes a few minutes.
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
if errorlevel 1 (
  echo ------------------------------------------------------------
  echo   The install did not finish. Read the red messages above.
  echo ------------------------------------------------------------
) else (
  echo ------------------------------------------------------------
  echo   Install finished.  Now double-click  START-Windows.bat
  echo ------------------------------------------------------------
)
pause
