#import "ExpoFontFallback.h"

// Generated Swift umbrella header — exposes FFFontFallbackRegistry to ObjC++.
#import "ExpoFontFallback-Swift.h"

@interface RNFontFallbackInterpose : NSObject
+ (BOOL)isAvailable;
+ (void)install;
@end

@interface RNTextLayoutManagerSwizzle : NSObject
+ (BOOL)isAvailable;
+ (void)install;
@end

@implementation ExpoFontFallback

// Loads the fallback chains embedded by the config plugin. The plugin writes
// `font_fallback_chains.json` into the app bundle.
- (NSString *)loadEmbeddedConfigJSON {
  NSURL *url = [NSBundle.mainBundle URLForResource:@"font_fallback_chains"
                                     withExtension:@"json"];
  if (url == nil) {
    return @"{\"chains\":{}}";
  }
  NSString *json = [NSString stringWithContentsOfURL:url
                                            encoding:NSUTF8StringEncoding
                                               error:nil];
  return json ?: @"{\"chains\":{}}";
}

- (NSNumber *)install:(BOOL)warnOnMissingGlyphs
        logResolvedFonts:(BOOL)logResolvedFonts
    defaultFamilyOverride:(NSString *)defaultFamilyOverride {
  NSString *json = [self loadEmbeddedConfigJSON];
  FFFontFallbackRegistry *registry = FFFontFallbackRegistry.sharedRegistry;
  registry.warnOnMissingGlyphs = warnOnMissingGlyphs;
  BOOL ok = [registry configureWithChainsJSON:json];
  [registry setDefaultFamilyOverride:defaultFamilyOverride ?: @""];

  // Install the RN default font resolver hook (bare <Text> default family) and
  // the text-layout swizzle (explicit-fontFamily cascade). Both idempotent.
  [RNFontFallbackInterpose install];
  [RNTextLayoutManagerSwizzle install];

  if (!RNFontFallbackInterpose.isAvailable) {
    NSLog(@"[expo-font-fallback] React Native font resolver symbol not found; "
          @"default-family <Text> fallback is inactive on this RN version.");
  }
  if (!RNTextLayoutManagerSwizzle.isAvailable) {
    NSLog(@"[expo-font-fallback] RCTTextLayoutManager not found; explicit-family "
          @"<Text> cascade is inactive on this RN version.");
  }

  if (logResolvedFonts) {
    NSLog(@"[expo-font-fallback] configured families: %@",
          [[registry configuredFamilies] componentsJoinedByString:@", "]);
    NSLog(@"[expo-font-fallback] default family: %@",
          [registry resolvedDefaultFamily] ?: @"(none)");
  }

  return @(ok);
}

- (NSNumber *)isInstalled {
  return @([FFFontFallbackRegistry.sharedRegistry isInstalled]);
}

- (NSString *)getConfigJSON {
  return [self loadEmbeddedConfigJSON];
}

- (NSString *)checkText:(NSString *)text baseFamily:(NSString *)baseFamily {
  NSDictionary *report =
      [FFFontFallbackRegistry.sharedRegistry coverageReportForText:text
                                                       baseFamily:baseFamily];
  NSData *data = [NSJSONSerialization dataWithJSONObject:report
                                                options:0
                                                  error:nil];
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeExpoFontFallbackSpecJSI>(params);
}

+ (NSString *)moduleName {
  return @"ExpoFontFallback";
}

@end
