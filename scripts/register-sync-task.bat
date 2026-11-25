@echo off
schtasks /Create /F /SC MINUTE /MO 30 /TN "PomeloLauncher GitHub Sync" /TR "D:\Project\PomeloLauncher\scripts\sync-github.bat"
