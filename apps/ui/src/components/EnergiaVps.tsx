/**
 * Seguridad del servidor → Encendido y servicios: reiniciar el VPS, Docker y
 * Mi Setup, y reiniciar / apagar / encender servicios y contenedores. Cada
 * acción pide escribir un texto para confirmar y tu PIN o huella.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Box, Play, Power, RefreshCw, RotateCcw, Search, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePaginado } from "./Paginas";
import { Boton, Cargando, Entrada, ErrorCaja, Insignia, Pestanas, Tarjeta, avisar, avisarError } from "./ui";

interface Servicio {
  nombre: string;
  estado: string;
  descripcion: string;
}
interface Contenedor {
  nombre: string;
  estado: string;
  imagen: string;
  activo: boolean;
}
type Operacion = "reiniciar" | "detener" | "iniciar";
type Cuerpo =
  | { tipo: "vps" | "misetup" | "docker" }
  | { tipo: "servicio" | "contenedor"; nombre: string; operacion: Operacion };

const PROTEGIDOS = /^(ssh|sshd|systemd-.*|dbus|networking|systemd-networkd|NetworkManager|cloud-init.*|getty@.*)(\.service)?$/i;
const VERBO: Record<Operacion, string> = { reiniciar: "Reiniciar", detener: "Apagar", iniciar: "Encender" };

export function EnergiaVps({ servidor, nombre }: { servidor: string; nombre: string }) {
  const [vista, setVista] = useState<"servicios" | "contenedores">("contenedores");
  const [filtro, setFiltro] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);
  const q = useQuery({
    queryKey: ["vps", "servicios", servidor],
    queryFn: () => api<{ servicios: Servicio[]; contenedores: Contenedor[]; docker: "si" | "no" | "sin-permiso" }>(`/api/vps/servidores/${servidor}/servicios`),
    retry: false,
  });
  const accion = useMutation({
    mutationFn: (c: Cuerpo & { confirmacion: string }) => api<{ mensaje: string }>(`/api/vps/servidores/${servidor}/energia`, { cuerpo: c }),
    onSuccess: (r) => {
      avisar(r.mensaje);
      setTimeout(() => void q.refetch(), 1500);
    },
    onError: avisarError,
  });

  const pedir = async (c: Cuerpo, titulo: string, mensaje: string) => {
    const texto = c.tipo === "servicio" || c.tipo === "contenedor" ? c.nombre : c.tipo === "misetup" ? "MI SETUP" : c.tipo === "docker" ? "DOCKER" : nombre;
    if (await confirmar({ titulo, mensaje, detalle: `Servidor: ${nombre}`, peligroso: true, textoExacto: texto, boton: titulo })) accion.mutate({ ...c, confirmacion: texto } as Cuerpo & { confirmacion: string });
  };

  const servicios = useMemo(
    () => (q.data?.servicios ?? []).filter((s) => (!soloActivos || s.estado === "running") && `${s.nombre} ${s.descripcion}`.toLowerCase().includes(filtro.toLowerCase())),
    [q.data, soloActivos, filtro],
  );
  const contenedores = useMemo(() => (q.data?.contenedores ?? []).filter((c) => c.nombre.toLowerCase().includes(filtro.toLowerCase())), [q.data, filtro]);
  const pagServicios = usePaginado(servicios, 15);
  const pagContenedores = usePaginado(contenedores, 15);

  return (
    <Tarjeta titulo="Encendido y servicios" icono={Power} acciones={<Boton tamano="sm" variante="fantasma" icono={RefreshCw} cargando={q.isFetching} onClick={() => void q.refetch()} aria-label="Actualizar" />}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Boton variante="peligro" icono={RotateCcw} disabled={accion.isPending} onClick={() => void pedir({ tipo: "vps" }, "Reiniciar el VPS", "Se apaga y se vuelve a encender todo el servidor (1 a 2 minutos sin servicio). Mi Setup vuelve solo.")}>
            Reiniciar VPS
          </Boton>
          <Boton icono={Box} disabled={accion.isPending || q.data?.docker === "no"} onClick={() => void pedir({ tipo: "docker" }, "Reiniciar Docker", "Se reinicia Docker; los contenedores con reinicio automático vuelven solos en unos segundos.")}>
            Reiniciar Docker
          </Boton>
          <Boton icono={RefreshCw} disabled={accion.isPending} onClick={() => void pedir({ tipo: "misetup" }, "Reiniciar Mi Setup", "Se reinician los contenedores de Mi Setup (misetup-*). La app se desconecta unos segundos y vuelve sola.")}>
            Reiniciar Mi Setup
          </Boton>
        </div>
        {accion.isPending ? <Cargando texto="Aplicando…" /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Pestanas
            valor={vista}
            alCambiar={setVista}
            opciones={[
              { id: "contenedores", texto: `Contenedores${q.data ? ` (${q.data.contenedores.length})` : ""}` },
              { id: "servicios", texto: "Servicios (systemd)" },
            ]}
          />
          <label className="mb-4 flex w-full min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-borde px-2 sm:w-auto">
            <Search className="h-4 w-4 text-tenue" />
            <Entrada className="border-0 bg-transparent px-0" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar" />
          </label>
        </div>
        {q.isLoading ? <Cargando texto="Leyendo el servidor…" /> : null}
        <ErrorCaja error={q.error} />
        {vista === "contenedores" ? (
          <>
            {q.data?.docker === "no" ? <p className="text-sm text-tenue">Este servidor no tiene Docker.</p> : null}
            {q.data?.docker === "sin-permiso" ? <p className="text-sm text-aviso">Tu usuario no puede usar Docker (necesita sudo sin contraseña o ser root).</p> : null}
            <ul className="space-y-1">
              {pagContenedores.visibles.map((c) => {
                const propio = c.nombre.startsWith("misetup-");
                return (
                  <li key={c.nombre} className="flex flex-wrap items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {c.nombre} {propio ? <Insignia>Mi Setup</Insignia> : null}
                      </p>
                      <p className="truncate text-xs text-tenue">
                        {c.imagen} · {c.estado}
                      </p>
                    </div>
                    <Insignia tono={c.activo ? "ok" : "neutro"}>{c.activo ? "Encendido" : "Apagado"}</Insignia>
                    <div className="flex gap-1">
                      <Boton tamano="icono" variante="fantasma" icono={RotateCcw} aria-label={`Reiniciar ${c.nombre}`} disabled={accion.isPending} onClick={() => void pedir({ tipo: "contenedor", nombre: c.nombre, operacion: "reiniciar" }, `Reiniciar ${c.nombre}`, "El contenedor se apaga y se vuelve a encender.")} />
                      {!propio ? (
                        c.activo ? (
                          <Boton tamano="icono" variante="fantasma" icono={Square} aria-label={`Apagar ${c.nombre}`} disabled={accion.isPending} onClick={() => void pedir({ tipo: "contenedor", nombre: c.nombre, operacion: "detener" }, `Apagar ${c.nombre}`, "El contenedor se apaga hasta que lo vuelvas a encender.")} />
                        ) : (
                          <Boton tamano="icono" variante="fantasma" icono={Play} aria-label={`Encender ${c.nombre}`} disabled={accion.isPending} onClick={() => void pedir({ tipo: "contenedor", nombre: c.nombre, operacion: "iniciar" }, `Encender ${c.nombre}`, "Se enciende el contenedor.")} />
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {pagContenedores.paginas}
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-tenue">
              <input type="checkbox" className="accent-acento" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} /> Solo los que están corriendo
            </label>
            <ul className="space-y-1">
              {pagServicios.visibles.map((s) => {
                const protegido = PROTEGIDOS.test(s.nombre);
                const corriendo = s.estado === "running";
                const op = (o: Operacion) => () => void pedir({ tipo: "servicio", nombre: s.nombre, operacion: o }, `${VERBO[o]} ${s.nombre}`, o === "detener" ? "El servicio se apaga hasta que lo vuelvas a encender o reinicies el VPS." : "Se aplica en el servidor.");
                return (
                  <li key={s.nombre} className="flex flex-wrap items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.nombre}</p>
                      <p className="truncate text-xs text-tenue">{s.descripcion}</p>
                    </div>
                    <Insignia tono={corriendo ? "ok" : "neutro"}>{s.estado}</Insignia>
                    <div className="flex gap-1">
                      <Boton tamano="icono" variante="fantasma" icono={RotateCcw} aria-label={`Reiniciar ${s.nombre}`} disabled={accion.isPending} onClick={op("reiniciar")} />
                      {!protegido ? (
                        corriendo ? (
                          <Boton tamano="icono" variante="fantasma" icono={Square} aria-label={`Apagar ${s.nombre}`} disabled={accion.isPending} onClick={op("detener")} />
                        ) : (
                          <Boton tamano="icono" variante="fantasma" icono={Play} aria-label={`Encender ${s.nombre}`} disabled={accion.isPending} onClick={op("iniciar")} />
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {pagServicios.paginas}
            <p className="text-xs text-tenue">SSH y los servicios básicos del sistema no se pueden apagar desde aquí (te quedarías fuera del servidor).</p>
          </>
        )}
      </div>
    </Tarjeta>
  );
}
