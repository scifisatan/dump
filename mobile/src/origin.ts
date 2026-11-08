import { originSetting } from '../../src/core/origin';
import { setting } from './settings';

export const origin = originSetting(setting('web-app-origin'));
