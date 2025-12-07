@echo off
echo ========================================
echo    Atlantis Analyst Demo
echo ========================================
echo.
echo Starting server...
echo.
echo Open in browser: http://localhost:8080
echo.
echo Press Ctrl+C to stop
echo.
cd /d "%~dp0"
npx serve -s . -l 8080
pause

