package com.expofontfallback

import com.facebook.react.bridge.ReactApplicationContext

class ExpoFontFallbackModule(reactContext: ReactApplicationContext) :
  NativeExpoFontFallbackSpec(reactContext) {

  override fun install(warnOnMissingGlyphs: Boolean, logResolvedFonts: Boolean): Boolean {
    // `warnOnMissingGlyphs` doubles as the below-API-29 warning toggle: in dev
    // builds the app opts in to fallback diagnostics in general.
    val ok = FontFallbackRegistry.install(reactApplicationContext, warnOnMissingGlyphs)
    if (logResolvedFonts) {
      android.util.Log.i(
        "ExpoFontFallback",
        "configured families: ${FontFallbackRegistry.configuredFamilies().joinToString(", ")}",
      )
    }
    return ok
  }

  override fun isInstalled(): Boolean = FontFallbackRegistry.isInstalled()

  override fun getConfigJSON(): String =
    FontFallbackRegistry.configJSON(reactApplicationContext)

  override fun checkText(text: String, baseFamily: String): String =
    FontFallbackRegistry.coverageReport(reactApplicationContext, text, baseFamily)

  companion object {
    const val NAME = NativeExpoFontFallbackSpec.NAME
  }
}
