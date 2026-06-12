// Hooks React Native's Fabric font resolution so fonts rendered for a
// configured base family carry our custom fallback cascade list, and so text
// with no explicit fontFamily can be rendered with a configured default family.
//
// On the new architecture, `<Text>` font resolution flows through the free C++
// function `RCTFontWithFontProperties` (declared `RCT_EXTERN` in RCTFontUtils.h).
// React Native exposes a supported override for it: `RCTSetDefaultFontResolver`,
// a block consulted from inside `RCTFontWithFontProperties`. We install a
// resolver that produces the base UIFont and re-attaches the cascade list that
// the system would otherwise strip.
//
// (A previous approach used a dyld `__interpose` of `RCTFontWithFontProperties`.
// That does not work with the prebuilt React core: the symbol and its caller
// live in the same image — React.framework — so the call is statically bound
// and never routes through the dynamic linker for our replacement to take
// effect. `RCTSetDefaultFontResolver` is the supported seam instead.)
//
// If the symbol is not present (e.g. a future RN version, or the old
// architecture), installation is a no-op — no crash.

#import <UIKit/UIKit.h>

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
- (nullable UIFont *)defaultFontWithSize:(CGFloat)size
                                  weight:(CGFloat)weight
                                  italic:(BOOL)italic;
@end

@interface RNFontFallbackInterpose : NSObject
+ (BOOL)isAvailable;
+ (void)install;
@end

@implementation RNFontFallbackInterpose

/// Reports whether the font-resolution hook is available for this RN version.
/// The runtime module surfaces this so JS can detect an unsupported RN version.
+ (BOOL)isAvailable {
  return FF_HAS_FONT_UTILS ? YES : NO;
}

/// Install the default font resolver. Idempotent; safe to call on every
/// `install()`.
+ (void)install {
#if FF_HAS_FONT_UTILS
  RCTSetDefaultFontResolver(^UIFont *(const RCTFontProperties &props) {
    FFFontFallbackRegistry *registry = FFFontFallbackRegistry.sharedRegistry;
    // React Native consults this resolver only for the *default* font branch —
    // i.e. text with no explicit fontFamily, where `props.family` is nil/empty
    // or the system-font sentinel (".AppleSystemUIFont"). Explicit families are
    // resolved by RN directly and never reach here.
    NSString *family = props.family;
    BOOL isDefaultBranch =
        family.length == 0 || [family hasPrefix:@"."];
    if (!isDefaultBranch) {
      // Should not happen, but guard: defer to RN for any explicit family.
      return nil;
    }
    CGFloat size = isnan(props.size) ? 14.0 : props.size;
    CGFloat weight = isnan(props.weight) ? UIFontWeightRegular : props.weight;
    BOOL italic = props.style == RCTFontStyleItalic;
    // Returns our default-family font (+ cascade) when a default is configured,
    // or nil to let React Native use its own system font.
    return [registry defaultFontWithSize:size weight:weight italic:italic];
  });
#endif
}

@end
