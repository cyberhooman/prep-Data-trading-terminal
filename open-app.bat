@echo off
REM Simple script to start the app and open in browser
title Starting Trading Dashboard
cd /d "%~dp0"

echo Starting the server...
start /B npm run dev:express

echo Waiting for server to be ready...
timeout /t 5 /nobreak >nul

echo Opening in browser...
start http://localhost:3000

echo.
echo Your app should open in your browser shortly!
echo If not, visit: http://localhost:3000
echo.
echo Press any key to close this window (app will keep running)...
pause >nul
