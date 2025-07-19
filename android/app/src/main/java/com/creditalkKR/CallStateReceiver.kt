package com.credittalka // 현재 프로젝트의 패키지명

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
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.ContactsContract
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray

// 사기 정보 데이터 클래스 (Supabase 연동용)
data class ScamInfo(val scamType: String, val nickname: String, val phoneNumber: String)

class CallStateReceiver : BroadcastReceiver() {

    companion object {
        // 핸들러 및 Runnable 관리
        private var handler: Handler? = null
        private var unknownRunnable3min: Runnable? = null
        private var unknownRunnable5min: Runnable? = null

        // 통화 상태 추적 변수
        private var currentNumber: String? = null
        private var isUnknownNumber = false
        private var isRecentlyAddedContact = false

        // Supabase에서 받아온 블랙리스트
        private var scamList: List<ScamInfo> = emptyList()

        // 리액트 네이티브에서 블랙리스트를 업데이트하는 함수
        fun updateBlacklist(jsonString: String) {
            val newList = mutableListOf<ScamInfo>()
            try {
                val jsonArray = JSONArray(jsonString)
                for (i in 0 until jsonArray.length()) {
                    val jsonObject = jsonArray.getJSONObject(i)
                    val phoneNumber = jsonObject.optString("phoneNumber", null)
                    if (phoneNumber != null) {
                       newList.add(
                           ScamInfo(
                               scamType = jsonObject.optString("scamType", "N/A"),
                               nickname = jsonObject.optString("nickname", "N/A"),
                               phoneNumber = phoneNumber
                           )
                       )
                    }
                }
                scamList = newList
                Log.d("CallStateReceiver", "Blacklist updated with ${scamList.size} numbers.")
            } catch(e: Exception) {
                Log.e("CallStateReceiver", "Failed to parse blacklist JSON", e)
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return

        when (action) {
            Intent.ACTION_NEW_OUTGOING_CALL -> {
                val outgoingNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER)
                handleCall(context, outgoingNumber, "발신")
            }
            TelephonyManager.ACTION_PHONE_STATE_CHANGED -> {
                val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
                val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

                when (state) {
                    TelephonyManager.EXTRA_STATE_RINGING -> {
                        handleCall(context, incomingNumber, "수신")
                    }
                    TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                        if (isRecentlyAddedContact) {
                            // 최근 저장된 번호: 즉시 경고
                            vibrateAndNotifyForRecent(context)
                        } else if (isUnknownNumber) {
                            // 모르는 번호: 3분, 5분 뒤 경고 예약
                            scheduleUnknownCallWarnings(context)
                        }
                    }
                    TelephonyManager.EXTRA_STATE_IDLE -> {
                        cancelAlarms()
                    }
                }
            }
        }
    }

    private fun handleCall(context: Context, number: String?, direction: String) {
        if (number == null) return

        cancelAlarms() // 새로운 통화 시작 시 이전 경보 모두 취소

        var normalizedNumber = number.replace("[^0-9+]".toRegex(), "")
        if (normalizedNumber.startsWith("+82")) {
            normalizedNumber = normalizedNumber.replaceFirst("+82", "0")
        }
        currentNumber = normalizedNumber

        // 1순위: 사기 이력 확인
        val scamInfo = checkBlacklist(normalizedNumber)
        if (scamInfo != null) {
            vibrateAndNotifyForScam(context, scamInfo, "$direction 전화입니다.")
            return // 사기 전화는 다른 검사를 할 필요 없음
        }

        // 2순위: 주소록 저장 여부 확인
        if (!isContact(context, normalizedNumber)) {
            isUnknownNumber = true
            vibrateAndNotifyForUnknown(context, "$direction 전화입니다.")
        } else {
            // 3순위: 최근 저장 여부 확인 (주소록에 있는 번호 대상)
            val contactTimestamp = getContactUpdateTimestamp(context, normalizedNumber)
            val thirtyDaysInMillis = 30L * 24 * 60 * 60 * 1000
            val oneMonthAgo = System.currentTimeMillis() - thirtyDaysInMillis

            if (contactTimestamp > oneMonthAgo) {
                isRecentlyAddedContact = true
                // 통화가 연결되면(OFFHOOK) 알림이 가도록 플래그만 설정
            }
        }
    }

    private fun scheduleUnknownCallWarnings(context: Context) {
        handler = Handler(Looper.getMainLooper())
        // 3분, 5분 경고는 기존 "모르는 번호"와 다른 메시지로 제공하여 혼동을 방지
        unknownRunnable3min = Runnable { notifyLongCallWarning(context, "3분") }
        unknownRunnable5min = Runnable { notifyLongCallWarning(context, "5분") }
        handler?.postDelayed(unknownRunnable3min!!, 180000) // 3분
        handler?.postDelayed(unknownRunnable5min!!, 300000) // 5분
    }

    private fun cancelAlarms() {
        handler?.removeCallbacks(unknownRunnable3min ?: Runnable {})
        handler?.removeCallbacks(unknownRunnable5min ?: Runnable {})
        handler = null
        unknownRunnable3min = null
        unknownRunnable5min = null
        currentNumber = null
        isUnknownNumber = false
        isRecentlyAddedContact = false
    }

    // --- 알림 생성 함수들 ---

    private fun vibrateAndNotifyForScam(context: Context, scamInfo: ScamInfo, direction: String) {
        vibrate(context, 2000)
        val channelId = "scam_call_warning_channel"
        createNotificationChannel(context, channelId, "사기 의심 전화 경고", NotificationManager.IMPORTANCE_HIGH)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("$direction 사기 이력이 있는 전화입니다.")
            .setContentText("사기 유형: ${scamInfo.scamType}, 닉네임: ${scamInfo.nickname}")
            .setStyle(NotificationCompat.BigTextStyle().bigText("금융 거래에 각별히 유의하세요. 통화 내용을 녹음하는 것을 권장합니다."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(getAppLaunchIntent(context))

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(111, builder.build())
    }

    private fun vibrateAndNotifyForUnknown(context: Context, direction: String) {
        vibrate(context, 1000)
        val channelId = "unknown_call_warning_channel"
        createNotificationChannel(context, channelId, "모르는 번호 경고", NotificationManager.IMPORTANCE_HIGH)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("$direction 저장되지 않은 번호입니다.")
            .setContentText("보이스피싱 피해가 우려되니 통화를 녹음하고, 크레디톡에서 분석하세요.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(getAppLaunchIntent(context))

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(112, builder.build())
    }

    private fun vibrateAndNotifyForRecent(context: Context) {
        vibrate(context, 1000)
        val channelId = "recent_contact_warning_channel"
        createNotificationChannel(context, channelId, "최근 저장 번호 경고", NotificationManager.IMPORTANCE_DEFAULT)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle("저장한 지 얼마 안 된 번호입니다.")
            .setContentText("금융거래 시 사기 피해에 유의하세요. 사기는 예방이 중요합니다.")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("금융거래 시 피해가 발생할 수 있으니 크레디톡 범죄수법을 활용하세요. 사기는 예방이 중요합니다."))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(getAppLaunchIntent(context))

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(113, builder.build())
    }

    private fun notifyLongCallWarning(context: Context, duration: String) {
         val channelId = "long_call_warning_channel"
         createNotificationChannel(context, channelId, "장시간 통화 경고", NotificationManager.IMPORTANCE_DEFAULT)

         val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle("모르는 번호와 $duration 넘게 통화중입니다.")
            .setContentText("개인정보나 금융정보 요구에 절대 응하지 마세요.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(114, builder.build())
    }

    // --- 유틸리티 함수들 ---

    private fun checkBlacklist(number: String): ScamInfo? {
        return scamList.firstOrNull { it.phoneNumber == number }
    }

    @SuppressLint("Range")
    private fun isContact(context: Context, phoneNumber: String): Boolean {
        if (phoneNumber.isBlank()) return false
        try {
            val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(phoneNumber))
            // 👇 [수정됨] 존재하지 않는 ContactsKey._ID 대신 정확한 ContactsContract.PhoneLookup._ID 를 사용합니다.
            context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use {
                return it.moveToFirst()
            }
        } catch (e: Exception) {
            Log.e("CallStateReceiver", "Failed to query contacts", e)
        }
        return false
    }

    @SuppressLint("Range")
    private fun getContactUpdateTimestamp(context: Context, phoneNumber: String): Long {
        if (phoneNumber.isBlank()) return 0L
        try {
            val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(phoneNumber))
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

    private fun vibrate(context: Context, duration: Long) {
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
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
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getActivity(context, 0, intent, flags)
    }
}
