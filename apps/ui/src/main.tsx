import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/fira-code/400.css";
import "./styles.css";
import "./edicion";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { queryClient } from "./lib/consultas";
import { interceptarDescargas } from "./lib/guardar";
import { aplicarPreferenciasGuardadas } from "./lib/preferencias";

// Tema, fuente y zoom guardados en este dispositivo: se aplican antes de pintar nada.
aplicarPreferenciasGuardadas();
// En el celular los <a download> no hacen nada: se guardan con Filesystem.
interceptarDescargas();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
