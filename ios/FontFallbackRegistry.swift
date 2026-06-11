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

  private override init() {}

  // MARK: Configuration

  /// Replace the configured chains. Clears the wrapped-font cache.
  func configure(chains: [String: [String]]) {
    lock.lock()
    defer { lock.unlock() }
    self.chains = chains
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
    configure(chains: rawChains)
    return true
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

  // MARK: Font wrapping (called from the dyld interpose)

  /// If `baseFamily` has a configured chain, return `font` with that chain
  /// attached as its cascade list; otherwise return `font` unchanged.
  ///
  /// This is the hot path: it runs for every font React Native resolves, so
  /// results are cached by family + size + traits.
  @objc(wrapFont:baseFamily:)
  public func wrap(_ font: UIFont, baseFamily: String?) -> UIFont {
    guard let baseFamily, !baseFamily.isEmpty else { return font }

    let fallbacks: [String]
    lock.lock()
    guard let configured = chains[baseFamily] else {
      lock.unlock()
      return font
    }
    fallbacks = configured

    let key = cacheKey(baseFamily: baseFamily, font: font)
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

  private func cacheKey(baseFamily: String, font: UIFont) -> String {
    let traits = font.fontDescriptor.symbolicTraits.rawValue
    return "\(baseFamily)|\(font.pointSize)|\(traits)"
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
    return ok && glyphs.allSatisfy { $0 != 0 }
  }
}
