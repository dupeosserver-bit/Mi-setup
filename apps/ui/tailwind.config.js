const v = (n) => `color-mix(in srgb, var(--${n}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: v("fondo"),
        superficie: v("superficie"),
        tarjeta: v("tarjeta"),
        borde: v("borde"),
        texto: v("texto"),
        tenue: v("texto-2"),
        acento: v("acento"),
        ok: v("ok"),
        aviso: v("aviso"),
        peligro: v("error"),
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
