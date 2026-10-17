/** Tema oscuro gris de Mi Setup. Los colores viven como variables en styles.css. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: "var(--fondo)",
        superficie: "var(--superficie)",
        tarjeta: "var(--tarjeta)",
        borde: "var(--borde)",
        texto: "var(--texto)",
        tenue: "var(--texto-2)",
        acento: "var(--acento)",
        ok: "var(--ok)",
        aviso: "var(--aviso)",
        peligro: "var(--error)",
      },
      fontFamily: {
        sans: ["var(--fuente)"],
        titulo: ["Montserrat", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      borderRadius: { tarjeta: "16px" },
    },
  },
  plugins: [],
};
