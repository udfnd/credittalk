package com.credittalka

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * PushNotifierModule
 *
 * 앱이 포그라운드일 때 수신한 푸시를 **앱이 직접** 상태바 알림으로 띄운다.
 *
 * 왜 notifee를 쓰지 않는가(2026-09-04 프로덕션 실측 + notifee core 디컴파일):
 *  - notifee가 표시한 알림의 탭은 삼성에서 사실상 이동하지 않는다(사용자 155명 중 2명만 성공).
 *    PRESS 이벤트의 data를 OneUI가 비운 채 전달하기 때문이다.
 *  - notifee의 `ReceiverService.launchPendingIntentActivity` 는 MainActivity 인텐트에
 *    "mainComponent" 문자열 하나만 싣는다. 즉 payload가 네이티브로 전달될 통로가 없어,
 *    성공률 1위 경로인 MainActivity.capturePushIntent 로도 구제할 수 없다.
 *  - v36~v40에 걸쳐 만든 id 백업 / 쉐이드 관측 blind 복원은 264회 시도 중 복원 0건이었다.
 *
 * 여기서 만드는 PendingIntent는 MainActivity를 직접 겨냥하고 push data를 평면 String
 * extras로 싣는다 → 탭이 capturePushIntent 로 그대로 들어온다(= FCM이 OS 표시분에
 * 쓰는 것과 동일한, 이미 검증된 경로).
 */
class PushNotifierModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val imageLoader = Executors.newSingleThreadExecutor()

    override fun getName(): String = "PushNotifier"

    @ReactMethod
    fun display(payload: ReadableMap, promise: Promise) {
        try {
            val id = payload.getString("id")?.takeIf { it.isNotBlank() }
                ?: System.currentTimeMillis().toString()
            val title = payload.getString("title").orEmpty()
            val body = payload.getString("body").orEmpty()
            val channelId = payload.getString("channelId")?.takeIf { it.isNotBlank() }
                ?: DEFAULT_CHANNEL_ID
            val imageUrl = payload.getString("image")?.takeIf { it.isNotBlank() }
            val data = readStringMap(payload.getMap("data"))

            ensureChannel(channelId)

            val builder = buildBase(id, title, body, channelId, data)
            val manager = NotificationManagerCompat.from(reactContext)
            val notificationId = id.hashCode()
            manager.notify(id, notificationId, builder.build())

            // 원격 이미지는 느리거나 실패할 수 있다. 텍스트 알림을 먼저 확정한 뒤
            // 같은 id로 best-effort 갱신한다(실패해도 텍스트 알림은 그대로 남는다).
            if (imageUrl != null) {
                imageLoader.execute {
                    val bitmap = downloadBitmap(imageUrl) ?: return@execute
                    try {
                        val rich = buildBase(id, title, body, channelId, data)
                            .setLargeIcon(bitmap)
                            .setStyle(
                                NotificationCompat.BigPictureStyle()
                                    .bigPicture(bitmap)
                                    .bigLargeIcon(null as Bitmap?),
                            )
                            .setOnlyAlertOnce(true)
                        NotificationManagerCompat.from(reactContext)
                            .notify(id, notificationId, rich.build())
                    } catch (_: Exception) {
                        // 이미지 갱신 실패는 무시 — 텍스트 알림이 이미 표시돼 있다.
                    }
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PUSH_NOTIFY_ERROR", e.message, e)
        }
    }

    private fun buildBase(
        id: String,
        title: String,
        body: String,
        channelId: String,
        data: Map<String, String>,
    ): NotificationCompat.Builder {
        val builder = NotificationCompat.Builder(reactContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title.ifBlank { reactContext.getString(R.string.app_name) })
            .setContentText(body)
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(contentIntent(id, data))
        if (body.isNotBlank()) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        return builder
    }

    /**
     * 탭 인텐트: MainActivity를 명시적으로 겨냥하고 push data를 평면 String extras로 싣는다.
     * requestCode를 알림별로 다르게 두지 않으면 FLAG_UPDATE_CURRENT라도 이전 알림의
     * extras가 재사용될 수 있으므로 id 해시를 쓴다.
     */
    private fun contentIntent(id: String, data: Map<String, String>): PendingIntent {
        val intent = Intent(reactContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            for ((key, value) in data) putExtra(key, value)
        }
        return PendingIntent.getActivity(
            reactContext,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun readStringMap(map: ReadableMap?): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        if (map == null) return out
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            // JS 쪽에서 문자열로 직렬화해 넘기지만, 숫자/불리언이 새어 들어와도 버리지 않는다.
            val value = when (map.getType(key)) {
                ReadableType.String -> map.getString(key)
                ReadableType.Number -> map.getDouble(key).let {
                    if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
                }
                ReadableType.Boolean -> map.getBoolean(key).toString()
                else -> null
            }
            if (value != null) out[key] = value
        }
        return out
    }

    /**
     * 채널은 JS(ensureNotificationChannel)가 만들지만, 헤드리스 실행 순서에 따라
     * 아직 없을 수 있다. 없으면 여기서 만들어 알림이 조용히 사라지는 것을 막는다.
     */
    private fun ensureChannel(channelId: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = reactContext.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(channelId) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                channelId,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
    }

    private fun downloadBitmap(url: String): Bitmap? =
        try {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 5000
                instanceFollowRedirects = true
            }
            connection.inputStream.use { BitmapFactory.decodeStream(it) }
        } catch (_: Exception) {
            null
        }

    companion object {
        private const val DEFAULT_CHANNEL_ID = "push_default_v2"
        private const val CHANNEL_NAME = "알림"
    }
}
