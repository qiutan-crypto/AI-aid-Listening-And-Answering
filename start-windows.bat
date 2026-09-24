@echo off
rem Double-click to start the English conversation assistant on Windows.
cd /d "%~dp0"

where node >/dev/null 2>nul
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

rem Open the page a few seconds after the server starts.
start "" cmd /c "timeout /t 3 >/dev/null & start http://localhost:3000"
call npm start
pause
