package com.credittalka

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class VoicePhishingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VoicePhishingModule"
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
