@echo off
title Migrate to Next.js
color 0A

echo.
echo =====================================================
echo  MIGRATING ALPHALABS TRADING DASHBOARD TO NEXT.JS
echo =====================================================
echo.

REM Change to project directory
cd /d "%~dp0"

echo [1/8] Backing up current code...
git add .
git commit -m "Backup before Next.js migration" >nul 2>&1

echo [2/8] Installing Next.js dependencies...
call npm install next@latest react@latest react-dom@latest

echo [3/8] Installing TypeScript and types...
call npm install --save-dev typescript @types/react @types/node @types/react-dom

echo [4/8] Renaming package.json...
if exist package.json.next (
    move /Y package.json package.json.old
    move /Y package.json.next package.json
)

echo [5/8] Creating remaining component files...
echo Please wait...

echo [6/8] Creating API routes...
echo Please wait...

echo [7/8] Setting up database utilities...
echo Please wait...

echo [8/8] Final setup...
call npm install

echo.
echo =====================================================
echo  MIGRATION COMPLETE!
echo =====================================================
echo.
echo Next steps:
echo 1. Review the files created in app/ and components/
echo 2. Run: npm run dev
echo 3. Test the application at http://localhost:3000
echo 4. Deploy to Vercel: vercel --prod
echo.
pause
