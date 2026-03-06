import { useEffect, useState, useRef } from 'react';
import { Link, useRouter, useLocation } from '@tanstack/react-router';
import { MdDashboard, MdStorage, MdLink, MdPerson, MdLogout, MdSettings } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { authClient } from '../lib/auth-client';
import styles from './Layout.module.css';

export function Layout({ children }: { children: React.ReactNode }) {
    console.log("[DEBUG] Render Layout");
    const [user, setUser] = useState<any>(null);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const location = useLocation();
    const { t } = useTranslation();

    useEffect(() => {
        authClient.getSession().then(({ data }) => {
            if (data?.user) {
                setUser(data.user);
            }
        });

        // Click outside to close menu
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const logout = async () => {
        await authClient.signOut();
        router.navigate({ to: '/login' });
    };

    const navItems = [
        { path: '/', label: t('nav_dashboard'), icon: MdDashboard },
        { path: '/sources', label: t('nav_sources'), icon: MdStorage },
        { path: '/links', label: t('nav_links'), icon: MdLink },
        { path: '/settings', label: t('nav_settings'), icon: MdSettings },
    ];

    return (
        <div className={styles.container}>
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.brandIcon}>
                        <span>S</span>
                    </div>
                    <div className={styles.brandText}>
                        <span className={styles.brandName}>Share Proxy</span>
                    </div>
                </div>

                <div className={styles.navGroup}>
                    <nav className={styles.nav}>
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                                >
                                    <Icon size={20} className={styles.navIcon} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className={styles.userSection} ref={menuRef}>
                    {isUserMenuOpen && (
                        <div className={styles.userMenuPopover}>
                            <div className={styles.popoverHeader}>
                                <div className={styles.userAvatar}>
                                    <MdPerson size={18} />
                                </div>
                                <div className={styles.userInfo}>
                                    <span className={styles.userName}>{user?.name || 'Admin'}</span>
                                    <span className={styles.userEmail}>{user?.email}</span>
                                </div>
                            </div>
                            <div className={styles.popoverDivider}></div>
                            <button onClick={logout} className={styles.popoverActionBtn}>
                                <MdLogout size={18} />
                                {t('logout')}
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className={`${styles.userProfileBtn} ${isUserMenuOpen ? styles.active : ''}`}
                    >
                        <div className={styles.userAvatar}>
                            <MdPerson size={18} />
                        </div>
                        <div className={styles.userInfo}>
                            <span className={styles.userName}>{user?.name || 'Admin'}</span>
                            <span className={styles.userEmail}>{user?.email}</span>
                        </div>
                    </button>
                </div>
            </aside>
            <main className={styles.content}>
                {children}
            </main>
        </div>
    );
}
