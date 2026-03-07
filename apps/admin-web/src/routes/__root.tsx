import * as React from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { I18nProvider } from '@share-proxy/components'
import { ThemeProvider } from '../components/ThemeProvider'
import { SettingsProvider, useSettings, getI18nLocaleFromSettings } from '../components/SettingsProvider'

function AppWrapper() {
    console.log("[DEBUG] Render AppWrapper");
    const { language, dateFormat } = useSettings();
    const locale = getI18nLocaleFromSettings(language, dateFormat);

    return (
        <I18nProvider locale={locale}>
            <ThemeProvider>
                <React.Fragment>
                    <Outlet />
                    <TanStackRouterDevtools />
                </React.Fragment>
            </ThemeProvider>
        </I18nProvider>
    )
}

function RootComponent() {
    console.log("[DEBUG] Render RootComponent");
    return (
        <SettingsProvider>
            <AppWrapper />
        </SettingsProvider>
    )
}

export const Route = createRootRoute({
    component: RootComponent,
})
