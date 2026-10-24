# Humed's AI Studio: one-step install for Windows 10 (version 2004 or newer) and Windows 11.
# The studio runs inside Ubuntu on WSL2, the Linux that is built into Windows. This script:
#   1. turns on WSL and installs Ubuntu 24.04 (first run only; Windows may ask you to restart),
#   2. copies this folder into Ubuntu at ~/ai-studio and runs install-ubuntu.sh there,
#   3. puts a "Humed's AI Studio" shortcut on your desktop that starts the studio.
# Safe to run again. Makes no paid API calls.
# Run: right-click this file > "Run with PowerShell", or in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

$ErrorActionPreference = 'Stop'
$Distro = 'Ubuntu-24.04'
function Step($text) { Write-Host "`n==> $text" -ForegroundColor Yellow }
function Stop-With($text) { Write-Host "`nStopped: $text" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
function Get-Distros {
    # wsl.exe prints UTF-16; strip the zero bytes so the names compare normally.
    try { (& wsl.exe -l -q 2>$null) -replace "`0", '' | ForEach-Object { $_.Trim() } | Where-Object { $_ } } catch { @() }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not ((Get-Distros) -contains $Distro)) {
    if (-not $isAdmin) {
        Step 'Asking for administrator rights to turn on WSL'
        Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        exit
    }
    Step "Installing WSL and $Distro (a few minutes)"
    & wsl.exe --install -d $Distro
    Write-Host ''
    Write-Host 'Next:' -ForegroundColor Green
    Write-Host ' 1. If Windows asks you to restart, restart now.'
    Write-Host " 2. When the Ubuntu window opens, choose a username and password (the password is typed invisibly)."
    Write-Host ' 3. Run this script again to finish installing the studio.'
    Read-Host 'Press Enter to close'
    exit
}

$user = ((& wsl.exe -d $Distro -- whoami) -join '').Trim()
if (-not $user -or $user -eq 'root') {
    Stop-With "Ubuntu has no user yet. Open 'Ubuntu 24.04' from the Start menu, choose a username and password, then run this script again."
}

Step "Copying the studio into Ubuntu (~/ai-studio)"
$src = ((& wsl.exe -d $Distro -- wslpath -a ($PSScriptRoot -replace '\\', '/')) -join '').Trim()
if (-not $src) { Stop-With 'Could not find this folder from inside Ubuntu.' }
# Your keys (.env), clients, videos and downloaded models inside Ubuntu are never overwritten.
$copy = "set -e; mkdir -p ~/ai-studio; tar -C '$src' --exclude=./.git --exclude=./.venv --exclude=./.venv-face --exclude=./node_modules --exclude=./motion/node_modules --exclude=./motion/whisper.cpp --exclude=./graphics-kit/node_modules --exclude=./runs --exclude=./models --exclude=./sfx-library --exclude=./.env --exclude=./clients.json -cf - . | tar -C ~/ai-studio -xf -"
& wsl.exe -d $Distro -- bash -lc $copy
if ($LASTEXITCODE -ne 0) { Stop-With 'Copying into Ubuntu failed.' }

Step 'Installing inside Ubuntu (asks for your Ubuntu password once; 10-20 minutes the first time)'
& wsl.exe -d $Distro -- bash -lc 'cd ~/ai-studio && bash install-ubuntu.sh'
if ($LASTEXITCODE -ne 0) { Stop-With 'The Ubuntu install did not finish. Read the message above, fix it, and run this script again.' }

Step 'Adding a desktop shortcut'
$desktop = [Environment]::GetFolderPath('Desktop')
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop "Humed's AI Studio.lnk"))
$link.TargetPath = Join-Path $PSScriptRoot 'start-windows.cmd'
$link.WorkingDirectory = $PSScriptRoot
$link.Save()

Write-Host "`nDone. Double-click 'Humed's AI Studio' on your desktop (or start-windows.cmd in this folder)." -ForegroundColor Green
Write-Host 'It opens http://127.0.0.1:8770 in your browser. Keep the black window open while you work.'
Write-Host 'Optional keys: in Ubuntu run  nano ~/ai-studio/.env  and add ANTHROPIC_API_KEY / ELEVENLABS_API_KEY.'
Read-Host 'Press Enter to close'
