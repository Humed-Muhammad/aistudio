@echo off
rem Starts Humed's AI Studio inside Ubuntu (WSL) and opens it in your browser.
rem Keep this window open while you work; close it to stop the studio.
title Humed's AI Studio
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://127.0.0.1:8770"
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd ~/ai-studio && make run"
pause
