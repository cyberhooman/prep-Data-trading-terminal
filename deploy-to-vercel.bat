@echo off
title Deploy Alphalabs Trading Dashboard to Vercel
color 0A

echo.
echo ========================================
echo  ALPHALABS TRADING DASHBOARD DEPLOYER
echo ========================================
echo.
echo This will deploy your app to Vercel...
echo.

REM Change to the project directory
cd /d "%~dp0"

echo [1/4] Checking Vercel CLI installation...
where vercel >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Vercel CLI not found!
    echo.
    echo Please install it first by running:
    echo npm install -g vercel
    echo.
    pause
    exit /b 1
)

echo [2/4] Checking for uncommitted changes...
git status --porcelain >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Git not initialized or not found
) else (
    git add .
    git commit -m "Update before Vercel deployment - %date% %time%"
    echo [3/4] Pushing to GitHub...
    git push origin main
)

echo [4/4] Deploying to Vercel...
echo.
vercel --prod

echo.
echo ========================================
echo  DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Your app should be live at the URL shown above.
echo.
pause
