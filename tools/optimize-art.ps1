# Converts every .jpg / .jpeg / .png under assets/ to a smaller .webp next to it (same name), using headless
# Edge or Chrome as the encoder, so nothing needs installing.
#
#   powershell -ExecutionPolicy Bypass -File tools\optimize-art.ps1                    # convert, keep the originals
#   powershell -ExecutionPolicy Bypass -File tools\optimize-art.ps1 -RemoveOriginals   # convert and delete the originals
#
# The game looks for .webp first and falls back to .jpg, so a freshly downloaded painting works as soon as it is
# saved; run this afterwards to make it smaller. Remember to raise ART_VERSION in js/missions.js when art changes.
param(
  [string]$Path = "",
  [double]$Quality = 0.82,
  [switch]$RemoveOriginals,
  [int]$Port = 9347
)

$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "Edge or Chrome not found."; exit 2 }

$root = Split-Path -Parent $PSScriptRoot
if (-not $Path) { $Path = Join-Path $root "assets" }
$files = Get-ChildItem $Path -Recurse -File | Where-Object { $_.Extension -match '^\.(jpe?g|png)$' }
if (-not $files) { Write-Output "Nothing to convert under $Path."; exit 0 }

$prof = Join-Path $env:TEMP ("citadel-webp-" + [guid]::NewGuid().ToString("N"))
$proc = Start-Process $browser -PassThru -WindowStyle Hidden -ArgumentList @(
  "--headless=new", "--disable-gpu", "--remote-debugging-port=$Port", "--user-data-dir=$prof",
  "--no-first-run", "--disable-extensions", "about:blank")

function Receive-Text($ws) {
  $buf = New-Object byte[] 4194304
  $sb = New-Object System.Text.StringBuilder
  do {
    $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $buf)
    $r = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
  } while (-not $r.EndOfMessage)
  $sb.ToString()
}
$script:id = 0
function Cdp($ws, [string]$method, $params) {
  $i = ++$script:id
  $b = [Text.Encoding]::UTF8.GetBytes((@{ id = $i; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress))
  $s = New-Object System.ArraySegment[byte] -ArgumentList @(, $b)
  [void]($ws.SendAsync($s, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult())
  while ($true) { $j = Receive-Text $ws | ConvertFrom-Json; if ($j.id -eq $i) { return $j } }
}
function Js($ws, [string]$expr) {
  $r = Cdp $ws "Runtime.evaluate" @{ expression = $expr; awaitPromise = $true; returnByValue = $true; timeout = 60000 }
  if ($r.result.exceptionDetails) { throw ("browser error: " + $r.result.exceptionDetails.exception.description) }
  return $r.result.result.value
}

$exit = 0
try {
  $targets = $null
  for ($i = 0; $i -lt 40 -and -not $targets; $i++) { try { $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 250 } }
  foreach ($x in $targets) { if ($x.type -eq 'page') { $page = $x; break } }
  $ws = New-Object Net.WebSockets.ClientWebSocket
  [void]($ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult())

  # the encoder: draw the image onto a canvas and ask the browser for WebP
  [void](Js $ws @'
window.toWebp = (uri, q) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => {
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    c.getContext('2d').drawImage(i, 0, 0);
    c.toBlob(b => { if (!b || b.type !== 'image/webp') return rej('this browser cannot encode WebP');
      const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b); }, 'image/webp', q);
  };
  i.onerror = () => rej('could not decode the image');
  i.src = uri;
}); true
'@)

  $before = 0; $after = 0; $n = 0
  foreach ($f in $files) {
    $out = [IO.Path]::ChangeExtension($f.FullName, '.webp')
    $mime = if ($f.Extension -eq '.png') { 'image/png' } else { 'image/jpeg' }
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    try {
      $b64 = Js $ws ("window.toWebp('data:$mime;base64," + [Convert]::ToBase64String($bytes) + "', $Quality)")
      $webp = [Convert]::FromBase64String($b64)
    } catch { Write-Output ("FAILED  " + $f.Name + ": " + $_.Exception.Message); $exit = 1; continue }
    if ($webp.Length -ge $bytes.Length) { Write-Output ("kept    {0}: WebP would not be smaller ({1} KB vs {2} KB)" -f $f.Name, [math]::Round($webp.Length/1KB), [math]::Round($bytes.Length/1KB)); continue }
    [IO.File]::WriteAllBytes($out, $webp)
    $before += $bytes.Length; $after += $webp.Length; $n++
    Write-Output ("{0,-34} {1,5} KB -> {2,5} KB" -f $f.Name, [math]::Round($bytes.Length/1KB), [math]::Round($webp.Length/1KB))
    if ($RemoveOriginals) { Remove-Item $f.FullName -Force }
  }
  if ($n) { Write-Output ("Converted {0} files: {1} KB -> {2} KB (saved {3}%)" -f $n, [math]::Round($before/1KB), [math]::Round($after/1KB), [math]::Round(100 * (1 - $after / $before))) }
} catch {
  Write-Output ("ERROR " + $_.Exception.Message); $exit = 1
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$prof*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
}
exit $exit
