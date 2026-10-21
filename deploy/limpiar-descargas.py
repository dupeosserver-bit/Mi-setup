#!/usr/bin/env python3
"""
Deja en la carpeta de descargas del VPS solo la versión nueva y las 2
anteriores de cada app (Android .apk y Windows .exe con su .blockmap).
latest.yml no se toca. Uso (como root):

    python3 /opt/mi-setup/app/deploy/limpiar-descargas.py [/opt/mi-setup/descargas]

Agrega --prueba para ver qué se borraría sin borrar nada.
Misma regla que packages/shared/src/versiones.ts.
"""
import os
import re
import sys

GUARDAR = 3
VERSION = re.compile(r"(\d+\.\d+(?:\.\d+)?[ab]?)(?=[^\d]*\.(?:apk|exe)$)", re.I)


def version(nombre):
    m = VERSION.search(nombre)
    return m.group(1).lower() if m else None


def clave(v):
    m = re.match(r"^([\d.]+)([a-z]?)", v)
    nums = tuple(int(n or 0) for n in m.group(1).split("."))
    nums = nums + (0,) * (4 - len(nums))
    etapa = 0 if m.group(2) == "b" else 1
    return nums + (etapa,)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    prueba = "--prueba" in sys.argv
    carpeta = args[0] if args else "/opt/mi-setup/descargas"
    archivos = [n for n in os.listdir(carpeta) if os.path.isfile(os.path.join(carpeta, n))]
    for ext in (".apk", ".exe"):
        apps = [n for n in archivos if n.lower().endswith(ext)]
        apps.sort(
            key=lambda n: (
                clave(version(n)) if version(n) else (0,),
                os.path.getmtime(os.path.join(carpeta, n)),
            ),
            reverse=True,
        )
        for viejo in apps[GUARDAR:]:
            for nombre in (viejo, viejo + ".blockmap"):
                ruta = os.path.join(carpeta, nombre)
                if os.path.exists(ruta):
                    print(("Se borraría: " if prueba else "Borrado: ") + nombre)
                    if not prueba:
                        os.remove(ruta)
    # .blockmap sin su .exe
    for n in archivos:
        if n.lower().endswith(".exe.blockmap") and not os.path.exists(os.path.join(carpeta, n[: -len(".blockmap")])):
            if os.path.exists(os.path.join(carpeta, n)):
                print(("Se borraría: " if prueba else "Borrado: ") + n)
                if not prueba:
                    os.remove(os.path.join(carpeta, n))


if __name__ == "__main__":
    main()
