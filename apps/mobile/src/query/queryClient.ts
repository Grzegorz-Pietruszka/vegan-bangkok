import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import * as Network from 'expo-network';

export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
export const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: PERSIST_MAX_AGE, staleTime: 1000 * 60 * 5, retry: 2 } },
});
export const asyncStoragePersister = createAsyncStoragePersister({ storage: AsyncStorage, throttleTime: 1000 });

// RN has no browser online events — wire expo-network or offline-pause never triggers.
onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(!!s.isConnected));
  // Cold-boot seed: the listener fires only on CHANGE, so a cold offline launch would
  // otherwise default to online=true and fire doomed fetches. Seed the initial state once.
  Network.getNetworkStateAsync().then((s) => setOnline(!!s.isConnected)).catch(() => {});
  return sub.remove; // return the fn, don't call it
});
