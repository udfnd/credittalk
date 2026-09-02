package com.credittalka

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.util.ArrayDeque

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // RN/메시징 모듈에 인텐트를 넘기기 전에 원본 FCM extras를 보존한다.
    // 일부 OneUI 탭에서는 super 호출 뒤 Notifee 이벤트에 id만 남고 data가
    // 비어 도착했으므로, JS 브리지 초기화보다 캡처가 반드시 먼저여야 한다.
    capturePushIntent(intent)
    super.onCreate(null)
  }

  /**
   * 앱이 이미 실행 중일 때(singleTask 모드) 새 Intent를 받으면 호출됨.
   * Deep Link Intent를 React Native로 전달하기 위해 필요.
   */
  override fun onNewIntent(intent: Intent?) {
    // 웜 스타트도 라이브러리 dispatch 전에 원본 extras부터 복사한다.
    capturePushIntent(intent)
    super.onNewIntent(intent)
    // 새 Intent를 현재 Intent로 설정하여 React Native Linking이 처리할 수 있도록 함
    setIntent(intent)
  }

  /**
   * FCM이 notification 메시지의 런처 PendingIntent에 실어 보내는 data extras를
   * 네이티브에서 직접 캡처한다. RNFirebase의 getInitialNotification /
   * onNotificationOpenedApp 이 삼성 OneUI 프로세스 재생성 상황에서 간헐적으로
   * payload를 누락하는 문제(탭해도 페이지 이동 안 함)의 폴백 경로.
   *
   * - consume-once: PushIntentModule이 1회 읽고 비운다.
   * - HANDLED_FLAG: recents에서 앱을 다시 열 때 원래 인텐트가 재전달되어
   *   중복 네비게이션되는 것을 방지(같은 인텐트는 한 번만 처리).
   * - 인텐트 extras 자체는 변형하지 않으므로 RNFirebase 기본 경로도 그대로 동작한다.
   */
  private fun capturePushIntent(intent: Intent?) {
    if (intent == null) return
    if (intent.getBooleanExtra(HANDLED_FLAG, false)) return
    val extras = intent.extras ?: return

    val data = HashMap<String, String>()
    // FCM(OS 표시) 알림 탭: data 키가 평면 String extras로 전달됨.
    // (notifee 표시 알림의 press는 트램폴린 액티비티로만 payload가 전달되고
    //  MainActivity 인텐트에는 실리지 않으므로 여기서는 캡처 불가 —
    //  그 경로는 push.js의 탭 큐 + setTapQueueListener가 담당한다.)
    for (key in extras.keySet()) {
      if (key == null) continue
      if (key.startsWith("google.") || key.startsWith("gcm.")) continue
      if (key == "from" || key == "collapse_key" || key == "message_type" || key == HANDLED_FLAG) continue
      val value = extras.get(key)
      if (value is String) data[key] = value
    }
    // FCM message id는 google.* 프리픽스라 위 루프에서 걸러진다 — 명시적으로 보존.
    // JS 쪽 stale-replay 방지 consume 마커의 키(_mid)로 쓰인다(메시지 단위 유니크).
    extras.getString("google.message_id")?.let { data["_mid"] = it }

    // 라우팅에 쓸 키가 하나라도 있어야 알림 탭으로 간주(런처 일반 실행은 무시).
    if (!hasRouteKey(data)) return

    intent.putExtra(HANDLED_FLAG, true)
    synchronized(pendingPushData) {
      if (pendingPushData.size >= MAX_PENDING_PUSHES) pendingPushData.removeFirst()
      pendingPushData.addLast(data)
    }
  }

  private fun hasRouteKey(data: Map<String, String>): Boolean =
      data.containsKey("link_url") ||
      data.containsKey("url") ||
      data.containsKey("screen") ||
      data.containsKey("nid")

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "credittalk"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  companion object {
    private const val HANDLED_FLAG = "ct_notif_handled"
    private const val MAX_PENDING_PUSHES = 10

    private val pendingPushData = ArrayDeque<HashMap<String, String>>()

    /** JS(PushIntentModule)에서 1회 읽고 비운다. */
    @JvmStatic
    fun consumePendingPushData(): HashMap<String, String>? {
      return synchronized(pendingPushData) {
        if (pendingPushData.isEmpty()) null else pendingPushData.removeFirst()
      }
    }
  }
}
