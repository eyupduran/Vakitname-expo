import React, { useEffect, useState, useRef } from 'react';
import { Box, IconButton, Heading, useToast, Text, VStack, HStack, useColorMode, Center, Spinner } from 'native-base';
import { StyleSheet, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  timestamp?: number;
}

export default function MapScreen() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const { colorMode } = useColorMode();
  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);

  // Toast gösterme fonksiyonu
  const showToast = (title: string, description: string, status: "error" | "warning" | "success" | "info") => {
    toast.show({
      title,
      description,
      duration: 3000, // 3 saniye sonra otomatik kapanır
      placement: "top",
      variant: status
    });
  };

  useEffect(() => {
    const checkIfInitialSetup = async () => {
      const savedLocation = await AsyncStorage.getItem('selectedLocation');
      setIsInitialSetup(!savedLocation);
      
      // Eğer kaydedilmiş konum varsa, onu yükle
      if (savedLocation) {
        const parsedLocation = JSON.parse(savedLocation);
        setLocation(parsedLocation);
        setSelectedLocation(parsedLocation);
      }
    };
    
    checkIfInitialSetup();
    
    // Sadece kaydedilmiş konum yoksa mevcut konumu al
    if (!isInitialSetup) {
      initializeLocation();
    }
  }, []);

  const initializeLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
          mayShowUserSettingsDialog: true
        });
        
        const currentLocation = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        
        setLocation(currentLocation);
        setSelectedLocation(currentLocation);
        setWebViewKey(prev => prev + 1);
      } catch (error) {
        console.error('Location error:', error);
        showToast("Hata", "Konum alınamadı. Lütfen konum servislerinin açık olduğundan emin olun.", "error");
      }
    }
  };

  const getLocationName = async (lat: number, lon: number): Promise<string> => {
    try {
      // API isteğine gecikme ekle
      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        {
          headers: {
            'User-Agent': 'PrayerTimesApp/1.0',
            'Accept-Language': 'tr-TR'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.address) {
        // İlçe ve şehir bilgisine göre isimlendirme yap
        const { city, town, province, city_district, county } = data.address;
        
        // İlçe ve il bilgisini kontrol et
        if (town && province) {
          return `${town}/${province}`;
        }
        // İlçe merkezi ve il bilgisini kontrol et
        else if (county && province) {
          return `${county}/${province}`;
        }
        // Sadece il bilgisini kontrol et
        else if (province) {
          return province;
        }
        // Şehir bilgisini kontrol et
        else if (city) {
          return city;
        }
        // İlçe bilgisini kontrol et
        else if (town) {
          return town;
        }
        // Son çare olarak semt/mahalle bilgisini kontrol et
        else if (city_district) {
          return city_district;
        }
      }

      // Hiçbir konum bilgisi bulunamazsa koordinatları göster
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } catch (error) {
      console.error('Error fetching location name:', error);
      // Hata durumunda koordinatları göster
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  };

  const getCurrentLocation = async () => {
    try {
      setIsLoadingCity(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast("İzin Gerekli", "Konum izni verilmedi", "warning");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true
      });
      
      const currentLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      // WebView'e konum değişikliğini bildirme
      const updateScript = `
        if (typeof map !== 'undefined' && typeof marker !== 'undefined') {
          map.setView([${currentLocation.latitude}, ${currentLocation.longitude}], 13);
          marker.setLatLng([${currentLocation.latitude}, ${currentLocation.longitude}]);
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(updateScript);

      // Nominatim API ile konum adını al
      const locationName = await getLocationName(currentLocation.latitude, currentLocation.longitude);
      
      setLocation(currentLocation);
      setSelectedLocation({
        ...currentLocation,
        city: locationName
      });
      
    } catch (error) {
      console.error('Location error:', error);
      showToast("Hata", "Konum alınamadı. Lütfen konum servislerinin açık olduğundan emin olun.", "error");
    } finally {
      setIsLoadingCity(false);
    }
  };

  const useSelectedLocation = async () => {
    if (selectedLocation) {
      try {
        let locationToSave = {...selectedLocation};
        
        // Şehir bilgisi yoksa Nominatim API ile al
        if (!locationToSave.city) {
          locationToSave.city = await getLocationName(selectedLocation.latitude, selectedLocation.longitude);
        }
        
        // Timestamp ekle
        locationToSave.timestamp = new Date().getTime();
        
        await AsyncStorage.setItem('selectedLocation', JSON.stringify(locationToSave));
        
        // Önceki verileri temizle
        await AsyncStorage.removeItem('lastPrayerTimes');
        await AsyncStorage.removeItem('lastUpdate');
        
        if (isInitialSetup) {
          // İlk kurulumda ana sayfaya yönlendir
          router.replace('/');
        } else {
          // Normal kullanımda geri dön
          router.back();
        }
      } catch (error) {
        console.error('Error saving location:', error);
        showToast("Hata", "Konum bilgisi kaydedilemedi", "error");
      }
    } else {
      showToast("Uyarı", "Lütfen bir konum seçin", "warning");
    }
  };

  const handleBackPress = () => {
    // Eğer ilk kurulumsa ve konum seçilmemişse geri dönüşe izin verme
    if (isInitialSetup && !selectedLocation) {
      showToast("Uyarı", "Lütfen bir konum seçin", "warning");
      return;
    }
    router.back();
  };

  const handleMapMessage = async (event: any) => {
    try {
      const location = JSON.parse(event.nativeEvent.data);
      
      // Önce konumu güncelle
      const newLocation = {
        latitude: location.latitude,
        longitude: location.longitude
      };
      
      setIsLoadingCity(true); // Şehir yüklenmeye başlarken
      setIsSelectingLocation(true); // Konum seçimi başladığında
      
      try {
        // Nominatim API ile konum adını al
        const locationName = await getLocationName(newLocation.latitude, newLocation.longitude);
        
        setSelectedLocation({
          ...newLocation,
          city: locationName
        });
      } catch (error) {
        console.error('Error getting city name:', error);
        setSelectedLocation({
          ...newLocation,
          city: `${newLocation.latitude.toFixed(4)}, ${newLocation.longitude.toFixed(4)}`
        });
      } finally {
        setIsLoadingCity(false); // Şehir yükleme bittiğinde
        setIsSelectingLocation(false); // Konum seçimi bittiğinde
      }
      
    } catch (error) {
      console.error('Error parsing location data:', error);
      setIsLoadingCity(false);
      setIsSelectingLocation(false);
    }
  };

  const getMapHTML = () => {
    if (!location) {
      return `<div>Loading...</div>`;
    }

    const initialLat = selectedLocation?.latitude || location.latitude;
    const initialLng = selectedLocation?.longitude || location.longitude;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            body { margin: 0; padding: 0; }
            #map { height: 100vh; width: 100vw; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            var map = L.map('map', {
              zoomControl: true,
              attributionControl: false
            }).setView([${initialLat}, ${initialLng}], 13);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19
            }).addTo(map);

            var marker = L.marker([${initialLat}, ${initialLng}], {
              draggable: true
            }).addTo(map);

            map.on('click', function(e) {
              marker.setLatLng(e.latlng);
              sendLocation(e.latlng);
            });

            marker.on('dragend', function(e) {
              sendLocation(marker.getLatLng());
            });

            function sendLocation(latlng) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                latitude: latlng.lat,
                longitude: latlng.lng
              }));
            }
          </script>
        </body>
      </html>
    `;
  };

  return (
    <Box flex={1} bg={colorMode === "dark" ? "gray.900" : "gray.50"}>
      {/* Header Bar */}
      <Box 
        position="absolute" 
        top={0} 
        left={0} 
        right={0} 
        zIndex={1} 
        py={4}
        px={3}
        flexDirection="row" 
        justifyContent="space-between"
        alignItems="center"
        bg={colorMode === "dark" ? "rgba(23,25,35,0.9)" : "rgba(255,255,255,0.9)"}
        borderBottomWidth={1}
        borderBottomColor={colorMode === "dark" ? "gray.800" : "gray.200"}
        safeAreaTop
      >
        {/* Sadece ilk kurulumda geri butonunu gösterme */}
        {!isInitialSetup && (
          <IconButton
            icon={<Ionicons name="arrow-back" size={22} color={colorMode === "dark" ? "white" : "black"} />}
            onPress={handleBackPress}
            variant="ghost"
            _pressed={{
              bg: colorMode === "dark" ? "gray.700" : "gray.200"
            }}
            borderRadius="full"
          />
        )}
        
        <Heading 
          size="md" 
          flex={isInitialSetup ? 1 : 0}
          textAlign={isInitialSetup ? "center" : "left"}
          ml={isInitialSetup ? 0 : 2}
          color={colorMode === "dark" ? "white" : "gray.800"}
        >
          {isInitialSetup ? "Konum Seçimi" : "Konum Değiştir"}
        </Heading>
        
        <IconButton
          icon={isLoadingCity ? 
            <Spinner size="sm" color={colorMode === "dark" ? "#10B981" : "#047857"} /> : 
            <Ionicons name="checkmark" size={24} color={colorMode === "dark" ? "#10B981" : "#047857"} />
          }
          onPress={useSelectedLocation}
          variant="solid"
          bg={colorMode === "dark" ? "emerald.800" : "emerald.500"}
          _pressed={{
            bg: colorMode === "dark" ? "emerald.900" : "emerald.600"
          }}
          isDisabled={isLoadingCity || !selectedLocation}
          opacity={isLoadingCity || !selectedLocation ? 0.5 : 1}
          borderRadius="full"
          shadow={2}
        />
      </Box>

      {/* Info Banner for Initial Setup */}
      {isInitialSetup && (
        <Box 
          position="absolute" 
          top={80}
          left={6} 
          right={6} 
          zIndex={1}
          bg={colorMode === "dark" ? "rgba(23,25,35,0.85)" : "rgba(255,255,255,0.9)"}
          p={4}
          rounded="xl"
          shadow={4}
          borderWidth={1}
          borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
        >
          <VStack space={3} alignItems="center">
            <Ionicons 
              name="information-circle-outline" 
              size={24} 
              color={colorMode === "dark" ? "#38B2AC" : "#0891B2"} 
            />
            <Text 
              textAlign="center"
              color={colorMode === "dark" ? "white" : "gray.700"}
              fontWeight="medium"
            >
              Namaz vakitlerini görmek için lütfen konumunuzu seçin ve onaylayın
            </Text>
          </VStack>
        </Box>
      )}

      {/* Loading Overlay */}
      {!location && (
        <Center 
          position="absolute"
          top={0}
          bottom={0}
          left={0}
          right={0}
          zIndex={2}
          bg={colorMode === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)"}
        >
          <VStack space={4} alignItems="center">
            <Spinner size="lg" color="emerald.500" />
            <Text color={colorMode === "dark" ? "white" : "gray.700"}>
              Konum alınıyor...
            </Text>
          </VStack>
        </Center>
      )}

      {/* Map View */}
      <WebView
        ref={webViewRef}
        key={webViewKey}
        style={styles.map}
        source={{ html: getMapHTML() }}
        onMessage={handleMapMessage}
        geolocationEnabled={true}
      />

      {/* Current Location Button ve Info */}
      <Box 
        position="absolute" 
        bottom={selectedLocation ? 24 : 6} 
        right={6} 
        zIndex={1}
      >
        <VStack space={2}>
          {/* Mevcut Konum Bilgisi - Daha küçük boyutlandırma */}
          {location && (
            <Box
              bg={colorMode === "dark" ? "rgba(23,25,35,0.9)" : "rgba(255,255,255,0.9)"}
              p={1.5}
              rounded="lg"
              borderWidth={1}
              borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
              shadow={2}
              maxWidth={150}
            >
              <Text 
                fontSize="2xs" 
                color={colorMode === "dark" ? "gray.400" : "gray.600"}
                textAlign="center"
              >
                Mevcut Konum
              </Text>
              <Text
                fontSize="2xs"
                fontWeight="medium"
                color={colorMode === "dark" ? "white" : "gray.800"}
                textAlign="center"
                numberOfLines={1}
                isTruncated
              >
                {location.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
              </Text>
            </Box>
          )}
          
          {/* Konumlan Butonu */}
          <IconButton
            icon={isLoadingCity ? 
              <Spinner size="sm" color={colorMode === "dark" ? "#38B2AC" : "#0891B2"} /> :
              <Ionicons name="locate" size={22} color={colorMode === "dark" ? "#38B2AC" : "#0891B2"} />
            }
            bg={colorMode === "dark" ? "gray.800" : "white"}
            borderWidth={1}
            borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
            rounded="full"
            shadow={3}
            size="lg"
            _pressed={{
              bg: colorMode === "dark" ? "gray.700" : "gray.100",
            }}
            onPress={getCurrentLocation}
            isDisabled={isLoadingCity}
          />
        </VStack>
      </Box>

      {/* Selected Location Info with Loading Indicator */}
      {selectedLocation && (
        <Box 
          position="absolute" 
          bottom={6} 
          left={6}
          right={6} 
          zIndex={1}
          bg={colorMode === "dark" ? "rgba(23,25,35,0.9)" : "rgba(255,255,255,0.9)"}
          p={3}
          rounded="xl"
          shadow={2}
          borderWidth={1}
          borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
        >
          <HStack space={3} alignItems="center">
            <Box 
              p={2} 
              bg={colorMode === "dark" ? "emerald.800" : "emerald.100"}
              rounded="lg"
            >
              {isSelectingLocation ? (
                <Spinner size="sm" color={colorMode === "dark" ? "#A7F3D0" : "#047857"} />
              ) : (
                <Ionicons name="location" size={18} color={colorMode === "dark" ? "#A7F3D0" : "#047857"} />
              )}
            </Box>
            <VStack flex={1}>
              <Text 
                fontSize="xs" 
                color={colorMode === "dark" ? "gray.400" : "gray.600"}
              >
                {isSelectingLocation ? "Konum Yükleniyor..." : "Seçilen Konum"}
              </Text>
              <Text 
                fontSize="sm" 
                fontWeight="medium" 
                color={colorMode === "dark" ? "white" : "gray.800"}
                numberOfLines={1}
              >
                {isSelectingLocation ? 
                  "Lütfen bekleyin..." : 
                  (selectedLocation.city || `${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude.toFixed(4)}`)}
              </Text>
            </VStack>
          </HStack>
        </Box>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
});