import React, { useEffect, useState, useCallback } from 'react';
import { Box, VStack, Text, Heading, useColorMode, IconButton, HStack, Spinner, useToast, ScrollView, Pressable, Badge, Center } from 'native-base';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import moment from 'moment';
import 'moment/locale/tr';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

moment.locale('tr');

interface PrayerTimes {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

const turkishCities = [
  "Adana", "Adıyaman", "Afyon", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir",
  "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli",
  "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane",
  "Hakkari", "Hatay", "Isparta", "İçel", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli",
  "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş",
  "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat",
  "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
  "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

export default function Home() {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [cityName, setCityName] = useState<string>('');
  const [nextPrayer, setNextPrayer] = useState<{ name: string; time: string; remaining: string } | null>(null);
  const { colorMode, toggleColorMode } = useColorMode();
  const toast = useToast();
  const router = useRouter();
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const loadSavedLocation = useCallback(async () => {
    try {
      const savedLocation = await AsyncStorage.getItem('selectedLocation');
      if (savedLocation) {
        const parsedLocation = JSON.parse(savedLocation);
        setLocation({
          latitude: parsedLocation.latitude,
          longitude: parsedLocation.longitude
        });
        if (parsedLocation.city) {
          setCityName(parsedLocation.city);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading saved location:', error);
      return false;
    }
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.show({
          title: "İzin Gerekli",
          description: "Konum izni verilmedi",
          variant: "warning"
        });
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true
      });
      
      const currentLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };
      
      setLocation(currentLocation);

      try {
        const response = await Location.reverseGeocodeAsync(currentLocation);
        if (response[0]?.city) {
          setCityName(response[0].city);
          // Save the location with city name
          await AsyncStorage.setItem('selectedLocation', JSON.stringify({
            ...currentLocation,
            city: response[0].city
          }));
        }
      } catch (error) {
        console.error('Error getting city name:', error);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      toast.show({
        title: "Hata",
        description: "Konum alınamadı. Konum servislerinin açık olduğundan emin olun.",
        variant: "error"
      });
    }
  };

  const showToast = (title: string, description: string, status: "error" | "warning" | "success" | "info") => {
    toast.show({
      title,
      description,
      duration: 3000,
      placement: "top",
      variant: status
    });
  };

  const fetchPrayerTimes = async (locationData: Coordinates | null = null) => {
    const loc = locationData || location;
    if (!loc) return;
    
    try {
      setLoading(true);
      const response = await axios.get(
        'https://api.aladhan.com/v1/timings',
        {
          params: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            method: 13,
            adjustment: 1
          }
        }
      );

      const hijriDate = response.data.data.date.hijri;
      const isRamadan = hijriDate.month.number === 9;
      
      setPrayerTimes(response.data.data.timings);
      calculateNextPrayer(response.data.data.timings, isRamadan);
      await AsyncStorage.setItem('lastPrayerTimes', JSON.stringify(response.data.data.timings));
      await AsyncStorage.setItem('lastUpdate', new Date().toISOString());
    } catch (error) {
      showToast("Hata", "Namaz vakitleri yüklenirken bir hata oluştu", "error");
      const cachedTimes = await AsyncStorage.getItem('lastPrayerTimes');
      if (cachedTimes) {
        setPrayerTimes(JSON.parse(cachedTimes));
        calculateNextPrayer(JSON.parse(cachedTimes));
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateNextPrayer = (times: PrayerTimes, isRamadan: boolean = false) => {
    const now = moment();
    const prayerMoments = Object.entries(prayerTimeNames).map(([key, name]) => ({
      name: isRamadan ? 
        (key === 'Fajr' ? 'Sahur' : 
         key === 'Maghrib' ? 'İftar' : name) : name,
      time: moment(times[key as keyof PrayerTimes], 'HH:mm'),
      key
    }));

    let nextPrayer = prayerMoments.find(prayer => prayer.time.isAfter(now));
    
    if (!nextPrayer) {
      nextPrayer = prayerMoments[0];
      nextPrayer.time.add(1, 'day');
    }

    const remaining = moment.duration(nextPrayer.time.diff(now));
    const hours = remaining.hours();
    const minutes = remaining.minutes();
    
    // Ramazan ayında ve İftar/Sahur vakitleri için özel metin
    let remainingStr = '';
    if (isRamadan && (nextPrayer.name === 'İftar' || nextPrayer.name === 'Sahur')) {
      if (hours > 0) {
        remainingStr = `${nextPrayer.name}a ${hours}s ${minutes}d`;
      } else {
        remainingStr = `${nextPrayer.name}a ${minutes}d`;
      }
    } else {
      remainingStr = `${hours}s ${minutes}d`;
    }

    setNextPrayer({
      name: nextPrayer.name,
      time: nextPrayer.time.format('HH:mm'),
      remaining: remainingStr
    });
  };

  const loadCachedData = async () => {
    try {
      const [cachedLocation, cachedPrayerTimes, cachedUpdate] = await Promise.all([
        AsyncStorage.getItem('selectedLocation'),
        AsyncStorage.getItem('lastPrayerTimes'),
        AsyncStorage.getItem('lastUpdate')
      ]);

      if (cachedLocation) {
        const parsedLocation = JSON.parse(cachedLocation);
        setLocation(parsedLocation);
        setCityName(parsedLocation.city || '');
      }

      if (cachedPrayerTimes && cachedUpdate) {
        const lastUpdate = new Date(cachedUpdate);
        const now = new Date();
        // Eğer son güncelleme 6 saatten eskiyse yeni veri çek
        if (now.getTime() - lastUpdate.getTime() < 6 * 60 * 60 * 1000) {
          const times = JSON.parse(cachedPrayerTimes);
          setPrayerTimes(times);
          calculateNextPrayer(times);
          setLoading(false);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error loading cached data:', error);
      return false;
    }
  };

  // İlk yükleme ve konum kontrolü
  useEffect(() => {
    const initializeApp = async () => {
      // Önce cache'den yükle
      const hasCachedData = await loadCachedData();
      
      try {
        // Kayıtlı konum kontrolü
        const savedLocation = await AsyncStorage.getItem('selectedLocation');
        
        if (savedLocation) {
          const parsedLocation = JSON.parse(savedLocation);
          if (!hasCachedData) {
            setLocation(parsedLocation);
            setCityName(parsedLocation.city || '');
            await fetchPrayerTimes(parsedLocation);
          }
          setIsInitialLoad(false);
        } else {
          // Kayıtlı konum yoksa izin iste
          const { status } = await Location.requestForegroundPermissionsAsync();
          
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High
            });
            
            const currentLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            };

            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`,
                {
                  headers: {
                    'User-Agent': 'PrayerTimesApp/1.0',
                    'Accept-Language': 'tr-TR'
                  }
                }
              );
              
              const data = await response.json();
              const cityName = data.address?.province || data.address?.city || 'Bilinmeyen Konum';
              
              const locationToSave = {
                ...currentLocation,
                city: cityName,
                timestamp: new Date().getTime()
              };

              await AsyncStorage.setItem('selectedLocation', JSON.stringify(locationToSave));
              
              if (!hasCachedData) {
                setLocation(locationToSave);
                setCityName(cityName);
                await fetchPrayerTimes(currentLocation);
              }
              setIsInitialLoad(false);
            } catch (error) {
              console.error('Error getting city name:', error);
              router.replace('/map');
            }
          } else {
            router.replace('/map');
          }
        }
      } catch (error) {
        console.error('Error checking location:', error);
        if (!hasCachedData) {
          router.replace('/map');
        }
      }
    };

    initializeApp();
  }, []);

  // Sayfa odağı değiştiğinde konumu kontrol et
  useFocusEffect(
    useCallback(() => {
      if (!isInitialLoad) {
        const checkLocation = async () => {
          const savedLocation = await AsyncStorage.getItem('selectedLocation');
          if (savedLocation) {
            const parsedLocation = JSON.parse(savedLocation);
            setLocation({
              latitude: parsedLocation.latitude,
              longitude: parsedLocation.longitude
            });
            
            if (parsedLocation.city) {
              setCityName(parsedLocation.city);
            }
            
            await fetchPrayerTimes({
              latitude: parsedLocation.latitude,
              longitude: parsedLocation.longitude
            });
          }
        };

        checkLocation();
      }
    }, [isInitialLoad])
  );

  // Her dakika sonraki namaz vaktini güncelle
  useEffect(() => {
    if (prayerTimes) {
      calculateNextPrayer(prayerTimes);
    }

    const interval = setInterval(() => {
      if (prayerTimes) {
        calculateNextPrayer(prayerTimes);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [prayerTimes]);

  // Konum değiştiğinde namaz vakitlerini güncelle
  useEffect(() => {
    if (location && !isInitialLoad) {
      fetchPrayerTimes();
    }
  }, [location, isInitialLoad]);

  const prayerTimeNames = {
    Fajr: 'İmsak',
    Sunrise: 'Güneş',
    Dhuhr: 'Öğle',
    Asr: 'İkindi',
    Maghrib: 'Akşam',
    Isha: 'Yatsı'
  };

  const prayerTimeIcons: Record<keyof typeof prayerTimeNames, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
    Fajr: {
      name: "moon", // İmsak için hilal ikonu
      color: colorMode === "dark" ? "#A78BFA" : "#7C3AED" // Mor tonları
    },
    Sunrise: {
      name: "sunny-outline", // Güneş doğuşu için güneş ikonu
      color: colorMode === "dark" ? "#FCD34D" : "#D97706" // Sarı/turuncu tonları
    },
    Dhuhr: {
      name: "sunny", // Öğle için parlak güneş ikonu
      color: colorMode === "dark" ? "#FBBF24" : "#B45309" // Altın sarısı tonları
    },
    Asr: {
      name: "partly-sunny", // İkindi için bulutlu güneş ikonu
      color: colorMode === "dark" ? "#60A5FA" : "#2563EB" // Mavi tonları
    },
    Maghrib: {
      name: "cloudy-night", // Akşam için gece ikonu
      color: colorMode === "dark" ? "#F87171" : "#DC2626" // Kırmızı tonları
    },
    Isha: {
      name: "moon-sharp", // Yatsı için dolunay ikonu
      color: colorMode === "dark" ? "#818CF8" : "#4F46E5" // İndigo tonları
    }
  };

  if (loading) {
    return (
      <Center flex={1} bg={colorMode === "dark" ? "gray.900" : "gray.50"}>
        <VStack space={4} alignItems="center">
          <Spinner size="lg" color="emerald.500" />
          <Text color={colorMode === "dark" ? "white" : "gray.700"}>Namaz vakitleri yükleniyor...</Text>
        </VStack>
      </Center>
    );
  }

  return (
    <Box flex={1} bg={colorMode === "dark" ? "gray.900" : "gray.50"} safeAreaTop pt={4}>
      {/* Header */}
      <Box 
        px={4} 
        mb={2} 
        pb={2}
        borderBottomWidth={1}
        borderBottomColor={colorMode === "dark" ? "gray.800" : "gray.200"}
      >
        <HStack justifyContent="space-between" alignItems="center" mb={2}>
          <VStack>
            <Heading size="md" color={colorMode === "dark" ? "white" : "gray.800"} fontWeight="bold">
              {moment().format('DD MMMM YYYY')}
            </Heading>
            <Text color={colorMode === "dark" ? "gray.400" : "gray.600"} fontSize="sm">
              {moment().format('dddd')}
            </Text>
          </VStack>
          <HStack space={2}>
            <Pressable onPress={() => router.push('/map')}>
              {({isPressed}) => (
                <Box 
                  bg={colorMode === "dark" ? "gray.800" : "gray.100"}
                  p={2}
                  rounded="full"
                  opacity={isPressed ? 0.8 : 1}
                >
                  <Ionicons 
                    name="location" 
                    size={20} 
                    color={colorMode === "dark" ? "#38B2AC" : "#0891B2"} 
                  />
                </Box>
              )}
            </Pressable>
            <IconButton
              icon={<Ionicons name={colorMode === "dark" ? "sunny" : "moon"} size={20} color={colorMode === "dark" ? "#FFD700" : "#6B46C1"} />}
              onPress={toggleColorMode}
              variant="solid"
              rounded="full"
              bg={colorMode === "dark" ? "gray.800" : "gray.100"}
              _pressed={{ bg: colorMode === "dark" ? "gray.700" : "gray.200" }}
            />
          </HStack>
        </HStack>
          
        <Pressable onPress={() => router.push('/map')}>
          {({isPressed}) => (
            <HStack 
              space={2} 
              alignItems="center" 
              bg={colorMode === "dark" ? "gray.800" : "white"}
              p={2}
              px={3}
              rounded="lg"
              shadow={1}
              opacity={isPressed ? 0.8 : 1}
            >
              <Ionicons name="navigate" size={16} color={colorMode === "dark" ? "#38B2AC" : "#0891B2"} />
              <Text 
                color={colorMode === "dark" ? "cyan.100" : "cyan.700"} 
                fontWeight="medium" 
                fontSize="sm"
                isTruncated
                flex={1}
              >
                {cityName || 'Konum seç'}
              </Text>
              <Ionicons 
                name="chevron-forward" 
                size={16} 
                color={colorMode === "dark" ? "gray.500" : "gray.400"} 
              />
            </HStack>
          )}
        </Pressable>
      </Box>

      {/* Next Prayer Card */}
      {nextPrayer && (
        <Box px={4} mb={2}>
          <Box
            bg={colorMode === "dark" ? "emerald.900" : "emerald.50"}
            p={4}
            rounded="xl"
            shadow={3}
            borderWidth={1}
            borderColor={colorMode === "dark" ? "emerald.800" : "emerald.100"}
          >
            <VStack space={3} alignItems="center">
              <Badge 
                colorScheme="emerald" 
                variant={colorMode === "dark" ? "subtle" : "solid"} 
                rounded="md" 
                px={2}
                py={1} 
                _text={{fontSize: "2xs", fontWeight: "bold"}}
              >
                SONRAKİ NAMAZ VAKTİ
              </Badge>
              <Heading size="xl" color={colorMode === "dark" ? "white" : "emerald.900"}>
                {nextPrayer.name}
              </Heading>
              <HStack 
                space={2} 
                alignItems="center" 
                bg={colorMode === "dark" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)"}
                px={3}
                py={1}
                rounded="full"
              >
                <Ionicons name="time-outline" size={18} color={colorMode === "dark" ? "#A7F3D0" : "#047857"} />
                <Text 
                  fontSize="md" 
                  color={colorMode === "dark" ? "#A7F3D0" : "#047857"} 
                  fontWeight="semibold"
                >
                  {nextPrayer.time}
                </Text>
              </HStack>
              
              {/* Enhanced remaining time indicator */}
              <Box
                bg={colorMode === "dark" ? "emerald.800" : "emerald.100"}
                px={5}
                py={2}
                rounded="lg"
                mt={1}
                borderWidth={1}
                borderColor={colorMode === "dark" ? "emerald.700" : "emerald.200"}
                shadow={2}
                width="70%"
              >
                <HStack space={2} justifyContent="center" alignItems="center">
                  <Ionicons 
                    name="stopwatch" 
                    size={20} 
                    color={colorMode === "dark" ? "#A7F3D0" : "#047857"} 
                  />
                  <Text 
                    fontSize="lg"
                    fontWeight="bold"
                    color={colorMode === "dark" ? "#A7F3D0" : "#047857"}
                    textAlign="center"
                  >
                    {nextPrayer.remaining}
                  </Text>
                  <Text 
                    fontSize="sm"
                    fontWeight="medium"
                    color={colorMode === "dark" ? "emerald.200" : "emerald.700"}
                    textAlign="center"
                    alignSelf="flex-end"
                    mb={0.5}
                  >
                    kaldı
                  </Text>
                </HStack>
              </Box>
            </VStack>
          </Box>
        </Box>
      )}
      
      {/* Prayer Times List */}
      <Box px={4} pb={4} flex={1}>
        <Heading size="sm" mb={2} color={colorMode === "dark" ? "gray.300" : "gray.700"}>
          Tüm Vakitler
        </Heading>
        <VStack space={2}>
          {prayerTimes && Object.entries(prayerTimes).map(([key, time]) => {
            if (prayerTimeNames[key as keyof typeof prayerTimeNames]) {
              const isNext = nextPrayer?.name === prayerTimeNames[key as keyof typeof prayerTimeNames];
              const prayerName = prayerTimeNames[key as keyof typeof prayerTimeNames];
              const icon = prayerTimeIcons[key as keyof typeof prayerTimeIcons];
              
              return (
                <Box
                  key={key}
                  bg={isNext 
                    ? (colorMode === "dark" ? "emerald.900" : "emerald.50")
                    : (colorMode === "dark" ? "gray.800" : "white")}
                  p={3}
                  rounded="lg"
                  shadow={1}
                  borderWidth={1}
                  borderColor={isNext 
                    ? (colorMode === "dark" ? "emerald.700" : "emerald.200")
                    : (colorMode === "dark" ? "gray.700" : "gray.100")}
                >
                  <HStack justifyContent="space-between" alignItems="center">
                    <HStack space={3} alignItems="center">
                      <Box 
                        p={2} 
                        rounded="lg" 
                        bg={isNext 
                          ? (colorMode === "dark" ? "emerald.800" : "emerald.100")
                          : (colorMode === "dark" ? "gray.700" : "gray.100")}
                      >
                        <Ionicons 
                          name={icon.name} 
                          size={18} 
                          color={isNext 
                            ? (colorMode === "dark" ? "#A7F3D0" : "#047857")
                            : icon.color} 
                        />
                      </Box>
                      <Text
                        fontSize="md"
                        fontWeight="medium"
                        color={isNext 
                          ? (colorMode === "dark" ? "emerald.100" : "emerald.900")
                          : (colorMode === "dark" ? "white" : "gray.800")}
                      >
                        {prayerName}
                      </Text>
                    </HStack>
                    <Text
                      fontSize="md"
                      fontWeight="semibold"
                      color={isNext 
                        ? (colorMode === "dark" ? "emerald.100" : "emerald.900")
                        : (colorMode === "dark" ? "white" : "gray.800")}
                    >
                      {time}
                    </Text>
                  </HStack>
                </Box>
              );
            }
            return null;
          })}
        </VStack>
      </Box>
    </Box>
  );
}