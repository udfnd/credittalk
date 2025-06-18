package com.credittalk

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.Calendar

class CallStateReceiver : BroadcastReceiver() {

    companion object {
        private var handler: Handler? = null
        private var runnable: Runnable? = null
        private var isUnknownNumberDuringCall = false
        private var isRecentlyAddedContact = false
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.intent.action.PHONE_STATE") return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                cancelAlarm()
                val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

                if (incomingNumber != null) {
                    if (!isContact(context, incomingNumber)) {
                        // 모르는 번호일 경우
                        isUnknownNumberDuringCall = true
                        isRecentlyAddedContact = false
                    } else {
                        // 아는 번호일 경우, 최근 저장 여부 확인
                        isUnknownNumberDuringCall = false
                        val contactTimestamp = getContactUpdateTimestamp(context, incomingNumber)

                        // 현재로부터 30일 전 타임스탬프 계산
                        val thirtyDaysInMillis = 30L * 24 * 60 * 60 * 1000
                        val oneMonthAgo = System.currentTimeMillis() - thirtyDaysInMillis

                        if (contactTimestamp > oneMonthAgo) {
                            isRecentlyAddedContact = true
                        } else {
                            isRecentlyAddedContact = false
                        }
                    }
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (isUnknownNumberDuringCall) {
                    // 모르는 번호: 30초 뒤에 경고 알림 및 진동
                    handler = Handler(Looper.getMainLooper())
                    runnable = Runnable { vibrateAndNotifyForUnknown(context) }
                    handler?.postDelayed(runnable!!, 30000) // 30초
                } else if (isRecentlyAddedContact) {
                    // 최근 저장된 번호: 즉시 경고 알림 및 진동
                    vibrateAndNotifyForRecent(context)
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                cancelAlarm()
                isUnknownNumberDuringCall = false
                isRecentlyAddedContact = false
            }
        }
    }

    private fun cancelAlarm() {
        handler?.removeCallbacks(runnable ?: return)
        handler = null
        runnable = null
    }

    @SuppressLint("Range")
    private fun isContact(context: Context, phoneNumber: String): Boolean {
        try {
            val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(phoneNumber))
            val projection = arrayOf(ContactsContract.PhoneLookup._ID)
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                return cursor.moveToFirst()
            }
        } catch (e: Exception) {
            Log.e("CallStateReceiver", "Failed to query contacts", e)
            return false
        }
        return false
    }

    @SuppressLint("Range")
    private fun getContactUpdateTimestamp(context: Context, phoneNumber: String): Long {
        try {
            val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(phoneNumber))
            // 연락처의 최종 수정 시간을 함께 조회
            val projection = arrayOf(ContactsContract.PhoneLookup.CONTACT_LAST_UPDATED_TIMESTAMP)
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return cursor.getLong(cursor.getColumnIndex(ContactsContract.PhoneLookup.CONTACT_LAST_UPDATED_TIMESTAMP))
                }
            }
        } catch (e: Exception) {
            Log.e("CallStateReceiver", "Failed to get contact timestamp", e)
        }
        return 0L
    }

    private fun vibrateAndNotifyForUnknown(context: Context) {
        vibrate(context)
        val channelId = "unknown_call_warning_channel"
        createNotificationChannel(context, channelId, "모르는 번호 경고", NotificationManager.IMPORTANCE_HIGH)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("저장되지 않은 번호입니다. 금융 거래에 유의하세요.")
            .setContentText("피해가 우려된다면 통화를 녹음하고, 크레디톡에서 분석하세요.")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("보이스피싱 피해가 우려되니 통화를 녹음하세요. 녹음 후 크레디톡 보이스피싱 검사 기능을 활용하세요."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(getAppLaunchIntent(context))

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(112, builder.build())
    }

    // '최근 저장된 번호'를 위한 새로운 알림 함수
    private fun vibrateAndNotifyForRecent(context: Context) {
        vibrate(context)
        val channelId = "recent_contact_warning_channel"
        createNotificationChannel(context, channelId, "최근 저장 번호 경고", NotificationManager.IMPORTANCE_DEFAULT)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle("저장한 지 얼마 안 된 번호입니다.")
            .setContentText("금융거래 시 사기 피해에 유의하세요. 사기는 예방이 중요합니다.")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("금융거래시 피해가 발생할수 있으니 크레디톡 범죄수법을 활용하세요. 사기는 예방이 중요합니다."))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(getAppLaunchIntent(context))

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(113, builder.build()) // 알림 ID를 다르게 설정
    }

    private fun vibrate(context: Context) {
        val vib = context.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vib.vibrate(android.os.VibrationEffect.createOneShot(1000, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(1000)
        }
    }

    private fun createNotificationChannel(context: Context, channelId: String, channelName: String, importance: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (notificationManager.getNotificationChannel(channelId) == null) {
                val channel = NotificationChannel(channelId, channelName, importance)
                notificationManager.createNotificationChannel(channel)
            }
        }
    }

    private fun getAppLaunchIntent(context: Context): PendingIntent {
        val appIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        appIntent?.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        return PendingIntent.getActivity(context, 0, appIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
