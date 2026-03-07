import { describe, expect, it } from 'vitest';
import { resolveI18nLocale } from './SettingsProvider';

describe('resolveI18nLocale', () => {
    it('returns US locale for US date format', () => {
        expect(resolveI18nLocale({ dateFormat: 'MM/DD/YYYY' })).toBe('en-US');
    });

    it('returns GB locale for UK date format', () => {
        expect(resolveI18nLocale({ dateFormat: 'DD/MM/YYYY' })).toBe('en-GB');
    });

    it('returns RU locale for dot date format', () => {
        expect(resolveI18nLocale({ dateFormat: 'DD.MM.YYYY' })).toBe('ru-RU');
    });
});
