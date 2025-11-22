/**
 * Root App entry
 */

import React, { useState } from 'react';
import {
  StatusBar,
  useColorScheme,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';

import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import PriorityBucketScreen from './src/screens/PriorityBucketScreen';
import MyListScreen from './src/screens/MyListScreen';
import CollectionScreen from './src/screens/CollectionScreen';
import DepositScreen from './src/screens/DepositScreen';
import { COMPANY_NAME, ERP_LOGOUT_URL } from './src/config/erpConfig';

const AuthStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const AttendanceStack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

/* ─────────────────────────────────────────────
   Custom drawer content (icon + "Frappe FOS")
   ───────────────────────────────────────────── */

type CustomDrawerProps = any & {
  onLogout?: () => void;
};

function CustomDrawerContent(props: CustomDrawerProps) {
  const { onLogout, ...drawerProps } = props;
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const handleLogoutPress = () => {
    // close drawer first for better UX
    props.navigation?.closeDrawer?.();
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <DrawerContentScrollView
      {...drawerProps}
      contentContainerStyle={{ flex: 1, paddingTop: 0 }}
    >
      {/* Drawer header block */}
      <View
        style={[
          styles.drawerHeader,
          { backgroundColor: isDark ? '#111827' : '#fda600' },
        ]}
      >
        {/* White rounded pill behind app icon + title */}
        <View
          style={[
            styles.drawerHeaderPill,
            { backgroundColor: isDark ? '#fbbf24' : '#ffffff' },
          ]}
        >
          <View
            style={[
              styles.drawerAppIcon,
              { backgroundColor: isDark ? '#111827' : '#fda600' },
            ]}
          >
            {/* Walking person icon for FOS */}
            <FontAwesome5
              name="walking"
              size={22}
              color={isDark ? '#fbbf24' : '#ffffff'}
            />
          </View>
          <View>
            <Text
              style={[
                styles.drawerAppTitle,
                { color: isDark ? '#111827' : '#111827' },
              ]}
            >
              Frappe FOS
            </Text>
            <Text
              style={[
                styles.drawerAppSubtitle,
                { color: isDark ? '#111827' : '#4b5563' },
              ]}
            >
              {COMPANY_NAME}
            </Text>
          </View>
        </View>
      </View>

      {/* Default drawer items */}
      <View style={{ flex: 1, paddingTop: 4 }}>
        <DrawerItemList {...drawerProps} />
      </View>

      {/* Logout button at bottom */}
      <View style={styles.drawerFooter}>
        <TouchableOpacity
          onPress={handleLogoutPress}
          style={styles.logoutButton}
        >
          <FontAwesome5 name="sign-out-alt" size={16} color="#b91c1c" />
          <Text style={styles.logoutLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </DrawerContentScrollView>
  );
}

/* ─────────────────────────────────────────────
   Home stack (Home + Priority + MyList + Collection + Deposit)
   ───────────────────────────────────────────── */

function HomeStackNavigator(props: { fullName?: string }) {
  const { fullName } = props;

  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="Home"
        options={{ headerShown: false }}
      >
        {(screenProps) => <HomeScreen {...screenProps} fullName={fullName} />}
      </HomeStack.Screen>

      <HomeStack.Screen
        name="PriorityBucket"
        component={PriorityBucketScreen}
        options={{ title: 'Priority Bucket' }}
      />
      <HomeStack.Screen
        name="MyList"
        component={MyListScreen}
        options={{ title: 'My List (All Cases)' }}
      />
      <HomeStack.Screen
        name="Collection"
        component={CollectionScreen}
        options={{ title: 'Collection' }}
      />
      <HomeStack.Screen
        name="Deposit"
        component={DepositScreen}
        options={{ title: 'Deposit' }}
      />
    </HomeStack.Navigator>
  );
}

/* ─────────────────────────────────────────────
   Attendance stack – header like other pages
   ───────────────────────────────────────────── */

function AttendanceStackNavigator() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const commonOptions: NativeStackNavigationOptions = {
    headerStyle: { backgroundColor: isDark ? '#020617' : '#ffffff' },
    headerTitleStyle: { fontWeight: '600' },
    headerTintColor: isDark ? '#f9fafb' : '#111827',
  };

  return (
    <AttendanceStack.Navigator screenOptions={commonOptions}>
      <AttendanceStack.Screen
        name="AttendanceMain"
        component={AttendanceScreen}
        options={({ navigation }) => ({
          title: 'Attendance',
          headerLeft: ({ tintColor }) => (
            <TouchableOpacity
              onPress={() => navigation.getParent()?.navigate('HomeDrawer')}
              style={{ marginRight: 12 }}
            >
              <FontAwesome5
                name="arrow-left"
                size={18}
                color={tintColor ?? (isDark ? '#f9fafb' : '#111827')}
              />
            </TouchableOpacity>
          ),
        })}
      />
    </AttendanceStack.Navigator>
  );
}

/* ─────────────────────────────────────────────
   Root App
   ───────────────────────────────────────────── */

function App(): JSX.Element {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [fullName, setFullName] = useState<string | undefined>(undefined);

  const handleLoginSuccess = (name?: string) => {
    setFullName(name);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    try {
      await fetch(ERP_LOGOUT_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {
      console.warn('Logout API failed (still clearing local session):', error);
    } finally {
      setFullName(undefined);
      setIsLoggedIn(false);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        {isLoggedIn ? (
          <Drawer.Navigator
            drawerContent={(props) => (
              <CustomDrawerContent {...props} onLogout={handleLogout} />
            )}
            screenOptions={{
              headerShown: false,
              drawerActiveTintColor: '#111827',
              drawerActiveBackgroundColor: '#e5e7eb',
              drawerInactiveTintColor: '#4b5563',
              drawerLabelStyle: { fontSize: 14 },
            }}
          >
            {/* Home – with nested stack */}
            <Drawer.Screen
              name="HomeDrawer"
              options={{
                drawerLabel: 'Home',
                drawerIcon: ({ color, size }) => (
                  <FontAwesome5 name="home" color={color} size={size} />
                ),
              }}
            >
              {() => <HomeStackNavigator fullName={fullName} />}
            </Drawer.Screen>

            {/* Attendance – separate stack with back arrow */}
            <Drawer.Screen
              name="AttendanceDrawer"
              options={{
                drawerLabel: 'Attendance',
                drawerIcon: ({ color, size }) => (
                  <FontAwesome5 name="user-check" color={color} size={size} />
                ),
              }}
            >
              {() => <AttendanceStackNavigator />}
            </Drawer.Screen>
          </Drawer.Navigator>
        ) : (
          <AuthStack.Navigator>
            <AuthStack.Screen
              name="Login"
              options={{ headerShown: false }}
            >
              {(props) => (
                <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />
              )}
            </AuthStack.Screen>
          </AuthStack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
   drawerHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
    marginHorizontal: 2,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 24,
  },
  drawerHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9999,
  },
  drawerAppIcon: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  drawerAppTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  drawerAppSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    marginTop: 'auto',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9999,
    backgroundColor: '#fee2e2',
  },
  logoutLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
  },
});

export default App;
