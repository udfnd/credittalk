# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ─────────────────────────────────────────────────────────────────────────────
# R8(난독화/축소)는 2026-09-04에 켰다. Play "앱 최적화" 리포트에서 난독화 비율이
# 2%로 기준(25%) 미만이라 공개 상태·게시에 영향을 줄 수 있다는 경고를 받았다.
#
# React Native AAR의 consumer rule이 이미 다음을 보장한다(직접 중복 선언 불필요):
#   -keep class * implements com.facebook.react.bridge.NativeModule { *; }
#   -keep @com.facebook.proguard.annotations.DoNotStrip class *
#   -keepclassmembers class * { native <methods>; }
# 아래는 그 밖에 리플렉션/직렬화로 접근되어 R8이 알 수 없는 것들만 고정한다.
# ─────────────────────────────────────────────────────────────────────────────

# ── 이 앱의 네이티브 코드 ────────────────────────────────────────────────────
# 푸시 수신·알림 표시·탭 라우팅 경로다. RN consumer rule로도 커버되지만
# (NativeModule 구현체), 장애 시 영향이 가장 큰 코드라 명시적으로 한 번 더 고정한다.
# 패키지 규모가 작아 난독화 비율에 미치는 영향은 무시할 수준이다.
-keep class com.credittalka.** { *; }

# ── Hermes / JNI ────────────────────────────────────────────────────────────
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.hermes.**

# ── Kakao 로그인 SDK ────────────────────────────────────────────────────────
# 응답 모델을 Gson으로 역직렬화하므로 필드명이 난독화되면 파싱이 깨진다.
-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep class * extends com.google.gson.TypeAdapter
-dontwarn com.kakao.sdk.**

# ── Naver 로그인 SDK ────────────────────────────────────────────────────────
-keep class com.navercorp.nid.** { *; }
-dontwarn com.navercorp.nid.**

# ── Gson ────────────────────────────────────────────────────────────────────
# 제네릭 시그니처와 @SerializedName 필드가 지워지면 역직렬화가 깨진다.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}
-dontwarn com.google.gson.**

# ── OkHttp / Okio ───────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── 크래시 스택 가독성 ──────────────────────────────────────────────────────
# 줄번호를 보존하고 원본 파일명은 숨긴다. mapping.txt는 AAB에 함께 올라가
# Play가 자동으로 역난독화한다.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
