# Drives the real UI in headless Edge/Chrome (index.html#seed=N&selftest) and prints the PASS/FAIL report.
# Optional: -Shot <path.png> also saves a screenshot of the page.
param([int]$Seed = 42, [string]$Shot = "")
$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "Edge or Chrome not found."; exit 2 }

$root = Split-Path -Parent $PSScriptRoot
$url  = "file:///" + ((Join-Path $root "index.html") -replace '\\', '/') + "#seed=$Seed&selftest"
$tmp  = Join-Path $env:TEMP "citadel_ui_dom.txt"
$args2 = @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1500,950", "--virtual-time-budget=20000", "--dump-dom", $url)
Start-Process $browser -ArgumentList $args2 -RedirectStandardOutput $tmp -Wait -NoNewWindow
$dom = Get-Content $tmp -Raw
$m = [regex]::Match($dom, '<div id="selftest-result".*?</div></div>|<div id="selftest-result"[\s\S]*$')
if (-not $m.Success) { Write-Output "No self-test report found (script did not run?)"; exit 1 }
$txt = $m.Value -replace '</div>', "`n" -replace '<[^>]+>', ''
$txt = $txt -replace '&gt;', '>' -replace '&lt;', '<' -replace '&amp;', '&'
$txt.Trim()
if ($txt -match '(?m)^FAIL ') { exit 1 }
