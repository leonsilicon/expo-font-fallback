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

  /** A multi-weight family: display name → its face files + fallback chain (file base names). */
  private data class FamilySpec(val faces: List<String>, val chain: List<String>)

  @Volatile
  private var installed = false
  private var chains: Map<String, List<String>> = emptyMap()
  private var families: Map<String, FamilySpec> = emptyMap()
  private var warnBelowApi29 = false

  /** Default family embedded by the config plugin (a file base name), or null. */
  private var embeddedDefaultFamily: String? = null
  /** Runtime override of [embeddedDefaultFamily], or null to use embedded. */
  private var defaultFamilyOverride: String? = null

  /** The effective default family: override if set, else embedded. */
  private fun activeDefaultFamily(): String? = defaultFamilyOverride ?: embeddedDefaultFamily

  fun isInstalled(): Boolean = installed

  fun configuredFamilies(): List<String> = chains.keys.toList() + families.keys.toList()

  fun resolvedDefaultFamily(): String? = activeDefaultFamily()

  fun configJSON(context: Context): String =
    runCatching {
      context.assets.open(ASSET_CONFIG).bufferedReader().use { it.readText() }
    }.getOrDefault("{\"chains\":{}}")

  /**
   * Load the embedded config and register cascaded typefaces. Idempotent.
   *
   * @param defaultFamilyOverride runtime override of the embedded default
   *   family; empty string uses the embedded value.
   * @return true if at least the config parsed successfully
   */
  fun install(
    context: Context,
    warnBelowApi29: Boolean,
    defaultFamilyOverride: String,
  ): Boolean {
    this.warnBelowApi29 = warnBelowApi29
    this.defaultFamilyOverride = defaultFamilyOverride.ifEmpty { null }
    val json = configJSON(context)
    val parsed =
      runCatching {
        val root = JSONObject(json)
        embeddedDefaultFamily = root.optString("defaultFamily").ifEmpty { null }
        val chainsObj = root.optJSONObject("chains") ?: JSONObject()
        val parsedChains = buildMap {
          for (key in chainsObj.keys()) {
            val arr = chainsObj.getJSONArray(key)
            put(key, List(arr.length()) { arr.getString(it) })
          }
        }
        val familiesObj = root.optJSONObject("families") ?: JSONObject()
        val parsedFamilies = buildMap {
          for (key in familiesObj.keys()) {
            val spec = familiesObj.getJSONObject(key)
            val faces = spec.getJSONArray("faces")
            val chain = spec.optJSONArray("chain")
            put(
              key,
              FamilySpec(
                faces = List(faces.length()) { faces.getString(it) },
                chain = if (chain == null) emptyList() else List(chain.length()) { chain.getString(it) },
              ),
            )
          }
        }
        parsedChains to parsedFamilies
      }.getOrElse {
        Log.e(TAG, "Failed to parse $ASSET_CONFIG", it)
        return false
      }

    chains = parsed.first
    families = parsed.second
    registerAll(context)
    applyDefaultFamily(context)
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
    // Multi-weight families are registered under their DISPLAY name — the string JS passes as
    // `fontFamily` — so React Native's custom-font cache hit carries every face (real weights)
    // AND the fallback chain.
    for ((familyName, spec) in families) {
      val typeface = buildFamilyTypeface(context, familyName, spec)
      if (typeface != null) {
        fontManager.addCustomFont(familyName, typeface)
      }
    }
  }

  /**
   * Build the cascaded [Typeface] for a multi-weight family: one [FontFamily] holding every face
   * (each face's weight/italic come from its file, so `Typeface.create(tf, weight)` selects the
   * real face), followed by the chain families as custom fallbacks. Returns null if no face loads.
   */
  private fun buildFamilyTypeface(
    context: Context,
    familyName: String,
    spec: FamilySpec,
  ): Typeface? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      if (warnBelowApi29) {
        Log.w(
          TAG,
          "API ${Build.VERSION.SDK_INT} < 29: multi-weight families are unavailable; " +
            "registering the first face of '$familyName' only.",
        )
      }
      return spec.faces.firstOrNull()?.let { loadBaseTypeface(context, it) }
    }

    return runCatching {
      val fonts =
        spec.faces.mapNotNull { name ->
          val font = loadFont(context, name)
          if (font == null) Log.w(TAG, "Face asset for '$name' (family '$familyName') not found.")
          font
        }
      if (fonts.isEmpty()) return null
      val familyBuilder = FontFamily.Builder(fonts.first())
      for (font in fonts.drop(1)) {
        // `addFont` rejects a face whose weight+italic duplicates one already in the family.
        runCatching { familyBuilder.addFont(font) }
          .onFailure { Log.w(TAG, "Skipping face in '$familyName': ${it.message}") }
      }
      val builder = Typeface.CustomFallbackBuilder(familyBuilder.build())
      for (fallback in spec.chain) {
        val family = loadFontFamily(context, fallback)
        if (family != null) {
          runCatching { builder.addCustomFallback(family) }
            .onFailure { Log.w(TAG, "Skipping fallback '$fallback': ${it.message}") }
        } else {
          Log.w(TAG, "Fallback font asset for '$fallback' not found.")
        }
      }
      builder.build()
    }.getOrElse {
      Log.e(TAG, "Failed to build family typeface for '$familyName'", it)
      spec.faces.firstOrNull()?.let { loadBaseTypeface(context, it) }
    }
  }

  /**
   * Make the configured default family the process-wide default typeface so
   * that bare `<Text>` (no `fontFamily`) — which React Native resolves to
   * [Typeface.DEFAULT] — renders in the default family with its fallback chain.
   *
   * React Native applies weight/italic via `Typeface.create(default, …)`, which
   * preserves the custom fallback chain, so bare bold text still works.
   *
   * Requires API 29+ (for [Typeface.CustomFallbackBuilder]) and overrides the
   * static [Typeface.DEFAULT] field via reflection. Any failure degrades to a
   * no-op with a warning — bare text simply keeps the system font.
   */
  private fun applyDefaultFamily(context: Context) {
    val defaultFamily = activeDefaultFamily() ?: return

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      if (warnBelowApi29) {
        Log.w(
          TAG,
          "API ${Build.VERSION.SDK_INT} < 29: default-family cascade is " +
            "unavailable; bare <Text> keeps the system font.",
        )
      }
      return
    }

    // A multi-weight family as the default gives bare weighted text its real faces.
    val familySpec = families[defaultFamily]
    val typeface =
      if (familySpec != null) {
        buildFamilyTypeface(context, defaultFamily, familySpec)
      } else {
        buildCascadedTypeface(context, defaultFamily, chains[defaultFamily] ?: emptyList())
      }
    if (typeface == null) {
      Log.w(TAG, "Default family '$defaultFamily' could not be loaded; skipping default.")
      return
    }

    overrideDefaultTypeface(typeface)
  }

  /**
   * Replace the static default typefaces with our cascaded [typeface] via
   * reflection so the unstyled `<Text>` path renders with the default family
   * and its fallback chain.
   *
   * We replace:
   *  - `Typeface.DEFAULT` (read by `ReactTypefaceUtils.applyStyles` for styled
   *    text with no `fontFamily`).
   *  - All four `sDefaults` style slots (NORMAL/BOLD/ITALIC/BOLD_ITALIC) with
   *    style-specific cascaded variants, used by `Typeface.create(null, style)`
   *    and by `Typeface.defaultFromStyle`.
   *
   * Each style slot is a `Typeface.create(typeface, style)` of our cascaded
   * face. Because `typeface` was built with `CustomFallbackBuilder`, the derived
   * styled typefaces retain the same custom font collection (and thus the
   * fallback chain). Best effort: any failure is logged and ignored.
   */
  private fun overrideDefaultTypeface(typeface: Typeface) {
    runCatching {
      val defaultField = Typeface::class.java.getDeclaredField("DEFAULT")
      defaultField.isAccessible = true
      defaultField.set(null, typeface)
    }.onFailure {
      Log.w(TAG, "Could not override Typeface.DEFAULT: ${it.message}")
    }

    runCatching {
      val defaultsField = Typeface::class.java.getDeclaredField("sDefaults")
      defaultsField.isAccessible = true
      @Suppress("UNCHECKED_CAST")
      val defaults = defaultsField.get(null) as? Array<Typeface?> ?: return@runCatching
      val styles =
        intArrayOf(
          Typeface.NORMAL,
          Typeface.BOLD,
          Typeface.ITALIC,
          Typeface.BOLD_ITALIC,
        )
      for (style in styles) {
        if (style < defaults.size) {
          defaults[style] = Typeface.create(typeface, style)
        }
      }
    }.onFailure {
      Log.w(TAG, "Could not override Typeface.sDefaults: ${it.message}")
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
    // Not in assets: the app may bundle this face only as an Android font RESOURCE (this is
    // what `android.skipBundlingFonts` opts into, so a face already shipped by expo-font
    // under `res/font/` is not duplicated into assets). Resolve it from resources instead.
    val resId = fontResourceId(context, name)
    if (resId != 0) {
      val font = runCatching { Font.Builder(context.resources, resId).build() }.getOrNull()
      if (font != null) return font
    }
    return null
  }

  /** The `res/font/<name>` resource id for a font base name, or 0 when absent. */
  private fun fontResourceId(context: Context, name: String): Int =
    runCatching {
      context.resources.getIdentifier(name.replace('-', '_'), "font", context.packageName)
    }.getOrDefault(0)

  private fun loadBaseTypeface(context: Context, name: String): Typeface? {
    for (ext in arrayOf("ttf", "otf")) {
      val path = "$FONTS_DIR/$name.$ext"
      val tf =
        runCatching { Typeface.createFromAsset(context.assets, path) }.getOrNull()
      if (tf != null) return tf
    }
    // See `loadFont`: fall back to the `res/font/` resource for faces bundled only there.
    val resId = fontResourceId(context, name)
    if (resId != 0) {
      val tf = runCatching { context.resources.getFont(resId) }.getOrNull()
      if (tf != null) return tf
    }
    return null
  }

  // MARK: Glyph coverage (checkText)

  fun coverageReport(context: Context, text: String, baseFamily: String): String {
    val familySpec = families[baseFamily]
    val chain =
      if (familySpec != null) familySpec.faces + familySpec.chain
      else listOf(baseFamily) + (chains[baseFamily] ?: emptyList())
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
