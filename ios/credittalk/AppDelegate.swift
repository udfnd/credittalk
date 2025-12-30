import UIKit
import FirebaseCore
import kakao_login
import NidThirdPartyLogin

// Note: React Native types (RCTReactNativeFactory, RCTDefaultReactNativeFactoryDelegate,
// RCTBridge, RCTBundleURLProvider, RCTLinkingManager) are imported via Bridging Header

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Firebase 초기화
    FirebaseApp.configure()

    // Kakao 로그인 초기화
    RNKakaoLogins().returnSwiftClassInstance()

    // Naver 로그인 초기화
    NidOAuth.shared.initialize()

    // React Native 초기화
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
    return true
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // Kakao 로그인 URL 처리
    if RNKakaoLogins.isKakaoTalkLoginUrl(url) {
      return RNKakaoLogins.handleOpen(url)
    }

    // Naver 로그인 URL 처리
    if let scheme = url.scheme, scheme.hasPrefix("naver") || scheme == "credittalk" {
      if NidOAuth.shared.handleURL(url) {
        return true
      }
    }

    // React Native Linking 처리
    if RCTLinkingManager.application(app, open: url, options: options) {
      return true
    }

    return false
  }
}

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
