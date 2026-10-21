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
 * Llave de la huella de Mi Setup: se guarda cifrada (AES-GCM) con una llave del
 * almacén seguro de Android y solo se entrega a la app justo después de pasar
 * la huella (AutorrellenoPlugin.huellaLeer).
 */
@RequiresApi(api = Build.VERSION_CODES.M)
public final class HuellaAlmacen {
    private static final String ALIAS = "mi-setup-huella";
    private static final String PREFS = "mi-setup-huella";

    private HuellaAlmacen() {}

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

    public static void guardar(Context c, String nombre, String valor) throws Exception {
        Cipher cifrador = Cipher.getInstance("AES/GCM/NoPadding");
        cifrador.init(Cipher.ENCRYPT_MODE, llave());
        byte[] cifrado = cifrador.doFinal(valor.getBytes(StandardCharsets.UTF_8));
        String guardado = Base64.encodeToString(cifrador.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cifrado, Base64.NO_WRAP);
        prefs(c).edit().putString(nombre, guardado).apply();
    }

    public static String leer(Context c, String nombre) throws Exception {
        String guardado = prefs(c).getString(nombre, null);
        if (guardado == null) return null;
        String[] partes = guardado.split(":", 2);
        Cipher cifrador = Cipher.getInstance("AES/GCM/NoPadding");
        cifrador.init(Cipher.DECRYPT_MODE, llave(), new GCMParameterSpec(128, Base64.decode(partes[0], Base64.NO_WRAP)));
        return new String(cifrador.doFinal(Base64.decode(partes[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    public static void borrar(Context c, String nombre) {
        prefs(c).edit().remove(nombre).apply();
    }
}
