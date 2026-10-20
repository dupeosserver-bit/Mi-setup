package net.mexicanland.misetup;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.service.autofill.Dataset;
import android.service.autofill.FillResponse;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillManager;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Pide tu huella y, si es correcta, entrega las contraseñas de ese sitio o app al autocompletado. */
@RequiresApi(api = Build.VERSION_CODES.O)
public class AutofillAuthActivity extends AppCompatActivity {
    static final String EXTRA_USUARIOS = "usuarios";
    static final String EXTRA_CONTRASENAS = "contrasenas";
    static final String EXTRA_DOMINIO = "dominio";
    static final String EXTRA_PAQUETE = "paquete";
    private static final int MAXIMO = 8;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Mi Setup")
                .setSubtitle("Confirma para rellenar tu contraseña")
                .setDeviceCredentialAllowed(true)
                .build();
        BiometricPrompt prompt = new BiometricPrompt(this, ContextCompat.getMainExecutor(this), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                rellenar();
            }

            @Override
            public void onAuthenticationError(int codigo, @NonNull CharSequence texto) {
                setResult(RESULT_CANCELED);
                finish();
            }
        });
        prompt.authenticate(info);
    }

    /** "https://www.instagram.com/x" → "instagram.com" */
    private static String host(String url) {
        if (url == null || url.isEmpty()) return "";
        String u = url.contains("://") ? url : "https://" + url;
        String h = Uri.parse(u).getHost();
        if (h == null) return "";
        h = h.toLowerCase(Locale.ROOT);
        return h.startsWith("www.") ? h.substring(4) : h;
    }

    /** Nombre principal del dominio: "accounts.google.com" → "google". */
    private static String marca(String dominio) {
        String[] partes = dominio.split("\\.");
        if (partes.length < 2) return dominio;
        String penultima = partes[partes.length - 2];
        // co.uk, com.mx…
        if (partes.length >= 3 && penultima.length() <= 3) return partes[partes.length - 3];
        return penultima;
    }

    private static boolean corresponde(JSONObject e, String dominio, String paquete) {
        String suyo = host(e.optString("url"));
        if (dominio != null && !dominio.isEmpty()) {
            String d = host(dominio);
            if (suyo.isEmpty()) return false;
            return d.equals(suyo) || d.endsWith("." + suyo) || suyo.endsWith("." + d);
        }
        if (paquete == null) return false;
        String p = paquete.toLowerCase(Locale.ROOT);
        String m = suyo.isEmpty() ? "" : marca(suyo);
        if (m.length() >= 3 && p.contains(m)) return true;
        String nombre = e.optString("nombre").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        for (String parte : p.split("\\.")) {
            if (parte.length() >= 4 && !parte.equals("android") && !parte.equals("mobile") && nombre.contains(parte)) return true;
        }
        return false;
    }

    private void rellenar() {
        Intent pedido = getIntent();
        ArrayList<AutofillId> usuarios = pedido.getParcelableArrayListExtra(EXTRA_USUARIOS);
        ArrayList<AutofillId> contrasenas = pedido.getParcelableArrayListExtra(EXTRA_CONTRASENAS);
        String dominio = pedido.getStringExtra(EXTRA_DOMINIO);
        String paquete = pedido.getStringExtra(EXTRA_PAQUETE);
        try {
            JSONArray entradas = new JSONArray(AutorrellenoAlmacen.leer(this));
            FillResponse.Builder respuesta = new FillResponse.Builder();
            int agregadas = 0;
            for (int i = 0; i < entradas.length() && agregadas < MAXIMO; i++) {
                JSONObject e = entradas.getJSONObject(i);
                if (!corresponde(e, dominio, paquete)) continue;
                RemoteViews vista = new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1);
                String usuario = e.optString("usuario");
                vista.setTextViewText(android.R.id.text1, e.optString("nombre") + (usuario.isEmpty() ? "" : " · " + usuario));
                Dataset.Builder datos = new Dataset.Builder(vista);
                boolean algo = false;
                if (usuarios != null && !usuario.isEmpty()) {
                    for (AutofillId id : usuarios) {
                        datos.setValue(id, AutofillValue.forText(usuario));
                        algo = true;
                    }
                }
                String clave = e.optString("contrasena");
                if (contrasenas != null && !clave.isEmpty()) {
                    for (AutofillId id : contrasenas) {
                        datos.setValue(id, AutofillValue.forText(clave));
                        algo = true;
                    }
                }
                if (algo) {
                    respuesta.addDataset(datos.build());
                    agregadas++;
                }
            }
            if (agregadas == 0) {
                Toast.makeText(this, "Mi Setup no tiene contraseñas para " + (dominio != null ? dominio : "esta app"), Toast.LENGTH_LONG).show();
                setResult(RESULT_CANCELED);
            } else {
                Intent resultado = new Intent();
                resultado.putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, respuesta.build());
                setResult(RESULT_OK, resultado);
            }
        } catch (Exception err) {
            Toast.makeText(this, "No se pudieron leer tus contraseñas", Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
        }
        finish();
    }
}
