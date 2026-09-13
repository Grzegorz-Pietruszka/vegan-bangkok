import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import { themes } from './tokens';
import { useColors, makeThemedStyles } from './useTheme';

jest.mock('react-native/Libraries/Utilities/useColorScheme');
const mockScheme = useColorScheme as jest.Mock;

test('light and dark palettes expose the same tokens', () => {
  expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
});

test('useColors follows the system scheme (null → light)', async () => {
  mockScheme.mockReturnValue('dark');
  expect((await renderHook(() => useColors())).result.current).toBe(themes.dark);
  mockScheme.mockReturnValue(null);
  expect((await renderHook(() => useColors())).result.current).toBe(themes.light);
});

test('makeThemedStyles builds one sheet per scheme', async () => {
  const useStyles = makeThemedStyles((colors) => ({ root: { backgroundColor: colors.bg } }));
  mockScheme.mockReturnValue('dark');
  expect((await renderHook(() => useStyles())).result.current.root.backgroundColor).toBe(themes.dark.bg);
  mockScheme.mockReturnValue('light');
  expect((await renderHook(() => useStyles())).result.current.root.backgroundColor).toBe(themes.light.bg);
});
