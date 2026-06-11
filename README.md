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
  React Native resolves, via a dynamic-linker interpose of the Fabric font
  resolver. Works transparently for normal `<Text>`.
- **Android** registers a [`Typeface.CustomFallbackBuilder`][custom-fallback]
  chain (API 29+) with React Native's `ReactFontManager`.

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
          }
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
your entry file is ideal:

```ts
import { FontFallback } from 'expo-font-fallback';

FontFallback.install({
  warnOnMissingGlyphs: __DEV__,
});
```

That's it. Existing `<Text style={{ fontFamily: 'Inter-Regular' }}>` now uses the
configured fallback chain.

### API

```ts
FontFallback.install(options?: {
  warnOnMissingGlyphs?: boolean; // dev warnings for uncovered glyphs
  logResolvedFonts?: boolean;    // log resolved chains at install time
}): boolean;

FontFallback.isInstalled(): boolean;

FontFallback.getConfig(): { chains: Record<string, string[]> };

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

**Guaranteed:** for a configured base family, the configured bundled fallback
chain is tried *before* the platform system fallback.

**Not guaranteed:** this does not globally disable system fallback. System UI,
alerts, third-party native components, `TextInput` (may resolve fonts
differently), `WebView` content, color emoji, and glyphs not covered by your
chain may still hit the platform's own fallback.

### Platform limits

| Case | Behavior |
| --- | --- |
| Android API ≥ 29 | Full ordered custom fallback chain. |
| Android API < 29 | `Typeface.CustomFallbackBuilder` is unavailable; the base font is registered without a chain, and a dev warning is logged. |
| iOS new arch (Fabric) | Supported via font-resolver interpose. |
| Unrecognized RN version | If the iOS interpose target symbol is absent, `<Text>` fallback is inactive (logged); the app does not crash. |

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
