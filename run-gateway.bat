@echo off
setlocal

cd /d "%~dp0\backend\himilet-gateway"

if not exist node_modules (
    echo [1/2] Installing gateway dependencies...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [2/2] Starting HiMilet gateway...
npm run dev

endlocal
