import styles from './Page.module.css';
import { useSettings } from '../components/SettingsProvider';
import { useTheme } from '../components/ThemeProvider';
import { RadioGroup, Radio, Select, SelectItem } from '@share-proxy/components';
import { useTranslation } from 'react-i18next';

const FlagRU = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 6" width="18" height="12" style={{ borderRadius: '2px' }}>
        <rect fill="#fff" width="9" height="3" />
        <rect fill="#d52b1e" y="3" width="9" height="3" />
        <rect fill="#0039a6" y="2" width="9" height="2" />
    </svg>
);

const FlagEN = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="18" height="12" style={{ borderRadius: '2px' }}>
        <clipPath id="t">
            <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
);

const FlagES = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="18" height="12" style={{ borderRadius: '2px' }}>
        <rect width="3" height="2" fill="#AA151B" />
        <rect y="0.5" width="3" height="1" fill="#F1BF00" />
    </svg>
);

const ThemeIllustration = ({ type }: { type: 'light' | 'dark' | 'system' }) => {
    const renderWindow = (theme: 'light' | 'dark', clipId?: string) => {
        const bg = theme === 'light' ? '#f4f4f5' : '#09090b';
        const top = theme === 'light' ? '#e4e4e7' : '#18181b';
        const sidebar = theme === 'light' ? '#ffffff' : '#000000';
        const line = theme === 'light' ? '#e4e4e7' : '#27272a';
        const text = theme === 'light' ? '#18181b' : '#fafafa';
        const card = theme === 'light' ? '#ffffff' : '#18181b';
        const border = theme === 'light' ? '#e4e4e7' : '#27272a';

        return (
            <g clipPath={clipId ? `url(#${clipId})` : undefined}>
                <rect width="200" height="130" fill={bg} />
                {/* Browser outline */}
                <rect x="10" y="10" width="180" height="110" rx="6" fill={bg} stroke={border} strokeWidth="1.5" />
                {/* Top bar */}
                <path d="M10 16a6 6 0 0 1 6-6h168a6 6 0 0 1 6 6v14H10z" fill={top} stroke={border} strokeWidth="1.5" />
                <circle cx="22" cy="17" r="3.5" fill="#ff5f56" />
                <circle cx="34" cy="17" r="3.5" fill="#ffbd2e" />
                <circle cx="46" cy="17" r="3.5" fill="#27c93f" />

                {/* Sidebar */}
                <rect x="10" y="30" width="50" height="90" fill={sidebar} stroke={border} strokeWidth="1.5" />
                <circle cx="22" cy="45" r="5" fill={line} />
                <rect x="32" y="43" width="20" height="4" rx="2" fill={line} />

                <rect x="18" y="60" width="30" height="4" rx="2" fill={line} />
                <rect x="18" y="70" width="25" height="4" rx="2" fill={line} />
                <rect x="18" y="80" width="28" height="4" rx="2" fill={line} />
                <rect x="18" y="90" width="22" height="4" rx="2" fill={line} />

                {/* Main area */}
                <text x="75" y="48" fill={text} fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">{theme === 'dark' ? 'Your dashboard' : 'Welcome back'}</text>
                <rect x="75" y="58" width="60" height="4" rx="2" fill={line} />

                <rect x="75" y="70" width="105" height="40" rx="4" fill={card} stroke={border} strokeWidth="1.5" />
            </g>
        );
    }

    return (
        <svg viewBox="0 0 200 130" width="100%" height="auto" style={{ display: 'block', pointerEvents: 'none' }}>
            {type === 'system' ? (
                <>
                    <defs>
                        <clipPath id="left-half-clip">
                            <polygon points="0,0 120,0 80,130 0,130" />
                        </clipPath>
                        <clipPath id="right-half-clip">
                            <polygon points="120,0 200,0 200,130 80,130" />
                        </clipPath>
                    </defs>
                    {renderWindow('light', 'left-half-clip')}
                    {renderWindow('dark', 'right-half-clip')}
                    <line x1="120" y1="0" x2="80" y2="130" stroke="hsl(var(--border))" strokeWidth="2" />
                </>
            ) : type === 'light' ? (
                renderWindow('light')
            ) : (
                renderWindow('dark')
            )}
        </svg>
    );
};

const ThemeOption = ({ value, label, current, onChange, children }: any) => {
    const isSelected = value === current;
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', cursor: 'pointer' }}>
            <input
                type="radio"
                name="theme"
                value={value}
                checked={isSelected}
                onChange={() => onChange(value)}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
            />
            <div style={{
                border: `2px solid ${isSelected ? 'hsl(var(--foreground))' : 'transparent'}`,
                borderRadius: '10px',
                padding: '4px',
                transition: 'border-color 0.2s',
            }}>
                <div style={{
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))'
                }}>
                    {children}
                </div>
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>{label}</span>
        </label>
    );
};

export function Settings() {
    const { language, dateFormat, timeFormat, setLanguage, setDateFormat, setTimeFormat } = useSettings();
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation();

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t('settings_title')}</h1>
                    <p className={styles.description}>{t('settings_description')}</p>
                </div>
            </div>

            <div className={styles.card} style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{t('interface_theme')}</div>
                        <div style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>{t('interface_theme_desc')}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
                        <ThemeOption value="system" label={t('system_preference')} current={theme} onChange={setTheme}>
                            <ThemeIllustration type="system" />
                        </ThemeOption>
                        <ThemeOption value="light" label={t('light')} current={theme} onChange={setTheme}>
                            <ThemeIllustration type="light" />
                        </ThemeOption>
                        <ThemeOption value="dark" label={t('dark')} current={theme} onChange={setTheme}>
                            <ThemeIllustration type="dark" />
                        </ThemeOption>
                    </div>
                </div>

                <div style={{ height: '1px', background: 'hsl(var(--border))' }} />

                <Select label={t('language')} selectedKey={language} onSelectionChange={(val) => setLanguage(val as any)}>
                    <SelectItem id="ru">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FlagRU /> <span>Русский</span>
                        </div>
                    </SelectItem>
                    <SelectItem id="en">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FlagEN /> <span>English</span>
                        </div>
                    </SelectItem>
                    <SelectItem id="es">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FlagES /> <span>Español</span>
                        </div>
                    </SelectItem>
                </Select>

                <RadioGroup label={t('date_format')} value={dateFormat} onChange={(val) => setDateFormat(val as any)}>
                    <Radio value="DD.MM.YYYY">DD.MM.YYYY (European / Russian)</Radio>
                    <Radio value="DD/MM/YYYY">DD/MM/YYYY (UK)</Radio>
                    <Radio value="MM/DD/YYYY">MM/DD/YYYY (US)</Radio>
                </RadioGroup>

                <RadioGroup label={t('time_format')} value={timeFormat} onChange={(val) => setTimeFormat(val as any)}>
                    <Radio value="24h">24-hour (e.g. 14:30)</Radio>
                    <Radio value="12h">12-hour (e.g. 02:30 PM)</Radio>
                </RadioGroup>
            </div>
        </div>
    );
}
