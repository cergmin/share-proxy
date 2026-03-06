import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './Page.module.css';
import { MdAdd, MdEdit, MdDelete, MdClose, MdSave, MdLink } from 'react-icons/md';
import { Button, TextField, Select, SelectItem, Modal } from '@share-proxy/components';
import { useTranslation } from 'react-i18next';

type Source = { id: string; name: string; type: string; createdAt: string; config?: string };

const SOURCE_TYPES = [
    { id: 'jellyfin', name: 'Jellyfin' },
    { id: 'gdrive', name: 'Google Drive' },
    { id: 's3', name: 'AWS S3' }
];

export function Sources() {
    const { t } = useTranslation();
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    // Dialog states
    const [alertState, setAlertState] = useState({ isOpen: false, message: '', title: '' });
    const [confirmState, setConfirmState] = useState({ isOpen: false, message: '', targetId: '' });

    const [name, setName] = useState('');
    const [type, setType] = useState('jellyfin');

    // Config fields mapped to UI
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');

    const fetchSources = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/sources');
            setSources(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    const handleTestConnection = async () => {
        setIsTesting(true);
        try {
            const compiledConfig = { url, apiKey };
            await api.post('/api/sources/test', {
                type,
                config: compiledConfig
            });
            setAlertState({ isOpen: true, message: t('connection_success'), title: 'Success' });
        } catch (e: any) {
            setAlertState({ isOpen: true, message: t('connection_failed') + e.message, title: 'Error' });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Re-construct the config JSON based on the specific fields
            const compiledConfig = { url, apiKey };
            const payload = {
                name,
                type,
                config: compiledConfig
            };

            if (editingId) {
                await api.put(`/api/sources/${editingId}`, payload);
            } else {
                await api.post('/api/sources', payload);
            }
            setView('list');
            fetchSources();
        } catch (e: any) {
            setAlertState({ isOpen: true, message: t('error_saving') + e.message, title: 'Error' });
        }
    };

    const handleDeleteClick = (id: string) => {
        setConfirmState({ isOpen: true, message: t('delete_confirm'), targetId: id });
    };

    const executeDelete = async () => {
        if (!confirmState.targetId) return;
        try {
            await api.delete(`/api/sources/${confirmState.targetId}`);
            setConfirmState({ isOpen: false, message: '', targetId: '' });
            fetchSources();
        } catch (e: any) {
            setConfirmState({ isOpen: false, message: '', targetId: '' });
            setAlertState({ isOpen: true, message: t('error_deleting') + e.message, title: 'Error' });
        }
    };

    const openEdit = (source: Source) => {
        setName(source.name);
        setType(source.type);
        // Note: Admin API currently strips config. We need to fetch the single source or change API
        // For demonstration, we leave URL/API blank to force re-entry if editing.
        setUrl('');
        setApiKey('');
        setEditingId(source.id);
        setView('form');
    };

    const openNew = () => {
        setName('');
        setType('jellyfin');
        setUrl('http://');
        setApiKey('');
        setEditingId(null);
        setView('form');
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t('sources_title')}</h1>
                    <p className={styles.description}>{t('sources_description')}</p>
                </div>
                {view === 'list' && (
                    <Button variant="primary" onPress={openNew}>
                        <MdAdd size={20} /> {t('add_source')}
                    </Button>
                )}
            </div>

            {view === 'list' ? (
                <div className={styles.card}>
                    {loading ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('loading')}</p>
                    ) : sources.length === 0 ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('no_sources')}</p>
                    ) : (
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>{t('name')}</th>
                                        <th>{t('type')}</th>
                                        <th>{t('created')}</th>
                                        <th style={{ textAlign: 'right' }}>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sources.map(s => (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 500 }}>{s.name}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{s.type}</td>
                                            <td style={{ color: 'hsl(var(--muted-foreground))' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className={styles.iconBtn} onClick={() => openEdit(s)}><MdEdit /></button>
                                                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteClick(s.id)}><MdDelete /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>{editingId ? t('edit_source') : t('new_source')}</h2>
                        <button className={styles.iconBtn} onClick={() => setView('list')}><MdClose /></button>
                    </div>
                    <form onSubmit={handleSave} className={styles.form}>
                        <TextField
                            label={t('source_name')}
                            placeholder={t('source_name_placeholder')}
                            value={name}
                            onChange={setName}
                            isRequired
                        />

                        <Select
                            label={t('storage_type')}
                            defaultSelectedKey={type}
                            onSelectionChange={(key) => key && setType(key.toString())}
                            items={SOURCE_TYPES}
                        >
                            {(item: any) => <SelectItem>{item.name}</SelectItem>}
                        </Select>

                        {type === 'jellyfin' && (
                            <div className={styles.grid}>
                                <TextField
                                    label={t('jellyfin_url')}
                                    description={t('jellyfin_url_desc')}
                                    placeholder="http://192.168.1.10:8096"
                                    value={url}
                                    onChange={setUrl}
                                    isRequired={!editingId}
                                />
                                <TextField
                                    label={t('api_key')}
                                    description={t('api_key_desc')}
                                    placeholder={t('api_key_placeholder')}
                                    type="password"
                                    value={apiKey}
                                    onChange={setApiKey}
                                    isRequired={!editingId}
                                />
                            </div>
                        )}

                        {type === 'gdrive' && (
                            <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('gdrive_desc')}</p>
                        )}

                        {type === 's3' && (
                            <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('s3_desc')}</p>
                        )}

                        <div className={styles.formActions}>
                            {(type === 'jellyfin') && (
                                <div style={{ marginRight: 'auto' }}>
                                    <Button variant="secondary" onPress={handleTestConnection} isDisabled={isTesting || !url || !apiKey}>
                                        <MdLink size={18} style={{ marginRight: '8px' }} />
                                        {isTesting ? t('testing_connection') : t('test_connection')}
                                    </Button>
                                </div>
                            )}
                            <Button variant="ghost" onPress={() => setView('list')}>{t('cancel')}</Button>
                            <Button variant="primary" type="submit"><MdSave size={18} /> {t('save')}</Button>
                        </div>
                    </form>
                </div>
            )}

            <Modal isOpen={alertState.isOpen} onOpenChange={(isOpen) => setAlertState(prev => ({ ...prev, isOpen }))} title={alertState.title || t('Notification')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <p style={{ margin: 0 }}>{alertState.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="primary" onPress={() => setAlertState(prev => ({ ...prev, isOpen: false }))}>
                            {t('close')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={confirmState.isOpen} onOpenChange={(isOpen) => setConfirmState(prev => ({ ...prev, isOpen }))} title={t('Confirmation')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <p style={{ margin: 0 }}>{confirmState.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <Button variant="ghost" onPress={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}>
                            {t('cancel')}
                        </Button>
                        <Button variant="primary" onPress={executeDelete} style={{ background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}>
                            {t('delete')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
