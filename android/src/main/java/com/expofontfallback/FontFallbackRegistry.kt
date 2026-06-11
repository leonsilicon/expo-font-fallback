package com.expofontfallback

import android.content.Context
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily
import android.os.Build
import android.util.Log
import com.facebook.react.common.assets.ReactFontManager
import org.json.JSONObject

/**
 * Builds cascaded [Typeface]s from the configured fallback chains and registers
 * them with React Native's [ReactFontManager] so that every
 * `<Text style={{ fontFamily }}>` using a configured base family transparently
 * gains the fallback chain.
 *
 * React Native checks its custom-typeface cache before any asset/system lookup,
 * so registering under the base family name is sufficient — no reflection.
 *
 * True ordered fallback requires [Typeface.CustomFallbackBuilder] (API 29+). On
 * older devices we register the base font only and (optionally) warn.
 */
object FontFallbackRegistry {
  private const val TAG = "ExpoFontFallback"
  private const val ASSET_CONFIG = "font_fallback_chains.json"
  private const val FONTS_DIR = "fonts"

  @Volatile
  private var installed = false
  private var chains: Map<String, List<String>> = emptyMap()
  private var warnBelowApi29 = false

  fun isInstalled(): Boolean = installed

  fun configuredFamilies(): List<String> = chains.keys.toList()

  fun configJSON(context: Context): String =
    runCatching {
      context.assets.open(ASSET_CONFIG).bufferedReader().use { it.readText() }
    }.getOrDefault("{\"chains\":{}}")

  /**
   * Load the embedded config and register cascaded typefaces. Idempotent.
   *
   * @return true if at least the config parsed successfully
   */
  fun install(context: Context, warnBelowApi29: Boolean): Boolean {
    this.warnBelowApi29 = warnBelowApi29
    val json = configJSON(context)
    val parsed =
      runCatching {
        val root = JSONObject(json)
        val chainsObj = root.optJSONObject("chains") ?: JSONObject()
        buildMap {
          for (key in chainsObj.keys()) {
            val arr = chainsObj.getJSONArray(key)
            put(key, List(arr.length()) { arr.getString(it) })
          }
        }
      }.getOrElse {
        Log.e(TAG, "Failed to parse $ASSET_CONFIG", it)
        return false
      }

    chains = parsed
    registerAll(context)
    installed = true
    return true
  }

  private fun registerAll(context: Context) {
    val fontManager = ReactFontManager.getInstance()
    for ((baseFamily, fallbacks) in chains) {
      val typeface = buildCascadedTypeface(context, baseFamily, fallbacks)
      if (typeface != null) {
        fontManager.addCustomFont(baseFamily, typeface)
      }
    }
  }

  /**
   * Build a [Typeface] for [baseFamily] with [fallbacks] as an ordered custom
   * fallback chain. Returns null if the base font cannot be loaded.
   */
  private fun buildCascadedTypeface(
    context: Context,
    baseFamily: String,
    fallbacks: List<String>,
  ): Typeface? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      if (warnBelowApi29) {
        Log.w(
          TAG,
          "API ${Build.VERSION.SDK_INT} < 29: custom fallback chains are " +
            "unavailable; registering base font '$baseFamily' only.",
        )
      }
      return loadBaseTypeface(context, baseFamily)
    }

    return runCatching {
      val baseFontFamily = loadFontFamily(context, baseFamily)
        ?: return loadBaseTypeface(context, baseFamily)

      val builder = Typeface.CustomFallbackBuilder(baseFontFamily)
      for (fallback in fallbacks) {
        val family = loadFontFamily(context, fallback)
        if (family != null) {
          // addCustomFallback throws once the platform fallback limit (64) is
          // reached; stop gracefully if so.
          runCatching { builder.addCustomFallback(family) }
            .onFailure { Log.w(TAG, "Skipping fallback '$fallback': ${it.message}") }
        } else {
          Log.w(TAG, "Fallback font asset for '$fallback' not found.")
        }
      }
      builder.build()
    }.getOrElse {
      Log.e(TAG, "Failed to build cascaded typeface for '$baseFamily'", it)
      loadBaseTypeface(context, baseFamily)
    }
  }

  /** Resolve a [FontFamily] from a bundled asset (tries .ttf then .otf). */
  private fun loadFontFamily(context: Context, name: String): FontFamily? {
    val font = loadFont(context, name) ?: return null
    return runCatching { FontFamily.Builder(font).build() }.getOrNull()
  }

  private fun loadFont(context: Context, name: String): Font? {
    for (ext in arrayOf("ttf", "otf")) {
      val path = "$FONTS_DIR/$name.$ext"
      val font =
        runCatching { Font.Builder(context.assets, path).build() }.getOrNull()
      if (font != null) return font
    }
    return null
  }

  private fun loadBaseTypeface(context: Context, name: String): Typeface? {
    for (ext in arrayOf("ttf", "otf")) {
      val path = "$FONTS_DIR/$name.$ext"
      val tf =
        runCatching { Typeface.createFromAsset(context.assets, path) }.getOrNull()
      if (tf != null) return tf
    }
    return null
  }

  // MARK: Glyph coverage (checkText)

  fun coverageReport(context: Context, text: String, baseFamily: String): String {
    val chain = listOf(baseFamily) + (chains[baseFamily] ?: emptyList())
    val paints =
      chain.mapNotNull { family ->
        val tf = loadBaseTypeface(context, family) ?: return@mapNotNull null
        family to Paint().apply { typeface = tf }
      }

    val coveredBy = JSONObject()
    val missing = mutableListOf<JSONObject>()

    var i = 0
    while (i < text.length) {
      val codePoint = text.codePointAt(i)
      val charCount = Character.charCount(codePoint)
      val ch = text.substring(i, i + charCount)
      i += charCount

      if (Character.isWhitespace(codePoint)) continue

      val covering = paints.firstOrNull { (_, p) -> p.hasGlyph(ch) }
      if (covering != null) {
        coveredBy.put(ch, covering.first)
      } else {
        missing.add(
          JSONObject().put("char", ch).put("codepoint", "U+%04X".format(codePoint))
        )
      }
    }

    return JSONObject()
      .put("baseFamily", baseFamily)
      .put("missingCodepoints", missing)
      .put("coveredBy", coveredBy)
      .toString()
  }
}
