/** Barra de direcciones del navegador privado (sin scripts en la página: todo vive aquí). */
import { ipcRenderer } from "electron";

interface Estado {
  url: string;
  atras: boolean;
  adelante: boolean;
  cargando: boolean;
}

window.addEventListener("DOMContentLoaded", () => {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const direccion = $<HTMLInputElement>("direccion");
  const atras = $<HTMLButtonElement>("atras");
  const adelante = $<HTMLButtonElement>("adelante");
  const recargar = $<HTMLButtonElement>("recargar");

  $<HTMLFormElement>("formulario").addEventListener("submit", (e) => {
    e.preventDefault();
    ipcRenderer.send("barra:ir", direccion.value);
  });
  atras.addEventListener("click", () => ipcRenderer.send("barra:accion", "atras"));
  adelante.addEventListener("click", () => ipcRenderer.send("barra:accion", "adelante"));
  recargar.addEventListener("click", () => ipcRenderer.send("barra:accion", "recargar"));

  ipcRenderer.on("barra:estado", (_e, estado: Estado) => {
    if (document.activeElement !== direccion) direccion.value = estado.url;
    atras.disabled = !estado.atras;
    adelante.disabled = !estado.adelante;
    recargar.textContent = estado.cargando ? "×" : "↻";
  });
  direccion.focus();
});
