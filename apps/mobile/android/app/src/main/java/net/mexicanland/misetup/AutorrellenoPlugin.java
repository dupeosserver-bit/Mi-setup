package net.mexicanland.misetup;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.autofill.AutofillManager;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
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

    /** ¿Hay huella o rostro registrados? (respaldo por si el plugin de huella no la detecta). */
    @PluginMethod
    public void huella(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        int r = bm.canAuthenticate(TIPOS);
        JSObject o = new JSObject();
        o.put("disponible", r == BiometricManager.BIOMETRIC_SUCCESS);
        o.put("sinRegistrar", r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED);
        // Las versiones con huellaPedir (0.11.2b+) lo avisan para no usar el plugin viejo.
        o.put("propia", true);
        call.resolve(o);
    }

    /** Momento (reloj de arranque) de la última huella correcta; la llave solo se entrega 30 s después. */
    private long ultimaHuella = 0;
    private static final long VIGENCIA_MS = 30_000;
    private static final int TIPOS = BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK;

    /**
     * Aviso de huella del sistema (como el de Revolut): "Desbloquear con la huella
     * dactilar", el sensor abajo y el botón Cancelar. Usa BiometricPrompt directo,
     * sin pantallas intermedias (la del plugin viejo fallaba en Android 14+).
     */
    @PluginMethod
    public void huellaPedir(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        int estado = bm.canAuthenticate(TIPOS);
        if (estado != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject(estado == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED
                    ? "No tienes huellas registradas en el celular (Ajustes → Seguridad → Huellas)"
                    : "Este celular no puede usar la huella ahora", "sin-huella");
            return;
        }
        String titulo = call.getString("titulo", "Desbloquear con la huella dactilar");
        String subtitulo = call.getString("subtitulo", "Escanee su huella digital.");
        String cancelar = call.getString("cancelar", "Cancelar");
        getActivity().runOnUiThread(() -> {
            try {
                FragmentActivity actividad = (FragmentActivity) getActivity();
                BiometricPrompt prompt = new BiometricPrompt(actividad, ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        ultimaHuella = SystemClock.elapsedRealtime();
                        call.resolve();
                    }

                    @Override
                    public void onAuthenticationError(int codigo, @NonNull CharSequence texto) {
                        boolean cancelada = codigo == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || codigo == BiometricPrompt.ERROR_USER_CANCELED
                                || codigo == BiometricPrompt.ERROR_CANCELED;
                        call.reject(cancelada ? "Cancelaste la huella" : texto.toString(), cancelada ? "cancelada" : "error");
                    }
                });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(titulo)
                        .setSubtitle(subtitulo)
                        .setNegativeButtonText(cancelar)
                        .setAllowedAuthenticators(TIPOS)
                        .setConfirmationRequired(false)
                        .build();
                prompt.authenticate(info);
            } catch (Exception err) {
                call.reject("No se pudo mostrar la huella: " + err.getMessage(), "error");
            }
        });
    }

    private boolean huellaReciente() {
        return ultimaHuella != 0 && SystemClock.elapsedRealtime() - ultimaHuella < VIGENCIA_MS;
    }

    /** Guarda la llave de la huella cifrada con el almacén seguro de Android. */
    @PluginMethod
    public void huellaGuardar(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.reject("Tu Android es muy viejo para la huella");
            return;
        }
        if (!huellaReciente()) {
            call.reject("Primero pon tu huella", "sin-huella");
            return;
        }
        try {
            HuellaAlmacen.guardar(getContext(), call.getString("nombre", "llave"), call.getString("valor", ""));
            call.resolve();
        } catch (Exception err) {
            call.reject("No se pudo guardar la llave: " + err.getMessage());
        }
    }

    /** Entrega la llave solo si la huella se puso hace menos de 30 s. */
    @PluginMethod
    public void huellaLeer(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || !huellaReciente()) {
            call.reject("Primero pon tu huella", "sin-huella");
            return;
        }
        try {
            String valor = HuellaAlmacen.leer(getContext(), call.getString("nombre", "llave"));
            JSObject r = new JSObject();
            r.put("valor", valor);
            call.resolve(r);
        } catch (Exception err) {
            call.reject("No se pudo leer la llave: " + err.getMessage());
        }
    }

    @PluginMethod
    public void huellaBorrar(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) HuellaAlmacen.borrar(getContext(), call.getString("nombre", "llave"));
        call.resolve();
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
