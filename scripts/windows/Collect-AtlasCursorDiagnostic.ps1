# Opt-in, out-of-process observations. Does not inject input, change the cursor,
# send window messages, refresh surfaces, alter GPU options, or read campaign data.
[CmdletBinding()]
param(
    [ValidateRange(10,300)][int]$DurationSeconds = 90,
    [ValidateRange(50,500)][int]$IntervalMs = 100,
    [string]$OutputDirectory = '.',
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AtlasCursorProbe {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct CURSORINFO { public uint Size,Flags; public IntPtr Cursor; public POINT Position; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public uint Size,Flags; public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret; public RECT CaretRect;
  }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint process);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
  [DllImport("user32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] public static extern bool GetCursorInfo(ref CURSORINFO info);
  [DllImport("user32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] public static extern bool GetGUIThreadInfo(uint thread,ref GUITHREADINFO info);
  [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] public static extern bool ScreenToClient(IntPtr hwnd,ref POINT point);
  [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] public static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
}
'@
$cursorSize = [Runtime.InteropServices.Marshal]::SizeOf([type][AtlasCursorProbe+CURSORINFO])
$guiSize = [Runtime.InteropServices.Marshal]::SizeOf([type][AtlasCursorProbe+GUITHREADINFO])
if ($cursorSize -ne (8 + [IntPtr]::Size + 8) -or $guiSize -ne (24 + 6 * [IntPtr]::Size)) { throw 'Unexpected native structure layout' }
function Test-AtlasSwitch([string]$CommandLine,[string]$Name) {
    return $CommandLine -match ('(?:^|[\s"])--' + [regex]::Escape($Name) + '(?:[=\s"]|$)')
}
if ($ValidateOnly) {
    if (-not (Test-AtlasSwitch 'webview.exe "--force-high-performance-gpu"' 'force-high-performance-gpu') -or
        -not (Test-AtlasSwitch '--disable-gpu=true' 'disable-gpu') -or
        (Test-AtlasSwitch '--disable-gpu-compositing' 'disable-gpu')) { throw 'Known switch boundary validation failed' }
    Write-Output 'Native probe compiled; structures and known-switch boundaries validated; no collection started.'; return
}
$targets = @(Get-Process -Name projectatlas -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($targets.Count -ne 1) { throw 'Open exactly one ProjectAtlas window before starting the collector.' }
$targetProcess = $targets[0]
$targetWindow = $targetProcess.MainWindowHandle
[uint32]$owner = 0
$targetThread = [AtlasCursorProbe]::GetWindowThreadProcessId($targetWindow,[ref]$owner)
if ($targetThread -eq 0 -or $owner -ne $targetProcess.Id) { throw 'ProjectAtlas window could not be identified.' }
function Test-AtlasWindow([IntPtr]$Handle) {
    return $Handle -ne [IntPtr]::Zero -and ($Handle -eq $targetWindow -or [AtlasCursorProbe]::GetAncestor($Handle,2) -eq $targetWindow)
}
# Only versions and whitelisted switch presence from descendants; never export
# command lines, executable paths, titles, usernames, device IDs, or other apps.
$runtimeVersions = @()
$switchPresence = @{ forceHighPerformanceGpu = $false; disableGpu = $false; unknown = $true }
try {
    $all = @(Get-CimInstance Win32_Process -OperationTimeoutSec 3 | Select-Object ProcessId,ParentProcessId,Name)
    $family = [Collections.Generic.HashSet[uint32]]::new(); $null = $family.Add([uint32]$targetProcess.Id)
    do {
        $changed = $false
        foreach ($item in $all) { if ($family.Contains([uint32]$item.ParentProcessId) -and $family.Add([uint32]$item.ProcessId)) { $changed = $true } }
    } while ($changed)
    foreach ($item in $all) {
        if ($family.Contains([uint32]$item.ProcessId) -and $item.Name -eq 'msedgewebview2.exe') {
            $runtime = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $item.ProcessId) -OperationTimeoutSec 3
            if ($runtime.ExecutablePath) { $runtimeVersions += [Diagnostics.FileVersionInfo]::GetVersionInfo($runtime.ExecutablePath).FileVersion }
            if ($null -ne $runtime.CommandLine) {
                $switchPresence.unknown = $false
                if (Test-AtlasSwitch $runtime.CommandLine 'force-high-performance-gpu') { $switchPresence.forceHighPerformanceGpu = $true }
                if (Test-AtlasSwitch $runtime.CommandLine 'disable-gpu') { $switchPresence.disableGpu = $true }
            }
        }
    }
} catch { $switchPresence.unknown = $true }
$all = $null
$watch = [Diagnostics.Stopwatch]::StartNew()
$rows = [Collections.Generic.List[object]]::new()
$previousF9 = $false; $previousF10 = $false
$maximumRows = [int][Math]::Ceiling($DurationSeconds * 1000.0 / $IntervalMs) + 1
Write-Output "Recording native observations for at most $DurationSeconds seconds. Return to ProjectAtlas, enable its diagnostic, then use F9/F10."
try {
    while ($watch.Elapsed.TotalSeconds -lt $DurationSeconds -and $rows.Count -lt $maximumRows) {
        $targetProcess.Refresh()
        if ($targetProcess.HasExited) { break }
        $foreground = Test-AtlasWindow ([AtlasCursorProbe]::GetForegroundWindow())
        $row = [ordered]@{ elapsedMs = [Math]::Round($watch.Elapsed.TotalMilliseconds,3); utcUnixMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); foreground = $foreground
            visible = [AtlasCursorProbe]::IsWindowVisible($targetWindow); minimized = [AtlasCursorProbe]::IsIconic($targetWindow) }
        $rect = [AtlasCursorProbe+RECT]::new()
        if ([AtlasCursorProbe]::GetClientRect($targetWindow,[ref]$rect)) { $row.clientWidth = $rect.Right; $row.clientHeight = $rect.Bottom }
        try { $nativeDpi = [AtlasCursorProbe]::GetDpiForWindow($targetWindow); $row.dpi = if ($nativeDpi -gt 0) { $nativeDpi } else { $null } } catch { $row.dpi = $null }
        $gui = [AtlasCursorProbe+GUITHREADINFO]::new(); $gui.Size = $guiSize
        $row.guiInfoAvailable = [AtlasCursorProbe]::GetGUIThreadInfo($targetThread,[ref]$gui)
        if ($row.guiInfoAvailable) {
            $row.focusInAtlas = Test-AtlasWindow $gui.Focus
            $row.captureInAtlas = Test-AtlasWindow $gui.Capture
            $row.capturePresent = $gui.Capture -ne [IntPtr]::Zero
            $row.inMenuMode = ($gui.Flags -band 4) -ne 0
        }
        if ($foreground) {
            $cursor = [AtlasCursorProbe+CURSORINFO]::new(); $cursor.Size = $cursorSize
            $row.cursorInfoAvailable = [AtlasCursorProbe]::GetCursorInfo([ref]$cursor)
            if ($row.cursorInfoAvailable) {
                $row.cursorShowing = ($cursor.Flags -band 1) -ne 0
                $row.cursorSuppressed = ($cursor.Flags -band 2) -ne 0
                $point = $cursor.Position
                if ([AtlasCursorProbe]::ScreenToClient($targetWindow,[ref]$point) -and $point.X -ge 0 -and $point.Y -ge 0 -and $point.X -lt $rect.Right -and $point.Y -lt $rect.Bottom) {
                    $row.clientX = $point.X; $row.clientY = $point.Y
                }
            }
            $f9 = ([int][AtlasCursorProbe]::GetAsyncKeyState(0x78) -band 0x8000) -ne 0
            $f10 = ([int][AtlasCursorProbe]::GetAsyncKeyState(0x79) -band 0x8000) -ne 0
            if ($f9 -and -not $previousF9) { $row.keyObservation = 'F9-down-observed' }
            if ($f10 -and -not $previousF10) { $row.keyObservationF10 = 'F10-down-observed' }
            $previousF9 = $f9; $previousF10 = $f10
        } else { $previousF9 = $false; $previousF10 = $false }
        $row.sampleEndElapsedMs = [Math]::Round($watch.Elapsed.TotalMilliseconds,3)
        $row.sampleEndUtcUnixMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $rows.Add($row)
        Start-Sleep -Milliseconds $IntervalMs
    }
} finally {
    $watch.Stop()
    $log = [ordered]@{ schema = 'projectatlas-native-observations-v1'; intervalMs = $IntervalMs; durationLimitSeconds = $DurationSeconds; maximumRows = $maximumRows
        elapsedMs = $watch.Elapsed.TotalMilliseconds; runtimeFileVersions = @($runtimeVersions | Sort-Object -Unique); switchPresence = $switchPresence
        coordinateSpace = 'ScreenToClient in collector DPI context, not CSS pixels; use movement continuity, not uncalibrated coordinate equality.'
        limitation = 'Read-only sampled Win32 state, not presented frames or cursor rasterization. Short key presses may be missed; samples may be delayed. UTC correlation is approximate; compare monotonic/UTC drift and key observations.'; rows = $rows.ToArray() }
    $filename = 'projectatlas-native-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '.json'
    $outPath = Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path $filename
    $log | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outPath -Encoding UTF8
    Write-Output "Native diagnostic exported: $outPath"
}
