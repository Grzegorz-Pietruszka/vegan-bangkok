import { View, StyleSheet } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { PlacesMap } from '@/map/PlacesMap';

// expo-router renders this if anything under the route throws while rendering — a runtime
// map/render error degrades to a message instead of a blank/crashed tab. (The token-missing
// case is already handled inside PlacesMap by its own fallback view.)
export function ErrorBoundary({ error }: ErrorBoundaryProps) {
  return (
    <View style={styles.error}>
      <ThemedText>Map failed to load: {error.message}</ThemedText>
    </View>
  );
}

export default function MapScreen() {
  return (
    <View style={styles.root}>
      <PlacesMap />
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
