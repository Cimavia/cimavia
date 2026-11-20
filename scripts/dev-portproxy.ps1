# Expose au reseau local les serveurs de dev qui tournent DANS WSL (API NestJS, Metro/Expo),
# pour qu'un telephone physique puisse les joindre.
#
# Pourquoi : en mode reseau NAT (defaut de WSL2), WSL a une IP privee que le LAN ne connait pas.
# Windows, lui, est sur le reseau : on lui fait donc relayer les deux ports.
# SILO (le storage) n'y figure PAS : il tourne sous Docker Desktop, cote Windows, donc deja expose au LAN.
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

# adb (#638) : les parcours e2e mobiles, lances depuis WSL, pilotent l'emulateur de Windows. Son
# serveur adb n'ecoute que sur 127.0.0.1, que WSL ne voit pas : on le relaie sur l'adresse de
# Windows VUE DE WSL, et sur elle seule. L'exposer au LAN (`adb -a`, ou 0.0.0.0 ici) donnerait
# l'appareil a quiconque le joint.
# Cote WSL, cette adresse est la passerelle par defaut (`ip route show default`) :
#   CMV_ADB_SERVER=<elle>:5037 pnpm --filter @cmv/mobile test:e2e:mobile
$ADB_PORT = 5037
$ADB_RULE = "cimavia - adb depuis WSL"
$wslHostIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "vEthernet (WSL*)" -ErrorAction SilentlyContinue |
    Select-Object -First 1).IPAddress
if ($wslHostIp) {
    # L'ancienne redirection et l'ancienne regle d'abord : l'adresse peut avoir change.
    Get-NetFirewallRule -DisplayName $ADB_RULE -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    foreach ($line in (netsh interface portproxy show v4tov4)) {
        $fields = $line.Trim() -split "\s+"
        if ($fields.Count -ge 4 -and $fields[1] -eq "$ADB_PORT" -and $fields[2] -eq "127.0.0.1") {
            netsh interface portproxy delete v4tov4 listenport=$ADB_PORT listenaddress=$($fields[0]) | Out-Null
        }
    }
    netsh interface portproxy add v4tov4 listenport=$ADB_PORT listenaddress=$wslHostIp connectport=$ADB_PORT connectaddress=127.0.0.1 | Out-Null
    # Entrant depuis WSL seulement : la regle ne vaut que pour cette adresse locale.
    New-NetFirewallRule -DisplayName $ADB_RULE -Direction Inbound -Protocol TCP -LocalPort $ADB_PORT -LocalAddress $wslHostIp -Action Allow | Out-Null
    Write-Host "  ${wslHostIp}:$ADB_PORT -> 127.0.0.1:$ADB_PORT (adb, vu de WSL seulement)"
} else {
    Write-Warning "Interface vEthernet (WSL) introuvable : adb n'est pas relaye vers WSL."
}

Write-Host ""
Write-Host "Redirections actives :"
netsh interface portproxy show v4tov4
