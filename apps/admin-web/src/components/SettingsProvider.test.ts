import { describe, expect, it } from 'vitest';
import { resolveI18nLocale } from './SettingsProvider';

describe('resolveI18nLocale', () => {
    it('returns US locale for US date format in English', () => {
        expect(resolveI18nLocale({ language: 'en', dateFormat: 'MM/DD/YYYY' })).toBe('en-US');
    });

    it('returns GB locale for UK date format in English', () => {
        expect(resolveI18nLocale({ language: 'en', dateFormat: 'DD/MM/YYYY' })).toBe('en-GB');
    });

    it('returns RU locale for Russian date format in Russian', () => {
        expect(resolveI18nLocale({ language: 'ru', dateFormat: 'DD.MM.YYYY' })).toBe('ru-RU');
    });

    it('returns ES locale for Spanish with non-US date formats', () => {
        expect(resolveI18nLocale({ language: 'es', dateFormat: 'DD.MM.YYYY' })).toBe('es-ES');
        expect(resolveI18nLocale({ language: 'es', dateFormat: 'DD/MM/YYYY' })).toBe('es-ES');
    });

    it('returns US Spanish locale for Spanish with US date format', () => {
        expect(resolveI18nLocale({ language: 'es', dateFormat: 'MM/DD/YYYY' })).toBe('es-US');
    });
});
