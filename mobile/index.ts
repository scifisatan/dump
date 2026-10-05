// Web APIs first: TinyBase reads crypto, TextEncoder and structuredClone as its modules load.
import './src/runtime';
import { registerRootComponent } from 'expo';
import { App } from './src/App';

registerRootComponent(App);
