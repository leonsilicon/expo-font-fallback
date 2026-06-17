// Attaches our fallback cascade to fonts used by explicit-`fontFamily` `<Text>`
// on iOS (new architecture / Fabric).
//
// Explicit families do NOT flow through `RCTSetDefaultFontResolver` — React
// Native's `RCTFontWithFontProperties` builds those fonts itself and the
// resolver is only consulted for the default/system branch. And the free C
// function cannot be interposed against the prebuilt React core (its caller is
// in the same image). So for explicit families we hook one level up: the
// `NSAttributedString` that `RCTTextLayoutManager` produces for every measure
// and draw pass funnels through the private method
// `-_nsAttributedStringFromAttributedString:`. We swizzle it, let the original
// build the string, then post-process every `NSFontAttributeName` run whose
// family has a configured chain, replacing the font with a cascade-attached
// copy.
//
// If the method or header is unavailable (future RN version), installation is a
// no-op — no crash.

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#if __has_include(<react/renderer/textlayoutmanager/RCTTextLayoutManager.h>)
#import <react/renderer/attributedstring/AttributedString.h>
#import <react/renderer/textlayoutmanager/RCTTextLayoutManager.h>
#define FF_HAS_TEXT_LAYOUT_MANAGER 1
#else
#define FF_HAS_TEXT_LAYOUT_MANAGER 0
#endif

// Bridge to the Swift registry (see FontFallbackRegistry.swift).
@interface FFFontFallbackRegistry : NSObject
@property (class, readonly) FFFontFallbackRegistry *sharedRegistry;
- (nullable UIFont *)cascadeFontForFont:(UIFont *)font;
@end

#if FF_HAS_TEXT_LAYOUT_MANAGER

/// Returns a copy of `input` in which every font run whose family has a
/// configured chain is replaced by a cascade-attached font.
static NSAttributedString *FFApplyCascades(NSAttributedString *input) {
  if (input.length == 0) {
    return input;
  }
  FFFontFallbackRegistry *registry = FFFontFallbackRegistry.sharedRegistry;
  __block NSMutableAttributedString *result = nil;

  [input enumerateAttribute:NSFontAttributeName
                    inRange:NSMakeRange(0, input.length)
                    options:0
                 usingBlock:^(id value, NSRange range, BOOL *stop) {
                   UIFont *font = value;
                   if (font == nil) {
                     return;
                   }
                   UIFont *wrapped = [registry cascadeFontForFont:font];
                   // Only substitute a genuinely resolved replacement. A nil (no
                   // chain / unresolved) or identity result means "leave the
                   // original untouched". Writing a malformed font into the
                   // attributed string would surface as a crash later in the
                   // draw path, so the registry must only ever return a real
                   // UIFont here — but we re-assert it defensively regardless.
                   if (wrapped == nil || wrapped == font ||
                       ![wrapped isKindOfClass:[UIFont class]]) {
                     return;
                   }
                   if (result == nil) {
                     result = [input mutableCopy];
                   }
                   [result addAttribute:NSFontAttributeName
                                  value:wrapped
                                  range:range];
                 }];

  return result != nil ? [result copy] : input;
}

@interface RCTTextLayoutManager (FFSwizzle)
@end

@implementation RCTTextLayoutManager (FFSwizzle)

// Matches the private original signature:
//   - (NSAttributedString *)_nsAttributedStringFromAttributedString:(AttributedString)
- (NSAttributedString *)ff_nsAttributedStringFromAttributedString:
    (facebook::react::AttributedString)attributedString {
  // Calls the original (implementations are exchanged at install time).
  NSAttributedString *original =
      [self ff_nsAttributedStringFromAttributedString:attributedString];
  return FFApplyCascades(original);
}

@end

#endif // FF_HAS_TEXT_LAYOUT_MANAGER

@interface RNTextLayoutManagerSwizzle : NSObject
+ (BOOL)isAvailable;
+ (void)install;
@end

@implementation RNTextLayoutManagerSwizzle

+ (BOOL)isAvailable {
  return FF_HAS_TEXT_LAYOUT_MANAGER ? YES : NO;
}

+ (void)install {
#if FF_HAS_TEXT_LAYOUT_MANAGER
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = NSClassFromString(@"RCTTextLayoutManager");
    if (cls == nil) {
      return;
    }
    SEL originalSel = NSSelectorFromString(@"_nsAttributedStringFromAttributedString:");
    SEL swizzledSel = @selector(ff_nsAttributedStringFromAttributedString:);
    Method originalMethod = class_getInstanceMethod(cls, originalSel);
    Method swizzledMethod = class_getInstanceMethod(cls, swizzledSel);
    if (originalMethod == NULL || swizzledMethod == NULL) {
      NSLog(@"[expo-font-fallback] RCTTextLayoutManager text method not found; "
            @"explicit-family <Text> cascade is inactive on this RN version.");
      return;
    }
    method_exchangeImplementations(originalMethod, swizzledMethod);
  });
#endif
}

@end
