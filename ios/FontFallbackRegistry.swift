import UIKit
import CoreText

/// Process-wide store of the configured fallback chains and the entry point
/// used by the dyld interpose to wrap fonts that React Native resolves.
///
/// The registry is keyed by the *base family name* exactly as it appears in a
/// `<Text style={{ fontFamily }}>`. When React Native resolves a font for one
/// of these families, `wrap(_:baseFamily:)` re-attaches the fallback cascade
/// that the system would otherwise strip when reconstructing the font by name.
@objc(FFFontFallbackRegistry)
public final class FontFallbackRegistry: NSObject {
  @objc(sharedRegistry)
  public static let shared = FontFallbackRegistry()

  private let lock = NSLock()
  private var chains: [String: [String]] = [:]
  private var cache: [String: UIFont] = [:]
  private(set) var installed = false
  @objc public var warnOnMissingGlyphs = false

  /// The app-wide default family embedded by the config plugin (a PostScript
  /// name), applied to text that specifies no `fontFamily`. `nil` when unset.
  private var embeddedDefaultFamily: String?
  /// Optional runtime override of `embeddedDefaultFamily`.
  private var defaultFamilyOverride: String?
  /// The effective default family: override if set, else the embedded value.
  private var activeDefaultFamily: String? {
    defaultFamilyOverride ?? embeddedDefaultFamily
  }

  private override init() {}

  // MARK: Configuration

  /// Replace the configured chains and default family. Clears the cache.
  func configure(chains: [String: [String]], defaultFamily: String?) {
    lock.lock()
    defer { lock.unlock() }
    self.chains = chains
    self.embeddedDefaultFamily =
      (defaultFamily?.isEmpty == false) ? defaultFamily : nil
    self.cache.removeAll()
    self.installed = true
  }

  @objc public func configure(withChainsJSON json: String) -> Bool {
    guard
      let data = json.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let rawChains = root["chains"] as? [String: [String]]
    else {
      return false
    }
    configure(chains: rawChains, defaultFamily: root["defaultFamily"] as? String)
    return true
  }

  /// Set a runtime override of the embedded default family. An empty string
  /// clears the override so the embedded value is used.
  @objc public func setDefaultFamilyOverride(_ family: String) {
    lock.lock()
    defer { lock.unlock() }
    defaultFamilyOverride = family.isEmpty ? nil : family
    cache.removeAll()
  }

  /// The effective default family (override or embedded), for diagnostics.
  @objc public func resolvedDefaultFamily() -> String? {
    lock.lock(); defer { lock.unlock() }
    return activeDefaultFamily
  }

  @objc public func isInstalled() -> Bool {
    lock.lock(); defer { lock.unlock() }
    return installed
  }

  @objc public func configuredFamilies() -> [String] {
    lock.lock(); defer { lock.unlock() }
    return Array(chains.keys)
  }

  /// Returns the chain for `baseFamily`, or nil if none is configured.
  func chain(for baseFamily: String) -> [String]? {
    lock.lock(); defer { lock.unlock() }
    return chains[baseFamily]
  }

  // MARK: Explicit-family cascade (called from the text-layout swizzle)

  /// If `font` belongs to a family that has a configured chain, return a copy of
  /// `font` with that chain attached as its cascade list; otherwise return nil.
  ///
  /// Used to post-process the fonts React Native resolves for `<Text>` that set
  /// an explicit `fontFamily` (which never reach the default font resolver).
  /// Matching is by the font's PostScript name — the same key space as the
  /// emitted iOS chains. Results are cached.
  @objc(cascadeFontForFont:)
  public func cascadeFont(for font: UIFont) -> UIFont? {
    let psName = font.fontName

    lock.lock()
    guard let fallbacks = chains[psName] else {
      lock.unlock()
      return nil
    }
    let key = "__explicit__|" + cacheKey(family: psName, size: font.pointSize,
                                         weight: referenceWeight(of: font),
                                         italic: isItalic(font))
    if let cached = cache[key] {
      lock.unlock()
      return cached
    }
    lock.unlock()

    let wrapped = font.addingFallbackCascade(fallbacks)

    lock.lock()
    cache[key] = wrapped
    lock.unlock()
    return wrapped
  }

  private func referenceWeight(of font: UIFont) -> CGFloat {
    guard
      let traits = font.fontDescriptor.object(forKey: .traits)
        as? [UIFontDescriptor.TraitKey: Any],
      let raw = traits[.weight] as? CGFloat
    else {
      return UIFont.Weight.regular.rawValue
    }
    return raw
  }

  private func isItalic(_ font: UIFont) -> Bool {
    return font.fontDescriptor.symbolicTraits.contains(.traitItalic)
  }

  // MARK: Default font resolution (called from RCTSetDefaultFontResolver)

  /// Produce the font React Native should use for text with **no** explicit
  /// `fontFamily`, applying the configured `defaultFamily` and its cascade.
  ///
  /// Returns the default family's face at the requested weight/italic with its
  /// fallback chain attached, or `nil` when no default family is configured (or
  /// it cannot be resolved) so React Native uses its own system font.
  ///
  /// React Native only consults this for the default/system-font branch;
  /// explicit families are resolved by RN directly and never reach here.
  @objc(defaultFontWithSize:weight:italic:)
  public func defaultFont(
    size: CGFloat,
    weight: CGFloat,
    italic: Bool
  ) -> UIFont? {
    lock.lock()
    guard let defaultFamily = activeDefaultFamily else {
      lock.unlock()
      return nil
    }

    let key = cacheKey(
      family: defaultFamily, size: size, weight: weight, italic: italic
    )
    if let cached = cache[key] {
      lock.unlock()
      return cached
    }
    lock.unlock()

    // Build the default-family face at the requested traits.
    guard let base = makeFont(
      family: defaultFamily, size: size, weight: weight, italic: italic
    ) else {
      // Configured default family does not resolve to a registered font.
      return nil
    }

    // A default configured as a multi-weight FAMILY (display name) has no chain of its own —
    // its chains are keyed by each face's PostScript name — so look the resolved face up too.
    lock.lock()
    let fallbacks = chains[defaultFamily] ?? chains[base.fontName] ?? []
    lock.unlock()

    let result = fallbacks.isEmpty ? base : base.addingFallbackCascade(fallbacks)

    // Final safety gate before handing the font back to React Native. RN's
    // `RCTDefaultFontWithFontProperties` re-resolves whatever we return through
    // `+[UIFont fontWithDescriptor:size:]` after adding a synthetic italic or
    // condensed trait, then stores the result into an `NSCache` WITHOUT a nil
    // check — a `nil` there raises `NSInvalidArgumentException` and aborts the
    // app mid-draw. Returning `nil` from this resolver is safe (RN falls through
    // to `RCTGetLegacyDefaultFont` and then `+[UIFont systemFontOfSize:weight:]`,
    // RCTFontUtils.mm:285,289), so if our font would not survive that
    // re-resolution we yield `nil` instead of crashing the host app.
    //
    // Relative, not absolute: a face with no italic/condensed variant fails the
    // probe on its own merits (`base` already fails it), and bailing to nil
    // there would drop the configured default family for every such font —
    // including our CJK faces — rather than only when the CASCADE is what
    // breaks re-resolution. Yield nil only when attaching the chain is the
    // regression. Matching `addingFallbackCascade`, this is judged per trait.
    guard UIFont.cascadeIsNonRegressive(
      original: base.fontDescriptor,
      candidate: result.fontDescriptor,
      size: result.pointSize
    ) else {
      return nil
    }

    // Separately: RN takes its crashing branch only for an ITALIC (or condensed)
    // request, and for that branch it re-resolves whatever we return. A face
    // with no italic variant — every CJK face we ship — makes that re-resolution
    // yield `nil` with or without a cascade, so the gate above (which is
    // deliberately relative) cannot catch it. It is not a regression we cause,
    // but we are the ones handing RN the font, so we decline the request rather
    // than supply one we know aborts the app. Returning nil is safe here: RN
    // falls through to its own system font, which does synthesise italic.
    if italic, !UIFont.italicReResolutionIsSafe(
      descriptor: result.fontDescriptor, size: result.pointSize
    ) {
      return nil
    }

    lock.lock()
    cache[key] = result
    lock.unlock()
    return result
  }

  /// Build a font in `family` at the given size, weight and italic. Falls back
  /// to the nearest available weight when an exact face is not registered.
  /// Returns nil if `family` resolves to no real font.
  private func makeFont(
    family: String,
    size: CGFloat,
    weight: CGFloat,
    italic: Bool
  ) -> UIFont? {
    var traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
    if italic {
      traits[.symbolic] = UIFontDescriptor.SymbolicTraits.traitItalic.rawValue
    }
    let descriptor = UIFontDescriptor(fontAttributes: [
      .family: family,
      .traits: traits,
    ])
    // `.family` matching handles real family names; if the configured name is a
    // PostScript name (common for CJK faces), fall back to exact-name lookup.
    if let matched = descriptor.matchingFontDescriptors(withMandatoryKeys: [.family]).first {
      return UIFont(descriptor: matched, size: size)
    }
    if let byName = UIFont(name: family, size: size) {
      return byName
    }
    return nil
  }

  private func cacheKey(
    family: String, size: CGFloat, weight: CGFloat, italic: Bool
  ) -> String {
    return "\(family)|\(size)|\(weight)|\(italic ? 1 : 0)"
  }

  // MARK: Glyph coverage (checkText)

  /// Build a `GlyphCoverageReport`-shaped dictionary for `text` against
  /// `baseFamily` and its configured chain.
  @objc(coverageReportForText:baseFamily:)
  public func coverageReport(text: String, baseFamily: String) -> [String: Any] {
    let chainFamilies = [baseFamily] + (chain(for: baseFamily) ?? [])
    let size: CGFloat = 16
    let fonts: [(String, CTFont)] = chainFamilies.compactMap { family in
      guard let f = UIFont(name: family, size: size) else { return nil }
      return (family, f as CTFont)
    }

    var coveredBy: [String: String] = [:]
    var missing: [[String: String]] = []

    for scalar in text.unicodeScalars {
      // Skip whitespace/control characters from the report.
      if scalar.properties.isWhitespace { continue }
      let char = String(scalar)
      var covered = false
      for (family, ctFont) in fonts {
        if fontHasGlyph(ctFont, for: scalar) {
          coveredBy[char] = family
          covered = true
          break
        }
      }
      if !covered {
        missing.append([
          "char": char,
          "codepoint": String(format: "U+%04X", scalar.value),
        ])
      }
    }

    return [
      "baseFamily": baseFamily,
      "missingCodepoints": missing,
      "coveredBy": coveredBy,
    ]
  }

  private func fontHasGlyph(_ font: CTFont, for scalar: Unicode.Scalar) -> Bool {
    var chars = Array(String(scalar).utf16)
    var glyphs = [CGGlyph](repeating: 0, count: chars.count)
    let ok = CTFontGetGlyphsForCharacters(font, &chars, &glyphs, chars.count)
    // For a non-BMP scalar, `chars` is a surrogate pair: CoreText returns the
    // composed glyph in the first slot and 0 in the trailing slot. A scalar is
    // covered iff its leading glyph is non-zero (requiring *all* slots non-zero
    // would wrongly flag every astral-plane codepoint as missing).
    return ok && (glyphs.first ?? 0) != 0
  }
}
