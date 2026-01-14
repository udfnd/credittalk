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

class VoicePhishingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VoicePhishingModule"
    }

    /**
     * 전화 감지 기능에 필요한 권한 목록을 반환합니다.
     */
    @ReactMethod
    fun getRequiredPermissions(promise: Promise) {
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
    }

    /**
     * 현재 권한 상태를 확인합니다.
     */
    @ReactMethod
    fun checkPermissions(promise: Promise) {
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
    }

    /**
     * 전화 감지 기능이 정상 작동 가능한지 확인합니다.
     */
    @ReactMethod
    fun isCallDetectionReady(promise: Promise) {
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
    }

    @ReactMethod
    fun startKeywordDetection(promise: Promise) {
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
    }

    @ReactMethod
    fun stopKeywordDetection(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, KeywordDetectService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve("서비스가 중지되었습니다.")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", "서비스 중지 실패: ${e.message}", e)
        }
    }

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
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
    }
}
