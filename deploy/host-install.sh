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

command -v python3 >/dev/null || { echo "Falta python3." >&2; exit 1; }

# --- WireGuard (wg0). Si ya tienes /etc/wireguard/wg0.conf se reutiliza tal cual.
if ! command -v wg >/dev/null || ! command -v iptables >/dev/null; then
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q wireguard-tools iptables
fi
install -m 750 "$REPO/deploy/wg-agent/mi-setup-wg" /usr/local/sbin/mi-setup-wg

if [[ ! -f /etc/wireguard/wg0.conf ]]; then
  if ss -lunH 2>/dev/null | awk '{print $4}' | grep -q ':51820$'; then
    echo "El puerto 51820/udp ya lo usa otro programa (¿otra VPN en Docker?). Apágalo o dime cuál es antes de seguir." >&2
    exit 1
  fi
  SALIDA="$(ip -4 route show default | awk '{print $5; exit}')"
  install -d -m 700 /etc/wireguard
  umask 077
  PRIVADA="$(wg genkey)"
  cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = ${PRIVADA}
PostUp = iptables -I FORWARD 1 -i %i -j ACCEPT; iptables -I FORWARD 1 -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o ${SALIDA} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.8.0.0/24 -o ${SALIDA} -j MASQUERADE
EOF
  unset PRIVADA
  umask 022
  echo "Creé /etc/wireguard/wg0.conf (red 10.8.0.0/24, puerto 51820)."
fi
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-mi-setup-wg.conf
sysctl -q -p /etc/sysctl.d/99-mi-setup-wg.conf
systemctl enable --now wg-quick@wg0
if command -v ufw >/dev/null; then ufw allow 51820/udp comment WireGuard >/dev/null || true; fi

install -d -m 755 /etc/mi-setup
if [[ ! -f /etc/mi-setup/wg.env ]]; then
  PUBLICA="$(curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  printf 'ENDPOINT=%s:%s\nDNS=1.1.1.1\n' "$PUBLICA" "$(wg show wg0 listen-port)" > /etc/mi-setup/wg.env
  echo "Los dispositivos se conectarán a ${PUBLICA} (cámbialo en /etc/mi-setup/wg.env si usas un dominio)."
fi

install -d -m 755 /opt/mi-setup/wg-agent
install -m 755 "$REPO/deploy/wg-agent/mi-setup-wg-agent.py" /opt/mi-setup/wg-agent/mi-setup-wg-agent.py
install -m 644 "$REPO/deploy/wg-agent/mi-setup-wg-agent.service" /etc/systemd/system/mi-setup-wg-agent.service

systemctl daemon-reload
systemctl enable --now mi-setup-wg-agent.service
systemctl restart mi-setup-wg-agent.service

echo "Servicio VPN de Mi Setup activo en /run/mi-setup/wg.sock."
