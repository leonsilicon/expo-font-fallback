import { useState } from 'react';
import { Text, View, StyleSheet, ScrollView, Button } from 'react-native';
import { FontFallback, type GlyphCoverageReport } from 'expo-font-fallback';

// Activate the fallback chains before the first render.
const installed = FontFallback.install({
  warnOnMissingGlyphs: __DEV__,
  logResolvedFonts: __DEV__,
});

const SAMPLE = 'Hello 你好 こんにちは 안녕하세요 ∑ → ★';

// Codepoints in exotic Unicode blocks that neither Inter nor Noto Sans SC
// cover (Egyptian Hieroglyphs, Linear B, Deseret). With the Last Resort font
// as the final cascade entry these render block-hint glyphs (a boxed symbol),
// proving the cascade reached our bundled font instead of the OS system font.
const LAST_RESORT_SAMPLE = '𓀀 𐀀 𐐀';

export default function App() {
  const [report, setReport] = useState<GlyphCoverageReport | null>(null);
  const defaultFamily = FontFallback.getConfig().defaultFamily ?? '(none)';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>install() returned: {String(installed)}</Text>
      <Text style={styles.label}>
        isInstalled(): {String(FontFallback.isInstalled())}
      </Text>
      <Text style={styles.label}>defaultFamily: {defaultFamily}</Text>

      <Text style={styles.heading}>Inter-Regular (with fallback)</Text>
      <Text style={[styles.sample, { fontFamily: 'Inter-Regular' }]}>
        {SAMPLE}
      </Text>

      <Text style={styles.heading}>Inter-Bold (with fallback)</Text>
      <Text style={[styles.sample, { fontFamily: 'Inter-Bold' }]}>
        {SAMPLE}
      </Text>

      <Text style={styles.heading}>Bare Text (no fontFamily → default)</Text>
      <Text style={styles.sample}>{SAMPLE}</Text>

      <Text style={styles.heading}>
        Bare bold Text (no fontFamily → default)
      </Text>
      <Text style={[styles.sample, { fontWeight: 'bold' }]}>{SAMPLE}</Text>

      <Text style={styles.heading}>
        Last Resort (Inter-Regular → uncovered glyphs)
      </Text>
      <Text style={[styles.sample, { fontFamily: 'Inter-Regular' }]}>
        {LAST_RESORT_SAMPLE}
      </Text>

      <Text style={styles.heading}>Last Resort (bare → default chain)</Text>
      <Text style={styles.sample}>{LAST_RESORT_SAMPLE}</Text>

      <Text style={styles.heading}>
        Last Resort (bare BOLD → default chain)
      </Text>
      <Text style={[styles.sample, { fontWeight: 'bold' }]}>
        {LAST_RESORT_SAMPLE}
      </Text>

      <Text style={styles.heading}>
        CONTROL: forced fontFamily LastResort-Regular
      </Text>
      <Text style={[styles.sample, { fontFamily: 'LastResort-Regular' }]}>
        {LAST_RESORT_SAMPLE}
      </Text>

      <View style={styles.spacer} />
      <Button
        title="checkText(sample, Inter-Regular)"
        onPress={() =>
          setReport(FontFallback.checkText(SAMPLE, 'Inter-Regular'))
        }
      />
      {report != null && (
        <Text style={styles.report}>{JSON.stringify(report, null, 2)}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 80,
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#555',
  },
  heading: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  sample: {
    fontSize: 28,
  },
  spacer: {
    height: 24,
  },
  report: {
    marginTop: 12,
    fontFamily: 'Courier',
    fontSize: 12,
  },
});
