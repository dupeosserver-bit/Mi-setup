import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DialogoConfirmar, DialogoReauth } from "./components/Dialogos";
import { GuardiaModulo, Layout } from "./components/Layout";
import { Logo } from "./components/Logo";
import { Avisos } from "./components/ui";
import { useMe } from "./lib/consultas";
import { asegurarDispositivo, iniciarLatidos } from "./lib/dispositivo";
import { useSesion } from "./lib/sesion";
import { tiempoReal } from "./lib/tiempo-real";
import { MODULOS_UI, RUTAS_MOVIDAS } from "./modulos";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";

const BotPublico = lazy(() => import("./pages/BotPublico"));
const NotaPublica = lazy(() => import("./pages/NotaPublica"));
const CobroPublico = lazy(() => import("./pages/CobroPublico"));

/**
 * Mientras llegan tu cuenta y tus permisos se ve el logo con un círculo de carga,
 * no el inicio vacío («Hola,» sin nombre, menú sin apartados).
 */
function ConSesion() {
  const me = useMe();
  if (!me.data && !me.error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-fondo" role="status" aria-label="Cargando">
        <Logo tamano="lg" />
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-borde border-t-acento" />
      </div>
    );
  }
  return <Layout />;
}

export function App() {
  const conSesion = useSesion((s) => Boolean(s.refreshToken));

  useEffect(() => {
    if (!conSesion) {
      tiempoReal.detener();
      return;
    }
    tiempoReal.iniciar();
    void asegurarDispositivo().catch(() => undefined);
    const offRegistro = tiempoReal.on("auth.ok", (msg) => {
      if (msg.dispositivo === false) void asegurarDispositivo().catch(() => undefined);
    });
    const detener = iniciarLatidos();
    return () => {
      offRegistro();
      detener();
    };
  }, [conSesion]);

  return (
    <>
      <Routes>
        <Route path="/login" element={conSesion ? <Navigate to="/" replace /> : <Login />} />
        {/* Página del dueño de un bot (enlace de cliente): no pide cuenta de Mi Setup. */}
        <Route
          path="/bot/:token"
          element={
            <Suspense fallback={<p className="py-10 text-center text-sm text-tenue">Cargando…</p>}>
              <BotPublico />
            </Suspense>
          }
        />
        {/* Nota compartida con enlace: se ve sin cuenta. */}
        <Route
          path="/n/:token"
          element={
            <Suspense fallback={<p className="py-10 text-center text-sm text-tenue">Cargando…</p>}>
              <NotaPublica />
            </Suspense>
          }
        />
        {/* Lista de cobros de Pagos divididos con enlace: se ve sin cuenta. */}
        <Route
          path="/cobro/:token"
          element={
            <Suspense fallback={<p className="py-10 text-center text-sm text-tenue">Cargando…</p>}>
              <CobroPublico />
            </Suspense>
          }
        />
        <Route element={conSesion ? <ConSesion /> : <Navigate to="/login" replace />}>
          <Route index element={<Inicio />} />
          {RUTAS_MOVIDAS.map((r) => (
            <Route key={r.desde} path={`${r.desde.slice(1)}/*`} element={<Navigate to={r.hasta} replace />} />
          ))}
          {Object.values(MODULOS_UI).map((m) => (
            <Route
              key={m.id}
              path={`${m.ruta.slice(1)}/*`}
              element={
                <GuardiaModulo modulo={m.id}>
                  <m.Pagina />
                </GuardiaModulo>
              }
            />
          ))}
          <Route path="*" element={<p className="py-10 text-center text-sm text-tenue">Esta página no existe.</p>} />
        </Route>
      </Routes>
      <DialogoReauth />
      <DialogoConfirmar />
      <Avisos />
    </>
  );
}
