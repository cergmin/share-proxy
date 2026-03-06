import React, { useState, useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { authClient } from '../lib/auth-client';
import { useTranslation } from 'react-i18next';
import styles from './Login.module.css'; // Reusing Login CSS for now

export function Register() {
    const [name, setName] = useState('');
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
                if (data.hasUsers) {
                    // Users already exist, do not allow registration here
                    router.navigate({ to: '/login' });
                }
            } catch (err) {
                console.error("Failed to check setup status", err);
            } finally {
                setCheckingSetup(false);
            }
        };
        checkSetup();
    }, [router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: signUpError } = await authClient.signUp.email({
            name,
            email,
            password,
        });

        if (signUpError) {
            setError(signUpError.message || t('registration_failed'));
            setLoading(false);
            return;
        }

        router.navigate({ to: '/' });
    };

    if (checkingSetup) {
        return <div className={styles.container}>{t('checking_initial_config')}</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h2>{t('welcome_title')}</h2>
                <p>{t('welcome_description')}</p>

                {error && <div className={styles.error}>{error}</div>}

                <form onSubmit={handleRegister} className={styles.form}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="name">{t('name')}</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
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
                            minLength={8}
                        />
                    </div>
                    <button type="submit" disabled={loading} className={styles.submitBtn}>
                        {loading ? t('creating_account') : t('create_account')}
                    </button>
                </form>
            </div>
        </div>
    );
}
