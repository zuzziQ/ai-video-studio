@echo off
rem Mở AI Video Studio trên Windows (giống studio.sh):
rem   studio.cmd                         trang chủ (dự án gần đây, Video mới, Tự lái)
rem   studio.cmd <thư mục dự án>         mở dự án
rem   studio.cmd --new <video.mp4>       tạo dự án từ video thô
rem Giữ cửa sổ này mở trong lúc dùng; đóng nó là tắt Studio.
chcp 65001 >nul
title AI Video Studio
set "HERE=%~dp0"
where node >nul 2>nul || (echo Chưa có Node.js. Chạy install.cmd trước. & pause & exit /b 1)
node "%HERE%studio\server.mjs" %* --open
if errorlevel 1 pause
