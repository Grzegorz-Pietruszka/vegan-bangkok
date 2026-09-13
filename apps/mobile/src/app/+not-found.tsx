import { Link, Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useColors } from '@/theme/useTheme';

export default function NotFound() {
  const colors = useColors();
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.screen}>
        <ThemedText>This screen does not exist.</ThemedText>
        <Link href="/"><ThemedText color={colors.primary}>Go home</ThemedText></Link>
      </View>
    </>
  );
}
const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 } });
