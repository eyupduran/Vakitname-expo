import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { NativeBaseProvider, extendTheme, useColorMode, StorageManager } from 'native-base';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/useColorScheme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Tema depolama yöneticisi
const colorModeManager: StorageManager = {
  get: async () => {
    try {
      const val = await AsyncStorage.getItem('@color-mode');
      return val === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  },
  set: async (value: 'light' | 'dark') => {
    try {
      await AsyncStorage.setItem('@color-mode', value);
    } catch (e) {
      console.log(e);
    }
  },
};

const theme = extendTheme({
  colors: {
    // Ana renkler (Emerald renk paleti)
    emerald: {
      50: "#ecfdf5",
      100: "#d1fae5",
      200: "#a7f3d0",
      300: "#6ee7b7",
      400: "#34d399",
      500: "#10b981",
      600: "#059669",
      700: "#047857",
      800: "#065f46",
      900: "#064e3b",
    },
    // Tema renkleri
    primary: {
      50: '#E3F2F9',
      100: '#C5E4F3',
      200: '#A2D4EC',
      300: '#7AC1E4',
      400: '#47A9DA',
      500: '#0088CC',
      600: '#007AB8',
      700: '#006BA1',
      800: '#005885',
      900: '#003F5E',
    },
    // Karanlık mod renkleri için ek düzenlemeler
    darkBg: {
      50: "#171923",
      100: "#1A202C",
      200: "#2D3748"
    },
    lightBg: {
      50: "#FFFFFF",
      100: "#F7FAFC",
      200: "#EDF2F7"
    }
  },
  config: {
    // Sistem ayarlarına göre otomatik tema seçimi
    useSystemColorMode: true,
    initialColorMode: 'light',
  },
  components: {
    // Metin bileşenleri için karanlık moddaki varsayılan renkleri ayarla
    Text: {
      baseStyle: (props: any) => ({
        color: props.colorMode === 'dark' ? 'white' : 'gray.800',
      }),
    },
    // Başlık bileşenleri için karanlık moddaki varsayılan renkleri ayarla
    Heading: {
      baseStyle: (props: any) => ({
        color: props.colorMode === 'dark' ? 'white' : 'gray.800',
      }),
    },
  },
});

// StatusBar için ayrı bir bileşen oluşturuyoruz
function AppStatusBar() {
  const { colorMode } = useColorMode();
  return <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <NativeBaseProvider theme={theme} colorModeManager={colorModeManager}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ 
          headerShown: false,
          animation: 'slide_from_right'
        }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="map" />
          <Stack.Screen name="+not-found" options={{ presentation: 'modal' }} />
        </Stack>
        <AppStatusBar />
      </ThemeProvider>
    </NativeBaseProvider>
  );
}
