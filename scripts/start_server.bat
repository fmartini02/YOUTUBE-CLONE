@echo off
cd /d "%~dp0.."
title YTProxy Server
echo.
echo   ^> YTProxy Server
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Errore: Python non trovato. Scaricalo da https://python.org
    pause
    exit /b 1
)

:: Install deps
echo Verifica dipendenze...
pip install -r server\requirements.txt -q

:: Build frontend if needed
if not exist "frontend\dist" (
    echo Build del frontend...
    cd frontend
    call npm install --silent
    call npm run build --silent
    cd ..
)

:: Get IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set LOCAL_IP=%%a
    goto :found
)
:found
set LOCAL_IP=%LOCAL_IP: =%

echo.
echo   Server pronto!
echo.
echo   Questo PC:    http://localhost:8090
echo   Telefono/TV:  http://%LOCAL_IP%:8090
echo.
echo   Assicurati che telefono e PC siano sulla stessa WiFi
echo.

:: Libera la porta 8090 (istanza precedente rimasta appesa)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":8090 .*LISTENING"') do (
    echo   Porta 8090 occupata ^(PID %%a^) - chiudo il processo...
    taskkill /PID %%a /F >nul 2>&1
)

cd server
python -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload
pause
