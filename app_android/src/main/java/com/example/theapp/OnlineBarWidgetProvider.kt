package com.example.theapp

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import android.widget.RemoteViews
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.NetworkType
import org.json.JSONObject
import java.net.URL

class OnlineBarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
        val request = OneTimeWorkRequestBuilder<WidgetUpdateWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "ob_widget_refresh",
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == "com.example.theapp.ACTION_WIDGET_REFRESH") {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, OnlineBarWidgetProvider::class.java))
            for (id in ids) {
                updateAppWidget(context, appWidgetManager, id)
            }
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences("ob_widget_prefs", Context.MODE_PRIVATE)
            val configStr = prefs.getString("active_config", null)
            
            val views = RemoteViews(context.packageName, R.layout.ob_app_widget)

            if (configStr != null) {
                try {
                    val config = JSONObject(configStr)
                    if (!config.optBoolean("available", true)) {
                        views.setTextViewText(R.id.widget_title, "Online Bar")
                        views.setTextViewText(R.id.widget_description, "No active widget content is available.")
                        views.setTextViewText(R.id.widget_button, "OPEN SHOP")
                        val shopIntent = Intent(Intent.ACTION_VIEW, Uri.parse("${MainActivity.BASE_URL}/shop")).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        val shopPendingIntent = PendingIntent.getActivity(
                            context, appWidgetId, shopIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                        )
                        views.setOnClickPendingIntent(R.id.widget_button, shopPendingIntent)
                        views.setOnClickPendingIntent(R.id.widget_root, shopPendingIntent)
                        appWidgetManager.updateAppWidget(appWidgetId, views)
                        return
                    }
                    val title = config.optString("title", "Online Bar")
                    val description = config.optString("description", "")
                    val ctaLabel = config.optString("cta_label", "OPEN APP")
                    val deepLink = config.optString("deep_link", MainActivity.ADMIN_URL)

                    views.setTextViewText(R.id.widget_title, title)
                    views.setTextViewText(R.id.widget_description, description)
                    views.setTextViewText(R.id.widget_button, ctaLabel)
                    
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    val pendingIntent = PendingIntent.getActivity(
                        context, appWidgetId, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(R.id.widget_button, pendingIntent)
                    views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

                    val imageUrl = config.optString("image_url", "")
                    if (imageUrl.isNotEmpty()) {
                        Thread {
                            try {
                                val url = URL(imageUrl)
                                val bitmap = BitmapFactory.decodeStream(url.openConnection().getInputStream())
                                if (bitmap != null) {
                                    views.setImageViewBitmap(R.id.widget_image, bitmap)
                                    appWidgetManager.updateAppWidget(appWidgetId, views)
                                }
                            } catch (e: Exception) {
                                Log.e("WIDGET", "Image load failed", e)
                            }
                        }.start()
                    }
                } catch (e: Exception) {
                    Log.e("WIDGET", "Widget update failed", e)
                }
            } else {
                // Initial State prior to backend sync
                views.setTextViewText(R.id.widget_title, "Online Bar")
                views.setTextViewText(R.id.widget_description, "Tap to open terminal")
                views.setTextViewText(R.id.widget_button, "OPEN")

                val intent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                val pendingIntent = PendingIntent.getActivity(
                    context, appWidgetId, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_button, pendingIntent)
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
