@echo off
setlocal

set "ROOT=%~dp0"

echo Starting Audio Notes backend and frontend...
echo.

if not exist "%ROOT%venv\Scripts\python.exe" (
    echo ERROR: Python virtual environment not found at "%ROOT%venv".
    echo Please create/install the backend environment first.
    pause
    exit /b 1
)

if not exist "%ROOT%frontend\node_modules" (
    echo ERROR: Frontend dependencies not found at "%ROOT%frontend\node_modules".
    echo Please run "npm install" inside the frontend folder first.
    pause
    exit /b 1
)

:: Use python -m uvicorn (NOT uvicorn.exe) so the subprocess uses the correct venv.
:: PYTHONUTF8=1 prevents encoding errors on Windows with non-ASCII transcripts.
start "Audio Notes Backend" cmd /k "set "PYTHONUTF8=1" && cd /d "%ROOT%backend" && "%ROOT%venv\Scripts\python.exe" -m uvicorn main:app --host localhost --port 8000 --reload"
start "Audio Notes Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev -- --host localhost --port 5173"

echo.
echo  Backend:  http://localhost:8000  (with --reload)
echo  Frontend: http://localhost:5173
echo.
echo  GPU: RTX 3050 CUDA enabled - Whisper and Qwen will load on GPU.
echo  Two terminal windows were opened. Close them to stop the servers.
pause
