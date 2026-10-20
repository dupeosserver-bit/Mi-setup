package net.mexicanland.misetup;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.RequiresApi;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Contraseñas para autocompletar en otras apps. Se guardan cifradas (AES-GCM)
 * con una llave del almacén seguro de Android que nunca sale del teléfono, y
 * solo se descifran después de tu huella (AutofillAuthActivity).
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public final class AutorrellenoAlmacen {
    private static final String ALIAS = "mi-setup-autorrelleno";
    private static final String PREFS = "mi-setup-autorrelleno";
    private static final String DATOS = "datos";
    private static final String CUANTAS = "cuantas";

    private AutorrellenoAlmacen() {}

    private static SecretKey llave() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void guardar(Context c, String json, int cuantas) throws Exception {
        Cipher cifrador = Cipher.getInstance("AES/GCM/NoPadding");
        cifrador.init(Cipher.ENCRYPT_MODE, llave());
        byte[] iv = cifrador.getIV();
        byte[] cifrado = cifrador.doFinal(json.getBytes(StandardCharsets.UTF_8));
        String valor = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cifrado, Base64.NO_WRAP);
        prefs(c).edit().putString(DATOS, valor).putInt(CUANTAS, cuantas).apply();
    }

    public static String leer(Context c) throws Exception {
        String valor = prefs(c).getString(DATOS, null);
        if (valor == null) return "[]";
        String[] partes = valor.split(":", 2);
        Cipher cifrador = Cipher.getInstance("AES/GCM/NoPadding");
        cifrador.init(Cipher.DECRYPT_MODE, llave(), new GCMParameterSpec(128, Base64.decode(partes[0], Base64.NO_WRAP)));
        return new String(cifrador.doFinal(Base64.decode(partes[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    public static int cuantas(Context c) {
        return prefs(c).getInt(CUANTAS, 0);
    }

    public static void borrar(Context c) {
        prefs(c).edit().clear().apply();
    }
}
