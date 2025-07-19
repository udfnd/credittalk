package com.credittalka // 자신의 패키지명으로 변경하세요

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class CallDetectionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "CallDetectionModule"

    @ReactMethod
    fun updateBlacklist(blacklistJson: String, promise: Promise) {
        try {
            CallStateReceiver.updateBlacklist(blacklistJson)
            promise.resolve("Blacklist updated successfully.")
        } catch (e: Exception) {
            promise.reject("BLACKLIST_UPDATE_ERROR", e)
        }
    }
}
