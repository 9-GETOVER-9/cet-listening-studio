[CmdletBinding()]
param([string]$SshTarget = 'cet-listening-server')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$temp = Join-Path $root 'output/account-sync-deploy'
New-Item -ItemType Directory -Path $temp -Force | Out-Null
# Only existing public Supabase client configuration is required. Never read service-role credentials.
$values = @{}
Get-Content -LiteralPath (Join-Path $root '.env.local') | ForEach-Object {
    if ($_ -match '^VITE_SUPABASE_(URL|ANON_KEY)=(.+)$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"', "'") }
}
if (-not $values['URL'] -or -not $values['ANON_KEY']) { throw 'Missing public Supabase client configuration' }
$envFile = Join-Path $temp 'sync.env'
[IO.File]::WriteAllText($envFile, "SUPABASE_URL=$($values['URL'])`nSUPABASE_ANON_KEY=$($values['ANON_KEY'])`nSYNC_DB=/var/lib/listening-sync/progress.sqlite`n", [Text.UTF8Encoding]::new($false))
function Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed ($LASTEXITCODE)" }
}
Checked 'ssh' @($SshTarget, 'mkdir -p /tmp/listening-sync-release && chmod 700 /tmp/listening-sync-release')
foreach ($name in @('learning_sync.py', 'backup_sync.py', 'listening-sync.service', 'listening-sync-backup.service', 'listening-sync-backup.timer')) {
    Checked 'scp' @((Join-Path $root "server/$name"), "${SshTarget}:/tmp/listening-sync-release/$name")
}
Checked 'scp' @($envFile, "${SshTarget}:/tmp/listening-sync-release/sync.env")
Checked 'scp' @((Join-Path $PSScriptRoot 'install-sync.sh'), "${SshTarget}:/tmp/listening-sync-release/install-sync.sh")
Checked 'ssh' @($SshTarget, 'chmod 600 /tmp/listening-sync-release/sync.env && sudo -n bash /tmp/listening-sync-release/install-sync.sh')
