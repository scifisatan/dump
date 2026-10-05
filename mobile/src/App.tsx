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
import { Home } from './screens/Home';
import { ListEditor } from './screens/ListEditor';
import { NotebookScreen } from './screens/Notebook';
import { Settings } from './screens/Settings';
import { SortInbox } from './screens/SortInbox';
import { navigationTheme, useColors } from './theme';
import type { Place } from './views';

export type Screens = {
  Home: undefined;
  // `reveal` scrolls to and highlights a dump, after a search.
  Notebook: { place: Place; reveal?: string };
  ListEditor: { id?: string };
  SortInbox: undefined;
  Settings: undefined;
};
export type ScreenProps<Name extends keyof Screens> = NativeStackScreenProps<Screens, Name>;

const Stack = createNativeStackNavigator<Screens>();

// The app opens on the inbox, ready to capture; Home, with the lists, is one step back.
const INITIAL: InitialState = {
  routes: [{ name: 'Home' }, { name: 'Notebook', params: { place: { kind: 'inbox' } } }],
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
          {/* Opening another notebook starts the screens over, as a reload does on the web. */}
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
              <Stack.Screen
                name="Home"
                component={Home}
                options={{ title: 'Dump', headerLargeTitle: true }}
              />
              <Stack.Screen name="Notebook" component={NotebookScreen} />
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
