import { originSetting } from '../../src/core/origin';
import type { Setting } from '../../src/core/setting';
import { native } from './native';

export const setting = (name: string): Setting => ({
  read: () => native.readSetting(name),
  write: (value) => native.writeSetting(name, value),
});

export const origin = originSetting(setting('webAppOrigin'));
