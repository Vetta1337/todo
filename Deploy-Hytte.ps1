$ErrorActionPreference = 'Stop'
$workspace = 'C:\Websites\worktracker-server'
$caddyFile = 'C:\Caddy\Caddyfile'
$candidate = Join-Path $workspace 'artifacts\Caddyfile.hytte'
$expectedHash = (Get-Content -LiteralPath (Join-Path $workspace 'artifacts\caddy-original.sha256') -Raw).Trim()
if ((Get-FileHash -LiteralPath $caddyFile -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Caddy configuration has changed since preparation. Review the new configuration before deploying.'
}
& 'C:\Caddy\caddy.exe' validate --config $candidate --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy validation failed.' }
$backup = 'C:\Caddy\Caddyfile.before-hytte-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item -LiteralPath $caddyFile -Destination $backup
try {
    Restart-Service -Name WorkTracker
    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/hytte/api/calendar' -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) { throw 'Cabin route did not become ready on port 3002.' }
    Copy-Item -LiteralPath $candidate -Destination $caddyFile -Force
    & 'C:\Caddy\caddy.exe' reload --config $caddyFile --adapter caddyfile
    if ($LASTEXITCODE -ne 0) { throw 'Caddy reload failed.' }
    foreach ($url in @('https://ehalvorsen.no/hytte', 'https://ehalvorsen.no/hytte/admin', 'https://ehalvorsen.no/hytte/api/calendar', 'https://ehalvorsen.no/todo/login.html')) {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
        if ($response.StatusCode -ne 200) { throw "Unexpected status for $url" }
        Write-Output "Verified $url : HTTP $($response.StatusCode)"
    }
    Write-Output "Caddy backup: $backup"
    Get-Service -Name WorkTracker,caddy | Select-Object Name,Status
} catch {
    Copy-Item -LiteralPath $backup -Destination $caddyFile -Force
    & 'C:\Caddy\caddy.exe' reload --config $caddyFile --adapter caddyfile
    throw
}
