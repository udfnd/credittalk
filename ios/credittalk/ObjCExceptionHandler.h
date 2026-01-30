#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ObjCExceptionHandler : NSObject

/// Objective-C 예외를 안전하게 처리하며 블록 실행
/// @param tryBlock 실행할 블록
/// @param catchBlock 예외 발생 시 호출될 블록
+ (BOOL)tryExecute:(void(^)(void))tryBlock
            catch:(void(^_Nullable)(NSException *exception))catchBlock;

/// 간단한 실행 (예외 발생 시 무시)
+ (BOOL)tryExecute:(void(^)(void))tryBlock;

@end

NS_ASSUME_NONNULL_END
