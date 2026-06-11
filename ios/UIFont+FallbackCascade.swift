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
      if let byName = UIFont(name: family, size: pointSize) {
        return byName.fontDescriptor
      }
      let familyDescriptor = UIFontDescriptor(
        fontAttributes: [.family: family]
      )
      return familyDescriptor
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
