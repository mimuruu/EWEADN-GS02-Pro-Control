@echo off
REM ============================================================
REM  EWEADN GS02 Pro Control Hub - Launcher
REM  Jalankan versi .exe bila ada, kalau tidak jalankan skrip Python.
REM ============================================================
cd /d "%~dp0"

if exist "GS02Pro-Control.exe" (
    start "" "GS02Pro-Control.exe"
    exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw main.py
    exit /b 0
)

echo Python tidak ditemukan. Pasang Python 3.10+ lalu jalankan:
echo     pip install -r requirements.txt
echo     python main.py
pause
