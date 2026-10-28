[CmdletBinding()]
param(
    [string]$SshTarget = 'cet-listening-server',
    [string]$LibraryRoot = 'D:\桌面\雅思100\剑桥听力库',
    [string]$RemoteAudioRoot = '/var/lib/listening-sync/cambridge-audio',
    [int]$ExpectedTracks = 226,
    [long]$ExpectedBytes = 1461208197
)

$ErrorActionPreference = 'Stop'
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

$libraryPath = (Resolve-Path -LiteralPath $LibraryRoot).Path
$audioPath = (Resolve-Path -LiteralPath (Join-Path $libraryPath 'audio')).Path
$catalogPath = (Resolve-Path -LiteralPath (Join-Path $libraryPath 'catalog.json')).Path
$catalog = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
$localTracks = @(Get-ChildItem -LiteralPath $audioPath -Recurse -File -Filter '*.mp3')
$localBytes = [long](($localTracks | Measure-Object -Property Length -Sum).Sum)
if ($localTracks.Count -ne $ExpectedTracks -or $localBytes -ne $ExpectedBytes) {
    throw "Local Cambridge audio inventory changed: $($localTracks.Count) tracks / $localBytes bytes"
}
if (@($catalog.tracks).Count -ne $ExpectedTracks) { throw 'Catalog track count does not match the checked audio inventory' }

$stage = Join-Path $PSScriptRoot '..\output\cambridge-audio-deploy'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$archive = Join-Path $stage 'cambridge-audio.tar'
$remoteArchive = '/tmp/cambridge-audio-release.tar'
$remoteCatalog = '/tmp/cambridge-catalog-release.json'
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Invoke-Checked 'tar.exe' @('-cf', $archive, '-C', $audioPath, '.')
$localHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()

Invoke-Checked 'ssh' @($SshTarget, "install -d -m 700 /tmp/cambridge-audio-stage && sudo -n install -d -o www-data -g www-data -m 700 '$RemoteAudioRoot'")
Invoke-Checked 'scp' @($archive, ("${SshTarget}:$remoteArchive"))
Invoke-Checked 'scp' @($catalogPath, ("${SshTarget}:$remoteCatalog"))
$remoteHashOutput = & ssh $SshTarget "sha256sum '$remoteArchive'"
if ($LASTEXITCODE -ne 0) { throw 'Could not verify the uploaded Cambridge audio archive' }
$remoteHash = ($remoteHashOutput -split '\s+')[0].ToLowerInvariant()
if ($remoteHash -ne $localHash) { throw 'Uploaded Cambridge audio archive checksum mismatch' }

$installCommand = @"
set -e
sudo -n tar -xf '$remoteArchive' -C '$RemoteAudioRoot'
sudo -n chown -R www-data:www-data '$RemoteAudioRoot'
sudo -n find '$RemoteAudioRoot' -type d -exec chmod 700 {} +
sudo -n find '$RemoteAudioRoot' -type f -exec chmod 600 {} +
sudo -n install -o www-data -g www-data -m 600 '$remoteCatalog' /var/lib/listening-sync/cambridge-catalog.json
count=`$(sudo -n find '$RemoteAudioRoot' -type f -name '*.mp3' | wc -l)
bytes=`$(sudo -n find '$RemoteAudioRoot' -type f -name '*.mp3' -printf '%s\n' | awk '{s+=`$1} END {printf "%.0f", s}')
test "`$count" -eq $ExpectedTracks
test "`$bytes" -eq $ExpectedBytes
rm -- '$remoteArchive' '$remoteCatalog'
echo "Cambridge audio staged: `$count tracks, `$bytes bytes"
"@
$installCommand = $installCommand.Replace([string][char]13 + [char]10, [string][char]10)
Invoke-Checked 'ssh' @($SshTarget, $installCommand)

Remove-Item -LiteralPath $archive -Force
Write-Host "Cambridge private audio uploaded and checksum verified: $ExpectedTracks tracks / $ExpectedBytes bytes." -ForegroundColor Green
