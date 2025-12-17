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
          Manifest.permission.READ_CONTACTS,
          Manifest.permission.POST_NOTIFICATIONS,
          Manifest.permission.READ_MEDIA_AUDIO,
          Manifest.permission.RECORD_AUDIO,
          Manifest.permission.FOREGROUND_SERVICE_MICROPHONE
      )
  } else {
      arrayOf(
          Manifest.permission.READ_PHONE_STATE,
          Manifest.permission.READ_CONTACTS,
          Manifest.permission.READ_EXTERNAL_STORAGE,
          Manifest.permission.RECORD_AUDIO
      )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    checkAndRequestPermissions()
  }

  /**
   * 앱이 이미 실행 중일 때(singleTask 모드) 새 Intent를 받으면 호출됨.
   * Deep Link Intent를 React Native로 전달하기 위해 필요.
   */
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    // 새 Intent를 현재 Intent로 설정하여 React Native Linking이 처리할 수 있도록 함
    setIntent(intent)
  }

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
}
