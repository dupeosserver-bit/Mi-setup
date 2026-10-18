package net.mexicanland.misetup;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Apartado a abrir (lo mandan el widget y los accesos del ícono). */
    public static final String EXTRA_RUTA = "ruta";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String ruta = rutaDe(getIntent());
        // En frío: se carga la app directo en ese apartado.
        if (ruta != null && !ruta.equals("/") && getBridge() != null) {
            getBridge().getWebView().loadUrl(getBridge().getLocalUrl() + ruta);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String ruta = rutaDe(intent);
        // Con la app abierta: se cambia de pantalla sin recargar (React Router escucha popstate).
        if (ruta != null && getBridge() != null) {
            getBridge().eval("history.pushState({}, '', '" + ruta + "'); dispatchEvent(new PopStateEvent('popstate'));", null);
        }
    }

    /** Solo rutas internas simples, para que nadie pueda inyectar código por el intent. */
    private static String rutaDe(Intent intent) {
        if (intent == null) return null;
        String ruta = intent.getStringExtra(EXTRA_RUTA);
        if (ruta == null || !ruta.matches("^/[a-z0-9/_-]{0,60}$")) return null;
        return ruta;
    }
}
