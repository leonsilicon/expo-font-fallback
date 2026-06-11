import type { ExpoConfig } from 'expo/config';
import withFontFallback from 'expo-font-fallback/plugin';

const fontFallback = withFontFallback({
  fonts: [
    './assets/fonts/Inter-Regular.ttf',
    './assets/fonts/Inter-Bold.ttf',
    './assets/fonts/NotoSansSC-Regular.otf',
  ],
  chains: {
    'Inter-Regular': ['NotoSansSC-Regular'],
    'Inter-Bold': ['NotoSansSC-Regular'],
  },
});

const config: ExpoConfig = {
  name: 'ExpoFontFallback Example',
  slug: 'expo-font-fallback-example',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'expofontfallback.example',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'expofontfallback.example',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [fontFallback],
};

export default config;
