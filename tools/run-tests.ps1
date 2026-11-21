# Runs tests.html in headless Edge/Chrome and prints the results. No server or Node needed.
$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "Edge or Chrome not found."; exit 2 }

$root = Split-Path -Parent $PSScriptRoot
$url  = "file:///" + ((Join-Path $root "tests.html") -replace '\\', '/')
$tmp  = Join-Path $env:TEMP "citadel_tests_dom.txt"

Start-Process $browser -ArgumentList "--headless=new", "--disable-gpu", "--virtual-time-budget=120000", "--dump-dom", $url `
  -RedirectStandardOutput $tmp -Wait -NoNewWindow
$dom = Get-Content $tmp -Raw
# Keep only rendered results (skip the template-string lines inside the <script>).
$pre = $dom.Substring(0, [Math]::Max(0, $dom.IndexOf('<script')))
$body = $dom.Substring($dom.IndexOf('<div id="out">'))
$body = $body.Substring(0, $body.IndexOf('<script'))
[regex]::Matches($body, '<div class="(pass|fail)">[^<]*</div>|<h2>[^<]*</h2>|<pre id="(balance|sizes)">[^<]*</pre>') |
  ForEach-Object { ($_.Value -replace '<[^>]+>', '') -replace '&gt;', '>' -replace '&lt;', '<' -replace '&amp;', '&' }
if ($body -match 'class="fail"') { exit 1 }

