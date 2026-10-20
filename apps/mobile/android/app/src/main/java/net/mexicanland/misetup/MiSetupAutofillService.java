package net.mexicanland.misetup;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.text.InputType;
import android.view.View;
import android.view.autofill.AutofillId;
import android.widget.RemoteViews;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Autocompletar de Mi Setup (como Samsung Pass): cuando una app o sitio pide
 * usuario y contraseña, ofrece «Mi Setup». Al tocarlo se pide la huella y se
 * rellenan las contraseñas guardadas para ese sitio o app.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class MiSetupAutofillService extends AutofillService {

    /** Campos encontrados en la pantalla que pide datos. */
    static final class Campos {
        final ArrayList<AutofillId> usuarios = new ArrayList<>();
        final ArrayList<AutofillId> contrasenas = new ArrayList<>();
        String dominio = null;
    }

    @Override
    public void onFillRequest(@NonNull FillRequest request, @NonNull CancellationSignal cancel, @NonNull FillCallback callback) {
        List<FillContext> contextos = request.getFillContexts();
        if (contextos.isEmpty()) {
            callback.onSuccess(null);
            return;
        }
        AssistStructure estructura = contextos.get(contextos.size() - 1).getStructure();
        String paquete = estructura.getActivityComponent().getPackageName();
        // En la propia app de Mi Setup no se ofrece (ahí ya tienes la bóveda).
        if (getPackageName().equals(paquete)) {
            callback.onSuccess(null);
            return;
        }
        Campos campos = new Campos();
        for (int i = 0; i < estructura.getWindowNodeCount(); i++) recorrer(estructura.getWindowNodeAt(i).getRootViewNode(), campos);
        if (campos.contrasenas.isEmpty() && campos.usuarios.isEmpty()) {
            callback.onSuccess(null);
            return;
        }
        if (AutorrellenoAlmacen.cuantas(this) == 0) {
            callback.onSuccess(null);
            return;
        }
        ArrayList<AutofillId> todos = new ArrayList<>(campos.usuarios);
        todos.addAll(campos.contrasenas);

        Intent intent = new Intent(this, AutofillAuthActivity.class);
        intent.putParcelableArrayListExtra(AutofillAuthActivity.EXTRA_USUARIOS, campos.usuarios);
        intent.putParcelableArrayListExtra(AutofillAuthActivity.EXTRA_CONTRASENAS, campos.contrasenas);
        intent.putExtra(AutofillAuthActivity.EXTRA_DOMINIO, campos.dominio);
        intent.putExtra(AutofillAuthActivity.EXTRA_PAQUETE, paquete);
        int banderas = PendingIntent.FLAG_CANCEL_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        IntentSender sender = PendingIntent.getActivity(this, 1001, intent, banderas).getIntentSender();

        RemoteViews vista = new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1);
        vista.setTextViewText(android.R.id.text1, "Mi Setup: rellenar con huella");
        FillResponse respuesta = new FillResponse.Builder()
                .setAuthentication(todos.toArray(new AutofillId[0]), sender, vista)
                .build();
        callback.onSuccess(respuesta);
    }

    @Override
    public void onSaveRequest(@NonNull SaveRequest request, @NonNull SaveCallback callback) {
        // Las contraseñas nuevas se guardan desde la app (Gestor de contraseñas).
        callback.onSuccess();
    }

    private static boolean contiene(String texto, String... palabras) {
        if (texto == null) return false;
        String t = texto.toLowerCase(Locale.ROOT);
        for (String p : palabras) if (t.contains(p)) return true;
        return false;
    }

    private static void recorrer(AssistStructure.ViewNode nodo, Campos campos) {
        if (nodo == null) return;
        if (campos.dominio == null && nodo.getWebDomain() != null && !nodo.getWebDomain().isEmpty()) campos.dominio = nodo.getWebDomain();
        AutofillId id = nodo.getAutofillId();
        if (id != null && nodo.getAutofillType() == View.AUTOFILL_TYPE_TEXT) {
            String[] pistas = nodo.getAutofillHints();
            String tipoHtml = null;
            String autocompletar = null;
            if (nodo.getHtmlInfo() != null && nodo.getHtmlInfo().getAttributes() != null) {
                for (android.util.Pair<String, String> a : nodo.getHtmlInfo().getAttributes()) {
                    if ("type".equals(a.first)) tipoHtml = a.second;
                    if ("autocomplete".equals(a.first)) autocompletar = a.second;
                }
            }
            int clase = nodo.getInputType() & InputType.TYPE_MASK_CLASS;
            int variacion = nodo.getInputType() & InputType.TYPE_MASK_VARIATION;
            boolean esContrasena = "password".equalsIgnoreCase(tipoHtml)
                    || contiene(autocompletar, "current-password", "new-password")
                    || (pistas != null && contiene(String.join(" ", pistas), "password"))
                    || (clase == InputType.TYPE_CLASS_TEXT && (variacion == InputType.TYPE_TEXT_VARIATION_PASSWORD || variacion == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD || variacion == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD))
                    || (clase == InputType.TYPE_CLASS_NUMBER && (variacion == InputType.TYPE_NUMBER_VARIATION_PASSWORD));
            boolean esUsuario = !esContrasena && ("email".equalsIgnoreCase(tipoHtml)
                    || contiene(autocompletar, "username", "email")
                    || (pistas != null && contiene(String.join(" ", pistas), "username", "email", "phone"))
                    || (clase == InputType.TYPE_CLASS_TEXT && (variacion == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS || variacion == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS))
                    || contiene(nodo.getIdEntry(), "user", "email", "login", "correo", "usuario")
                    || contiene(nodo.getHint() == null ? null : nodo.getHint().toString(), "user", "email", "correo", "usuario", "teléfono", "phone"));
            if (esContrasena) campos.contrasenas.add(id);
            else if (esUsuario) campos.usuarios.add(id);
        }
        for (int i = 0; i < nodo.getChildCount(); i++) recorrer(nodo.getChildAt(i), campos);
    }
}
