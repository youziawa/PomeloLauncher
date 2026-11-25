$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRestore {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$proc = Get-Process pomelo-launcher -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "no process"; exit 1 }
$proc.Refresh()
$h = $proc.MainWindowHandle
[WinRestore]::ShowWindow([IntPtr]$h, 9) | Out-Null
[WinRestore]::SetForegroundWindow([IntPtr]$h) | Out-Null
Write-Output ("restored hwnd=" + $h)
