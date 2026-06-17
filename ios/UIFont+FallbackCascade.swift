import UIKit

extension UIFont {
  /// Returns a copy of the receiver with the given fallback families attached
  /// as its `cascadeList`. The point size, weight and traits of the receiver
  /// are preserved; only the fallback behavior for uncovered glyphs changes.
  ///
  /// Fallback families that cannot be resolved to a font are skipped. If none
  /// resolve, the receiver is returned unchanged.
  func addingFallbackCascade(_ fallbackFamilies: [String]) -> UIFont {
    let fallbackDescriptors: [UIFontDescriptor] = fallbackFamilies.compactMap {
      family in
      // Resolve by exact font name first (handles PostScript names), then by
      // family name (handles "Noto Sans CJK SC" style family lookups).
      let resolved: UIFontDescriptor
      if let byName = UIFont(name: family, size: pointSize) {
        resolved = byName.fontDescriptor
      } else {
        resolved = UIFontDescriptor(fontAttributes: [.family: family])
      }
      // Pin each fallback to an empty cascade list. A descriptor built from a
      // resolved UIFont carries an implicit *system* cascade; without this,
      // CoreText diverts to the system font as soon as one cascade entry lacks
      // a glyph — never reaching the later bundled entries (e.g. a final
      // "last resort" face). An empty list forces CoreText to keep walking our
      // explicit chain in order.
      return resolved.addingAttributes([.cascadeList: [UIFontDescriptor]()])
    }

    guard !fallbackDescriptors.isEmpty else {
      return self
    }

    let newDescriptor = fontDescriptor.addingAttributes([
      .cascadeList: fallbackDescriptors
    ])
    // `UIFont(descriptor:size:)` is *non-failable* in its type signature but can
    // still hand back a font that React Native cannot survive: RN re-resolves the
    // returned font through `+[UIFont fontWithDescriptor:size:]` after bolting on
    // a synthetic italic/condensed trait (RCTFontUtils.mm), and a descriptor that
    // carries our custom `.cascadeList` plus a forced trait can fail that match
    // and yield `nil` — which RN then stores into an `NSCache` without a guard,
    // raising `NSInvalidArgumentException` and aborting the process during draw.
    //
    // We cannot patch RN's prebuilt core, so we make this side self-validating:
    // probe the exact re-resolution RN will perform (add italic, add condensed)
    // and, if either probe produces no usable face, return the ORIGINAL receiver
    // unchanged. Losing the cascade on a font that can't carry it safely is
    // strictly better than handing RN a font that crashes it. The common case
    // (upright Latin/CJK faces) keeps the cascade exactly as before.
    let candidate = UIFont(descriptor: newDescriptor, size: pointSize)
    guard candidateSurvivesReResolution(candidate, size: pointSize) else {
      return self
    }
    return candidate
  }

  /// Mirrors the synthetic re-resolution React Native performs on the resolved
  /// font (RCTFontUtils.mm `RCTDefaultFontWithFontProperties`): for an italic or
  /// condensed request it does
  ///
  ///   d = [font.fontDescriptor fontDescriptorWithSymbolicTraits: traits|extra];
  ///   font = [UIFont fontWithDescriptor:d size:size];   // may be nil → crash
  ///
  /// Both ObjC calls are nullable and a `nil` from either is what RN stuffs into
  /// its `NSCache`, aborting the app. We therefore reproduce both calls and
  /// require a *concretely matchable* result. Note `UIFont(descriptor:size:)` is
  /// imported into Swift as NON-failable, so a bare `!= nil` would be dead code;
  /// we instead confirm the augmented descriptor still matches a real installed
  /// face via `matchingFontDescriptors`, which is exactly the resolution
  /// `fontWithDescriptor:` performs and returns empty for when RN would get nil.
  static func reResolutionIsSafe(
    descriptor: UIFontDescriptor,
    size: CGFloat
  ) -> Bool {
    let probeTraits: [UIFontDescriptor.SymbolicTraits] = [.traitItalic, .traitCondensed]
    for trait in probeTraits {
      // RN: `fontDescriptorWithSymbolicTraits:`. Failable in ObjC and Swift.
      guard let augmented = descriptor.withSymbolicTraits(
        descriptor.symbolicTraits.union(trait)
      ) else {
        return false
      }
      // RN: `+[UIFont fontWithDescriptor:size:]`. Returns nil in ObjC when the
      // augmented descriptor matches no installed face. Swift hides that nil, so
      // assert matchability directly: an empty match set is RN's nil case.
      if augmented.matchingFontDescriptors(withMandatoryKeys: nil).isEmpty {
        return false
      }
    }
    return true
  }

  private func candidateSurvivesReResolution(
    _ font: UIFont,
    size: CGFloat
  ) -> Bool {
    UIFont.reResolutionIsSafe(descriptor: font.fontDescriptor, size: size)
  }
}
