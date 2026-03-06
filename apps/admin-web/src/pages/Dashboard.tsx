import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTranslation } from 'react-i18next';
import styles from './Page.module.css';

export function Dashboard() {
    const { t } = useTranslation();
    const [counts, setCounts] = useState({ sources: 0, links: 0 });

    useEffect(() => {
        Promise.all([
            api.get('/api/sources').catch(() => []),
            api.get('/api/links').catch(() => [])
        ]).then(([sources, links]) => {
            setCounts({
                sources: sources.length,
                links: links.filter((l: any) => l.active).length
            });
        });
    }, []);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('dashboard_title')}</h1>
                <p className={styles.description}>
                    {t('dashboard_description')}
                </p>
            </div>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>{t('sources_configured')}</h3>
                    </div>
                    <p className={styles.cardContent}>{counts.sources}</p>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>{t('active_links')}</h3>
                    </div>
                    <p className={styles.cardContent}>{counts.links}</p>
                </div>
            </div>
        </div>
    );
}
