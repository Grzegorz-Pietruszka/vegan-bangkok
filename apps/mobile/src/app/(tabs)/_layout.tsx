import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { type ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/theme/useTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// ponytail: temporary tab icons — swap the glyph (or icon family) here when final art lands
const icon = (on: IoniconName, off: IoniconName) => {
  const TabIcon = ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? on : off} size={size} color={color} />
  );
  return TabIcon;
};

export default function TabsLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.explore'), tabBarIcon: icon('compass', 'compass-outline') }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: t('tabs.map'), tabBarIcon: icon('map', 'map-outline') }}
      />
      <Tabs.Screen
        name="tour"
        options={{ title: t('tabs.tour'), tabBarIcon: icon('walk', 'walk-outline') }}
      />
      <Tabs.Screen
        name="passport"
        options={{ title: t('tabs.passport'), tabBarIcon: icon('ribbon', 'ribbon-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}
