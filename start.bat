@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js 18 或更高版本。
  echo 下载地址：https://nodejs.org/
  pause
  exit /b 1
)
echo 正在启动会议纪要助手...
echo 打开浏览器访问：http://127.0.0.1:4173
start http://127.0.0.1:4173
node server.mjs
pause
