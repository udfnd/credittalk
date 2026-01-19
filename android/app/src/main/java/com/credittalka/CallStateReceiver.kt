package com.credittalka

import android.app.PendingIntent
import android.content.*
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.telephony.PhoneNumberUtils
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class CallStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallStateReceiver"
        private var handler: Handler? = null
        private var runnable: Runnable? = null
        private val executor = Executors.newSingleThreadExecutor()

        // 신고된 전화번호 캐시 (앱 생명주기 동안 유지)
        private var scammerPhoneNumbers: Set<String> = emptySet()
        private var lastFetchTime: Long = 0
        private const val CACHE_DURATION_MS = 5 * 60 * 1000L // 5분 캐시
        private const val ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000L // 1주일

        // 중복 알림 방지
        private var lastNotifiedNumber: String? = null
        private var lastNotifiedTime: Long = 0
        private const val NOTIFICATION_COOLDOWN_MS = 30_000L // 30초
    }

    // 연락처 상태 정보
    data class ContactStatus(
        val isInContacts: Boolean,
        val savedTimestamp: Long? = null // null이면 연락처에 없음
    )

    override fun onReceive(context: Context, intent: Intent) {
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)

        // 전화번호 가져오기 (Android 버전에 따라 다름)
        @Suppress("DEPRECATION")
        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        Log.d(TAG, "onReceive called - state: $state, number: $incomingNumber")

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                cancelAlarm()

                if (incomingNumber != null) {
                    Log.d(TAG, "Incoming call from: $incomingNumber")
                    checkNumberAndNotify(context, incomingNumber)
                } else {
                    // 권한 부재로 번호를 못 받은 경우에도 경고 알림 표시
                    Log.w(TAG, "Incoming number is null - possibly missing READ_CALL_LOG permission")
                    notifyUnknownNumber(context)
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                // 통화 연결됨 - 기존 로직 유지 (통화 중 경고)
                if (incomingNumber != null) {
                    checkNumberAndScheduleWarning(context, incomingNumber)
                } else {
                    // 권한 부재로 번호를 못 받은 경우에도 경고 알림 표시
                    Log.w(TAG, "Incoming number is null (offhook) - possibly missing READ_CALL_LOG permission")
                    handler = Handler(Looper.getMainLooper())
                    runnable = Runnable {
                        notifyUnknownNumber(context)
                    }
                    handler?.postDelayed(runnable!!, 5_000)
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                cancelAlarm()
                lastNotifiedNumber = null // 통화 종료 시 알림 상태 초기화
            }
        }
    }

    private fun checkNumberAndNotify(context: Context, phoneNumber: String) {
        executor.execute {
            val normalizedNumber = normalizePhoneNumber(phoneNumber)

            // 중복 알림 체크
            if (!shouldNotify(normalizedNumber)) {
                return@execute
            }

            // 1. 신고된 번호인지 확인 (최우선)
            val isScammer = isScammerNumber(context, normalizedNumber)
            if (isScammer) {
                Log.d(TAG, "Scammer number detected: $normalizedNumber")
                Handler(Looper.getMainLooper()).post {
                    notifyScammerNumber(context, normalizedNumber)
                }
                return@execute
            }

            // 2. 연락처 상태 확인
            val contactStatus = getContactStatus(context, normalizedNumber)
            Log.d(TAG, "Contact status for $normalizedNumber - isInContacts: ${contactStatus.isInContacts}, savedTimestamp: ${contactStatus.savedTimestamp}")

            when {
                !contactStatus.isInContacts -> {
                    // 저장되지 않은 번호
                    Log.d(TAG, "Number not in contacts: $normalizedNumber")
                    Handler(Looper.getMainLooper()).post {
                        notifyUnknownNumber(context)
                    }
                }
                contactStatus.savedTimestamp != null &&
                (System.currentTimeMillis() - contactStatus.savedTimestamp) < ONE_WEEK_MS -> {
                    // timestamp가 유효하고 1주일 이내에 저장된 번호
                    Log.d(TAG, "Number saved within one week: $normalizedNumber")
                    Handler(Looper.getMainLooper()).post {
                        notifyRecentlySavedNumber(context)
                    }
                }
                else -> {
                    // 연락처에 있고 (timestamp 없거나 1주일 이상 지남) - 경고 없음
                    Log.d(TAG, "Number is in contacts, skipping alert (timestamp: ${contactStatus.savedTimestamp})")
                }
            }
        }
    }

    private fun checkNumberAndScheduleWarning(context: Context, phoneNumber: String) {
        executor.execute {
            val normalizedNumber = normalizePhoneNumber(phoneNumber)

            // 중복 알림 체크 (RINGING에서 이미 알림을 보낸 경우 스킵)
            if (!shouldNotify(normalizedNumber)) {
                Log.d(TAG, "Skipping scheduled warning for: $normalizedNumber (already notified)")
                return@execute
            }

            // 1. 신고된 번호인지 확인 (최우선)
            val isScammer = isScammerNumber(context, normalizedNumber)
            if (isScammer) {
                Log.d(TAG, "Scammer number detected (scheduled): $normalizedNumber")
                Handler(Looper.getMainLooper()).post {
                    handler = Handler(Looper.getMainLooper())
                    runnable = Runnable {
                        notifyScammerNumber(context, normalizedNumber)
                    }
                    handler?.postDelayed(runnable!!, 5_000)
                }
                return@execute
            }

            // 2. 연락처 상태 확인
            val contactStatus = getContactStatus(context, normalizedNumber)
            Log.d(TAG, "Contact status (scheduled) for $normalizedNumber - isInContacts: ${contactStatus.isInContacts}, savedTimestamp: ${contactStatus.savedTimestamp}")

            when {
                !contactStatus.isInContacts -> {
                    // 저장되지 않은 번호
                    Log.d(TAG, "Number not in contacts (scheduled): $normalizedNumber")
                    Handler(Looper.getMainLooper()).post {
                        handler = Handler(Looper.getMainLooper())
                        runnable = Runnable {
                            notifyUnknownNumber(context)
                        }
                        handler?.postDelayed(runnable!!, 5_000)
                    }
                }
                contactStatus.savedTimestamp != null &&
                (System.currentTimeMillis() - contactStatus.savedTimestamp) < ONE_WEEK_MS -> {
                    // timestamp가 유효하고 1주일 이내에 저장된 번호
                    Log.d(TAG, "Number saved within one week (scheduled): $normalizedNumber")
                    Handler(Looper.getMainLooper()).post {
                        handler = Handler(Looper.getMainLooper())
                        runnable = Runnable {
                            notifyRecentlySavedNumber(context)
                        }
                        handler?.postDelayed(runnable!!, 5_000)
                    }
                }
                else -> {
                    // 연락처에 있고 (timestamp 없거나 1주일 이상 지남) - 경고 없음
                    Log.d(TAG, "Number is in contacts (scheduled), skipping alert (timestamp: ${contactStatus.savedTimestamp})")
                }
            }
        }
    }

    private fun normalizePhoneNumber(phoneNumber: String): String {
        // 전화번호에서 숫자만 추출
        return phoneNumber.replace(Regex("[^0-9]"), "")
    }

    private fun getContactStatus(context: Context, phoneNumber: String): ContactStatus {
        // 다양한 전화번호 형식으로 검색 시도
        val phoneVariations = generatePhoneVariations(phoneNumber)

        Log.d(TAG, "Checking contact status for: $phoneNumber, variations: $phoneVariations")

        // 방법 1: PhoneLookup으로 검색
        for (variation in phoneVariations) {
            try {
                val result = lookupContactByNumber(context, variation)
                if (result.isInContacts) {
                    Log.d(TAG, "Contact found with PhoneLookup variation: $variation")
                    return result
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking contact for variation $variation: ${e.message}")
            }
        }

        // 방법 2: PhoneLookup 실패 시, 모든 연락처를 가져와서 PhoneNumberUtils.compare()로 비교
        Log.d(TAG, "PhoneLookup failed, trying PhoneNumberUtils.compare() method")
        try {
            val result = findContactByPhoneNumberUtils(context, phoneNumber)
            if (result.isInContacts) {
                Log.d(TAG, "Contact found with PhoneNumberUtils.compare()")
                return result
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in PhoneNumberUtils compare: ${e.message}")
        }

        Log.d(TAG, "No contact found for any variation of: $phoneNumber")
        return ContactStatus(isInContacts = false, savedTimestamp = null)
    }

    /**
     * PhoneNumberUtils.compare()를 사용하여 연락처에서 전화번호를 찾습니다.
     * PhoneLookup이 실패할 경우 대안으로 사용합니다.
     */
    private fun findContactByPhoneNumberUtils(context: Context, targetNumber: String): ContactStatus {
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.CONTACT_LAST_UPDATED_TIMESTAMP
        )

        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                null
            )

            cursor?.let {
                val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                val timestampIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_LAST_UPDATED_TIMESTAMP)

                while (it.moveToNext()) {
                    val contactNumber = if (numberIndex >= 0) it.getString(numberIndex) else null
                    if (contactNumber != null) {
                        // PhoneNumberUtils.compare()로 전화번호 비교 (국가 코드, 형식 차이 무시)
                        if (PhoneNumberUtils.compare(targetNumber, contactNumber)) {
                            val rawTimestamp = if (timestampIndex >= 0) it.getLong(timestampIndex) else 0L
                            val timestamp = if (rawTimestamp > 0L) rawTimestamp else null
                            Log.d(TAG, "PhoneNumberUtils match found: $contactNumber (target: $targetNumber), timestamp: $timestamp")
                            return ContactStatus(isInContacts = true, savedTimestamp = timestamp)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in findContactByPhoneNumberUtils: ${e.message}")
        } finally {
            cursor?.close()
        }

        return ContactStatus(isInContacts = false, savedTimestamp = null)
    }

    /**
     * 전화번호의 다양한 형식 변형을 생성합니다.
     */
    private fun generatePhoneVariations(phoneNumber: String): List<String> {
        val normalized = normalizePhoneNumber(phoneNumber)
        val variations = mutableListOf<String>()

        // 원본 번호 추가
        variations.add(phoneNumber)

        // 정규화된 번호 추가
        if (normalized != phoneNumber) {
            variations.add(normalized)
        }

        // 한국 전화번호 형식 변환
        when {
            // +82로 시작하는 경우 → 0으로 시작하는 형식으로 변환
            normalized.startsWith("82") && normalized.length >= 11 -> {
                val withoutCountryCode = "0" + normalized.substring(2)
                variations.add(withoutCountryCode)
                variations.add("+82" + normalized.substring(2))
                variations.add("+82-" + formatKoreanNumber(normalized.substring(2)))
            }
            // 0으로 시작하는 경우 → +82 형식으로도 변환
            normalized.startsWith("0") && normalized.length >= 10 -> {
                variations.add("+82" + normalized.substring(1))
                variations.add("82" + normalized.substring(1))
                // 하이픈 형식 추가
                variations.add(formatKoreanNumber(normalized))
            }
            // 국가코드 없이 시작하는 경우
            else -> {
                variations.add("0$normalized")
                variations.add("+82$normalized")
            }
        }

        return variations.distinct()
    }

    /**
     * 한국 전화번호 형식으로 포맷팅합니다. (예: 01012345678 → 010-1234-5678)
     */
    private fun formatKoreanNumber(number: String): String {
        val normalized = normalizePhoneNumber(number)
        return when {
            normalized.length == 11 && normalized.startsWith("010") -> {
                "${normalized.substring(0, 3)}-${normalized.substring(3, 7)}-${normalized.substring(7)}"
            }
            normalized.length == 10 && normalized.startsWith("02") -> {
                "${normalized.substring(0, 2)}-${normalized.substring(2, 6)}-${normalized.substring(6)}"
            }
            normalized.length == 10 -> {
                "${normalized.substring(0, 3)}-${normalized.substring(3, 6)}-${normalized.substring(6)}"
            }
            normalized.length == 11 -> {
                "${normalized.substring(0, 3)}-${normalized.substring(3, 7)}-${normalized.substring(7)}"
            }
            else -> normalized
        }
    }

    /**
     * 특정 번호로 연락처를 조회합니다.
     */
    private fun lookupContactByNumber(context: Context, phoneNumber: String): ContactStatus {
        val uri = Uri.withAppendedPath(
            ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
            Uri.encode(phoneNumber)
        )

        // 먼저 timestamp 컬럼을 포함하여 시도
        try {
            val projectionWithTimestamp = arrayOf(
                ContactsContract.PhoneLookup._ID,
                ContactsContract.PhoneLookup.CONTACT_LAST_UPDATED_TIMESTAMP
            )

            val cursor: Cursor? = context.contentResolver.query(
                uri,
                projectionWithTimestamp,
                null,
                null,
                null
            )

            cursor?.use {
                if (it.count > 0 && it.moveToFirst()) {
                    val timestampIndex = it.getColumnIndex(ContactsContract.PhoneLookup.CONTACT_LAST_UPDATED_TIMESTAMP)
                    val rawTimestamp = if (timestampIndex >= 0) it.getLong(timestampIndex) else 0L
                    val timestamp = if (rawTimestamp > 0L) rawTimestamp else null
                    Log.d(TAG, "Contact found - rawTimestamp: $rawTimestamp, timestamp: $timestamp")
                    return ContactStatus(isInContacts = true, savedTimestamp = timestamp)
                }
            }
        } catch (e: Exception) {
            // CONTACT_LAST_UPDATED_TIMESTAMP가 지원되지 않는 경우, 기본 조회로 폴백
            Log.d(TAG, "Timestamp column not supported, falling back to basic lookup for $phoneNumber")
            try {
                val basicProjection = arrayOf(ContactsContract.PhoneLookup._ID)
                val cursor: Cursor? = context.contentResolver.query(
                    uri,
                    basicProjection,
                    null,
                    null,
                    null
                )

                cursor?.use {
                    if (it.count > 0 && it.moveToFirst()) {
                        Log.d(TAG, "Contact found (without timestamp): $phoneNumber")
                        return ContactStatus(isInContacts = true, savedTimestamp = null)
                    }
                }
            } catch (fallbackError: Exception) {
                Log.e(TAG, "Error in fallback lookupContactByNumber for $phoneNumber: ${fallbackError.message}")
            }
        }
        return ContactStatus(isInContacts = false, savedTimestamp = null)
    }

    private fun isScammerNumber(context: Context, phoneNumber: String): Boolean {
        try {
            // 캐시가 유효한지 확인
            val currentTime = System.currentTimeMillis()
            if (currentTime - lastFetchTime > CACHE_DURATION_MS || scammerPhoneNumbers.isEmpty()) {
                fetchScammerNumbers(context)
            }

            // 여러 형식으로 번호 확인
            val variations = listOf(
                phoneNumber,
                "0$phoneNumber",
                phoneNumber.removePrefix("82"),
                phoneNumber.removePrefix("0"),
                "+82${phoneNumber.removePrefix("0")}"
            )

            return variations.any { variation ->
                scammerPhoneNumbers.any { scammerNumber ->
                    normalizePhoneNumber(scammerNumber) == normalizePhoneNumber(variation)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking scammer numbers: ${e.message}")
        }
        return false
    }

    private fun fetchScammerNumbers(context: Context) {
        try {
            val supabaseUrl = context.getString(R.string.supabase_url)
            val supabaseKey = context.getString(R.string.supabase_anon_key)

            val url = URL("$supabaseUrl/rest/v1/masked_scammer_reports?select=phone_numbers")
            val connection = url.openConnection() as HttpURLConnection

            connection.requestMethod = "GET"
            connection.setRequestProperty("apikey", supabaseKey)
            connection.setRequestProperty("Authorization", "Bearer $supabaseKey")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().readText()
                val phoneNumbers = mutableSetOf<String>()

                val jsonArray = JSONArray(response)
                for (i in 0 until jsonArray.length()) {
                    val item = jsonArray.getJSONObject(i)
                    if (!item.isNull("phone_numbers")) {
                        val numbersArray = item.getJSONArray("phone_numbers")
                        for (j in 0 until numbersArray.length()) {
                            if (!numbersArray.isNull(j)) {
                                val number = numbersArray.getString(j)
                                if (number.isNotEmpty()) {
                                    phoneNumbers.add(normalizePhoneNumber(number))
                                }
                            }
                        }
                    }
                }

                scammerPhoneNumbers = phoneNumbers
                lastFetchTime = System.currentTimeMillis()
                Log.d(TAG, "Fetched ${phoneNumbers.size} scammer phone numbers")
            } else {
                Log.e(TAG, "Failed to fetch scammer numbers: ${connection.responseCode}")
            }

            connection.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching scammer numbers: ${e.message}")
        }
    }

    private fun cancelAlarm() {
        handler?.removeCallbacks(runnable ?: Runnable { })
        handler = null
        runnable = null
    }

    /**
     * 중복 알림 방지를 위해 동일 번호에 대해 30초 이내 알림 여부 체크
     */
    private fun shouldNotify(phoneNumber: String): Boolean {
        val currentTime = System.currentTimeMillis()
        val normalizedNumber = normalizePhoneNumber(phoneNumber)

        if (normalizedNumber == lastNotifiedNumber &&
            currentTime - lastNotifiedTime < NOTIFICATION_COOLDOWN_MS) {
            Log.d(TAG, "Skipping duplicate notification for: $normalizedNumber")
            return false
        }

        lastNotifiedNumber = normalizedNumber
        lastNotifiedTime = currentTime
        return true
    }

    // 1) 저장되지 않은 번호 알림
    private fun notifyUnknownNumber(context: Context) {
        vibrateDefault(context)

        val channelId = "unregistered_call_warning"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager.getNotificationChannel(channelId) == null) {
            val channel = android.app.NotificationChannel(channelId, "전화경고", android.app.NotificationManager.IMPORTANCE_HIGH)
            notificationManager.createNotificationChannel(channel)
        }
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("저장되지 않은 전화번호입니다.")
            .setContentText("금융사기에 주의하세요.")
            .setAutoCancel(true)
        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }

    // 2) 저장된 지 1주일 이내인 번호 알림
    private fun notifyRecentlySavedNumber(context: Context) {
        vibrateDefault(context)

        val channelId = "recent_contact_warning"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager.getNotificationChannel(channelId) == null) {
            val channel = android.app.NotificationChannel(channelId, "최근 저장 번호 경고", android.app.NotificationManager.IMPORTANCE_HIGH)
            notificationManager.createNotificationChannel(channel)
        }
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("저장된지 1주일 미만인 번호입니다.")
            .setContentText("금융사기에 주의하세요.")
            .setAutoCancel(true)
        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }

    private fun notifyScammerNumber(context: Context, phoneNumber: String) {
        vibrateWarning(context)

        val channelId = "scammer_call_warning"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager.getNotificationChannel(channelId) == null) {
            val channel = android.app.NotificationChannel(channelId, "보이스피싱 경고", android.app.NotificationManager.IMPORTANCE_HIGH)
            channel.enableVibration(true)
            notificationManager.createNotificationChannel(channel)
        }

        // Deep Link를 통해 앱의 검색 화면으로 이동
        val deepLinkUri = Uri.parse("credittalk://search?phoneNumber=$phoneNumber")
        val intent = Intent(Intent.ACTION_VIEW, deepLinkUri).apply {
            // 명시적으로 이 앱의 MainActivity를 타겟으로 지정
            setClassName(context.packageName, "${context.packageName}.MainActivity")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            phoneNumber.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("피해사례가 등록된 전화번호입니다.")
            .setContentText("크레딧톡을 참고하세요.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }

    // 기본 진동
    private fun vibrateDefault(context: Context) {
        val vib = context.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vib.vibrate(android.os.VibrationEffect.createOneShot(3000, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(3000)
        }
    }

    // 경고 진동 (더 강한 패턴)
    private fun vibrateWarning(context: Context) {
        val vib = context.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val pattern = longArrayOf(0, 500, 200, 500, 200, 500, 200, 1000)
            vib.vibrate(android.os.VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION")
            val pattern = longArrayOf(0, 500, 200, 500, 200, 500, 200, 1000)
            vib.vibrate(pattern, -1)
        }
    }
}
