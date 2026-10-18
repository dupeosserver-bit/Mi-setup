package net.mexicanland.misetup;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Widget de inicio: reloj, fecha y accesos directos a apartados de la app. */
public class WidgetMiSetup extends AppWidgetProvider {
    private static final int[] BOTONES = { R.id.widget_ia, R.id.widget_notas, R.id.widget_finanzas, R.id.widget_calendario, R.id.widget_vps };
    private static final String[] RUTAS = { "/ia", "/notas", "/finanzas", "/calendario", "/vps/rendimiento" };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_mi_setup);
            vista.setOnClickPendingIntent(R.id.widget_raiz, abrir(context, "/", 0));
            for (int i = 0; i < BOTONES.length; i++) {
                vista.setOnClickPendingIntent(BOTONES[i], abrir(context, RUTAS[i], i + 1));
            }
            manager.updateAppWidget(id, vista);
        }
    }

    private static PendingIntent abrir(Context context, String ruta, int codigo) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("net.mexicanland.misetup.ABRIR" + ruta);
        intent.putExtra(MainActivity.EXTRA_RUTA, ruta);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, codigo, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
