@echo off
chcp 65001 >nul
REM CloudBase Deploy Script (Windows)
REM Usage: deploy.bat [env] [action]
REM env: dev (development) | prod (production)
REM action: all (all) | functions (functions only) | db (database only)

setlocal enabledelayedexpansion

REM Set default parameters
set ENV=%1
set ACTION=%2
if "%ENV%"=="" set ENV=dev
if "%ACTION%"=="" set ACTION=all

REM Validate parameters
if not "%ENV%"=="dev" if not "%ENV%"=="prod" (
    echo [ERROR] Invalid environment parameter, use dev or prod
    exit /b 1
)

if not "%ACTION%"=="all" if not "%ACTION%"=="functions" if not "%ACTION%"=="db" (
    echo [ERROR] Invalid action parameter, use all, functions or db
    exit /b 1
)

echo [INFO] Starting deployment to %ENV% environment, action: %ACTION%

REM Set environment variables
if "%ENV%"=="prod" (
    set CLOUDBASE_ENV=prod-3g0drdmz9b335b02
    echo [WARNING] Deploying to production environment, please confirm all configurations are correct!
    set /p confirm="Continue? (y/N): "
    if not "!confirm!"=="y" if not "!confirm!"=="Y" (
        echo [INFO] Deployment cancelled
        exit /b 0
    )
) else (
    set CLOUDBASE_ENV=dev-4g40wh23d397fbae
)

echo [INFO] Using environment ID: %CLOUDBASE_ENV%

REM Check CloudBase CLI
cloudbase --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] CloudBase CLI not installed, please install first: npm install -g @cloudbase/cli
    exit /b 1
)

REM Check login status by trying to list environments
cloudbase env:list >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not logged in to CloudBase or no environments found, please login first: cloudbase login
    exit /b 1
)

REM Install dependencies
echo [INFO] Installing project dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install project dependencies
    exit /b 1
)

echo [INFO] Installing cloud function dependencies...
for /d %%i in (functions\*) do (
    if exist "%%i\package.json" (
        echo [INFO] Installing %%~ni dependencies...
        pushd "%%i"
        call npm install
        if errorlevel 1 (
            echo [ERROR] Failed to install %%~ni dependencies
            popd
            exit /b 1
        )
        popd
    )
)

echo [INFO] Installing script dependencies...
pushd scripts
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install script dependencies
    popd
    exit /b 1
)
popd

REM 根据操作类型执行相应步骤
if "%ACTION%"=="all" goto deploy_all
if "%ACTION%"=="functions" goto deploy_functions_only
if "%ACTION%"=="db" goto init_db_only

:deploy_all
call :deploy_functions
if errorlevel 1 exit /b 1
call :init_database
if errorlevel 1 exit /b 1
call :verify_deployment
goto end

:deploy_functions_only
call :deploy_functions
if errorlevel 1 exit /b 1
call :verify_deployment
goto end

:init_db_only
call :init_database
if errorlevel 1 exit /b 1
goto end

REM Deploy cloud functions
:deploy_functions
echo [INFO] Deploying cloud functions...
for /d %%i in (functions\*) do (
    set func_name=%%~ni
    echo [INFO] Deploying cloud function: !func_name!
    cloudbase fn deploy "!func_name!" -e %CLOUDBASE_ENV% --dir "functions\!func_name!"
    if errorlevel 1 (
        echo [ERROR] Failed to deploy cloud function !func_name!
        exit /b 1
    )
    echo [SUCCESS] Cloud function !func_name! deployed successfully
)
exit /b 0

REM Initialize database
:init_database
echo [INFO] Initializing database...
pushd scripts
call npm run init-db-full
if errorlevel 1 (
    echo [ERROR] Failed to initialize database
    popd
    exit /b 1
)
popd
echo [SUCCESS] Database initialized successfully
exit /b 0

REM Verify deployment
:verify_deployment
echo [INFO] Verifying deployment...
echo [INFO] Checking cloud function status...
for /d %%i in (functions\*) do (
    set func_name=%%~ni
    cloudbase fn detail "!func_name!" -e %CLOUDBASE_ENV% >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] Cloud function !func_name! may have issues
    ) else (
        echo [SUCCESS] Cloud function !func_name! is running normally
    )
)

echo [INFO] Checking database collections...
pushd scripts
call npm run db-stats
if errorlevel 1 (
    echo [WARNING] Database check failed
) else (
    echo [SUCCESS] Database check completed
)
popd
exit /b 0

:end
echo [SUCCESS] Deployment completed!
echo.
echo [INFO] Next steps:
echo 1. Configure environment ID in miniprogram: %CLOUDBASE_ENV%
echo 2. Configure environment variables in CloudBase console
echo 3. Test miniprogram functionality
if "%ENV%"=="prod" (
    echo 4. Submit miniprogram for review
)

echo [SUCCESS] All operations completed!
pause