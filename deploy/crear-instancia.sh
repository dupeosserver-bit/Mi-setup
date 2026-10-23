#!/usr/bin/env bash
# Crea otra instalación de Mi Setup en este VPS (por ejemplo la pública o la de
# pruebas), con su carpeta, su .env, su base de datos y sus volúmenes.
#
#   sudo bash /opt/mi-setup/app/deploy/crear-instancia.sh <nombre> <dirección> <edición> <paquete.tar.gz>
#   Ejemplo: ... crear-instancia.sh publica app.mexicanland.net publica /home/ubuntu/mi-setup.tar.gz
#
# Necesita la instalación personal encendida (/opt/mi-setup): su Caddy manda la
# dirección nueva a esta instalación y comparte ntfy, Ollama y ClamAV.
# Las contraseñas del .env nuevo se generan aquí y no se copian de ninguna otra.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/instancias.sh
. "$AQUI/instancias.sh"

if [ "$#" -ne 4 ]; then
  echo "Uso: $0 <nombre> <dirección> <edición> <paquete.tar.gz>"
  echo "Ejemplo: $0 publica app.mexicanland.net publica /home/ubuntu/mi-setup.tar.gz"
  exit 1
fi
NOMBRE="$1"; HOST="$2"; EDICION="$3"; PAQUETE="$4"

[ "$(id -u)" -eq 0 ] || { echo "Córrelo como root (sudo -i)."; exit 1; }
echo "$NOMBRE" | grep -qE '^[a-z0-9]{2,20}$' || { echo "El nombre solo lleva minúsculas y números (2 a 20)."; exit 1; }
[ "$NOMBRE" != "personal" ] || { echo "«personal» ya es la instalación principal."; exit 1; }
echo "$HOST" | grep -qE '^[a-z0-9-]+(\.[a-z0-9-]+)+$' || { echo "Dirección inválida: $HOST"; exit 1; }
case "$EDICION" in personal|publica) ;; *) echo "La edición es «personal» o «publica»."; exit 1 ;; esac
[ -f "$PAQUETE" ] || { echo "No encuentro el paquete: $PAQUETE"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx misetup-caddy || { echo "Primero enciende la instalación personal (no veo misetup-caddy)."; exit 1; }

BASE="$(base_de "$NOMBRE")"
APP="$BASE/app"
ENV_FILE="$BASE/.env"
PRINCIPAL_ENV="$BASE_PRINCIPAL/.env"
PREFIJO="misetup-$NOMBRE"
CADDY_SITIO="$BASE_PRINCIPAL/caddy/mi-setup-$NOMBRE.caddy"

echo "1/5 Carpetas en $BASE"
mkdir -p "$APP" "$BASE/backups" "$BASE/versiones" "$BASE_PRINCIPAL/caddy"
chmod 700 "$BASE"

echo "2/5 Archivos de la app"
NUEVA="$BASE/nueva"
rm -rf "$NUEVA"; mkdir -p "$NUEVA"
tar -xf "$PAQUETE" -C "$NUEVA"
rsync -a --delete --exclude .git "$NUEVA"/ "$APP"/
rm -rf "$NUEVA"

echo "3/5 Configuración"
if [ -f "$ENV_FILE" ]; then
  echo "Ya existe $ENV_FILE: se conserva tal cual."
else
  secreto() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
  NTFY="$(valor_env "$PRINCIPAL_ENV" NTFY_HOST)"
  OLLAMA="$(valor_env "$PRINCIPAL_ENV" OLLAMA_URL)"
  umask 077
  # Lo propio de esta instalación va al final; se quitan antes del ejemplo para no repetir.
  # DOMAIN es su propia dirección: así sus sitios (nombre.<dirección>) no chocan con los de la personal.
  grep -vE '^(EDICION|BACKUP_HOST_DIR|DESCARGAS_HOST_DIR|OLLAMA_URL|CLAMAV_HOST|MISETUP_PREFIJO|NTFY_URL_INTERNA|COMPOSE_PROFILES)=' "$APP/.env.example" |
    sed \
      -e "s|^DOMAIN=.*|DOMAIN=${HOST}|" \
      -e "s|^APP_HOST=.*|APP_HOST=${HOST}|" \
      -e "s|^NTFY_HOST=.*|NTFY_HOST=${NTFY:-ntfy.${HOST#*.}}|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secreto)|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=$(secreto)|" \
      -e "s|^SERVER_ENC_KEY=.*|SERVER_ENC_KEY=$(secreto)|" \
      -e "s|^MAIL_INBOUND_SECRET=.*|MAIL_INBOUND_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^NTFY_TOPIC=.*|NTFY_TOPIC=misetup-$(openssl rand -hex 16)|" \
      > "$ENV_FILE"
  cat >> "$ENV_FILE" <<FIN

# --- Esta instalación (la creó deploy/crear-instancia.sh) ---
EDICION=${EDICION}
MISETUP_PREFIJO=${PREFIJO}
BACKUP_HOST_DIR=${BASE}/backups
# Las descargas (APK y EXE) son las de la instalación personal.
DESCARGAS_HOST_DIR=${BASE_PRINCIPAL}/descargas
# Compartido con la instalación personal por la red misetup-compartida.
NTFY_URL_INTERNA=http://misetup-ntfy
CLAMAV_HOST=misetup-clamav
OLLAMA_URL=${OLLAMA}
FIN
  chmod 600 "$ENV_FILE"
  echo "Creado $ENV_FILE con contraseñas nuevas (solo root puede leerlo)."
fi

echo "4/5 Encendiendo $PREFIJO-db y $PREFIJO-core (la primera vez tarda varios minutos)"
cd "$APP"
# shellcheck disable=SC2046
compose_de "$NOMBRE" up -d --build --remove-orphans $(servicios_de "$NOMBRE")
if esperar_core "$PREFIJO"; then echo "Funcionando."; else echo "El core no contestó en 5 minutos. Revisa: docker logs --tail 80 $PREFIJO-core"; fi

echo "5/5 Caddy: https://$HOST → $PREFIJO-core"
cat > "$CADDY_SITIO" <<FIN
# Instalación «$NOMBRE» de Mi Setup (la creó deploy/crear-instancia.sh).
$HOST {
	encode zstd gzip
	header -Server
	reverse_proxy $PREFIJO-core:3000 {
		lb_try_duration 30s
		lb_try_interval 500ms
	}
}
FIN
docker exec misetup-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

echo
echo "Listo: https://$HOST (edición $EDICION)."
echo "Crea su cuenta maestra con:"
echo "  docker exec -it $PREFIJO-core node dist/cli/crear-maestra.js"
echo "Para actualizarla junto con las demás:"
echo "  bash $BASE_PRINCIPAL/app/deploy/instalar-version.sh <versión> <paquete> todas"
