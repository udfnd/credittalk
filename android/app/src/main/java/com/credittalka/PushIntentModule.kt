package com.credittalka

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * PushIntentModule
 *
 * 알림 탭으로 앱이 열릴 때 FCM이 런처 인텐트에 실어 보내는 data extras를
 * MainActivity가 네이티브에서 직접 캡처해 둔 것을 JS로 노출한다.
 *
 * RNFirebase의 getInitialNotification / onNotificationOpenedApp 이 삼성
 * OneUI 프로세스 재생성 상황에서 간헐적으로 payload를 누락하는 문제
 * (S24/S25: 탭해도 링크 페이지로 이동하지 않고 앱만 열림)의 폴백 경로.
 *
 * 반환값은 consume-once: 한 번 읽으면 네이티브 보관분은 비워진다.
 */
class PushIntentModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PushIntentModule"

    @ReactMethod
    fun getInitialNotificationData(promise: Promise) {
        try {
            val data = MainActivity.consumePendingPushData()
            if (data.isNullOrEmpty()) {
                promise.resolve(null)
                return
            }
            val map: WritableMap = Arguments.createMap()
            for ((k, v) in data) map.putString(k, v)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("PUSH_INTENT_ERROR", e.message, e)
        }
    }
}
