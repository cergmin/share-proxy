import { createContext, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';

export type Language = 'ru' | 'en' | 'es';
export type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
type TimeFormat = '12h' | '24h';

type SettingsState = {
    language: Language;
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
    setLanguage: (lang: Language) => void;
    setDateFormat: (format: DateFormat) => void;
    setTimeFormat: (format: TimeFormat) => void;
};

const initialState: SettingsState = {
    language: 'ru',
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    setLanguage: () => null,
    setDateFormat: () => null,
    setTimeFormat: () => null,
};

const SettingsContext = createContext<SettingsState>(initialState);

export function SettingsProvider({ children, storageKey = 'share-proxy-settings' }: { children: React.ReactNode, storageKey?: string }) {
    console.log("[DEBUG] Render SettingsProvider");
    const [settings, setSettings] = useState(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try {
                return { ...initialState, ...JSON.parse(stored) };
            } catch (_error) {
                return initialState;
            }
        }
        return initialState;
    });

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify({
            language: settings.language,
            dateFormat: settings.dateFormat,
            timeFormat: settings.timeFormat
        }));
        i18n.changeLanguage(settings.language);
    }, [settings, storageKey]);

    const value = {
        ...settings,
        setLanguage: (language: Language) => setSettings({ ...settings, language }),
        setDateFormat: (dateFormat: DateFormat) => setSettings({ ...settings, dateFormat }),
        setTimeFormat: (timeFormat: TimeFormat) => setSettings({ ...settings, timeFormat }),
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined)
        throw new Error('useSettings must be used within a SettingsProvider');
    return context;
};

export const resolveI18nLocale = ({
    language,
    dateFormat,
}: Pick<SettingsState, 'language' | 'dateFormat'>): string => {
    // `I18nProvider` locale drives Intl-based formatting (dates, numbers, calendar),
    // so we derive regional locale from both selected language and date format.
    if (language === 'es') {
        if (dateFormat === 'MM/DD/YYYY') return 'es-US';
        return 'es-ES';
    }
    if (dateFormat === 'MM/DD/YYYY') return 'en-US';
    if (dateFormat === 'DD/MM/YYYY') return 'en-GB';
    return language === 'en' ? 'en-GB' : 'ru-RU';
};
