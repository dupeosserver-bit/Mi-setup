package net.mexicanland.misetup;

import android.content.Context;
import android.content.pm.PackageManager;

final class SpotifyPuente {
    interface Listo {
        void ok();
        void error(String mensaje);
    }

    private static final String FALTA = "Esta versión de la app no trae el SDK de Spotify. La música se controla con Spotify Connect.";

    private SpotifyPuente() {}

    static boolean sdk() {
        return false;
    }

    static boolean instalado(Context c) {
        try {
            c.getPackageManager().getPackageInfo("com.spotify.music", 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    static boolean conectado() {
        return false;
    }

    static void conectar(Context c, String clientId, String retorno, Listo listo) {
        listo.error(FALTA);
    }

    static void reproducir(String uri, Listo listo) {
        listo.error(FALTA);
    }

    static void pausar(Listo listo) {
        listo.error(FALTA);
    }

    static void reanudar(Listo listo) {
        listo.error(FALTA);
    }

    static void siguiente(Listo listo) {
        listo.error(FALTA);
    }

    static void anterior(Listo listo) {
        listo.error(FALTA);
    }

    static void cola(String uri, Listo listo) {
        listo.error(FALTA);
    }

    static void desconectar() {}
}
