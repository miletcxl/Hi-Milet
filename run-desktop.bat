@echo off
setlocal

cd /d "%~dp0"

set "DOTNET_EXE=%ProgramFiles%\dotnet\dotnet.exe"
if not exist "%DOTNET_EXE%" set "DOTNET_EXE=dotnet"

set "PET_CONFIG=..\VPet\VPet-Simulator.Windows\mod\0000_core\pet\vup.lps"
if not exist "%PET_CONFIG%" (
    echo [ERROR] VPet pet config not found:
    echo         %PET_CONFIG%
    echo Please keep folder layout: Hi^!Milet\HiMilet and Hi^!Milet\VPet
    pause
    exit /b 1
)

echo [1/2] Building HiMilet.Desktop...
taskkill /IM HiMilet.Desktop.exe /F >nul 2>nul
"%DOTNET_EXE%" build ".\HiMilet.sln" -c Debug
if errorlevel 1 (
    echo [ERROR] build failed.
    pause
    exit /b 1
)

echo [2/2] Launching desktop pet...
start "" ".\src\HiMilet.Desktop\bin\Debug\net8.0-windows\HiMilet.Desktop.exe"

endlocal
