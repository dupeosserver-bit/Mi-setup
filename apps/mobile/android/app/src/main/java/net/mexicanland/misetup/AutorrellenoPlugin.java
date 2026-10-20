package net.mexicanland.misetup;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.autofill.AutofillManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/** Puente entre la app y el autocompletado de Android (Gestor de contraseñas → Autocompletar). */
@CapacitorPlugin(name = "Autorrelleno")
public class AutorrellenoPlugin extends Plugin {

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        boolean soportado = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O;
        r.put("soportado", soportado);
        boolean activo = false;
        int entradas = 0;
        if (soportado) {
            AutofillManager am = getContext().getSystemService(AutofillManager.class);
            activo = am != null && am.hasEnabledAutofillServices();
            entradas = AutorrellenoAlmacen.cuantas(getContext());
        }
        r.put("activo", activo);
        r.put("entradas", entradas);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Tu Android no tiene autocompletado (necesita Android 8 o más nuevo)");
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            Intent ajustes = new Intent(Settings.ACTION_SETTINGS);
            ajustes.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ajustes);
        }
        call.resolve();
    }

    @PluginMethod
    public void guardar(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Tu Android no tiene autocompletado");
            return;
        }
        JSArray entradas = call.getArray("entradas", new JSArray());
        try {
            JSONArray limpias = new JSONArray();
            for (int i = 0; i < entradas.length() && i < 5000; i++) {
                JSONObject e = entradas.getJSONObject(i);
                JSONObject x = new JSONObject();
                x.put("nombre", e.optString("nombre"));
                x.put("usuario", e.optString("usuario"));
                x.put("contrasena", e.optString("contrasena"));
                x.put("url", e.optString("url"));
                if (!x.optString("contrasena").isEmpty()) limpias.put(x);
            }
            AutorrellenoAlmacen.guardar(getContext(), limpias.toString(), limpias.length());
            JSObject r = new JSObject();
            r.put("guardadas", limpias.length());
            call.resolve(r);
        } catch (Exception err) {
            call.reject("No se pudieron guardar: " + err.getMessage());
        }
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) AutorrellenoAlmacen.borrar(getContext());
        call.resolve();
    }
}
