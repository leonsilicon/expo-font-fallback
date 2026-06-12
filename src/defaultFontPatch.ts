import * as React from 'react';
// Intentionally use `require` (not `import`) for react-native: we need the
// actual CommonJS module exports object that consumers read `Text` from at
// render time, not the ESM namespace wrapper Metro would hand an `import *`.
// Patching the wrapper would not affect `_reactNative.Text` call sites.
const ReactNative = require('react-native');

/**
 * Transparently injects a default `fontFamily` into every React Native `<Text>`
 * that does not specify its own, so bare text renders in the configured default
 * family (and therefore through that family's fallback chain). The caller writes
 * plain `<Text>` from `react-native` and changes nothing.
 *
 * Why this exists: iOS resolves the default natively via
 * `RCTSetDefaultFontResolver`, but Android's attribute-less text path draws with
 * the platform default font and cannot be redirected reliably from native code
 * (there is no `Typeface.setDefault` on modern API levels). Routing bare `<Text>`
 * through an explicit `fontFamily` at the JS layer makes it flow through the
 * (working) per-family cascade on Android.
 *
 * Implementation: we replace the `Text` property on the `react-native` module
 * object with a wrapper that injects the default family as the *base* of the
 * element's style. Metro compiles `import { Text }` to live property reads
 * (`_reactNative.Text`) at each JSX call site, so replacing the property affects
 * all consumers regardless of import order — no caller changes required. An
 * explicit `fontFamily` in a `<Text>`'s own style still wins, because later
 * entries in a style array override earlier ones.
 *
 * The patch is idempotent and Android-only (iOS uses the native resolver).
 */

type AnyProps = { style?: unknown } & Record<string, unknown>;

let patched = false;

/**
 * Activate the default-font injection for `family`. No-op on non-Android
 * platforms, when no family is given, or if already patched.
 */
export function installDefaultFontPatch(family: string | undefined): void {
  // iOS resolves the default natively via RCTSetDefaultFontResolver, which also
  // attaches the cascade. Injecting an explicit fontFamily there would instead
  // route bare text through the (separate) explicit-family path, so this is
  // Android-only.
  if (ReactNative.Platform.OS !== 'android') return;
  const activeFamily = family && family.length > 0 ? family : undefined;
  if (patched || activeFamily == null) return;

  const moduleObject = ReactNative as unknown as {
    Text: React.ComponentType<AnyProps>;
  };
  const OriginalText = moduleObject.Text;
  if (OriginalText == null) return;

  const baseStyle = { fontFamily: activeFamily };

  const WrappedText = React.forwardRef<unknown, AnyProps>((props, ref) => {
    const style = props.style == null ? baseStyle : [baseStyle, props.style];
    return React.createElement(OriginalText, { ...props, ref, style });
  });
  (WrappedText as { displayName?: string }).displayName = 'Text';

  // The `Text` property may be defined as a read-only getter on the module
  // namespace; `defineProperty` replaces it regardless. Best effort — on failure
  // bare <Text> simply keeps the system font (iOS native path is unaffected).
  try {
    Object.defineProperty(moduleObject, 'Text', {
      configurable: true,
      enumerable: true,
      get: () => WrappedText,
      set: () => {},
    });
    patched = moduleObject.Text === WrappedText;
  } catch {
    patched = false;
  }
}
