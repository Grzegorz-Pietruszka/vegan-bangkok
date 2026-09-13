import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { Animated, StyleSheet } from 'react-native';
import VendorCard from '@/app/vendor/[id]';
import { dishesSeed } from '@/data/dishes.seed';
import { coachLines } from '@/lib/coach';
import { spacing } from '@/theme/tokens';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'c74cef79-43da-43cf-a72a-df3bf7e42b46' }),
  useRouter: () => ({ back: jest.fn() }),
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
}));
jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn(async () => 0.5),
  setBrightnessAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: jest.fn(async () => undefined),
}));
jest.mock('@/passport/stamps', () => ({ addStamp: jest.fn(async () => []) }));
jest.mock('expo-status-bar', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    StatusBar: ({ style }: { style?: string }) => React.createElement(View, {
      testID: 'vendor-status-bar',
      accessibilityLabel: `status-${style}`,
    }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 11, right: 13, bottom: 17, left: 19 }),
}));

const dish = dishesSeed.find((candidate) => candidate.id === 'c74cef79-43da-43cf-a72a-df3bf7e42b46')!;
const coach = coachLines(dish);

let parallelSpy: jest.SpiedFunction<typeof Animated.parallel>;

beforeEach(() => {
  parallelSpy = jest.spyOn(Animated, 'parallel').mockImplementation((animations) => ({
    start: (callback) => {
      animations.forEach((animation) => animation.start());
      callback?.({ finished: true });
    },
    stop: () => animations.forEach((animation) => animation.stop()),
    reset: () => animations.forEach((animation) => animation.reset()),
  }));
});

afterEach(() => jest.restoreAllMocks());

function backgroundWrapper(compactCard: TestInstance): TestInstance {
  let node: TestInstance | null = compactCard;
  while (node && node.props.accessibilityElementsHidden === undefined) node = node.parent;
  if (!node) throw new Error('vendor screen accessibility wrapper not found');
  return node;
}

function findDescendant(
  node: TestInstance,
  predicate: (candidate: TestInstance) => boolean,
): TestInstance | null {
  if (predicate(node)) return node;
  for (const child of node.children) {
    if (typeof child !== 'string') {
      const match = findDescendant(child, predicate);
      if (match) return match;
    }
  }
  return null;
}

async function openCard(): Promise<TestInstance> {
  await fireEvent.press(screen.getByTestId('vendor-card'));
  return screen.getByTestId('vendor-card-fullscreen');
}

function gestureEvents(gestureState: { dx: number; dy: number; vy: number }) {
  const duration = gestureState.vy === 0 ? 16 : Math.abs(gestureState.dy / gestureState.vy);
  const touchHistory = (currentPageX: number, currentPageY: number, currentTimeStamp: number) => ({
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: currentTimeStamp,
    touchBank: [{
      touchActive: true,
      startPageX: 0,
      startPageY: 0,
      startTimeStamp: 0,
      previousPageX: 0,
      previousPageY: 0,
      previousTimeStamp: 0,
      currentPageX,
      currentPageY,
      currentTimeStamp,
    }],
  });
  const startEvent = {
    nativeEvent: { touches: [{}] },
    touchHistory: touchHistory(0, 0, 0),
  };
  const releaseEvent = {
    nativeEvent: { touches: [] },
    touchHistory: touchHistory(gestureState.dx, gestureState.dy, duration),
  };

  return { startEvent, releaseEvent };
}

async function moveCard(gestureState: { dx: number; dy: number; vy: number }): Promise<void> {
  const overlay = screen.getByTestId('vendor-card-fullscreen');
  const { startEvent, releaseEvent } = gestureEvents(gestureState);

  await fireEvent(overlay, 'responderGrant', startEvent, gestureState);
  await fireEvent(overlay, 'responderMove', releaseEvent, gestureState);
}

async function releaseCard(gestureState: { dx: number; dy: number; vy: number }): Promise<void> {
  const overlay = screen.getByTestId('vendor-card-fullscreen');
  const { releaseEvent } = gestureEvents(gestureState);

  await moveCard(gestureState);
  await fireEvent(overlay, 'responderRelease', releaseEvent, gestureState);
}

test('opens full screen and hides the background accessibility tree', async () => {
  await render(<VendorCard />);

  expect(screen.queryByTestId('vendor-card-fullscreen')).toBeNull();
  expect(backgroundWrapper(screen.getByTestId('vendor-card')).props).toMatchObject({
    accessibilityElementsHidden: false,
    importantForAccessibility: 'auto',
  });

  await openCard();

  expect(backgroundWrapper(screen.getByTestId('vendor-card', { includeHiddenElements: true })).props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
});

test('full-screen card repeats the real Thai dish and vegan exclusion instructions', async () => {
  await render(<VendorCard />);
  const overlay = await openCard();

  expect(within(overlay).getByText(`${dish.nameTh}เจ`)).toBeOnTheScreen();
  expect(within(overlay).getByText(`✕ ${coach.avoid[0].thai}`)).toBeOnTheScreen();
  expect(within(overlay).getByText(coach.avoid[0].english)).toBeOnTheScreen();
});

test('full-screen content pads every edge by the safe-area inset', async () => {
  await render(<VendorCard />);
  const overlay = await openCard();
  const content = findDescendant(overlay, (node) => (
    StyleSheet.flatten(node.props.style)?.paddingTop === 11 + spacing.xxl
  ));

  expect(content).not.toBeNull();
  expect(content).toHaveStyle({
    paddingTop: 11 + spacing.xxl,
    paddingRight: 13 + spacing.xxl,
    paddingBottom: 17 + spacing.xxl,
    paddingLeft: 19 + spacing.xxl,
  });
});

test('a tap release dismisses the full-screen card', async () => {
  await render(<VendorCard />);
  await openCard();

  await releaseCard({ dx: 0, dy: 0, vy: 0 });

  await waitFor(() => expect(screen.queryByTestId('vendor-card-fullscreen')).toBeNull());
});

test('a sufficiently long downward swipe dismisses the full-screen card', async () => {
  await render(<VendorCard />);
  await openCard();

  await releaseCard({ dx: 0, dy: 120, vy: 0.1 });

  await waitFor(() => expect(screen.queryByTestId('vendor-card-fullscreen')).toBeNull());
});

test('release gestures are ignored while the opening animation is locked', async () => {
  let finishOpening: (() => void) | undefined;
  parallelSpy.mockImplementationOnce((animations) => ({
    start: (callback) => {
      animations.forEach((animation) => animation.start());
      finishOpening = () => callback?.({ finished: true });
    },
    stop: () => animations.forEach((animation) => animation.stop()),
    reset: () => animations.forEach((animation) => animation.reset()),
  }));
  await render(<VendorCard />);
  await openCard();

  await releaseCard({ dx: 0, dy: 0, vy: 0 });

  expect(screen.getByTestId('vendor-card-fullscreen')).toBeOnTheScreen();
  expect(finishOpening).toBeDefined();
  await act(() => finishOpening?.());
  await releaseCard({ dx: 0, dy: 0, vy: 0 });
  await waitFor(() => expect(screen.queryByTestId('vendor-card-fullscreen')).toBeNull());
});

test('a short downward swipe springs back to zero and keeps the card open', async () => {
  const springSpy = jest.spyOn(Animated, 'spring');
  const setValueSpy = jest.spyOn(Animated.Value.prototype, 'setValue');
  await render(<VendorCard />);
  await openCard();
  springSpy.mockClear();
  setValueSpy.mockClear();

  await releaseCard({ dx: 0, dy: 40, vy: 0.2 });

  expect(screen.getByTestId('vendor-card-fullscreen')).toBeOnTheScreen();
  expect(setValueSpy).toHaveBeenCalledWith(40);
  expect(springSpy).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 0 }),
  );
});

test('an upward swipe through the responder springs back and keeps the card open', async () => {
  const springSpy = jest.spyOn(Animated, 'spring');
  const setValueSpy = jest.spyOn(Animated.Value.prototype, 'setValue');
  await render(<VendorCard />);
  await openCard();
  springSpy.mockClear();
  setValueSpy.mockClear();

  await releaseCard({ dx: 0, dy: -40, vy: -0.2 });

  expect(screen.getByTestId('vendor-card-fullscreen')).toBeOnTheScreen();
  expect(setValueSpy).toHaveBeenCalledWith(0);
  expect(springSpy).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 0 }),
  );
});

test('responder termination restores the card translation to zero', async () => {
  const setValueSpy = jest.spyOn(Animated.Value.prototype, 'setValue');
  await render(<VendorCard />);
  await openCard();
  setValueSpy.mockClear();
  const gestureState = { dx: 0, dy: 40, vy: 0.2 };
  await moveCard(gestureState);
  expect(setValueSpy).toHaveBeenCalledWith(40);
  setValueSpy.mockClear();
  const overlay = screen.getByTestId('vendor-card-fullscreen');
  const { releaseEvent } = gestureEvents(gestureState);

  await fireEvent(overlay, 'responderTerminate', releaseEvent, gestureState);

  expect(setValueSpy).toHaveBeenCalledWith(0);
  expect(screen.getByTestId('vendor-card-fullscreen')).toBeOnTheScreen();
});

test('compact and full-screen cards describe their open and dismiss actions', async () => {
  await render(<VendorCard />);
  const compact = screen.getByTestId('vendor-card');

  expect(compact).toHaveProp('accessibilityRole', 'button');
  expect(compact).toHaveProp('accessibilityLabel', expect.stringMatching(/expand.*vendor card/i));
  expect(compact).toHaveProp('accessibilityHint', expect.stringMatching(/full screen/i));

  const overlay = await openCard();
  expect(overlay).toHaveProp('accessibilityRole', 'button');
  expect(overlay).toHaveProp('accessibilityLabel', expect.stringMatching(/dismiss.*vendor card/i));
  expect(overlay).toHaveProp('accessibilityHint', expect.stringMatching(/tap.*swipe down/i));
  const label = String(overlay.props.accessibilityLabel);
  expect(label).toContain(`${dish.nameTh}เจ`);
  for (const line of coach.avoid) {
    if (line.thai) expect(label).toContain(line.thai);
    expect(label).toContain(line.english);
  }
  expect(label).toContain(coach.say!.roman);
});

test('the full-screen card supports Android accessibility activation', async () => {
  await render(<VendorCard />);
  const overlay = await openCard();

  expect(overlay).toHaveProp('accessible', true);
  expect(overlay).toHaveProp('accessibilityActions', [
    { name: 'activate', label: 'Dismiss vendor card' },
  ]);
  expect(overlay).toHaveProp('onAccessibilityTap', expect.any(Function));

  await fireEvent(overlay, 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });

  await waitFor(() => expect(screen.queryByTestId('vendor-card-fullscreen')).toBeNull());
});

test('the full-screen card supports iOS accessibility tap dismissal', async () => {
  await render(<VendorCard />);
  const overlay = await openCard();

  await fireEvent(overlay, 'accessibilityTap');

  await waitFor(() => expect(screen.queryByTestId('vendor-card-fullscreen')).toBeNull());
});

test('uses light status icons only while the green overlay is expanded', async () => {
  await render(<VendorCard />);
  expect(screen.getByTestId('vendor-status-bar')).toHaveProp('accessibilityLabel', 'status-dark');

  await openCard();
  expect(screen.getByTestId('vendor-status-bar')).toHaveProp('accessibilityLabel', 'status-light');

  await releaseCard({ dx: 0, dy: 0, vy: 0 });
  await waitFor(() => expect(screen.getByTestId('vendor-status-bar')).toHaveProp('accessibilityLabel', 'status-dark'));
});
