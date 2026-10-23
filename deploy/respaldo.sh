#!/bin/sh
# Respaldo completo de Mi Setup: base de datos + archivos subidos (música,
# videos, compartidos, logos). Guarda en /opt/mi-setup/backups y borra los
# de más de 14 días. Programar con cron (ver docs/USO.md):
#   15 4 * * * /opt/mi-setup/app/deploy/respaldo.sh >> /var/log/misetup-respaldo.log 2>&1
# Otra instalación del mismo VPS (p. ej. la pública):
#   MISETUP_PREFIJO=misetup-publica PROYECTO=mi-setup-publica BACKUP_HOST_DIR=/opt/mi-setup-publica/backups .../respaldo.sh
set -eu
PREFIJO="${MISETUP_PREFIJO:-misetup}"
PROYECTO="${PROYECTO:-mi-setup}"
DIR="${BACKUP_HOST_DIR:-/opt/mi-setup/backups}"
DIAS="${RESPALDO_DIAS:-14}"
FECHA="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DIR"

echo "[$(date)] Respaldando base..."
docker exec "$PREFIJO-db" pg_dump -U misetup -Fc misetup > "$DIR/misetup-base-$FECHA.dump"

for NOMBRE in misetup_uploads misetup_archivos; do
  # Docker compose antepone el nombre del proyecto (mi-setup_).
  VOL=""
  for C in "${PROYECTO}_$NOMBRE" "$NOMBRE"; do
    if docker volume inspect "$C" >/dev/null 2>&1; then VOL="$C"; break; fi
  done
  if [ -n "$VOL" ]; then
    echo "[$(date)] Respaldando $VOL..."
    docker run --rm -v "$VOL":/datos:ro -v "$DIR":/destino alpine \
      tar -czf "/destino/$NOMBRE-$FECHA.tar.gz" -C /datos .
  fi
done

find "$DIR" -maxdepth 1 -name 'misetup*' -type f -mtime +"$DIAS" -delete
echo "[$(date)] Listo. Espacio usado:"; du -sh "$DIR"
