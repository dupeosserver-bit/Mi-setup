#!/usr/bin/env python3
"""
Servicio mínimo del host para la VPN de Mi Setup.

core corre en un contenedor y no puede ejecutar /usr/local/sbin/mi-setup-wg.
Este servicio (root, systemd) escucha en un socket Unix que solo puede usar el
grupo del contenedor (GID 1000) y permite exactamente tres operaciones:

  GET  /estado  -> `wg show wg0 dump` (llave pública, endpoint, último saludo, bytes)
  POST /alta    -> `mi-setup-wg add <nombre> --pubkey <llave> [--psk <llave>] --json`
  POST /baja    -> `mi-setup-wg remove <nombre> --json`

Los argumentos se validan con expresiones regulares y nunca pasan por un shell.
"""
import json
import os
import re
import socketserver
import subprocess
import sys
from http.server import BaseHTTPRequestHandler

SOCKET = os.environ.get("MI_SETUP_WG_SOCKET", "/run/mi-setup/wg.sock")
AYUDANTE = os.environ.get("MI_SETUP_WG_HELPER", "/usr/local/sbin/mi-setup-wg")
INTERFAZ = os.environ.get("MI_SETUP_WG_IFACE", "wg0")
GID = int(os.environ.get("MI_SETUP_WG_GID", "1000"))

NOMBRE = re.compile(r"^[a-z0-9-]{1,32}$")
LLAVE = re.compile(r"^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$")


def ejecutar(argumentos):
    r = subprocess.run(argumentos, capture_output=True, text=True, timeout=20, check=False)
    if r.returncode != 0:
        detalle = (r.stderr or r.stdout).strip()[:300]
        raise RuntimeError(detalle or f"código de salida {r.returncode}")
    return r.stdout


class Manejador(BaseHTTPRequestHandler):
    def address_string(self):
        return "local"

    def log_message(self, formato, *args):
        sys.stderr.write("mi-setup-wg-agent: " + (formato % args) + "\n")

    def responder(self, codigo, datos):
        cuerpo = json.dumps(datos).encode()
        self.send_response(codigo)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def leer(self):
        largo = int(self.headers.get("content-length") or 0)
        if largo > 4096:
            raise ValueError("cuerpo demasiado grande")
        return json.loads(self.rfile.read(largo) or b"{}")

    def do_GET(self):
        if self.path != "/estado":
            return self.responder(404, {"error": "no encontrado"})
        try:
            pares = []
            for linea in ejecutar(["wg", "show", INTERFAZ, "dump"]).strip().splitlines()[1:]:
                c = linea.split("\t")
                if len(c) >= 7:
                    pares.append({
                        "llave": c[0],
                        "endpoint": None if c[2] == "(none)" else c[2],
                        "ultimoSaludo": int(c[4]),
                        "rx": int(c[5]),
                        "tx": int(c[6]),
                    })
            self.responder(200, pares)
        except Exception as error:  # noqa: BLE001 - se informa al cliente
            self.responder(500, {"error": str(error)})

    def do_POST(self):
        try:
            datos = self.leer()
            nombre = str(datos.get("nombre", ""))
            if not NOMBRE.match(nombre):
                return self.responder(400, {"error": "nombre inválido"})
            if self.path == "/alta":
                llave = str(datos.get("llavePublica", ""))
                if not LLAVE.match(llave):
                    return self.responder(400, {"error": "llave pública inválida"})
                argumentos = [AYUDANTE, "add", nombre, "--pubkey", llave]
                psk = datos.get("psk")
                if psk:
                    if not LLAVE.match(str(psk)):
                        return self.responder(400, {"error": "llave precompartida inválida"})
                    argumentos += ["--psk", str(psk)]
                argumentos.append("--json")
                return self.responder(200, json.loads(ejecutar(argumentos)))
            if self.path == "/baja":
                ejecutar([AYUDANTE, "remove", nombre, "--json"])
                return self.responder(200, {"ok": True})
            return self.responder(404, {"error": "no encontrado"})
        except Exception as error:  # noqa: BLE001
            self.responder(500, {"error": str(error)})


class Servidor(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    os.makedirs(os.path.dirname(SOCKET), exist_ok=True)
    if os.path.exists(SOCKET):
        os.unlink(SOCKET)
    with Servidor(SOCKET, Manejador) as servidor:
        os.chown(SOCKET, 0, GID)
        os.chmod(SOCKET, 0o660)
        servidor.serve_forever()


if __name__ == "__main__":
    main()
