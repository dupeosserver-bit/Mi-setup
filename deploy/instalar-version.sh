#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Uso: $0 <version> <paquete.tar> [instalaciones…]"
  echo "Ejemplo: $0 0.11.5b /home/ubuntu/mi-setup.tar.gz                 (solo la personal)"
  echo "         $0 0.11.5b /home/ubuntu/mi-setup.tar.gz pruebas         (solo la de pruebas)"
  echo "         $0 0.11.5b /home/ubuntu/mi-setup.tar.gz publica pruebas"
  echo "         $0 0.11.5b /home/ubuntu/mi-setup.tar.gz todas"
  echo "Cada una guarda todo en <su carpeta>/versiones/<version>/."
  exit 1
fi

VERSION="$1"
PAQUETE="$2"
shift 2
[ -f "$PAQUETE" ] || { echo "No encuentro el paquete: $PAQUETE"; exit 1; }

# Las funciones viven junto a este script; si lo sacaste solo del paquete
# (p. ej. a /root/), se leen del mismo paquete.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$AQUI/instancias.sh" ]; then
  # shellcheck source=deploy/instancias.sh
  . "$AQUI/instancias.sh"
else
  # shellcheck disable=SC1090
  . <(tar -xOf "$PAQUETE" deploy/instancias.sh)
fi
ENV_PERSONAL="${ENV_FILE:-$BASE_PRINCIPAL/.env}"

if [ "$#" -eq 0 ]; then
  set -- personal
elif [ "$1" = "todas" ]; then
  # shellcheck disable=SC2046
  set -- $(todas_las_instancias)
fi
# La personal va primero: crea la red compartida y tiene el Caddy de todas.
LISTA=""
for N in "$@"; do [ "$N" = "personal" ] && LISTA="personal"; done
for N in "$@"; do [ "$N" = "personal" ] || LISTA="$LISTA $N"; done

instalar_en() {
  local NOMBRE="$1"
  local BASE; BASE="$(base_de "$NOMBRE")"
  local ENV_FILE="$BASE/.env"
  [ "$NOMBRE" != "personal" ] || ENV_FILE="$ENV_PERSONAL"
  local APP="$BASE/app"
  [ "$NOMBRE" != "personal" ] || APP="${APP_DIR:-$APP}"
  local DESTINO="$BASE/versiones/$VERSION"
  local FECHA; FECHA="$(date +%Y-%m-%d_%H%M)"
  local PREFIJO; PREFIJO="$(prefijo_de "$NOMBRE")"

  echo
  echo "════ $NOMBRE ($BASE) ════"
  [ -d "$APP" ] || { echo "No encuentro la carpeta de la app: $APP"; return 1; }
  [ "$NOMBRE" = "personal" ] || [ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE (créala con deploy/crear-instancia.sh)"; return 1; }

  mkdir -p "$DESTINO/respaldo-$FECHA"
  chmod 700 "$DESTINO"

  echo "1/5 Guardando el paquete en $DESTINO"
  cp -f "$PAQUETE" "$DESTINO/mi-setup-$VERSION.tar"

  echo "2/5 Guardando la lista de cambios"
  if tar -tf "$PAQUETE" "docs/CAMBIOS-$VERSION.md" >/dev/null 2>&1; then
    tar -xOf "$PAQUETE" "docs/CAMBIOS-$VERSION.md" > "$DESTINO/CAMBIOS-$VERSION.md"
  else
    echo "El paquete no trae docs/CAMBIOS-$VERSION.md; sigo sin la lista."
  fi

  echo "3/5 Respaldando la base de datos y la configuración"
  if docker ps --format '{{.Names}}' | grep -x "$PREFIJO-db" >/dev/null; then
    docker exec "$PREFIJO-db" sh -c 'pg_dump -U "${POSTGRES_USER:-misetup}" -Fc "${POSTGRES_DB:-misetup}"' > "$DESTINO/respaldo-$FECHA/base.dump"
    chmod 600 "$DESTINO/respaldo-$FECHA/base.dump"
  else
    echo "La base ($PREFIJO-db) no está encendida; no se respaldó la base."
  fi
  if [ -f "$ENV_FILE" ]; then
    install -m 600 "$ENV_FILE" "$DESTINO/respaldo-$FECHA/env"
  fi
  git -C "$APP" rev-parse HEAD > "$DESTINO/respaldo-$FECHA/commit-anterior.txt" 2>/dev/null || true

  echo "4/5 Poniendo los archivos nuevos en $APP"
  local NUEVA="$BASE/nueva"
  rm -rf "$NUEVA"
  mkdir -p "$NUEVA"
  tar -xf "$PAQUETE" -C "$NUEVA"
  rsync -a --delete --exclude .git "$NUEVA"/ "$APP"/
  rm -rf "$NUEVA"

  echo "5/5 Encendiendo la versión nueva"
  (
    cd "$APP"
    # shellcheck disable=SC2046
    compose_de "$NOMBRE" up -d --build --remove-orphans $(servicios_de "$NOMBRE")
  )

  echo "Listo: $NOMBRE con Mi Setup $VERSION. Todo quedó en $DESTINO"
  echo "Para regresar la base: docker exec -i $PREFIJO-db pg_restore -U misetup -d misetup --clean < $DESTINO/respaldo-$FECHA/base.dump"
}

FALLARON=""
for NOMBRE in $LISTA; do
  instalar_en "$NOMBRE" || FALLARON="$FALLARON $NOMBRE"
done

echo
if [ -n "$FALLARON" ]; then
  echo "No se pudo instalar en:$FALLARON"
  exit 1
fi
echo "Listo: Mi Setup $VERSION en: ${LISTA# }"
