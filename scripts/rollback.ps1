[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupName,
    [string]$SshTarget = 'cet-listening-server'
)

$ErrorActionPreference = 'Stop'
if ($BackupName -notmatch '^cet-listening-\d{8}-\d{6}$') {
    throw 'Invalid backup name, for example: cet-listening-20260815-203000'
}

$target = $SshTarget
$backupPath = "/var/www/backups/$BackupName"
$sitePath = '/var/www/cet-listening'
$command = "sudo /bin/bash -c 'set -e; test -d $backupPath; test -f $backupPath/index.html; rm -rf $sitePath/assets; cp -a $backupPath/. $sitePath/; chown -R ubuntu:www-data $sitePath; nginx -t; systemctl reload nginx'"
& ssh $target $command
if ($LASTEXITCODE -ne 0) { throw "Rollback failed with exit code $LASTEXITCODE" }
Write-Host "Rollback requested: $BackupName. Check the website now." -ForegroundColor Green
