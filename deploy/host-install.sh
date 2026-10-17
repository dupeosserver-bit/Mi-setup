#!/usr/bin/env bash
# Tareas en el host (opcional). mi-setup-vps.sh lo ejecuta como root, con aviso.
# Instala el servicio mínimo que permite a core dar de alta dispositivos VPN
# usando /usr/local/sbin/mi-setup-wg, sin montar el socket de Docker.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Ejecuta este script como root." >&2
  exit 1
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -x /usr/local/sbin/mi-setup-wg ]]; then
  echo "Aviso: no existe /usr/local/sbin/mi-setup-wg (lo instala mi-setup-vps.sh). La VPN no funcionará hasta que exista." >&2
fi
command -v python3 >/dev/null || { echo "Falta python3." >&2; exit 1; }

install -d -m 755 /opt/mi-setup/wg-agent
install -m 755 "$REPO/deploy/wg-agent/mi-setup-wg-agent.py" /opt/mi-setup/wg-agent/mi-setup-wg-agent.py
install -m 644 "$REPO/deploy/wg-agent/mi-setup-wg-agent.service" /etc/systemd/system/mi-setup-wg-agent.service

systemctl daemon-reload
systemctl enable --now mi-setup-wg-agent.service
systemctl restart mi-setup-wg-agent.service

echo "Servicio VPN de Mi Setup activo en /run/mi-setup/wg.sock."
