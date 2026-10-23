package net.mexicanland.misetup;

import android.content.Context;
import com.spotify.android.appremote.api.ConnectionParams;
import com.spotify.android.appremote.api.Connector;
import com.spotify.android.appremote.api.SpotifyAppRemote;
import com.spotify.protocol.client.CallResult;

final class SpotifyPuente {
    interface Listo {
        void ok();
        void error(String mensaje);
    }

    private static SpotifyAppRemote remoto;

    private SpotifyPuente() {}

    static boolean sdk() {
        return true;
    }

    static boolean instalado(Context c) {
        return SpotifyAppRemote.isSpotifyInstalled(c);
    }

    static boolean conectado() {
        return remoto != null && remoto.isConnected();
    }

    static void conectar(Context c, String clientId, String retorno, Listo listo) {
        if (conectado()) {
            listo.ok();
            return;
        }
        ConnectionParams p = new ConnectionParams.Builder(clientId).setRedirectUri(retorno).showAuthView(true).build();
        SpotifyAppRemote.connect(c, p, new Connector.ConnectionListener() {
            @Override
            public void onConnected(SpotifyAppRemote r) {
                remoto = r;
                listo.ok();
            }

            @Override
            public void onFailure(Throwable t) {
                remoto = null;
                listo.error(t.getMessage() == null ? "No se pudo conectar con Spotify" : t.getMessage());
            }
        });
    }

    private static <T> void esperar(CallResult<T> r, Listo listo) {
        r.setResultCallback(x -> listo.ok()).setErrorCallback(t -> listo.error(t.getMessage() == null ? "Spotify no respondió" : t.getMessage()));
    }

    private static boolean listo(Listo listo) {
        if (conectado()) return true;
        listo.error("Spotify no está conectado en este celular");
        return false;
    }

    static void reproducir(String uri, Listo listo) {
        if (listo(listo)) esperar(remoto.getPlayerApi().play(uri), listo);
    }

    static void pausar(Listo listo) {
        if (listo(listo)) esperar(remoto.getPlayerApi().pause(), listo);
    }

    static void reanudar(Listo listo) {
        if (listo(listo)) esperar(remoto.getPlayerApi().resume(), listo);
    }

    static void siguiente(Listo listo) {
        if (listo(listo)) esperar(remoto.getPlayerApi().skipNext(), listo);
    }

    static void anterior(Listo listo) {
        if (listo(listo)) esperar(remoto.getPlayerApi().skipPrevious(), listo);
    }

    static void cola(String uri, Listo listo) {
        if (listo(listo)) esperar(remoto.getPlayerApi().queue(uri), listo);
    }

    static void desconectar() {
        if (remoto != null) SpotifyAppRemote.disconnect(remoto);
        remoto = null;
    }
}
