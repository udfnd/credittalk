#import "ObjCExceptionHandler.h"

@implementation ObjCExceptionHandler

+ (BOOL)tryExecute:(void(^)(void))tryBlock catch:(void(^)(NSException *exception))catchBlock {
    @try {
        if (tryBlock) {
            tryBlock();
        }
        return YES;
    }
    @catch (NSException *exception) {
        NSLog(@"[ObjCExceptionHandler] Caught exception: %@", exception);
        if (catchBlock) {
            catchBlock(exception);
        }
        return NO;
    }
}

+ (BOOL)tryExecute:(void(^)(void))tryBlock {
    return [self tryExecute:tryBlock catch:nil];
}

@end
