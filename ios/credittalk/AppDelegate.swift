import UIKit
import FirebaseCore
import FirebaseMessaging
import kakao_login
import NidThirdPartyLogin

// Note: React Native types (RCTReactNativeFactory, RCTDefaultReactNativeFactoryDelegate,
// RCTBridge, RCTBundleURLProvider, RCTLinkingManager) are imported via Bridging Header

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  // SDK 초기화 상태 추적
  private var isNaverSDKInitialized = false
  private var isKakaoSDKInitialized = false

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {

    // 1. Firebase 초기화 (가장 먼저, 안전하게)
    initializeFirebase()

    // 2. React Native 초기화 (필수 - 앱의 핵심)
    initializeReactNative(launchOptions: launchOptions)

    // 3. Third-party SDK 초기화는 지연 실행 (크래시 방지)
    // RunLoop의 다음 사이클에서 실행하여 React Native가 완전히 초기화된 후 실행
    DispatchQueue.main.async { [weak self] in
      self?.initializeThirdPartySDKs()
    }

    return true
  }

  // MARK: - Firebase 초기화

  private func initializeFirebase() {
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
      print("[AppDelegate] Firebase configured successfully")
    }
  }

  // MARK: - React Native 초기화

  private func initializeReactNative(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "credittalk",
      in: window,
      launchOptions: launchOptions
    )
    print("[AppDelegate] React Native initialized successfully")
  }

  // MARK: - Third-party SDK 초기화

  private func initializeThirdPartySDKs() {
    // Kakao SDK 초기화
    initializeKakaoSDK()

    // Naver SDK 초기화
    initializeNaverSDK()
  }

  private func initializeKakaoSDK() {
    let success = ObjCExceptionHandler.tryExecute({
      let _ = RNKakaoLogins().returnSwiftClassInstance()
    }, catch: { exception in
      print("[AppDelegate] Kakao SDK initialization exception: \(exception.description)")
    })

    isKakaoSDKInitialized = success
    if success {
      print("[AppDelegate] Kakao SDK initialized successfully")
    }
  }

  private func initializeNaverSDK() {
    let success = ObjCExceptionHandler.tryExecute({
      NidOAuth.shared.initialize()
    }, catch: { exception in
      print("[AppDelegate] Naver SDK initialization exception: \(exception.description)")
    })

    isNaverSDKInitialized = success
    if success {
      print("[AppDelegate] Naver SDK initialized successfully")
    } else {
      print("[AppDelegate] Naver SDK initialization skipped - will initialize on first use")
    }
  }

  // MARK: - URL Handling

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // Kakao 로그인 URL 처리
    let isKakaoUrl = ObjCExceptionHandler.tryExecute({
      if RNKakaoLogins.isKakaoTalkLoginUrl(url) {
        let _ = RNKakaoLogins.handleOpen(url)
      }
    })
    if isKakaoUrl && RNKakaoLogins.isKakaoTalkLoginUrl(url) {
      return true
    }

    // Naver 로그인 URL 처리
    if let scheme = url.scheme, scheme.hasPrefix("naver") || scheme == "credittalk" {
      // Naver SDK가 초기화되지 않았다면 먼저 초기화 시도
      if !isNaverSDKInitialized {
        initializeNaverSDK()
      }

      var naverHandled = false
      let success = ObjCExceptionHandler.tryExecute({
        naverHandled = NidOAuth.shared.handleURL(url)
      })

      if success && naverHandled {
        return true
      }
    }

    // React Native Linking 처리
    var rnHandled = false
    let success = ObjCExceptionHandler.tryExecute({
      rnHandled = RCTLinkingManager.application(app, open: url, options: options)
    })

    if success && rnHandled {
      return true
    }

    return false
  }

  // MARK: - Push Notifications (APNS)

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    // Firebase Messaging에 APNS 토큰 전달
    Messaging.messaging().apnsToken = deviceToken
    print("[AppDelegate] APNS token registered")
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    print("[AppDelegate] Failed to register for remote notifications: \(error.localizedDescription)")
  }
}

// MARK: - React Native Delegate

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
    #if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
    #else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}
