@echo off
chcp 65001 >nul
title 多多AI客服 · 激活码生成器
cd /d "%~dp0"

REM 找 node:先看 PATH,再看常见安装位置
where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE=node"
) else if exist "C:\Program Files\nodejs\node.exe" (
  set "NODE=C:\Program Files\nodejs\node.exe"
) else if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
) else (
  echo.
  echo  [错误] 没找到 Node.js
  echo  请先安装 Node.js: https://nodejs.org  然后重新双击本文件。
  echo.
  pause
  exit /b 1
)

echo  正在启动激活码生成器,浏览器会自动打开...
echo  发码时保持本窗口开着,关掉窗口即停止。
"%NODE%" "%~dp0license-gui.mjs"
pause
