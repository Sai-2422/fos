/**
 * @format
 */
import 'react-native-gesture-handler';  // 1) must be first
import 'react-native-reanimated';       // 2) reanimated runtime

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
