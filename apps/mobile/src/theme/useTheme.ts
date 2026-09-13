import { useColorScheme } from 'react-native';
import { themes, type Colors } from './tokens';

export function useColors(): Colors {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

// Wrap a colors→styles factory: both sheets built once at module load, the
// returned hook just picks per scheme. Usage:
//   const useStyles = makeThemedStyles((colors) => StyleSheet.create({ ... }));
export function makeThemedStyles<T>(make: (colors: Colors) => T): () => T {
  const sheets = { light: make(themes.light), dark: make(themes.dark) };
  return function useThemedStyles() {
    return sheets[useColorScheme() === 'dark' ? 'dark' : 'light'];
  };
}
