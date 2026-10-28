@echo off
title WorkLab XC - Running (close this window to stop)
cd /d "%~dp0"
if not exist ".env" (
  echo First run: installing first ...
  call "%~dp0INSTALL-Windows.bat"
)
if not exist ".env" goto :end
set PYCMD=python
python -c "import sys" >nul 2>&1 || set PYCMD=py -3
echo Starting WorkLab XC. Your browser opens when it is ready (first start can take a minute or two).
%PYCMD% scripts\run.py --open
:end
echo.
echo WorkLab XC stopped.
pause
