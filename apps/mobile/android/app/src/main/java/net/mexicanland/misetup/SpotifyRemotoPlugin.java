package net.mexicanland.misetup;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SpotifyRemoto")
public class SpotifyRemotoPlugin extends Plugin {

    private static SpotifyPuente.Listo resultado(PluginCall call) {
        return new SpotifyPuente.Listo() {
            @Override
            public void ok() {
                call.resolve();
            }

            @Override
            public void error(String mensaje) {
                call.reject(mensaje);
            }
        };
    }

    private static boolean uriValida(String uri) {
        return uri != null && uri.matches("^spotify:(track|album|playlist|artist):\\w+$");
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sdk", SpotifyPuente.sdk());
        r.put("instalado", SpotifyPuente.instalado(getContext()));
        r.put("conectado", SpotifyPuente.conectado());
        call.resolve(r);
    }

    @PluginMethod
    public void conectar(PluginCall call) {
        String clientId = call.getString("clientId");
        String retorno = call.getString("retorno", "misetup://spotify");
        if (clientId == null || clientId.isEmpty()) {
            call.reject("Falta el Client ID de Spotify (Ajustes → Servicios y claves)");
            return;
        }
        SpotifyPuente.conectar(getContext(), clientId, retorno, resultado(call));
    }

    @PluginMethod
    public void reproducir(PluginCall call) {
        String uri = call.getString("uri");
        if (!uriValida(uri)) {
            call.reject("Canción no válida");
            return;
        }
        SpotifyPuente.reproducir(uri, resultado(call));
    }

    @PluginMethod
    public void cola(PluginCall call) {
        String uri = call.getString("uri");
        if (!uriValida(uri)) {
            call.reject("Canción no válida");
            return;
        }
        SpotifyPuente.cola(uri, resultado(call));
    }

    @PluginMethod
    public void pausar(PluginCall call) {
        SpotifyPuente.pausar(resultado(call));
    }

    @PluginMethod
    public void reanudar(PluginCall call) {
        SpotifyPuente.reanudar(resultado(call));
    }

    @PluginMethod
    public void siguiente(PluginCall call) {
        SpotifyPuente.siguiente(resultado(call));
    }

    @PluginMethod
    public void anterior(PluginCall call) {
        SpotifyPuente.anterior(resultado(call));
    }

    @PluginMethod
    public void desconectar(PluginCall call) {
        SpotifyPuente.desconectar();
        call.resolve();
    }
}
