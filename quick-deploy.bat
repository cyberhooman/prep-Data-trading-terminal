@echo off
REM Quick Deploy - One-click deployment to Vercel
title Quick Deploy to Vercel
color 0B

cd /d "%~dp0"

echo.
echo  QUICK DEPLOY TO VERCEL
echo  ======================
echo.

REM Check if Vercel CLI is installed
where vercel >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing Vercel CLI...
    npm install -g vercel
)

REM Add, commit, and push changes
git add .
git commit -m "Quick deploy - %date% %time%" >nul 2>&1
git push origin main >nul 2>&1

REM Deploy to Vercel production
echo Deploying...
vercel --prod --yes

echo.
echo Done! Check the URL above.
timeout /t 10
