@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo First run: installing, this takes about a minute...
  call npm install
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
