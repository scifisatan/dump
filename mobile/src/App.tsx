import { NavigationContainer, type InitialState } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SheetHost } from './menu';
import { useSession } from './notebook';
import { ListEditor } from './screens/ListEditor';
import { NotebookScreen } from './screens/Notebook';
import { PickDay } from './screens/PickDay';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { SortInbox } from './screens/SortInbox';
import { navigationTheme, useColors } from './theme';
import type { Place } from '../../src/core/views';

export type Screens = {
  Notebook: { place: Place; reveal?: string };
  Search: undefined;
  ListEditor: { id?: string };
  PickDay: { id: string };
  SortInbox: undefined;
  Settings: undefined;
};
export type ScreenProps<Name extends keyof Screens> = NativeStackScreenProps<Screens, Name>;

const Stack = createNativeStackNavigator<Screens>();

const INITIAL: InitialState = {
  routes: [{ name: 'Notebook', params: { place: { kind: 'home' } } }],
};

export function App() {
  const session = useSession();
  const colors = useColors();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <StatusBar style="auto" />
          <NavigationContainer
            key={session.id}
            theme={navigationTheme(colors, scheme)}
            initialState={INITIAL}
          >
            <Stack.Navigator
              screenOptions={{
                headerShadowVisible: false,
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="Notebook" component={NotebookScreen} />
              <Stack.Screen name="Search" component={Search} options={{ title: 'Search' }} />
              <Stack.Screen
                name="ListEditor"
                component={ListEditor}
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: 'fitToContents',
                  sheetGrabberVisible: true,
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.card },
                }}
              />
              <Stack.Screen
                name="PickDay"
                component={PickDay}
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: 'fitToContents',
                  sheetGrabberVisible: true,
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.card },
                }}
              />
              <Stack.Screen
                name="SortInbox"
                component={SortInbox}
                options={{ presentation: 'modal', title: 'Sort Inbox' }}
              />
              <Stack.Screen
                name="Settings"
                component={Settings}
                options={{ presentation: 'modal', title: 'Settings' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
          <SheetHost />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
