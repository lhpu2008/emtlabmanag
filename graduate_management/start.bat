@echo off
chcp 65001 > nul
title 研路通 - 研究生管理系统

echo ====================================================
echo   研路通 研究生管理系统 - 一键启动脚本
echo ====================================================
echo.

:: 检查 Python 是否安装
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    echo   下载地址：https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 安装依赖（首次运行）
echo [1/3] 正在检查并安装 Python 依赖...
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [警告] 依赖安装可能有问题，尝试继续启动...
)
echo       依赖检查完成 ✓
echo.

:: 生成随机 SECRET_KEY（如果未设置）
if "%SECRET_KEY%"=="" (
    echo [2/3] 正在生成安全密钥...
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_hex(32))"') do set SECRET_KEY=%%i
    echo       密钥已生成 ✓
) else (
    echo [2/3] 检测到已设置 SECRET_KEY ✓
)
echo.

:: 启动服务器
echo [3/3] 正在启动研路通服务器...
echo.
echo   启动后请在浏览器访问以下地址：
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /r "IPv4"') do (
    set LOCAL_IP=%%i
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP: =%
echo   本机访问：  http://localhost:8181
echo   局域网访问：http://%LOCAL_IP%:8181
echo.
echo   按 Ctrl+C 可停止服务
echo ====================================================
echo.

python server.py

pause
