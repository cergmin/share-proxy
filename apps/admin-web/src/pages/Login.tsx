import { useState, useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { authClient } from '../lib/auth-client';
import { useTranslation } from 'react-i18next';
import styles from './Login.module.css';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingSetup, setCheckingSetup] = useState(true);
    const router = useRouter();
    const { t } = useTranslation();

    useEffect(() => {
        const checkSetup = async () => {
            try {
                const response = await fetch('/api/setup/status');
                const data = await response.json();
                if (!data.hasUsers) {
                    router.navigate({ to: '/register' });
                }
            } catch (err) {
                console.error("Failed to check setup status", err);
            } finally {
                setCheckingSetup(false);
            }
        };
        checkSetup();
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: signInError } = await authClient.signIn.email({
            email,
            password,
        });

        if (signInError) {
            setError(signInError.message || t('login_failed'));
            setLoading(false);
            return;
        }

        router.navigate({ to: '/' });
    };

    if (checkingSetup) {
        return <div className={styles.container}>{t('connecting_securely')}</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h2>{t('app_name')}</h2>
                <p>{t('login_description')}</p>

                {error && <div className={styles.error}>{error}</div>}

                <form onSubmit={handleLogin} className={styles.form}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="email">{t('email')}</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label htmlFor="password">{t('password')}</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" disabled={loading} className={styles.submitBtn}>
                        {loading ? t('signing_in') : t('sign_in')}
                    </button>
                    {/* Dev note: Add a register method here if you need to create the first admin */}
                </form>
            </div>
        </div>
    );
}
