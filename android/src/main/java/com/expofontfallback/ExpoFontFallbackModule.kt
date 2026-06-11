package com.expofontfallback

import com.facebook.react.bridge.ReactApplicationContext

class ExpoFontFallbackModule(reactContext: ReactApplicationContext) :
  NativeExpoFontFallbackSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeExpoFontFallbackSpec.NAME
  }
}
