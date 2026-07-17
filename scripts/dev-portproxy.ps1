# Expose au reseau local les serveurs de dev qui tournent DANS WSL (API NestJS, Metro/Expo),
# pour qu'un telephone physique puisse les joindre.
#
# Pourquoi : en mode reseau NAT (defaut de WSL2), WSL a une IP privee que le LAN ne connait pas.
# Windows, lui, est sur le reseau : on lui fait donc relayer les deux ports.
# MinIO n'y figure PAS : il tourne sous Docker Desktop, cote Windows, donc deja expose au LAN.
#
# Le mode "mirrored" supprimerait ce besoin, mais rend injoignables les ports publies par
# Docker Desktop (WSL possede alors l'adresse, et rien n'y ecoute pour eux) : le storage devient
# inaccessible depuis le telephone. On garde donc NAT + ce relais.
#
# A rejouer apres chaque `wsl --shutdown` ou redemarrage : l'IP de WSL change.
#
# Usage (PowerShell ADMINISTRATEUR) :
#   powershell -ExecutionPolicy Bypass -File scripts\dev-portproxy.ps1

$ErrorActionPreference = "Stop"

# API NestJS, Metro (Expo).
$PORTS = @(3000, 8081)

$wslIp = (wsl.exe hostname -I).Trim().Split(" ")[0]
if (-not $wslIp) {
    Write-Error "IP de WSL introuvable - WSL est-il demarre ?"
}
Write-Host "WSL est sur $wslIp"

foreach ($port in $PORTS) {
    # delete puis add : une redirection existante pointe sur l'ANCIENNE IP de WSL.
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp | Out-Null
    Write-Host "  0.0.0.0:$port -> ${wslIp}:$port"
}

Write-Host ""
Write-Host "Redirections actives :"
netsh interface portproxy show v4tov4
