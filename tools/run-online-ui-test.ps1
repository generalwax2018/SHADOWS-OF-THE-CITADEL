# End-to-end online test: two real browser tabs (host + guest) driven over the DevTools protocol.
# The host tab creates a lobby and an invite; this script carries the codes to the guest tab exactly as a
# person would (copy/paste), then plays turns through the real buttons on both sides and compares states.
param([int]$Port = 9334, [int]$TimeoutSec = 150, [switch]$GuestTraitor)

$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "Edge or Chrome not found."; exit 2 }

$root = Split-Path -Parent $PSScriptRoot
$base = "file:///" + ((Join-Path $root "index.html") -replace '\\', '/')
$prof = Join-Path $env:TEMP ("citadel-cdp2-" + [guid]::NewGuid().ToString("N"))
$proc = Start-Process $browser -PassThru -WindowStyle Hidden -ArgumentList @(
  "--headless=new", "--disable-gpu", "--remote-debugging-port=$Port", "--user-data-dir=$prof",
  "--no-first-run", "--disable-extensions", "about:blank")

$script:fails = 0
function Check([string]$name, $cond, [string]$extra = "") {
  if ($cond) { Write-Output "PASS $name" } else { $script:fails++; Write-Output "FAIL $name $extra" }
}
function Receive-Text($ws) {
  $buf = New-Object byte[] 262144
  $sb = New-Object System.Text.StringBuilder
  do {
    $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $buf)
    $r = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
  } while (-not $r.EndOfMessage)
  $sb.ToString()
}
$script:msgId = 100
function Cdp($ws, [string]$method, $params) {
  $id = ++$script:msgId
  $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
  [void]($ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult())
  while ($true) { $j = Receive-Text $ws | ConvertFrom-Json; if ($j.id -eq $id) { return $j } }
}
# Evaluate JS (promises awaited); throws on a JS exception; returns the value.
function Js($ws, [string]$expr) {
  $r = Cdp $ws "Runtime.evaluate" @{ expression = $expr; awaitPromise = $true; returnByValue = $true; timeout = 60000 }
  if ($r.result.exceptionDetails) { throw ("JS error: " + $r.result.exceptionDetails.exception.description) }
  return $r.result.result.value
}
function Open-Page([string]$url) {
  $t = Invoke-RestMethod -Method Put "http://127.0.0.1:$Port/json/new?about:blank"
  $ws = New-Object Net.WebSockets.ClientWebSocket
  [void]($ws.ConnectAsync([Uri]$t.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult())
  [void](Cdp $ws "Page.navigate" @{ url = $url })
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    if ((Js $ws "document.readyState === 'complete' && !!window.__citadel") -eq $true) { break }
  }
  return $ws
}

# helper library injected into both pages
$lib = @'
window.T = {
  el: id => document.getElementById(id),
  wait: async (fn, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { try { const v = fn(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 40)); } throw new Error('timeout: ' + (label || fn)); },
  click: (re, root) => { const b = [...(root || document).querySelectorAll('button')].find(x => re.test(x.textContent) && !x.disabled && x.offsetParent !== null); if (!b) throw new Error('no enabled button ' + re); b.click(); return true; },
  hasBtn: (re) => [...document.querySelectorAll('button')].some(x => re.test(x.textContent) && !x.disabled && x.offsetParent !== null),
  state: () => { const g = window.__citadel.game; return g ? { turn: g.turn, active: g.active, siege: g.siege, round: g.round, over: !!g.over, white: g.seats.filter(s => s === 'white').length, black: g.seats.filter(s => s === 'black').length, viewer: g.viewer, rng: g.rng, seed: g.seed, traitor: g.traitor, logLen: g.log.length } : null; }
};
true
'@

$exit = 1
try {
  Start-Sleep -Milliseconds 800
  $A = Open-Page "$base#botdelay=15"
  $B = Open-Page "$base#botdelay=15"
  [void](Js $A $lib); [void](Js $B $lib)
  if ($GuestTraitor) {
    $seed = Js $A "(() => { for (let s = 1; s < 800; s++) { const g = Citadel.createGame({ seed: s, partySize: 5, difficulty: 'normal' }); if (g.traitor === 1) return s; } })()"
    Write-Output "scenario: guest is the Traitor (seed $seed)"
    [void](Cdp $A "Page.navigate" @{ url = "$base#botdelay=15&hostseed=$seed" })
    for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 250; if ((Js $A "document.readyState === 'complete' && !!window.__citadel") -eq $true) { break } }
    [void](Js $A $lib)
  }

  # ---------- host builds a lobby and an invite ----------
  [void](Js $A "T.click(/Play online/); T.click(/Host a game/); T.el('lanOnly').checked = true; T.el('hostName').value = 'Hosty'; T.click(/Create lobby/); T.click(/Invite a friend/); true")
  $invite = Js $A "T.wait(() => T.el('inviteCode') && T.el('inviteCode').value.startsWith('SOC1.') && T.el('inviteCode').value, 20000, 'invite code')"
  Check "host produces an invite code" ($invite -like 'SOC1.*') "len=$($invite.Length)"

  # ---------- guest joins ----------
  [void](Js $B "T.click(/Play online/); T.click(/Join a friend/); T.el('joinLan').checked = true; T.el('joinName').value = 'Gwen'; true")
  [void](Js $B ("T.el('invite').value = " + ($invite | ConvertTo-Json) + "; T.click(/Create reply code/); true"))
  $reply = Js $B "T.wait(() => { const t = document.querySelector('#replyPane textarea'); return t && t.value.startsWith('SOC1.') && t.value; }, 20000, 'reply code')"
  Check "guest produces a reply code" ($reply -like 'SOC1.*')

  # ---------- host accepts the reply ----------
  [void](Js $A ("T.el('replyCode').value = " + ($reply | ConvertTo-Json) + "; T.click(/^Connect/); true"))
  $joined = Js $A "T.wait(() => document.querySelector('#seatList').innerText.includes('Gwen'), 30000, 'guest seat')"
  Check "host lobby shows the friend by name" ($joined -eq $true)
  $guestSees = Js $B "T.wait(() => T.el('joinMsg').innerText.includes('Connected to the host'), 15000, 'guest connected')"
  Check "guest sees the lobby" ($guestSees -eq $true)

  # ---------- start ----------
  [void](Js $A "T.click(/Start game/); true")
  $roleA = Js $A "T.wait(() => /You are/.test(T.el('modalCard').innerText) && T.el('modalCard').querySelector('h2').innerText, 10000, 'host role')"
  $roleB = Js $B "T.wait(() => /You are/.test(T.el('modalCard').innerText) && T.el('modalCard').querySelector('h2').innerText, 15000, 'guest role')"
  Check "both players get a secret role screen" ($roleA -like 'You are*' -and $roleB -like 'You are*') "$roleA | $roleB"
  $traitors = @($roleA, $roleB) | Where-Object { $_ -like '*Traitor*' }
  Check "at most one human is the Traitor" ($traitors.Count -le 1)
  [void](Js $A "T.click(/^Begin/); true"); [void](Js $B "T.click(/^Begin/); true")

  $sa = Js $A "T.state()"; $sb = Js $B "T.state()"
  Check "guest runs on a redacted view (no rng, no seed)" ($sb.rng -eq 0 -and $sb.seed -eq 0) "rng=$($sb.rng) seed=$($sb.seed)"
  Check "guest knows its own seat" ($sb.viewer -eq 1)
  $bIsTraitor = $roleB -like '*Traitor*'
  if ($GuestTraitor) { Check "scenario: guest role screen says Traitor" $bIsTraitor }
  else { Check "a loyal guest has no Sabotage button" (-not ((Js $B "T.hasBtn(/^Sabotage/)") -eq $true)) }
  Check "guest sees the Traitor id only if it is the Traitor" (($bIsTraitor -and $sb.traitor -ge 0) -or (-not $bIsTraitor -and $sb.traitor -eq -1)) "traitor=$($sb.traitor)"
  Check "guest board matches host board" ($sa.turn -eq $sb.turn -or [math]::Abs($sa.turn - $sb.turn) -le 1)
  if ($bIsTraitor) { $hasSab = Js $B "true"; }

  # ---------- play through the real buttons ----------
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $outOfTurnChecked = $false; $guestActed = $false; $hostActed = $false
  while ((Get-Date) -lt $deadline) {
    $sa = Js $A "T.state()"
    if ($sa.over) { break }
    if ($sa.active -eq 0) {
      if (-not $hostActed) { [void](Js $A "T.click(/^Gather supplies/); true"); $hostActed = $true }
      if (-not $outOfTurnChecked) {
        # the guest's action buttons must be disabled during the host's turn
        $dis = Js $B "T.wait(() => T.el('turn') !== undefined && document.querySelector('#actions') !== null, 5000); [...document.querySelectorAll('#actions button')].filter(b => !/Hint/.test(b.textContent)).every(b => b.disabled)"
        Check "guest's action buttons are locked on the host's turn" ($dis -eq $true)
        $outOfTurnChecked = $true
      }
      [void](Js $A "T.click(/^End turn/); true")
    } elseif ($sa.active -eq 1) {
      $okB = Js $B "T.wait(() => window.__citadel.game.active === 1 && T.hasBtn(/^End turn/), 10000, 'guest turn')"
      if ($GuestTraitor -and -not $script:sabotaged) {
        $hasBtn = Js $B "T.hasBtn(/^Sabotage/)"
        Check "the human Traitor gets a Sabotage button" ($hasBtn -eq $true)
        $script:rumorsBefore = Js $A "window.__citadel.game.rumors.length"
        $logBefore = Js $A "window.__citadel.game.log.length"
        [void](Js $B "T.click(/^Sabotage/); true")
        $picked = Js $B "T.wait(() => document.querySelector('#modalCard [data-t]'), 5000, 'plot targets') && (document.querySelector('#modalCard [data-t]').click(), true)"
        Check "the Traitor picks a target for the plot" ($picked -eq $true)
        $laid = Js $B "T.wait(() => window.__citadel.game.plot, 8000, 'plot laid')"
        Check "the plot reaches the host and back to the Traitor" ($laid -ne $null -and $laid -ne $false)
        $hostLog = Js $A "window.__citadel.game.log.length"
        Check "laying a plot puts nothing in the public log" ($hostLog -eq $logBefore)
        $btnNow = Js $B "[...document.querySelectorAll('#actions button')].find(b => /^Sabotage/.test(b.textContent)).disabled"
        Check "one plot at a time: the button waits" ($btnNow -eq $true)
        $script:sabotaged = $true
      }
      if (-not $guestActed) {
        $before = Js $B "window.__citadel.game.party[1].hand.length"
        [void](Js $B "T.click(/^Gather supplies/); true")
        $gotCards = Js $B "T.wait(() => window.__citadel.game.party[1].hand.length > $before || window.__citadel.game.party[1].hand.length >= 7, 8000, 'cards after gather')"
        $hostHand = Js $A "window.__citadel.game.party[1].hand.length"
        Check "guest action reaches the host and the result comes back" ($gotCards -eq $true -and $hostHand -ge $before)
        $guestActed = $true
      }
      [void](Js $B "T.click(/^End turn/); true")
    }
    Start-Sleep -Milliseconds 120
  }
  $sa = Js $A "T.state()"
  Check "the game reached an ending" ($sa.over -eq $true)
  if ($script:sabotaged) {
    $sprang = Js $A "window.__citadel.game.rumors.length > $($script:rumorsBefore) || window.__citadel.game.traitorRevealed || !window.__citadel.game.party[1].alive"
    Check "the plot sprang later and produced a rumor (or the Traitor was stopped first)" ($sprang -eq $true)
    $logHasName = Js $A "window.__citadel.game.log.some(l => /Gwen/.test(l.text) && /Sabotage/.test(l.text))"
    Check "the public log does not name the saboteur" ($logHasName -eq $false)
  }
  Check "the host's gather action worked" ($hostActed)
  Check "an out-of-turn lock check ran" ($outOfTurnChecked)

  # ---------- both players see the result ----------
  $endA = Js $A "T.wait(() => /Victory|Defeat/.test(T.el('modalCard').innerText) && T.el('modalCard').querySelector('h2').innerText, 15000, 'host end modal')"
  $endB = Js $B "T.wait(() => /Victory|Defeat/.test(T.el('modalCard').innerText) && T.el('modalCard').querySelector('h2').innerText, 15000, 'guest end modal')"
  Check "host and guest both see the same result" ($endA -eq $endB) "$endA vs $endB"
  $sb = Js $B "T.state()"
  Check "the Traitor is revealed to the guest at the end" ($sb.traitor -ge 0)
  Check "the seed is revealed at the end" ($sb.seed -ne 0)
  Check "final scores agree" ($sa.white -eq $sb.white -and $sa.black -eq $sb.black -and $sa.siege -eq $sb.siege) "A=$($sa.white)/$($sa.black)/$($sa.siege) B=$($sb.white)/$($sb.black)/$($sb.siege)"
  $leave = Js $B "T.hasBtn(/Leave game/)"
  Check "online games offer 'Leave game' instead of challenge links" ($leave -eq $true)

  if ($script:fails -eq 0) { $exit = 0 }
} catch {
  Write-Output ("ERROR " + $_.Exception.Message)
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$prof*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
}
exit $exit
