#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Uso: $0 <version> <paquete.tar>"
  echo "Ejemplo: $0 0.11.4b /home/ubuntu/mi-setup.tar.gz"
  echo "Guarda todo en /opt/mi-setup/versiones/<version>/ (cámbialo con MISETUP_BASE)."
  exit 1
fi

VERSION="$1"
PAQUETE="$2"
BASE="${MISETUP_BASE:-/opt/mi-setup}"
ENV_FILE="${ENV_FILE:-$BASE/.env}"
APP="${APP_DIR:-$BASE/app}"
DESTINO="$BASE/versiones/$VERSION"
FECHA="$(date +%Y-%m-%d_%H%M)"

[ -f "$PAQUETE" ] || { echo "No encuentro el paquete: $PAQUETE"; exit 1; }
[ -d "$APP" ] || { echo "No encuentro la carpeta de la app: $APP"; exit 1; }

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
if docker ps --format '{{.Names}}' | grep -x misetup-db >/dev/null; then
  docker exec misetup-db sh -c 'pg_dump -U "${POSTGRES_USER:-misetup}" -Fc "${POSTGRES_DB:-misetup}"' > "$DESTINO/respaldo-$FECHA/base.dump"
  chmod 600 "$DESTINO/respaldo-$FECHA/base.dump"
else
  echo "La base (misetup-db) no está encendida; no se respaldó la base."
fi
if [ -f "$ENV_FILE" ]; then
  install -m 600 "$ENV_FILE" "$DESTINO/respaldo-$FECHA/env"
fi
git -C "$APP" rev-parse HEAD > "$DESTINO/respaldo-$FECHA/commit-anterior.txt" 2>/dev/null || true

echo "4/5 Poniendo los archivos nuevos en $APP"
NUEVA="$BASE/nueva"
rm -rf "$NUEVA"
mkdir -p "$NUEVA"
tar -xf "$PAQUETE" -C "$NUEVA"
rsync -a --delete --exclude .git "$NUEVA"/ "$APP"/
rm -rf "$NUEVA"

echo "5/5 Encendiendo la versión nueva"
cd "$APP"
if [ -f "$ENV_FILE" ]; then
  docker compose --env-file "$ENV_FILE" up -d --build --remove-orphans
else
  docker compose up -d --build --remove-orphans
fi

echo
echo "Listo: Mi Setup $VERSION instalado."
echo "Todo lo de esta versión quedó en $DESTINO"
echo "Para regresar la base: docker exec -i misetup-db pg_restore -U misetup -d misetup --clean < $DESTINO/respaldo-$FECHA/base.dump"
