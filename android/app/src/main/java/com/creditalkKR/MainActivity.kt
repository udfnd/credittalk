package com.credittalk

import android.Manifest
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

  // 필요한 권한 목록을 재정의
  private val requiredPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      arrayOf(
          Manifest.permission.READ_PHONE_STATE,
          Manifest.permission.READ_CONTACTS,
          Manifest.permission.POST_NOTIFICATIONS
      )
  } else {
      arrayOf(
          Manifest.permission.READ_PHONE_STATE,
          Manifest.permission.READ_CONTACTS
      )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // React Native 렌더링 전에 권한을 먼저 처리하기 위해 super.onCreate(null)을 호출
    super.onCreate(null)
    checkAndRequestPermissions()
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
    // 권한 요청 결과와 관계없이 앱의 나머지 로직은 정상적으로 진행됩니다.
    // 권한이 거부될 경우, 해당 네이티브 기능은 동작하지 않게 됩니다.
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
