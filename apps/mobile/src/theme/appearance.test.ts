import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { loadAppearancePref, setAppearancePref } from './appearance';

beforeEach(() => AsyncStorage.clear());

test('round-trips a manual pref and applies it', async () => {
  const spy = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  await setAppearancePref('dark');
  expect(spy).toHaveBeenCalledWith('dark');
  expect(await loadAppearancePref()).toBe('dark');
  await setAppearancePref(null);   // back to system
  expect(spy).toHaveBeenCalledWith('unspecified');
  expect(await loadAppearancePref()).toBeNull();
});

test('corrupt stored value falls back to system', async () => {
  await AsyncStorage.setItem('appearance_pref', 'purple');
  expect(await loadAppearancePref()).toBeNull();
});
