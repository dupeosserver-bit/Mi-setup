# shellcheck shell=bash
# Funciones para las instalaciones de Mi Setup en el mismo VPS. Lo cargan
# deploy/crear-instancia.sh y deploy/instalar-version.sh (no se corre solo).
#
# - «personal» es la principal: /opt/mi-setup (o MISETUP_BASE), con Caddy, ntfy,
#   Ollama y ClamAV.
# - Cualquier otra (publica, pruebas…) vive en /opt/mi-setup-<nombre> y solo
#   tiene su base y su core; las crea deploy/crear-instancia.sh.

BASE_PRINCIPAL="${MISETUP_BASE:-/opt/mi-setup}"

# Carpeta de una instalación.
base_de() {
  if [ "$1" = "personal" ]; then echo "$BASE_PRINCIPAL"; else echo "${BASE_PRINCIPAL}-$1"; fi
}

# Valor de una variable del .env (vacío si no está).
valor_env() {
  [ -f "$1" ] || return 0
  grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2- || true
}

# Prefijo de sus contenedores (misetup-db, misetup-publica-db…).
prefijo_de() {
  local p
  p="$(valor_env "$(base_de "$1")/.env" MISETUP_PREFIJO)"
  if [ -n "$p" ]; then echo "$p"; elif [ "$1" = "personal" ]; then echo "misetup"; else echo "misetup-$1"; fi
}

# Todas las instalaciones que existen: la personal primero.
todas_las_instancias() {
  echo personal
  local d
  for d in "${BASE_PRINCIPAL}"-*/; do
    [ -f "${d}.env" ] && [ -d "${d}app" ] && basename "$d" | sed "s#^$(basename "$BASE_PRINCIPAL")-##"
  done
  return 0
}

# docker compose con el proyecto, el .env y los archivos de esa instalación.
compose_de() {
  local nombre="$1"; shift
  local base; base="$(base_de "$nombre")"
  if [ "$nombre" = "personal" ]; then
    local env="${ENV_PERSONAL:-$base/.env}"
    if [ -f "$env" ]; then docker compose --env-file "$env" "$@"; else docker compose "$@"; fi
  else
    docker compose -p "mi-setup-$nombre" --env-file "$base/.env" -f docker-compose.yml -f deploy/compose.instancia.yml "$@"
  fi
}

# Servicios que enciende: la personal todo, las demás solo base y core.
servicios_de() {
  if [ "$1" = "personal" ]; then echo ""; else echo "misetup-db core"; fi
}

# Espera hasta 5 minutos a que el core conteste.
esperar_core() {
  local contenedor="$1-core" _
  for _ in $(seq 1 60); do
    if docker exec "$contenedor" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}
