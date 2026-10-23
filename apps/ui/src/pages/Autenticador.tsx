import { usePaginado } from "../components/Paginas";
import { useMutation } from "@tanstack/react-query";
import jsQR from "jsqr";
import { Copy, Dices, Download, ImageUp, Link2, Lock, Plus, QrCode, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Desbloqueo } from "../components/Desbloqueo";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { Generador, Iniciales } from "../components/boveda/comun";
import { useForma } from "../lib/marco";
import { api } from "../lib/api";
import { cifrar, contextoDe } from "../lib/boveda/cripto";
import { recargarElementos, useBoveda, useConfigBoveda, useElementos } from "../lib/boveda/estado";
import { base32Decodificar, codigoTotp, parsearOtpauth, type Algoritmo, type CuentaTotp } from "../lib/boveda/totp";
import { copiarSeguro, exportar, importar } from "../lib/boveda/utilidades";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";

function Codigo({ id, cuenta, puede }: { id: string; cuenta: CuentaTotp; puede: boolean }) {
  const [estado, setEstado] = useState<{ codigo: string; restante: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    const tick = () => void codigoTotp(cuenta).then((e) => vivo && setEstado(e)).catch(() => vivo && setEstado(null));
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [cuenta]);
  const pct = estado ? (estado.restante / cuenta.periodo) * 100 : 0;
  const mitad = estado ? Math.ceil(estado.codigo.length / 2) : 0;
  const poco = Boolean(estado && estado.restante <= 5);
  const copiar = () => estado && void copiarSeguro(estado.codigo, "Código copiado").catch(avisarError);
  const nombre = cuenta.emisor || cuenta.cuenta || "Sin emisor";
  return (
    <li
      className="flex min-w-0 flex-col gap-3 rounded-tarjeta border bg-superficie p-4 transition-colors"
      style={{ borderColor: poco ? "color-mix(in srgb, var(--error) 55%, transparent)" : "var(--borde)" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Iniciales texto={nombre} tam={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{cuenta.emisor || "Sin emisor"}</p>
          <p className="truncate text-xs text-tenue">{cuenta.cuenta}</p>
        </div>
        {puede ? (
          <Boton
            tamano="icono"
            variante="fantasma"
            icono={Trash2}
            aria-label="Quitar"
            onClick={async () => {
              if (!(await confirmar({ titulo: "Quitar cuenta 2FA", mensaje: `Si quitas ${cuenta.emisor} ${cuenta.cuenta} y no tienes otro respaldo, podrías perder el acceso a esa cuenta.`, peligroso: true, textoExacto: cuenta.emisor || "QUITAR", boton: "Quitar" }))) return;
              await api(`/api/2fa/items/${id}`, { metodo: "DELETE" }).catch(avisarError);
              await recargarElementos();
            }}
          />
        ) : null}
      </div>
      <button type="button" onClick={copiar} title="Copiar" className={cx("flex items-center justify-between gap-2 text-left font-mono text-3xl tabular-nums tracking-[0.18em]", poco ? "text-peligro" : "text-texto")}>
        <span>{estado ? `${estado.codigo.slice(0, mitad)} ${estado.codigo.slice(mitad)}` : "— —"}</span>
        <Copy className="h-4 w-4 shrink-0 text-tenue" />
      </button>
      <div className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tarjeta">
          <i className="block h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: poco ? "var(--error)" : "var(--acento)" }} />
        </span>
        <small className={cx("w-8 text-right text-xs tabular-nums", poco ? "text-peligro" : "text-tenue")}>{estado ? `${estado.restante}s` : ""}</small>
      </div>
    </li>
  );
}

function leerQrDeImagen(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo leer la imagen"));
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(datos.data, datos.width, datos.height);
      if (qr?.data) resolve(qr.data);
      else reject(new Error("No se encontró un código QR en la imagen"));
    };
    img.onerror = () => reject(new Error("No se pudo abrir la imagen"));
    img.src = url;
  });
}

function EscanerCamara({ alLeer }: { alLeer: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let flujo: MediaStream | null = null;
    let cuadro = 0;
    const canvas = document.createElement("canvas");
    const buscar = () => {
      const v = video.current;
      if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0);
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(d.data, d.width, d.height);
          if (qr?.data) return alLeer(qr.data);
        }
      }
      cuadro = requestAnimationFrame(buscar);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        flujo = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        cuadro = requestAnimationFrame(buscar);
      })
      .catch(() => setError("No se pudo usar la cámara. Da permiso o usa una imagen."));
    return () => {
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [alLeer]);
  return error ? <p className="text-sm text-peligro">{error}</p> : <video ref={video} muted playsInline className="w-full rounded-xl bg-black" />;
}

function Agregar({ alTerminar }: { alTerminar: () => void }) {
  const clave = useBoveda((s) => s.clave);
  const [modo, setModo] = useState<"enlace" | "imagen" | "camara" | "manual">("enlace");
  const [enlace, setEnlace] = useState("");
  const [manual, setManual] = useState<CuentaTotp>({ emisor: "", cuenta: "", secreto: "", algoritmo: "SHA1", digitos: 6, periodo: 30 });
  const guardar = useMutation({
    mutationFn: async (c: CuentaTotp) => {
      if (!clave) throw new Error("La bóveda se bloqueó");
      base32Decodificar(c.secreto);
      await api("/api/2fa/items", { cuerpo: { tipo: "totp", datos: await cifrar(clave, c, contextoDe("totp")) } });
    },
    onSuccess: async () => {
      avisar("Cuenta 2FA agregada");
      await recargarElementos();
      alTerminar();
    },
    onError: avisarError,
  });
  const desdeTexto = (texto: string) => {
    try {
      guardar.mutate(parsearOtpauth(texto));
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <div>
      <Pestanas
        opciones={[
          { id: "enlace", texto: "Enlace" },
          { id: "imagen", texto: "Imagen QR" },
          { id: "camara", texto: "Cámara" },
          { id: "manual", texto: "Manual" },
        ]}
        valor={modo}
        alCambiar={setModo}
      />
      {modo === "enlace" ? (
        <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), desdeTexto(enlace))}>
          <Campo etiqueta="Enlace otpauth://">
            <Entrada value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="otpauth://totp/Servicio:cuenta?secret=…" autoFocus />
          </Campo>
          <Boton type="submit" variante="primario" className="w-full" icono={Link2} cargando={guardar.isPending}>Agregar</Boton>
        </form>
      ) : null}
      {modo === "imagen" ? (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-borde p-8 text-sm text-tenue hover:bg-tarjeta">
          <ImageUp className="h-6 w-6" /> Elige una captura con el código QR
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerQrDeImagen(f).then(desdeTexto, avisarError); }} />
        </label>
      ) : null}
      {modo === "camara" ? <EscanerCamara alLeer={desdeTexto} /> : null}
      {modo === "manual" ? (
        <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), guardar.mutate({ ...manual, secreto: manual.secreto.toUpperCase().replace(/[\s=-]/g, "") }))}>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Servicio">
              <Entrada value={manual.emisor} onChange={(e) => setManual({ ...manual, emisor: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Cuenta">
              <Entrada value={manual.cuenta} onChange={(e) => setManual({ ...manual, cuenta: e.target.value })} />
            </Campo>
          </div>
          <Campo etiqueta="Clave secreta (base32)">
            <Entrada value={manual.secreto} onChange={(e) => setManual({ ...manual, secreto: e.target.value })} required className="font-mono" autoComplete="off" />
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo etiqueta="Algoritmo">
              <Selector value={manual.algoritmo} onChange={(e) => setManual({ ...manual, algoritmo: e.target.value as Algoritmo })}>
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Dígitos">
              <Selector value={manual.digitos} onChange={(e) => setManual({ ...manual, digitos: Number(e.target.value) })}>
                <option value={6}>6</option>
                <option value={7}>7</option>
                <option value={8}>8</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Segundos">
              <Entrada type="number" min={10} max={300} value={manual.periodo} onChange={(e) => setManual({ ...manual, periodo: Number(e.target.value) })} />
            </Campo>
          </div>
          <Boton type="submit" variante="primario" className="w-full" icono={Plus} cargando={guardar.isPending}>Agregar</Boton>
        </form>
      ) : null}
    </div>
  );
}

function Contenido() {
  const puede = usePuede("autenticador", "escritura");
  const bloquear = useBoveda((s) => s.bloquear);
  const config = useConfigBoveda();
  const forma = useForma();
  const { data, isLoading, error } = useElementos<CuentaTotp>("2fa");
  const [agregar, setAgregar] = useState(false);
  const [q, setQ] = useState("");
  const [importando, setImportando] = useState<string | null>(null);
  const [claveArchivo, setClaveArchivo] = useState("");
  const archivo = useRef<HTMLInputElement>(null);
  const lista = (data ?? []).filter((i) => !q || `${i.valor.emisor} ${i.valor.cuenta}`.toLowerCase().includes(q.toLowerCase()));
  const pgAu = usePaginado(lista, 12);
  const lado = forma === "pc";
  return (
    <>
      <Encabezado
        titulo="Autenticador 2FA"
        descripcion="Tus códigos de dos pasos en grande, listos para copiar. Se calculan en este equipo y las claves están cifradas."
        acciones={
          <>
            <Boton tamano="sm" icono={Download} onClick={() => config.data && void exportar("2fa", config.data).then(() => avisar("Exportado (sigue cifrado)"), avisarError)}>
              Exportar
            </Boton>
            <Boton tamano="sm" icono={Upload} onClick={() => archivo.current?.click()}>
              Importar
            </Boton>
            <input
              ref={archivo}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void f.text().then(setImportando);
              }}
            />
            <Boton tamano="sm" icono={Lock} onClick={bloquear}>
              Bloquear
            </Boton>
            {puede && !lado ? (
              <Boton variante="primario" icono={Plus} onClick={() => setAgregar(true)}>
                Agregar
              </Boton>
            ) : null}
          </>
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando texto="Descifrando…" /> : null}
      <div className={cx("grid grid-cols-1 gap-4", lado && "grid-cols-[minmax(0,1fr)_360px]")}>
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
              <Entrada className="pl-9" placeholder="Buscar cuenta 2FA" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <span className="flex items-center gap-1.5 text-xs text-tenue">
              <Lock className="h-3.5 w-3.5" />
              Se guardan cifrados en tu bóveda
            </span>
          </div>
          {data?.length === 0 ? <Vacio icono={ShieldCheck} texto="Agrega tu primera cuenta con su QR o enlace otpauth." /> : null}
          {data?.length && !lista.length ? <Vacio icono={Search} texto="Sin resultados." /> : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {pgAu.visibles.map((i) => (
              <Codigo key={i.id} id={i.id} cuenta={i.valor} puede={puede} />
            ))}
          </ul>
          {pgAu.paginas}
        </section>
        <aside className={cx("min-w-0 space-y-4", lado ? "self-start" : "grid gap-4 md:grid-cols-2 md:space-y-0")}>
          {puede && lado ? (
            <Tarjeta titulo="Agregar cuenta 2FA" icono={QrCode}>
              <Agregar alTerminar={() => undefined} />
            </Tarjeta>
          ) : null}
          <Tarjeta titulo="Generador de contraseñas" icono={Dices}>
            <Generador compacto />
          </Tarjeta>
        </aside>
      </div>
      <Modal abierto={agregar} titulo="Agregar cuenta 2FA" alCerrar={() => setAgregar(false)}>
        <Agregar alTerminar={() => setAgregar(false)} />
      </Modal>
      <Modal abierto={importando !== null} titulo="Importar respaldo cifrado" alCerrar={() => setImportando(null)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void importar("2fa", importando ?? "", claveArchivo)
              .then((n) => {
                avisar(`${n} cuentas importadas`);
                setImportando(null);
                setClaveArchivo("");
              })
              .catch(avisarError);
          }}
        >
          <Campo etiqueta="Clave maestra con la que se exportó el archivo">
            <Entrada type="password" value={claveArchivo} onChange={(e) => setClaveArchivo(e.target.value)} autoFocus />
          </Campo>
          <Boton type="submit" variante="primario" className="w-full">
            Importar
          </Boton>
        </form>
      </Modal>
    </>
  );
}

export default function Autenticador() {
  return (
    <Desbloqueo>
      <Contenido />
    </Desbloqueo>
  );
}
