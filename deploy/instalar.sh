#!/usr/bin/env bash
# ==============================================================================
#  Instalador de Mi Setup en un VPS nuevo (Ubuntu / Debian), todo en español.
#
#  Uso (como root), con mi-setup.tar.gz ya subido a /root/:
#    mkdir -p /opt/mi-setup/app && tar -xzf /root/mi-setup.tar.gz -C /opt/mi-setup/app
#    bash /opt/mi-setup/app/deploy/instalar.sh
#
#  Qué hace: instala Docker si falta, pregunta tu dominio, genera contraseñas
#  secretas nuevas (no se comparten con nadie), crea /opt/mi-setup/.env,
#  enciende todo y crea tu cuenta maestra. Se puede volver a correr: si ya
#  existe el .env no lo toca.
# ==============================================================================
set -euo pipefail

VERDE=$'\e[0;32m'; AMARILLO=$'\e[1;33m'; ROJO=$'\e[0;31m'; CIAN=$'\e[0;36m'; NC=$'\e[0m'
ok()    { echo -e "  ${VERDE}✔ $1${NC}"; }
aviso() { echo -e "  ${AMARILLO}⚠ $1${NC}"; }
error() { echo -e "  ${ROJO}✘ $1${NC}"; }
paso()  { echo -e "\n${CIAN}──▶ $1${NC}"; }

BASE="/opt/mi-setup"
APP="${BASE}/app"
ENV_FILE="${BASE}/.env"

[ "$(id -u)" -eq 0 ] || { error "Corre este instalador como root (sudo -i)."; exit 1; }
[ -f "${APP}/docker-compose.yml" ] || { error "No encuentro ${APP}/docker-compose.yml. Descomprime primero mi-setup.tar.gz en ${APP}."; exit 1; }

echo -e "${CIAN}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║        Instalador de Mi Setup                ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ------------------------------------------------------------------ Docker ----
paso "1/6 · Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker ya está instalado."
else
  aviso "Instalando Docker (tarda unos minutos)…"
  apt-get update -qq && apt-get install -y -qq curl ca-certificates openssl >/dev/null
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  ok "Docker instalado."
fi
command -v openssl >/dev/null 2>&1 || apt-get install -y -qq openssl >/dev/null

# --------------------------------------------------------------- Puertos ------
paso "2/6 · Puertos 80 y 443"
if ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | grep -qE '[:.](80|443)$' && ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^misetup-caddy$'; then
  error "Otro programa ya usa el puerto 80 o 443 (¿Nginx o Apache?). Mi Setup los necesita."
  echo "    Mira quién es con:  ss -ltnp | grep -E ':(80|443) '"
  exit 1
fi
ok "Libres."
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ok "Firewall (ufw): abiertos 80 y 443."
fi

# ------------------------------------------------------------------ .env ------
paso "3/6 · Configuración"
mkdir -p "${BASE}/backups" "${BASE}/descargas" "${BASE}/caddy"
if [ -f "$ENV_FILE" ]; then
  ok "Ya existe ${ENV_FILE}: se conserva tal cual."
  APP_HOST="$(grep -E '^APP_HOST=' "$ENV_FILE" | cut -d= -f2-)"
else
  echo "  Necesito tu dominio (por ejemplo: midominio.com)."
  echo "  La app quedará en  setup.<tu dominio>  y los avisos en  ntfy.<tu dominio>."
  DOMINIO=""
  while [ -z "$DOMINIO" ]; do
    read -rp "  Tu dominio: " DOMINIO
    DOMINIO="$(echo "$DOMINIO" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##; s#^www\.##')"
    if ! echo "$DOMINIO" | grep -qE '^[a-z0-9-]+(\.[a-z0-9-]+)+$'; then error "Dominio inválido."; DOMINIO=""; fi
  done
  APP_HOST="setup.${DOMINIO}"
  secreto() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
  umask 077
  sed \
    -e "s|^DOMAIN=.*|DOMAIN=${DOMINIO}|" \
    -e "s|^APP_HOST=.*|APP_HOST=${APP_HOST}|" \
    -e "s|^NTFY_HOST=.*|NTFY_HOST=ntfy.${DOMINIO}|" \
    -e "s|^RD_HOST=.*|RD_HOST=rd.${DOMINIO}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secreto)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(secreto)|" \
    -e "s|^SERVER_ENC_KEY=.*|SERVER_ENC_KEY=$(secreto)|" \
    -e "s|^MAIL_INBOUND_SECRET=.*|MAIL_INBOUND_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^NTFY_TOPIC=.*|NTFY_TOPIC=misetup-$(openssl rand -hex 16)|" \
    -e "s|^PTERO_URL=.*|PTERO_URL=https://panel.${DOMINIO}|" \
    "${APP}/.env.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Creado ${ENV_FILE} con contraseñas nuevas (solo root puede leerlo)."
  aviso "Las claves de servicios (Claude, Discord, Twitch…) se ponen después desde la app: Ajustes → Servicios y claves."
fi

# ------------------------------------------------------------------- DNS ------
paso "4/6 · DNS"
IP_VPS="$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
IP_DNS="$(getent ahostsv4 "$APP_HOST" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ "$IP_DNS" = "$IP_VPS" ]; then
  ok "${APP_HOST} apunta a este VPS (${IP_VPS})."
else
  aviso "${APP_HOST} todavía no apunta a este VPS (${IP_VPS}); apunta a: ${IP_DNS:-nada}."
  echo "    En tu proveedor de DNS (p. ej. Cloudflare) crea registros A con la IP ${IP_VPS}:"
  echo "      setup  ·  ntfy  ·  rd     (en Cloudflare: nube GRIS, «Solo DNS»)"
  echo "    Puedes seguir: el certificado HTTPS se sacará solo cuando el DNS esté listo."
  read -rp "  Presiona ENTER para continuar…" _
fi

# ---------------------------------------------------------------- Encender ----
paso "5/6 · Encendiendo Mi Setup (la primera vez tarda varios minutos)"
cd "$APP"
docker compose --env-file "$ENV_FILE" up -d --build
echo -n "  Esperando a que arranque"
for _ in $(seq 1 60); do
  if docker exec misetup-core node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo; ok "Mi Setup está funcionando."; break
  fi
  echo -n "."; sleep 5
done

# --------------------------------------------------------- Cuenta maestra -----
paso "6/6 · Tu cuenta maestra"
echo "  Te pedirá correo, nombre y contraseña (mínimo 12 caracteres), y te mostrará"
echo "  un código 2FA para agregarlo a tu app de autenticación (Google Authenticator, Aegis…)."
if ! docker exec -it misetup-core node dist/cli/crear-maestra.js; then
  aviso "No se creó la cuenta (¿ya existía?). Para intentarlo otra vez:"
  echo "    docker exec -it misetup-core node dist/cli/crear-maestra.js"
fi

echo
echo -e "${VERDE}  ¡Listo! Abre https://${APP_HOST} en el navegador o en la app.${NC}"
echo "  En la app del celular: en el inicio de sesión toca «Cambiar servidor» y pon https://${APP_HOST}"
echo "  Guarda una copia de ${ENV_FILE} en un lugar seguro: sin ella no se pueden recuperar los datos cifrados."
