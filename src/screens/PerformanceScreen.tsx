// src/screens/PerformanceScreen.tsx

import React from 'react';
import {
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TouchableOpacity,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import Geolocation from 'react-native-geolocation-service';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';

type LatLng = {
  latitude: number;
  longitude: number;
};

const DEFAULT_REGION: Region = {
  // India center-ish
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

const PerformanceScreen: React.FC = () => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  const [location, setLocation] = React.useState<LatLng | null>(null);
  const [region, setRegion] = React.useState<Region | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mapRef = React.useRef<MapView | null>(null);

  // Ask for location permission (Android & iOS)
  const requestLocationPermission = async () => {
    if (Platform.OS === 'ios') {
      const status = await Geolocation.requestAuthorization('whenInUse');
      return status === 'granted';
    }

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'This app needs access to your location.',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    return false;
  };

  const handleGetCurrentLocation = async () => {
    setError(null);
    const hasPermission = await requestLocationPermission();

    if (!hasPermission) {
      setError('Location permission denied');
      return;
    }

    setLoading(true);

    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;

        const nextRegion: Region = {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };

        setLocation({ latitude, longitude });
        setRegion(nextRegion);
        setLoading(false);

        mapRef.current?.animateToRegion(nextRegion, 300);
      },
      err => {
        setError(err.message);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
        forceRequestLocation: true,
        showLocationDialog: true,
      },
    );
  };

  const currentRegion: Region = region || DEFAULT_REGION;

  // 👇 Zoom helpers (custom + / - buttons)
  const handleZoom = (factor: number) => {
    const base = currentRegion;

    const newRegion: Region = {
      ...base,
      latitudeDelta: base.latitudeDelta * factor,
      longitudeDelta: base.longitudeDelta * factor,
    };

    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 200);
  };

  const handleZoomIn = () => handleZoom(0.5); // closer
  const handleZoomOut = () => handleZoom(2); // farther

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Performance</Text>
      <Text style={styles.subtitle}>
        Dummy page. Show daily collections, targets vs achieved and visit
        summary for the agent here.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleGetCurrentLocation}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Get Current Location</Text>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          region={currentRegion}
          onRegionChangeComplete={setRegion}
          // ✅ Native controls
          zoomEnabled
          zoomControlEnabled // Android only (shows small + / - buttons)
          showsCompass
          showsMyLocationButton // Android only, needs location permission
          showsUserLocation
        >
          {location && (
            <Marker
              coordinate={location}
              title="You are here"
              description={`${location.latitude.toFixed(
                4,
              )}, ${location.longitude.toFixed(4)}`}
            />
          )}
        </MapView>

        {/* ✅ Custom overlay zoom buttons (like Google Maps) */}
        <View style={styles.zoomButtonsContainer}>
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={handleZoomIn}
            activeOpacity={0.8}
          >
            <Text style={styles.zoomButtonLabel}>+</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.zoomButton}
            onPress={handleZoomOut}
            activeOpacity={0.8}
          >
            <Text style={styles.zoomButtonLabel}>−</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      paddingTop: 24,
      backgroundColor: isDark ? '#020617' : '#f3f4f6',
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#0f172a',
      marginBottom: 4,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? '#e5e7eb' : '#4b5563',
      textAlign: 'center',
      marginBottom: 16,
    },
    button: {
      alignSelf: 'center',
      marginTop: 8,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: '#2563eb',
    },
    buttonText: {
      color: '#ffffff',
      fontWeight: '600',
      fontSize: 14,
    },
    error: {
      marginTop: 8,
      textAlign: 'center',
      color: '#ef4444',
      fontSize: 12,
    },
    mapContainer: {
      flex: 1,
      marginTop: 16,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? '#1f2933' : '#d1d5db',
      // ensure absolute children are positioned relative to this
      position: 'relative',
    },
    map: {
      flex: 1,
    },
    zoomButtonsContainer: {
      position: 'absolute',
      right: 16,
      bottom: 24,
      alignItems: 'center',
      gap: 8,
    },
    zoomButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(15,23,42,0.9)', // dark slate with opacity
    },
    zoomButtonLabel: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '700',
      marginTop: -2,
    },
  });

export default PerformanceScreen;


// // src/screens/PerformanceScreen.tsx

// import React from 'react';
// import { StyleSheet, Text, useColorScheme, View } from 'react-native';

// const PerformanceScreen: React.FC = () => {
//   const scheme = useColorScheme();
//   const isDark = scheme === 'dark';
//   const styles = React.useMemo(() => createStyles(isDark), [isDark]);

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>My Performance</Text>
//       <Text style={styles.subtitle}>
//         Dummy page. Show daily collections, targets vs achieved and visit
//         summary for the agent here.
//       </Text>
//     </View>
//   );
// };

// const createStyles = (isDark: boolean) =>
//   StyleSheet.create({
//     container: {
//       flex: 1,
//       padding: 24,
//       justifyContent: 'center',
//       alignItems: 'center',
//       backgroundColor: isDark ? '#020617' : '#f3f4f6',
//     },
//     title: {
//       fontSize: 22,
//       fontWeight: '700',
//       color: isDark ? '#f9fafb' : '#0f172a',
//       marginBottom: 8,
//       textAlign: 'center',
//     },
//     subtitle: {
//       fontSize: 14,
//       color: isDark ? '#e5e7eb' : '#4b5563',
//       textAlign: 'center',
//     },
//   });

// export default PerformanceScreen;
