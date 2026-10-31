@echo off
title AirCast Pro
cd /d "%~dp0"
if exist "%~dp0dist\win-unpacked\AirCast Pro.exe" (
    start "" "%~dp0dist\win-unpacked\AirCast Pro.exe"
) else (
    npm start
)

