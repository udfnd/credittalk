// React Native 0.79+ with use_frameworks! :linkage => :static
// Objective-C 헤더는 브리징 헤더를 통해 접근합니다.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

// Objective-C 예외 핸들러 (NSException을 Swift에서 안전하게 처리)
#import "ObjCExceptionHandler.h"

// React-RCTAppDelegate Headers
#if __has_include(<React_RCTAppDelegate/RCTAppDelegate.h>)
#import <React_RCTAppDelegate/RCTAppDelegate.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React_RCTAppDelegate/RCTReactNativeFactory.h>
#import <React_RCTAppDelegate/RCTDependencyProvider.h>
#elif __has_include(<React-RCTAppDelegate/RCTAppDelegate.h>)
#import <React-RCTAppDelegate/RCTAppDelegate.h>
#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React-RCTAppDelegate/RCTReactNativeFactory.h>
#import <React-RCTAppDelegate/RCTDependencyProvider.h>
#elif __has_include("RCTAppDelegate.h")
#import "RCTAppDelegate.h"
#import "RCTDefaultReactNativeFactoryDelegate.h"
#import "RCTReactNativeFactory.h"
#import "RCTDependencyProvider.h"
#endif

// ReactAppDependencyProvider
#if __has_include(<ReactAppDependencyProvider/RCTAppDependencyProvider.h>)
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#elif __has_include("RCTAppDependencyProvider.h")
#import "RCTAppDependencyProvider.h"
#endif

// React Native Core Headers
#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#elif __has_include("RCTBridge.h")
#import "RCTBridge.h"
#import "RCTBundleURLProvider.h"
#import "RCTLinkingManager.h"
#endif
