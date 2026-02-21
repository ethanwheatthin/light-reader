@echo off
echo Starting lib-reader development servers...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running!
    echo.
    echo Please start Docker Desktop and try again.
    echo The backend requires PostgreSQL which runs in Docker.
    echo.
    pause
    exit /b 1
)

REM Check and install frontend dependencies
if not exist "node_modules\" (
    echo Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install frontend dependencies!
        pause
        exit /b 1
    )
    echo.
)

REM Check and install backend dependencies
if not exist "backend\node_modules\" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    if errorlevel 1 (
        echo Failed to install backend dependencies!
        pause
        exit /b 1
    )
    cd ..
    echo.
)

REM Start PostgreSQL container
echo Starting PostgreSQL database...
docker compose up -d postgres
if errorlevel 1 (
    echo Failed to start PostgreSQL container!
    pause
    exit /b 1
)

REM Wait for PostgreSQL to be healthy
echo Waiting for database to be ready...
:waitloop
docker compose ps postgres | findstr "healthy" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitloop
)
echo Database is ready!
echo.

REM Clean up any existing processes
echo Cleaning up existing processes...

REM Kill all node-related processes more aggressively
taskkill /F /IM nodemon.exe >nul 2>&1
taskkill /F /IM ts-node.exe >nul 2>&1

REM Kill processes on ports multiple times to ensure cleanup
for /L %%i in (1,1,3) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3030" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
        taskkill /F /T /PID %%a >nul 2>&1
    )
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4200" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
        taskkill /F /T /PID %%a >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)

REM Wait for ports to be fully released
echo Waiting for ports to be released...
timeout /t 3 /nobreak >nul

REM Verify ports are free
set PORT_ERROR=0
netstat -ano | findstr ":3030" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port 3030 is still in use!
    set PORT_ERROR=1
)

netstat -ano | findstr ":4200" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port 4200 is still in use!
    set PORT_ERROR=1
)

if %PORT_ERROR%==1 (
    echo.
    echo Please manually close any Node.js processes and try again.
    echo You can also run: taskkill /F /IM node.exe
    pause
    exit /b 1
)

echo Ports are clear!
echo.

REM Start backend server in a new window
echo Starting backend server...
start "Backend Server" cmd /k "cd backend && npm run dev"

REM Wait a moment to let backend start first
timeout /t 3 /nobreak >nul

REM Start Angular app in a new window
echo Starting Angular app...
start "Angular App" cmd /k "npm start"

echo.
echo All services are starting:
echo - PostgreSQL: localhost:5432 (Docker)
echo - Backend: http://localhost:3030
echo - Angular: http://localhost:4200
echo.
echo To stop the database: docker compose down
echo Close this window or press any key to exit...
pause >nul
