// Intercepts React Native's Fabric font resolver so that fonts resolved for a
// configured base family carry our custom fallback cascade list.
//
// On the new architecture, `<Text>` font resolution flows through the free C++
// function `RCTFontWithFontProperties` (declared `RCT_EXTERN` in RCTFontUtils.h
// and called from RCTAttributedTextUtils.mm). A free function has no Objective-C
// method to swizzle, so we use dyld interposing: we provide a replacement with
// the same mangled symbol, and the dynamic linker redirects every call site to
// it. The replacement calls the original, then re-attaches the cascade list
// that the system strips when it rebuilds the font by PostScript name.
//
// If the symbol is not present (e.g. a future RN version renames it, or the old
// architecture is in use), the interpose simply never fires and font rendering
// falls back to RN's default behavior — no crash.

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#if __has_include(<react/renderer/textlayoutmanager/RCTFontUtils.h>)
#import <react/renderer/textlayoutmanager/RCTFontUtils.h>
#define FF_HAS_FONT_UTILS 1
#else
#define FF_HAS_FONT_UTILS 0
#endif

// Bridge to the Swift registry. `FFFontFallbackRegistry` is exposed to ObjC via
// the @objc attributes in FontFallbackRegistry.swift; we forward-declare the
// pieces we need to avoid importing the generated Swift header here (which is
// only available after the Swift module compiles).
@interface FFFontFallbackRegistry : NSObject
@property (class, readonly) FFFontFallbackRegistry *sharedRegistry;
- (UIFont *)wrapFont:(UIFont *)font baseFamily:(nullable NSString *)baseFamily;
@end

#if FF_HAS_FONT_UTILS

// The replacement. It must have the exact same signature (and therefore the
// same C++ mangled symbol) as the original.
static UIFont *FFFontWithFontProperties(RCTFontProperties fontProperties) {
  UIFont *resolved = RCTFontWithFontProperties(fontProperties);
  if (resolved == nil) {
    return resolved;
  }
  FFFontFallbackRegistry *registry = FFFontFallbackRegistry.sharedRegistry;
  return [registry wrapFont:resolved baseFamily:fontProperties.family];
}

// dyld interpose record: redirects calls to `RCTFontWithFontProperties` to
// `FFFontWithFontProperties` process-wide at load time.
__attribute__((used)) static struct {
  UIFont *(*replacement)(RCTFontProperties);
  UIFont *(*replacee)(RCTFontProperties);
} _ff_interpose_RCTFontWithFontProperties
    __attribute__((section("__DATA,__interpose"))) = {
        FFFontWithFontProperties,
        RCTFontWithFontProperties,
};

#endif // FF_HAS_FONT_UTILS

@interface RNFontFallbackInterpose : NSObject
@end

@implementation RNFontFallbackInterpose

/// Reports whether the interpose was compiled against the expected RN symbol.
/// The runtime module surfaces this so JS can detect an unsupported RN version.
+ (BOOL)isAvailable {
  return FF_HAS_FONT_UTILS ? YES : NO;
}

@end
