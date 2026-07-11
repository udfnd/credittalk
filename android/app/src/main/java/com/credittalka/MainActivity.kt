package com.credittalka

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  private val PERMISSIONS_REQUEST_CODE = 101

  private val requiredPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      arrayOf(
          Manifest.permission.READ_PHONE_STATE,
          Manifest.permission.READ_CALL_LOG,
          Manifest.permission.READ_CONTACTS,
          Manifest.permission.POST_NOTIFICATIONS,
          Manifest.permission.READ_MEDIA_AUDIO,
          Manifest.permission.RECORD_AUDIO,
          Manifest.permission.FOREGROUND_SERVICE_MICROPHONE
      )
  } else {
      arrayOf(
          Manifest.permission.READ_PHONE_STATE,
          Manifest.permission.READ_CALL_LOG,
          Manifest.permission.READ_CONTACTS,
          Manifest.permission.READ_EXTERNAL_STORAGE,
          Manifest.permission.RECORD_AUDIO
      )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    checkAndRequestPermissions()
    // 콜드스타트: 알림 탭으로 열렸다면 FCM data extras를 캡처해 둔다.
    capturePushIntent(intent)
  }

  /**
   * 앱이 이미 실행 중일 때(singleTask 모드) 새 Intent를 받으면 호출됨.
   * Deep Link Intent를 React Native로 전달하기 위해 필요.
   */
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    // 새 Intent를 현재 Intent로 설정하여 React Native Linking이 처리할 수 있도록 함
    setIntent(intent)
    // 웜 스타트: 백그라운드 상태에서 알림을 탭하면 여기로 들어온다.
    capturePushIntent(intent)
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

    // 라우팅에 쓸 키가 하나라도 있어야 알림 탭으로 간주(런처 일반 실행은 무시).
    if (!hasRouteKey(data)) return

    intent.putExtra(HANDLED_FLAG, true)
    pendingPushData = data
  }

  private fun hasRouteKey(data: Map<String, String>): Boolean =
      data.containsKey("link_url") ||
      data.containsKey("url") ||
      data.containsKey("screen") ||
      data.containsKey("nid")

  private fun checkAndRequestPermissions() {
    val permissionsToRequest = requiredPermissions.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }

    if (permissionsToRequest.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, permissionsToRequest.toTypedArray(), PERMISSIONS_REQUEST_CODE)
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
  }


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

    @Volatile
    private var pendingPushData: HashMap<String, String>? = null

    /** JS(PushIntentModule)에서 1회 읽고 비운다. */
    @JvmStatic
    fun consumePendingPushData(): HashMap<String, String>? {
      val d = pendingPushData
      pendingPushData = null
      return d
    }
  }
}
