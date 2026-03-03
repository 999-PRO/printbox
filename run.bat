@echo off
chcp 65001 >nul
echo ========================================
echo    999 PRO - File Receiver System
echo ========================================
echo.

echo Installing dependencies...
pip install -r requirements.txt -q

echo.
echo Starting server...
echo.
python -m app.main

pause
