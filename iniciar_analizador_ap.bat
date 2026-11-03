@echo off
title Analizador de Usuarios y APs Cisco Wireless
cd /d "%~dp0"
echo Iniciando servidor de Analisis Cisco AP en http://localhost:8060 ...
start "" http://localhost:8060
python app.py
pause
