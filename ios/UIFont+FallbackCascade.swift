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
    // and, if attaching the cascade is what breaks that probe, return the
    // ORIGINAL receiver unchanged. Losing the cascade on a font that can't carry
    // it safely is strictly better than handing RN a font that crashes it.
    //
    // The comparison is RELATIVE and evaluated PER TRAIT. Many bundled faces
    // (our CJK ones included) ship no italic/condensed variant at all, so a
    // trait probe fails for them whether or not a cascade is attached; an
    // absolute "must survive every trait" gate therefore rejected EVERY such
    // face and silently disabled fallback app-wide, which is how rare CJK
    // glyphs ended up drawn by the system font / LastResort instead of the
    // Regular face that carries them.
    //
    // Per trait is what makes this both safe and non-regressive. Bailing out
    // wholesale the moment the bare receiver fails ANY trait would hand RN the
    // unvalidated cascade font — and the two probes are not interchangeable:
    // `matchingFontDescriptors` (what we probe with) is stricter than
    // `fontWithDescriptor:` (what RN actually calls), so a face can fail our
    // bare probe while RN still resolves it fine, then return nil once the
    // cascade is attached. That nil is exactly the unguarded `NSCache` insert
    // that aborts the app mid-draw. So we only ever excuse a trait the receiver
    // ALREADY fails, and never skip validating the candidate itself.
    let candidate = UIFont(descriptor: newDescriptor, size: pointSize)
    guard UIFont.cascadeIsNonRegressive(
      original: fontDescriptor,
      candidate: candidate.fontDescriptor,
      size: pointSize
    ) else {
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
    probeTraits.allSatisfy { trait in
      reResolutionIsSafe(descriptor: descriptor, addingTrait: trait)
    }
  }

  /// The synthetic traits RN may bolt on (RCTFontUtils.mm gates on
  /// `isItalicFont || isCondensedFont`).
  private static let probeTraits: [UIFontDescriptor.SymbolicTraits] =
    [.traitItalic, .traitCondensed]

  /// Single-trait form of the probe above — the primitive both the absolute and
  /// the relative gate are built from.
  private static func reResolutionIsSafe(
    descriptor: UIFontDescriptor,
    addingTrait trait: UIFontDescriptor.SymbolicTraits
  ) -> Bool {
    // RN: `fontDescriptorWithSymbolicTraits:`. Failable in ObjC and Swift.
    guard let augmented = descriptor.withSymbolicTraits(
      descriptor.symbolicTraits.union(trait)
    ) else {
      return false
    }
    // RN: `+[UIFont fontWithDescriptor:size:]`. Returns nil in ObjC when the
    // augmented descriptor matches no installed face. Swift hides that nil, so
    // assert matchability directly: an empty match set is RN's nil case.
    return !augmented.matchingFontDescriptors(withMandatoryKeys: nil).isEmpty
  }

  /// True when RN can re-resolve `descriptor` with a synthetic italic trait
  /// without receiving `nil` (the unguarded `NSCache` insert that aborts the
  /// app). Italic only, deliberately: `.traitCondensed` matches no installed
  /// face on iOS for effectively any family, so probing it here would reject
  /// everything — it is meaningful only in the relative comparison below, where
  /// both sides fail it equally and it cancels out.
  static func italicReResolutionIsSafe(
    descriptor: UIFontDescriptor,
    size: CGFloat
  ) -> Bool {
    reResolutionIsSafe(descriptor: descriptor, addingTrait: .traitItalic)
  }

  /// True when attaching the cascade does not make RN's re-resolution any more
  /// likely to yield `nil` than the bare font already would.
  ///
  /// Evaluated per trait: a trait the ORIGINAL already fails is excused (the
  /// face simply has no such variant — RN would have produced the same nil with
  /// or without us), but a trait the original passes and the CANDIDATE fails is
  /// a regression we caused, and returning that font would abort the app.
  static func cascadeIsNonRegressive(
    original: UIFontDescriptor,
    candidate: UIFontDescriptor,
    size: CGFloat
  ) -> Bool {
    probeTraits.allSatisfy { trait in
      // Excused: the bare face cannot carry this trait either.
      guard reResolutionIsSafe(descriptor: original, addingTrait: trait) else {
        return true
      }
      // The original survives this trait, so the candidate must too.
      return reResolutionIsSafe(descriptor: candidate, addingTrait: trait)
    }
  }
}
