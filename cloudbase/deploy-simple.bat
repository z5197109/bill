@echo off
chcp 65001 >nul

echo [INFO] Starting CloudBase deployment...

REM Check if cloudbase command exists
echo [INFO] Checking CloudBase CLI...
where cloudbase >nul 2>&1
if errorlevel 1 (
    echo [ERROR] CloudBase CLI not found. Please install it first:
    echo npm install -g @cloudbase/cli
    pause
    exit /b 1
)

echo [SUCCESS] CloudBase CLI found

REM Check version
echo [INFO] CloudBase CLI version:
cloudbase --version

REM Try to list environments to check login status
echo [INFO] Checking login status...
cloudbase env:list >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not logged in to CloudBase or no environments found
    echo Please run: cloudbase login
    echo Then create an environment in the console
    pause
    exit /b 1
)

echo [SUCCESS] Login status OK

REM Install dependencies
echo [INFO] Installing project dependencies...
npm install

echo [INFO] Installing cloud function dependencies...
cd functions\user-service
npm install
cd ..\..

echo [INFO] Installing script dependencies...
cd scripts
npm install
cd ..

echo [SUCCESS] All dependencies installed

REM Deploy a single function for testing
echo [INFO] Deploying user-service function...
cloudbase fn:deploy user-service --env dev-4g40wh23d397fbae

echo [SUCCESS] Deployment test completed
pause