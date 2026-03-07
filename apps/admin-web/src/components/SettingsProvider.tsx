import { createContext, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';

type Language = 'ru' | 'en';
type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
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

export const getLocaleFromSettings = (_lang: Language, dateFormat: DateFormat): string => {
    if (dateFormat === 'MM/DD/YYYY') return 'en-US';
    if (dateFormat === 'DD/MM/YYYY') return 'en-GB';
    return 'ru-RU'; // DD.MM.YYYY
};
