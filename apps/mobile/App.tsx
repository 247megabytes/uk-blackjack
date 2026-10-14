import { useCallback, useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { randomSeed, type MatchSetup } from './src/game';
import { GameScreen } from './src/screens/GameScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { HowToPlayScreen } from './src/screens/HowToPlayScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { SettingsProvider, useSettings } from './src/state/settings';
import { colors } from './src/ui/theme';

type Route =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'rules' }
  | { name: 'settings' }
  | { name: 'game'; setup: MatchSetup };

/**
 * A deliberately small in-app router: five screens don't need a navigation
 * library yet. Expo Router can replace this when online rooms arrive (Phase 3).
 */
function Root() {
  const { settings, loaded } = useSettings();
  const [route, setRoute] = useState<Route>({ name: 'home' });

  const newSetup = useCallback(
    (): MatchSetup => ({ seed: randomSeed(), humanName: settings.playerName, botCount: settings.botCount, mode: settings.mode }),
    [settings.playerName, settings.botCount, settings.mode],
  );

  // Android back button: game → confirm handled in-game; other screens → home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'home' || route.name === 'game') return false;
      setRoute({ name: 'home' });
      return true;
    });
    return () => sub.remove();
  }, [route.name]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.chrome }} />;

  switch (route.name) {
    case 'home':
      return <HomeScreen onPlay={() => setRoute({ name: 'setup' })} onRules={() => setRoute({ name: 'rules' })} onSettings={() => setRoute({ name: 'settings' })} />;
    case 'setup':
      return <SetupScreen onBack={() => setRoute({ name: 'home' })} onStart={() => setRoute({ name: 'game', setup: newSetup() })} />;
    case 'rules':
      return <HowToPlayScreen onBack={() => setRoute({ name: 'home' })} />;
    case 'settings':
      return <SettingsScreen onBack={() => setRoute({ name: 'home' })} />;
    case 'game':
      return (
        <GameScreen
          key={route.setup.seed}
          setup={route.setup}
          onRematch={() => setRoute({ name: 'game', setup: { ...route.setup, seed: randomSeed() } })}
          onChangeTable={() => setRoute({ name: 'setup' })}
          onExit={() => setRoute({ name: 'home' })}
        />
      );
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="light" />
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
