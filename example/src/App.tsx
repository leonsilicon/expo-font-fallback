import { useState } from 'react';
import { Text, View, StyleSheet, ScrollView, Button } from 'react-native';
import { FontFallback, type GlyphCoverageReport } from 'expo-font-fallback';

// Activate the fallback chains before the first render.
const installed = FontFallback.install({
  warnOnMissingGlyphs: __DEV__,
  logResolvedFonts: __DEV__,
});

const SAMPLE = 'Hello 你好 こんにちは 안녕하세요 ∑ → ★';

export default function App() {
  const [report, setReport] = useState<GlyphCoverageReport | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>install() returned: {String(installed)}</Text>
      <Text style={styles.label}>
        isInstalled(): {String(FontFallback.isInstalled())}
      </Text>

      <Text style={styles.heading}>Inter-Regular (with fallback)</Text>
      <Text style={[styles.sample, { fontFamily: 'Inter-Regular' }]}>
        {SAMPLE}
      </Text>

      <Text style={styles.heading}>Inter-Bold (with fallback)</Text>
      <Text style={[styles.sample, { fontFamily: 'Inter-Bold' }]}>
        {SAMPLE}
      </Text>

      <Text style={styles.heading}>System font (control)</Text>
      <Text style={styles.sample}>{SAMPLE}</Text>

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
