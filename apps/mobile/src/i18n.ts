import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },   // th added later — that's the whole migration
  lng: getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],                     // add 'th' the day th.json lands
  interpolation: { escapeValue: false },
  returnNull: false,
});
export default i18n;
