import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { RouteStep } from '@vegan-bangkok/schemas';
import { TourStepCard } from '../TourStepCard';

const SIGHT: RouteStep = {
  type: 'site',
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Wat Pho',
  nameTh: 'วัดโพธิ์',
  lat: 13.7466,
  lng: 100.493,
  order: 0,
  summary: 'A sprawling old-city temple famous for its giant reclining Buddha, tiled chedis, massage heritage, and calm courtyards.',
  walkMetersFromPrev: 300,
};

const PLACE: RouteStep = {
  type: 'place',
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Jae Oa',
  lat: 13.7405,
  lng: 100.5095,
  order: 1,
  summary: 'Jay food',
  walkMetersFromPrev: 1200,
};

const DISH: RouteStep = {
  type: 'dish',
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Pad kra pao',
  lat: 13.741,
  lng: 100.51,
  order: 2,
  summary: 'Basil stir-fry',
  walkMetersFromPrev: 200,
};

const COLLAPSED_SIGHT_LABEL = `START, Wat Pho, วัดโพธิ์, ${SIGHT.summary}, SIGHT, Read more about Wat Pho`;
const EXPANDED_SIGHT_LABEL = `START, Wat Pho, วัดโพธิ์, ${SIGHT.summary}, SIGHT, Show less about Wat Pho`;

async function reportLines(id: string, count: number) {
  await fireEvent(screen.getByTestId(`tour-summary-measure-${id}`, { includeHiddenElements: true }), 'textLayout', {
    nativeEvent: { lines: Array.from({ length: count }, () => ({})) },
  });
}

test('a long sight summary starts truncated and toggles open and closed', async () => {
  const onOpen = jest.fn();
  await render(<TourStepCard step={SIGHT} onOpen={onOpen} />);

  expect(screen.getByTestId(`tour-summary-${SIGHT.id}`)).toHaveProp('numberOfLines', 2);
  expect(screen.queryByText('Read more')).not.toBeOnTheScreen();

  await reportLines(SIGHT.id, 3);
  expect(screen.getByText('Read more')).toHaveProp('accessibilityLabel', 'Read more about Wat Pho');
  expect(screen.getByTestId('tour-step-0')).toHaveProp(
    'accessibilityState', { disabled: false, expanded: false },
  );
  expect(screen.getByTestId('tour-step-0')).toHaveProp(
    'accessibilityLabel', COLLAPSED_SIGHT_LABEL,
  );

  await fireEvent.press(screen.getByTestId('tour-step-0'));
  expect(screen.getByTestId(`tour-summary-${SIGHT.id}`)).not.toHaveProp('numberOfLines');
  expect(screen.getByText('Show less')).toHaveProp('accessibilityLabel', 'Show less about Wat Pho');
  expect(screen.getByTestId('tour-step-0')).toHaveProp(
    'accessibilityState', { disabled: false, expanded: true },
  );
  expect(screen.getByTestId('tour-step-0')).toHaveProp(
    'accessibilityLabel', EXPANDED_SIGHT_LABEL,
  );
  expect(onOpen).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByTestId('tour-step-0'));
  expect(screen.getByTestId(`tour-summary-${SIGHT.id}`)).toHaveProp('numberOfLines', 2);
  expect(screen.getByText('Read more')).toBeOnTheScreen();
});

test('a sight summary that fits two lines has no expansion affordance', async () => {
  await render(<TourStepCard step={SIGHT} onOpen={jest.fn()} />);
  await reportLines(SIGHT.id, 2);
  expect(screen.queryByText('Read more')).not.toBeOnTheScreen();
  expect(screen.getByTestId('tour-step-0')).toHaveProp(
    'accessibilityState', { disabled: true, expanded: false },
  );
});

test('sight cards keep their expanded state independently', async () => {
  const second = { ...SIGHT, id: '00000000-0000-4000-8000-000000000004', name: 'Wat Arun', order: 1 };
  await render(
    <View>
      <TourStepCard step={SIGHT} onOpen={jest.fn()} />
      <TourStepCard step={second} onOpen={jest.fn()} />
    </View>,
  );
  await reportLines(SIGHT.id, 3);
  await reportLines(second.id, 3);

  await fireEvent.press(screen.getByTestId('tour-step-0'));
  expect(screen.getByTestId(`tour-summary-${SIGHT.id}`)).not.toHaveProp('numberOfLines');
  expect(screen.getByTestId(`tour-summary-${second.id}`)).toHaveProp('numberOfLines', 2);

  await fireEvent.press(screen.getByTestId('tour-step-1'));
  expect(screen.getByTestId(`tour-summary-${SIGHT.id}`)).not.toHaveProp('numberOfLines');
  expect(screen.getByTestId(`tour-summary-${second.id}`)).not.toHaveProp('numberOfLines');
  expect(screen.getByTestId('tour-step-0')).toHaveProp(
    'accessibilityState', { disabled: false, expanded: true },
  );
  expect(screen.getByTestId('tour-step-1')).toHaveProp(
    'accessibilityState', { disabled: false, expanded: true },
  );
});

test('a sight without a summary has no expansion control', async () => {
  await render(<TourStepCard step={{ ...SIGHT, summary: null }} onOpen={jest.fn()} />);
  expect(screen.queryByText('Read more')).not.toBeOnTheScreen();
  expect(screen.queryByTestId(`tour-summary-${SIGHT.id}`)).not.toBeOnTheScreen();
});

test('place and dish cards retain their navigation callback', async () => {
  const onOpen = jest.fn();
  await render(
    <View>
      <TourStepCard step={PLACE} onOpen={onOpen} />
      <TourStepCard step={DISH} onOpen={onOpen} />
    </View>,
  );

  await fireEvent.press(screen.getByTestId('tour-step-1'));
  await fireEvent.press(screen.getByTestId('tour-step-2'));
  expect(onOpen).toHaveBeenNthCalledWith(1, PLACE);
  expect(onOpen).toHaveBeenNthCalledWith(2, DISH);
});
