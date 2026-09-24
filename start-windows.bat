@echo off
rem Double-click to start the English conversation assistant on Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, this only happens the first time...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist .env (
  copy .env.example .env >nul
  echo Created .env - fill in DEEPGRAM_API_KEY and GEMINI_API_KEY, save, close Notepad.
  notepad .env
)

rem Use PORT from .env if it is set (default 3000).
set "PORT=3000"
for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
set "PORT=%PORT: =%"

rem Open the page a few seconds after the server starts.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"
call npm start
pause
