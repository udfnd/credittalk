package com.credittalka

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap

/**
 * VoicePhishingModule
 *
 * ============================================================
 * 주의: 민감한 권한(READ_CALL_LOG, READ_PHONE_STATE, RECORD_AUDIO) 관련 기능은
 * Google Play Store 정책으로 인해 비활성화됨.
 * 향후 "기본 전화 앱" 승인 또는 정책 변경 시 다시 활성화 가능.
 * ============================================================
 */
class VoicePhishingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VoicePhishingModule"
    }

    /**
     * 기능 비활성화 안내 메시지를 반환합니다.
     */
    @ReactMethod
    fun getFeatureStatus(promise: Promise) {
        promise.resolve("이 기능은 현재 Google Play Store 정책으로 인해 비활성화되어 있습니다.")
    }

    /**
     * 전화 감지 기능에 필요한 권한 목록을 반환합니다.
     * [비활성화됨] - 민감한 권한 사용 불가
     */
    @ReactMethod
    fun getRequiredPermissions(promise: Promise) {
        // 기능 비활성화 - 빈 배열 반환
        promise.resolve(Arguments.createArray())

        /*
        // ============================================================
        // 원본 코드 - Google Play Store 정책으로 인해 비활성화
        // ============================================================
        try {
            val permissions = Arguments.createArray()
            permissions.pushString(Manifest.permission.READ_PHONE_STATE)
            permissions.pushString(Manifest.permission.READ_CALL_LOG)
            permissions.pushString(Manifest.permission.READ_CONTACTS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.pushString(Manifest.permission.POST_NOTIFICATIONS)
            }
            promise.resolve(permissions)
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", "권한 목록 조회 실패: ${e.message}", e)
        }
        */
    }

    /**
     * 현재 권한 상태를 확인합니다.
     * [비활성화됨] - 민감한 권한 사용 불가
     */
    @ReactMethod
    fun checkPermissions(promise: Promise) {
        // 기능 비활성화 - 모든 권한 false 반환
        val result: WritableMap = Arguments.createMap()
        result.putBoolean("featureDisabled", true)
        result.putBoolean("allGranted", false)
        promise.resolve(result)

        /*
        // ============================================================
        // 원본 코드 - Google Play Store 정책으로 인해 비활성화
        // ============================================================
        try {
            val result: WritableMap = Arguments.createMap()

            val hasReadPhoneState = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED

            val hasReadCallLog = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.READ_CALL_LOG
            ) == PackageManager.PERMISSION_GRANTED

            val hasReadContacts = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.READ_CONTACTS
            ) == PackageManager.PERMISSION_GRANTED

            val hasPostNotifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    reactApplicationContext,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                true // Android 13 미만에서는 알림 권한이 필요 없음
            }

            result.putBoolean("READ_PHONE_STATE", hasReadPhoneState)
            result.putBoolean("READ_CALL_LOG", hasReadCallLog)
            result.putBoolean("READ_CONTACTS", hasReadContacts)
            result.putBoolean("POST_NOTIFICATIONS", hasPostNotifications)
            result.putBoolean("allGranted", hasReadPhoneState && hasReadCallLog && hasReadContacts && hasPostNotifications)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "권한 확인 실패: ${e.message}", e)
        }
        */
    }

    /**
     * 전화 감지 기능이 정상 작동 가능한지 확인합니다.
     * [비활성화됨] - 민감한 권한 사용 불가
     */
    @ReactMethod
    fun isCallDetectionReady(promise: Promise) {
        // 기능 비활성화 - 항상 false 반환
        promise.resolve(false)

        /*
        // ============================================================
        // 원본 코드 - Google Play Store 정책으로 인해 비활성화
        // ============================================================
        try {
            val hasReadPhoneState = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED

            val hasReadCallLog = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.READ_CALL_LOG
            ) == PackageManager.PERMISSION_GRANTED

            // Android 10 이상에서는 READ_CALL_LOG가 필수
            val isReady = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                hasReadPhoneState && hasReadCallLog
            } else {
                hasReadPhoneState
            }

            promise.resolve(isReady)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "상태 확인 실패: ${e.message}", e)
        }
        */
    }

    /**
     * 키워드 감지 서비스를 시작합니다.
     * [비활성화됨] - 민감한 권한 사용 불가
     */
    @ReactMethod
    fun startKeywordDetection(promise: Promise) {
        // 기능 비활성화
        promise.reject("FEATURE_DISABLED", "이 기능은 현재 Google Play Store 정책으로 인해 비활성화되어 있습니다.")

        /*
        // ============================================================
        // 원본 코드 - Google Play Store 정책으로 인해 비활성화
        // ============================================================
        try {
            val intent = Intent(reactApplicationContext, KeywordDetectService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve("서비스가 시작되었습니다.")
        } catch (e: Exception) {
            promise.reject("START_ERROR", "서비스 시작 실패: ${e.message}", e)
        }
        */
    }

    /**
     * 키워드 감지 서비스를 중지합니다.
     * [비활성화됨] - 민감한 권한 사용 불가
     */
    @ReactMethod
    fun stopKeywordDetection(promise: Promise) {
        // 기능 비활성화
        promise.resolve("서비스가 비활성화되어 있습니다.")

        /*
        // ============================================================
        // 원본 코드 - Google Play Store 정책으로 인해 비활성화
        // ============================================================
        try {
            val intent = Intent(reactApplicationContext, KeywordDetectService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve("서비스가 중지되었습니다.")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", "서비스 중지 실패: ${e.message}", e)
        }
        */
    }

    /**
     * 서비스 실행 상태를 확인합니다.
     * [비활성화됨] - 민감한 권한 사용 불가
     */
    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        // 기능 비활성화 - 항상 false 반환
        promise.resolve(false)

        /*
        // ============================================================
        // 원본 코드 - Google Play Store 정책으로 인해 비활성화
        // ============================================================
        try {
            val manager = reactApplicationContext.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            @Suppress("DEPRECATION")
            for (service in manager.getRunningServices(Integer.MAX_VALUE)) {
                if (KeywordDetectService::class.java.name == service.service.className) {
                    promise.resolve(true)
                    return
                }
            }
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "서비스 상태 확인 실패: ${e.message}", e)
        }
        */
    }
}
