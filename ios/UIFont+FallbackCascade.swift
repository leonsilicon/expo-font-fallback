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
    return UIFont(descriptor: newDescriptor, size: pointSize)
  }
}
