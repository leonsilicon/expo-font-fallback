# expo-font-fallback

Custom, ordered font **fallback chains** for React Native text.

Define an app-wide fallback chain so your bundled fonts are tried *in the order
you choose* before the platform reaches its own system fallback. A regular
`<Text style={{ fontFamily: 'Inter-Regular' }}>` that contains CJK, symbol, or
other glyphs your base font lacks will render them from your bundled fallback
fonts instead of tofu boxes or an inconsistent system font.

```tsx
<Text style={{ fontFamily: 'Inter-Regular' }}>Hello 你好 こんにちは 안녕하세요</Text>
//             ^ Inter         ^ rendered from your configured Noto fallbacks
```

- **iOS** attaches a [`UIFontDescriptor` cascade list][cascade] to the fonts
  React Native resolves for your `<Text>`. Works transparently for normal
  `<Text>`.
- **Android** registers a [`Typeface.CustomFallbackBuilder`][custom-fallback]
  chain (API 29+) with React Native's `ReactFontManager`.

See [How it works under the hood](#how-it-works-under-the-hood) for the exact
mechanism on each platform.

[cascade]: https://developer.apple.com/documentation/uikit/uifontdescriptor/attributename/1616821-cascadelist
[custom-fallback]: https://developer.android.com/reference/android/graphics/Typeface.CustomFallbackBuilder

> [!IMPORTANT]
> **Expo Go is not supported.** This library has native code and must run in a
> [custom dev client](https://docs.expo.dev/develop/development-builds/introduction/)
> or a release build. It targets the React Native **new architecture (Fabric)**.

## Installation

```sh
npx expo install expo-font-fallback
```

Then add the config plugin. Use whichever config format your project has.

The keys and values in `chains` are font **file base names** (the file name
without its extension). Run `npx expo prebuild` after changing the config.

<details open>
<summary><strong><code>app.json</code></strong> (plain JSON)</summary>

```json
{
  "expo": {
    "plugins": [
      [
        "expo-font-fallback",
        {
          "fonts": [
            "./assets/fonts/Inter-Regular.ttf",
            "./assets/fonts/Inter-Bold.ttf",
            "./assets/fonts/NotoSansSC-Regular.otf"
          ],
          "chains": {
            "Inter-Regular": ["NotoSansSC-Regular"],
            "Inter-Bold": ["NotoSansSC-Regular"]
          },
          "defaultFamily": "Inter-Regular"
        }
      ]
    ]
  }
}
```

The same `["expo-font-fallback", { … }]` array also works in a plain
`app.config.js`.

</details>

<details>
<summary><strong><code>app.config.ts</code></strong> (typed factory)</summary>

Import the plugin from the `expo-font-fallback/plugin` subpath. It is a typed
factory that returns the `["expo-font-fallback", props]` tuple, so your `fonts`
and `chains` are type-checked:

```ts
import type { ExpoConfig } from 'expo/config';
import withFontFallback from 'expo-font-fallback/plugin';

const config: ExpoConfig = {
  name: 'my-app',
  slug: 'my-app',
  plugins: [
    withFontFallback({
      fonts: [
        './assets/fonts/Inter-Regular.ttf',
        './assets/fonts/Inter-Bold.ttf',
        './assets/fonts/NotoSansSC-Regular.otf',
      ],
      chains: {
        'Inter-Regular': ['NotoSansSC-Regular'],
        'Inter-Bold': ['NotoSansSC-Regular'],
      },
      // Apply to <Text> that sets no fontFamily (optional).
      defaultFamily: 'Inter-Regular',
    }),
  ],
};

export default config;
```

The `FontFallbackPluginConfig` props type is also exported from the subpath if
you want to declare the config separately.

</details>

## Usage

Call `install()` **once, before your first React render** — at module scope in
your entry file is ideal (this also lets the app-wide default take effect before
anything mounts):

```ts
import { FontFallback } from 'expo-font-fallback';

FontFallback.install({
  warnOnMissingGlyphs: __DEV__,
});
```

That's it. Existing `<Text style={{ fontFamily: 'Inter-Regular' }}>` now uses the
configured fallback chain — no other code changes.

### App-wide default family

Set `defaultFamily` in the plugin config to apply a bundled family — and its
fallback chain — to every `<Text>` that specifies **no** `fontFamily`. A bare
`<Text>Hello 你好</Text>` then renders `Hello` in your default family and `你好`
via that family's chain, instead of dropping to the OS system font. Bare
weighted text (e.g. `fontWeight: 'bold'`) resolves to the matching face of the
default family.

`defaultFamily` must be one of `fonts`. You can override the embedded value at
runtime via `install({ defaultFamily })`. You don't change anything else — keep
writing plain `<Text>` from `react-native`; `install()` wires the default up
transparently (natively on iOS, and via a render-time `Text` shim on Android).
An explicit `fontFamily` on a `<Text>` always takes precedence.

> **Android note:** the default-family cascade needs API 29+
> (`Typeface.CustomFallbackBuilder`). On older devices bare `<Text>` keeps the
> system font; explicit per-`fontFamily` chains still apply.

### Multi-weight families

A `chains` entry is built from ONE font file, so on Android a chain base has a
single weight: `fontWeight: '100'` renders the base file's outlines and bold is
synthesised. When your family ships several weight files, declare it under
`families`, keyed by the **display name** JS passes as `fontFamily`:

```ts
withFontFallback({
  fonts: [
    './public/fonts/han-composite.ttf',        // Regular, the full font
    './public/fonts/han-composite-thin.ttf',   // Thin
    './public/fonts/han-composite-bold.ttf',   // Bold, Latin only
    './public/fonts/last-resort.ttf',
  ],
  chains: {
    // Per-face chains (iOS keys these by PostScript name): faces that lack a
    // glyph fall back to the full Regular face.
    'han-composite-thin': ['han-composite', 'last-resort'],
    'han-composite-bold': ['han-composite', 'last-resort'],
    'han-composite': ['last-resort'],
  },
  families: {
    'Han Composite': {
      faces: ['han-composite-thin', 'han-composite', 'han-composite-bold'],
      chain: ['han-composite', 'last-resort'],
    },
  },
  defaultFamily: 'Han Composite',
});
```

`faces` and `chain` are logical font names (file base names, all listed in
`fonts`); each face's weight and italic are read from its file. Android
registers one cascaded `Typeface` under the display name that carries every
face — `fontWeight` selects the real face and glyphs a face lacks walk the
chain — and uses it as the process default when `defaultFamily` names the
family. iOS resolves the family through CoreText from the bundled faces' name
tables and attaches each face's `chains` entry, so `families` only validates
the names there.

### API

```ts
FontFallback.install(options?: {
  warnOnMissingGlyphs?: boolean; // dev warnings for uncovered glyphs
  logResolvedFonts?: boolean;    // log resolved chains at install time
  defaultFamily?: string;        // override the embedded default family
}): boolean;

FontFallback.isInstalled(): boolean;

FontFallback.getConfig(): {
  chains: Record<string, string[]>;
  defaultFamily?: string;
};

// Development helper: which font covers each character, and what's missing.
FontFallback.checkText(text: string, baseFamily: string): GlyphCoverageReport;
```

## Font names

iOS looks fonts up by their internal **PostScript name**, which is often *not*
the same as the file name (e.g. `NotoSansSC-Regular.otf` has the PostScript name
`NotoSansCJKsc-Regular`). The config plugin reads each font's `name` table at
prebuild and maps names automatically, so you can keep using file base names.

If auto-detection picks the wrong name, override it explicitly:

```ts
{
  fonts: ['./assets/fonts/NotoSansSC-Regular.otf'],
  fontNames: {
    './assets/fonts/NotoSansSC-Regular.otf': {
      ios: 'NotoSansCJKsc-Regular',
      android: 'NotoSansSC-Regular',
    },
  },
  // ...
}
```

## What this guarantees (and what it doesn't)

**Guaranteed:** in `<Text>`, for a configured base family — whether set
explicitly via `fontFamily` or applied through `defaultFamily` — the configured
bundled fallback chain is tried *before* the platform system fallback.

**Not guaranteed:** this does not globally disable system fallback. System UI,
alerts, third-party native components, `TextInput` (may resolve fonts
differently), `WebView` content, color emoji, and glyphs not covered by your
chain may still hit the platform's own fallback.

### Platform limits

| Case | Behavior |
| --- | --- |
| iOS new arch (Fabric) | Fully supported — explicit `fontFamily` and the app-wide default. |
| Android API ≥ 29 | Full ordered custom fallback chain, including the default family. |
| Android API < 29 | `Typeface.CustomFallbackBuilder` is unavailable; the base font is registered without a chain, the default-family cascade is skipped, and a dev warning is logged. |
| Unrecognized RN version | If the iOS hook points are absent, fallback is inactive (logged); the app does not crash. |

### Gotchas & limitations

A few non-obvious things worth knowing:

- **Verifying with CJK is misleading.** Both iOS and Android ship system fonts
  that cover CJK, Kana, Hangul, and most common scripts, so that text renders
  correctly *even if the cascade does nothing*. To actually confirm your chain is
  engaged, test a glyph **no system font covers** — e.g. a "last resort" font
  with boxed block-hint glyphs, or an exotic block like Egyptian Hieroglyphs.
  Seeing real CJK glyphs is not proof.
- **`<Text>` only.** The hooks cover React Native `<Text>`. `TextInput`,
  `WebView` content, native UI (alerts, navigation titles), and third-party
  components that render text natively resolve fonts on their own paths and are
  unaffected.
- **`getConfig().defaultFamily` returns the resolved, platform-specific name**
  (PostScript name on iOS, file base name on Android), which can differ from the
  string you wrote in config for fonts whose PostScript name doesn't match the
  file name. See [Font names](#font-names).
- **`checkText` is a config check, not a render oracle.** It inspects the fonts
  directly and does not exercise RN's live resolution or OS system fallback, so
  it can disagree with what actually renders on screen.
- **iOS hooks a private RN method.** The explicit-`fontFamily` cascade swizzles
  `-[RCTTextLayoutManager _nsAttributedStringFromAttributedString:]`. If a future
  React Native renames or removes it, that path silently goes inactive (logged,
  no crash); the public default-font resolver is unaffected.
- **iOS weight matching is nearest-available.** A bare bold default with only a
  Regular face registered resolves to the closest weight you bundled, not a
  synthesized bold.
- **Android default relies on a JS `<Text>` shim.** `install()` wraps the `Text`
  export from `react-native`. Components that render text *without* going through
  that export won't pick up the default family (explicit per-`fontFamily` chains
  still work everywhere). The shim is Android-only; iOS uses a native resolver.
- **Long chains are capped on Android.** `Typeface.CustomFallbackBuilder` allows
  up to 64 fallback families; entries beyond that are skipped with a warning.
- **`install()` should run before your first render** so the chains — and the
  Android default-font shim — are in place before anything mounts.

## Avoiding duplicate font files

If another plugin already ships a font into your app, you can tell this plugin not to bundle its
own copy. The font is still used for chain and name resolution — only the duplicate file is
skipped.

This matters most alongside [`expo-font`](https://docs.expo.dev/versions/latest/sdk/font/), which
writes every registered face into `res/font/` on Android and into the app bundle on iOS. Without
this, each shared face ships **twice**, which is easy to miss and expensive for multi-megabyte CJK
fonts.

```js
[
  'expo-font-fallback',
  {
    fonts: ['./assets/fonts/noto-sans.ttf', './assets/fonts/noto-sans-sc.ttf'],
    chains: { 'noto-sans': ['noto-sans-sc'] },
    // Both platforms are configured independently.
    ios: { skipBundlingFonts: ['noto-sans.ttf', 'noto-sans-sc.ttf'] },
    android: { skipBundlingFonts: ['noto-sans.ttf', 'noto-sans-sc.ttf'] },
  },
]
```

Names may be given with or without the extension.

**iOS** — required when another plugin bundles the same file, otherwise two `CpResource` commands
write the same path and the build fails with *"Multiple commands produce …"*.

**Android** — optional but recommended. Nothing fails without it; you just ship the bytes twice.
When set, the font is not copied into `assets/fonts/` and the runtime loads it from `res/font/`
instead. Android resource names replace hyphens with underscores (matching `expo-font`'s own
naming), so `noto-sans-sc` resolves as `R.font.noto_sans_sc`.

> Only skip a font that another plugin genuinely bundles for that platform. If nothing ships it,
> the face cannot be found at runtime and its chain link is silently dropped.

## How it works under the hood

There are two halves: a **build-time config plugin** that bundles your fonts and
embeds the chains, and a **runtime** that hooks React Native's text rendering on
each platform so those chains actually take effect.

### Build time (the config plugin)

During `expo prebuild`, the plugin:

1. **Copies your font files** into the native projects (`ios/<App>/Fonts/` and
   `android/app/src/main/assets/fonts/`) and registers them — `UIAppFonts` in
   `Info.plist` on iOS, asset fonts on Android.
2. **Resolves names per platform.** iOS looks fonts up by their internal
   **PostScript name**; Android by **file base name**. The plugin reads each
   font's OpenType `name` table to map your file base names to the right lookup
   name for each platform (see [Font names](#font-names)).
3. **Emits `font_fallback_chains.json`** into each app bundle — the same chains,
   keyed by PostScript names for iOS and by file base names for Android, plus
   the resolved `defaultFamily`. The runtime loads this at `install()`.

So your config keys stay as friendly file base names; the platform-specific name
juggling happens at prebuild.

### Runtime: iOS (new architecture / Fabric)

On Fabric, `<Text>` font resolution flows through the C++ function
`RCTFontWithFontProperties`. There are two cases, hooked separately:

- **Text with an explicit `fontFamily`.** React Native resolves that font
  itself, so we post-process it: we swizzle the Objective-C method
  `-[RCTTextLayoutManager _nsAttributedStringFromAttributedString:]` — the single
  funnel every measure and draw pass goes through. After the original builds the
  `NSAttributedString`, we walk its `NSFontAttributeName` runs and, for any font
  whose family has a configured chain, swap in a copy carrying that chain as its
  [`UIFontDescriptor` cascade list][cascade].
- **Text with no `fontFamily` (the app-wide default).** This branch consults the
  public [`RCTSetDefaultFontResolver`][resolver] hook. We install a resolver that
  returns your `defaultFamily`'s face at the requested size/weight/italic, with
  its chain attached — so bare `<Text>` renders the default family and cascades
  through it.

Both hooks are best-effort: if a target symbol or method is missing on a future
React Native version, installation is a no-op and the app does not crash. One
important detail — each fallback entry is pinned to an *empty* cascade list so
CoreText walks **your** chain in order instead of diverting to the system font as
soon as one entry lacks a glyph.

> An earlier approach used a dynamic-linker (`dyld`) interpose of
> `RCTFontWithFontProperties`. That does **not** work with the prebuilt React
> core: the symbol and its caller live in the same image, so the call is bound
> statically and never routes through the interpose. The resolver + swizzle above
> are the supported seams.

### Runtime: Android (API 29+)

- **Text with an explicit `fontFamily`.** We build a
  [`Typeface.CustomFallbackBuilder`][custom-fallback] typeface (base font + your
  ordered fallback families) and register it under the family name with
  `ReactFontManager.addCustomFont`. React Native checks that registry first when
  resolving a `fontFamily`, so the cascade applies transparently. Weights are
  preserved because RN derives styled variants with `Typeface.create`, which
  keeps the custom font collection.
- **Text with no `fontFamily` (the app-wide default).** Android's attribute-less
  text path draws with the platform's native default font, and modern Android
  exposes no API to redirect it (`Typeface.setDefault` no longer exists). So the
  default is applied at the JS layer instead: `install()` replaces the `Text`
  export on the `react-native` module object with a thin wrapper that injects
  `defaultFamily` as the *base* of the element's style (an explicit `fontFamily`
  still wins). Because Metro compiles `import { Text }` to live property reads,
  this is transparent and order-independent — **you keep writing plain `<Text>`
  and change nothing.** This shim is Android-only; iOS uses its native resolver.

### `checkText` (dev helper)

`checkText(text, baseFamily)` walks `[baseFamily, ...chain]` and reports, per
character, which font first covers it and which codepoints nothing covers. It
inspects the fonts directly (it does not exercise the live render path), so it's
handy for spotting font-name mismatches and gaps in your chain during
development.

[resolver]: https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTFontUtils.h

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
