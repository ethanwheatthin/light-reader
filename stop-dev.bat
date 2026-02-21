@echo off
echo Stopping lib-reader development servers...
echo.

REM Kill nodemon first to prevent respawning
echo Stopping nodemon processes...
taskkill /F /IM nodemon.exe >nul 2>&1
taskkill /F /IM ts-node.exe >nul 2>&1

REM Kill all processes on ports with force and child processes
echo Stopping backend server (port 3030)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3030" ^| findstr "LISTENING"') do (
    echo   Killing process %%a
    taskkill /F /T /PID %%a >nul 2>&1
)

echo Stopping Angular server (port 4200)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4200" ^| findstr "LISTENING"') do (
    echo   Killing process %%a
    taskkill /F /T /PID %%a >nul 2>&1
)

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Verify cleanup
echo.
echo Verifying ports are free...
netstat -ano | findstr ":3030" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port 3030 may still be in use
) else (
    echo   Port 3030: Free
)

netstat -ano | findstr ":4200" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port 4200 may still be in use
) else (
    echo   Port 4200: Free
)

REM Stop Docker containers (optional, uncomment if you want to stop the database too)
REM echo Stopping PostgreSQL container...
REM docker compose down

echo.
echo All development servers stopped.
pause
