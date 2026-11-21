# Runs tests-online.html in real time. WebRTC needs real clocks, so this drives headless Edge/Chrome
# over the DevTools protocol instead of using --dump-dom with virtual time.
param([int]$TimeoutSec = 120, [int]$Port = 9333)

$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "Edge or Chrome not found."; exit 2 }

$root = Split-Path -Parent $PSScriptRoot
$url  = "file:///" + ((Join-Path $root "tests-online.html") -replace '\\', '/')
$prof = Join-Path $env:TEMP ("citadel-cdp-" + [guid]::NewGuid().ToString("N"))

$proc = Start-Process $browser -PassThru -WindowStyle Hidden -ArgumentList @(
  "--headless=new", "--disable-gpu", "--remote-debugging-port=$Port", "--user-data-dir=$prof",
  "--no-first-run", "--disable-extensions", "about:blank")

function Receive-Text($ws) {
  $buf = New-Object byte[] 65536
  $sb = New-Object System.Text.StringBuilder
  do {
    $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $buf)
    $r = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
  } while (-not $r.EndOfMessage)
  $sb.ToString()
}
function Send-Cmd($ws, [int]$id, [string]$method, $params) {
  $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
  $ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  while ($true) {                         # skip events until our reply arrives
    $j = Receive-Text $ws | ConvertFrom-Json
    if ($j.id -eq $id) { return $j }
  }
}

$exit = 1
try {
  $targets = $null
  for ($i = 0; $i -lt 40 -and -not $targets; $i++) {
    try { $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 250 }
  }
  $page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  if (-not $page) { throw "no debuggable page" }
  $ws = New-Object Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  [void](Send-Cmd $ws 1 "Page.navigate" @{ url = $url })

  $id = 10; $deadline = (Get-Date).AddSeconds($TimeoutSec); $title = ""
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $r = Send-Cmd $ws (++$id) "Runtime.evaluate" @{ expression = "document.title"; returnByValue = $true }
    $title = [string]$r.result.result.value
    if ($title -match 'passed') { break }
  }
  $r = Send-Cmd $ws (++$id) "Runtime.evaluate" @{ expression = "document.getElementById('out').innerText"; returnByValue = $true }
  $text = [string]$r.result.result.value
  Write-Output $text
  if ($title -notmatch 'passed') { Write-Output "TIMED OUT after $TimeoutSec s (title: $title)" }
  elseif ($title -match ' 0 failed') { $exit = 0 }
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$prof*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
}
exit $exit
