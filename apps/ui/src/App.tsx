import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DialogoConfirmar, DialogoReauth } from "./components/Dialogos";
import { GuardiaModulo, Layout } from "./components/Layout";
import { Avisos } from "./components/ui";
import { asegurarDispositivo, iniciarLatidos } from "./lib/dispositivo";
import { useSesion } from "./lib/sesion";
import { tiempoReal } from "./lib/tiempo-real";
import { MODULOS_UI } from "./modulos";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";

const BotPublico = lazy(() => import("./pages/BotPublico"));
const NotaPublica = lazy(() => import("./pages/NotaPublica"));

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
        <Route element={conSesion ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Inicio />} />
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
