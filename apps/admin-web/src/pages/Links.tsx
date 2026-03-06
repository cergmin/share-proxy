import { useEffect, useState } from 'react';
import { useSettings } from '../components/SettingsProvider';
import { api } from '../lib/api';
import styles from './Page.module.css';
import { MdAdd, MdEdit, MdDelete, MdClose, MdSave, MdCheck, MdDoNotDisturbAlt, MdFolder, MdInsertDriveFile, MdPlaylistPlay, MdArrowBack } from 'react-icons/md';
import { Button, TextField, Select, SelectItem, DatePicker, RadioGroup, Radio, Modal } from '@share-proxy/components';
import { useTranslation } from 'react-i18next';
import { parseDateTime } from '@internationalized/date';

type Source = { id: string; name: string; type: string };
type Resource = { id: string; name: string; type: string; externalId: string; sourceId: string };
type LinkItem = { id: string; active: boolean; expiresAt: string | null; createdAt: string; resource: Resource };

const RESOURCE_TYPES = [
    { id: 'file', name: 'File' },
    { id: 'folder', name: 'Folder' },
    { id: 'playlist', name: 'Playlist' }
];

export function Links() {
    console.log("[DEBUG] Render Links");
    const { timeFormat } = useSettings();
    const { t } = useTranslation();
    const [links, setLinks] = useState<LinkItem[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingId, setEditingId] = useState<string | null>(null);

    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerItems, setPickerItems] = useState<any[]>([]);
    const [pickerPath, setPickerPath] = useState<{ id: string, name: string }[]>([]);

    // Dialog states
    const [alertState, setAlertState] = useState({ isOpen: false, message: '', title: '' });
    const [confirmState, setConfirmState] = useState({ isOpen: false, message: '', targetId: '' });

    const [formData, setFormData] = useState({
        sourceId: '',
        externalId: '',
        name: '',
        type: 'file',
        active: true,
        expiresAt: '',
        expirationType: 'none', // 'none' | 'specific' | 'relative'
        relativeValue: 1,
        relativeUnit: 'hours' // 'hours' | 'days' | 'weeks'
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [linksData, sourcesData] = await Promise.all([
                api.get('/api/links'),
                api.get('/api/sources')
            ]);
            setLinks(linksData);
            setSources(sourcesData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchTree = async (parentId?: string) => {
        if (!formData.sourceId) return;
        setPickerLoading(true);
        try {
            let url = `/api/sources/${formData.sourceId}/tree`;
            if (parentId) {
                url += `?parentId=${parentId}`;
            }
            const data = await api.get(url);
            setPickerItems(data || []);
        } catch (e: any) {
            setAlertState({ isOpen: true, message: "Error fetching directory: " + e.message, title: 'Error' });
        } finally {
            setPickerLoading(false);
        }
    };

    const openPicker = () => {
        if (!formData.sourceId) return;
        setPickerPath([]);
        setPickerItems([]);
        setIsPickerOpen(true);
        fetchTree();
    };

    const handlePickerNavigate = (item: any) => {
        if (item.type === 'folder') {
            setPickerPath(p => [...p, { id: item.id, name: item.name }]);
            fetchTree(item.id);
        } else {
            // Select file/playlist
            setFormData(prev => ({
                ...prev,
                externalId: item.id,
                name: prev.name || item.name,
                type: item.type
            }));
            setIsPickerOpen(false);
        }
    };

    const handlePickerBack = () => {
        const newPath = [...pickerPath];
        newPath.pop();
        setPickerPath(newPath);
        const parentId = newPath.length > 0 ? newPath[newPath.length - 1].id : undefined;
        fetchTree(parentId);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let finalExpiresAt = null;

            if (formData.expirationType === 'specific' && formData.expiresAt) {
                finalExpiresAt = new Date(formData.expiresAt).toISOString();
            } else if (formData.expirationType === 'relative') {
                const now = new Date();
                const val = Number(formData.relativeValue);
                if (formData.relativeUnit === 'hours') now.setHours(now.getHours() + val);
                if (formData.relativeUnit === 'days') now.setDate(now.getDate() + val);
                if (formData.relativeUnit === 'weeks') now.setDate(now.getDate() + val * 7);
                finalExpiresAt = now.toISOString();
            }

            const payload = {
                sourceId: formData.sourceId,
                externalId: formData.externalId,
                name: formData.name,
                type: formData.type,
                active: formData.active,
                expiresAt: finalExpiresAt
            };

            if (editingId) {
                await api.put(`/api/links/${editingId}`, payload);
            } else {
                await api.post('/api/links', payload);
            }
            setView('list');
            fetchData();
        } catch (e: any) {
            setAlertState({ isOpen: true, message: t('error_saving_link') + e.message, title: 'Error' });
        }
    };

    const handleDeleteClick = (id: string) => {
        setConfirmState({ isOpen: true, message: t('delete_link_confirm'), targetId: id });
    };

    const executeDelete = async () => {
        if (!confirmState.targetId) return;
        try {
            await api.delete(`/api/links/${confirmState.targetId}`);
            setConfirmState({ isOpen: false, message: '', targetId: '' });
            fetchData();
        } catch (e: any) {
            setConfirmState({ isOpen: false, message: '', targetId: '' });
            setAlertState({ isOpen: true, message: t('error_deleting_link') + e.message, title: 'Error' });
        }
    };

    const openEdit = (link: LinkItem) => {
        setFormData({
            sourceId: link.resource.sourceId,
            externalId: link.resource.externalId,
            name: link.resource.name,
            type: link.resource.type,
            active: link.active,
            expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : '',
            expirationType: link.expiresAt ? 'specific' : 'none',
            relativeValue: 1,
            relativeUnit: 'hours'
        });
        setEditingId(link.id);
        setView('form');
    };

    const openNew = () => {
        setFormData({
            sourceId: sources[0]?.id || '',
            externalId: '',
            name: '',
            type: 'file',
            active: true,
            expiresAt: '',
            expirationType: 'none',
            relativeValue: 1,
            relativeUnit: 'hours'
        });
        setEditingId(null);
        setView('form');
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t('links_title')}</h1>
                    <p className={styles.description}>{t('links_description')}</p>
                </div>
                {view === 'list' && (
                    <Button variant="primary" onPress={openNew}>
                        <MdAdd size={20} /> {t('create_link')}
                    </Button>
                )}
            </div>

            {view === 'list' ? (
                <div className={styles.card}>
                    {loading ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('loading')}</p>
                    ) : links.length === 0 ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('no_links')}</p>
                    ) : (
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>{t('name')}</th>
                                        <th>{t('type')}</th>
                                        <th>{t('status')}</th>
                                        <th>{t('target_id')}</th>
                                        <th>{t('created')}</th>
                                        <th style={{ textAlign: 'right' }}>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {links.map(l => (
                                        <tr key={l.id}>
                                            <td style={{ fontWeight: 500 }}>{l.resource.name}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{l.resource.type}</td>
                                            <td>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: l.active ? 'hsl(142 76% 36%)' : 'hsl(var(--destructive))' }}>
                                                    {l.active ? <MdCheck size={16} /> : <MdDoNotDisturbAlt size={16} />}
                                                    {l.active ? t('active') : t('inactive')}
                                                </span>
                                            </td>
                                            <td style={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}>
                                                {l.resource.externalId.length > 15 ? l.resource.externalId.slice(0, 15) + '...' : l.resource.externalId}
                                            </td>
                                            <td style={{ color: 'hsl(var(--muted-foreground))' }}>{new Date(l.createdAt).toLocaleDateString()}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className={styles.iconBtn} onClick={() => openEdit(l)}><MdEdit /></button>
                                                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteClick(l.id)}><MdDelete /></button>
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
                        <h2 className={styles.cardTitle}>{editingId ? t('edit_link') : t('create_link')}</h2>
                        <button className={styles.iconBtn} onClick={() => setView('list')}><MdClose /></button>
                    </div>
                    <form onSubmit={handleSave} className={styles.form}>
                        {sources.length === 0 ? (
                            <p style={{ color: 'hsl(var(--destructive))' }}>{t('no_sources_error')}</p>
                        ) : (
                            <>
                                <Select
                                    label={t('storage_source')}
                                    defaultSelectedKey={formData.sourceId}
                                    onSelectionChange={(key) => key && setFormData({ ...formData, sourceId: key.toString() })}
                                    items={sources}
                                    isDisabled={!!editingId}
                                >
                                    {(item: any) => <SelectItem>{item.name} ({item.type})</SelectItem>}
                                </Select>

                                <div className={styles.grid}>
                                    <TextField
                                        label={t('resource_name')}
                                        placeholder={t('resource_name_placeholder')}
                                        value={formData.name}
                                        onChange={(val) => setFormData({ ...formData, name: val })}
                                        isRequired
                                    />
                                    <Select
                                        label={t('resource_type')}
                                        defaultSelectedKey={formData.type}
                                        onSelectionChange={(key) => key && setFormData({ ...formData, type: key.toString() })}
                                        items={RESOURCE_TYPES}
                                        isDisabled={!!editingId}
                                    >
                                        {(item: any) => <SelectItem>{item.name}</SelectItem>}
                                    </Select>
                                </div>

                                <div className={styles.grid} style={{ alignItems: 'end' }}>
                                    <TextField
                                        label={t('external_id')}
                                        description={t('external_id_desc')}
                                        placeholder={t('external_id_placeholder')}
                                        value={formData.externalId}
                                        onChange={(val) => setFormData({ ...formData, externalId: val })}
                                        isDisabled={!!editingId}
                                        isRequired
                                    />
                                    {!editingId && (
                                        <div style={{ paddingBottom: '24px' }}>
                                            <Button variant="secondary" onPress={openPicker} isDisabled={!formData.sourceId}>
                                                {t('select_resource')}
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.grid}>
                                    <RadioGroup
                                        label={t('expiration')}
                                        value={formData.expirationType}
                                        onChange={(val) => setFormData({ ...formData, expirationType: val as any })}
                                    >
                                        <Radio value="none">{t('none')}</Radio>
                                        <Radio value="specific">{t('specific_date')}</Radio>
                                        <Radio value="relative">{t('relative_date')}</Radio>
                                    </RadioGroup>

                                    {formData.expirationType === 'specific' && (
                                        <DatePicker
                                            label={t('expiration_date')}
                                            description={t('expiration_date_desc')}
                                            value={formData.expiresAt ? parseDateTime(formData.expiresAt) : null}
                                            onChange={(val) => setFormData({ ...formData, expiresAt: val ? val.toString().slice(0, 16) : '' })}
                                            granularity="minute"
                                            hourCycle={timeFormat === '24h' ? 24 : 12}
                                        />
                                    )}

                                    {formData.expirationType === 'relative' && (
                                        <div className={styles.grid} style={{ gap: '8px', alignItems: 'end' }}>
                                            <TextField
                                                label={t('duration')}
                                                type="number"
                                                value={formData.relativeValue.toString()}
                                                onChange={(val) => setFormData({ ...formData, relativeValue: Math.max(1, parseInt(val) || 1) })}
                                            />
                                            <Select
                                                label={t('unit')}
                                                selectedKey={formData.relativeUnit}
                                                onSelectionChange={(key) => key && setFormData({ ...formData, relativeUnit: key.toString() })}
                                                items={[
                                                    { id: 'hours', name: t('hours') },
                                                    { id: 'days', name: t('days') },
                                                    { id: 'weeks', name: t('weeks') }
                                                ]}
                                            >
                                                {(item: any) => <SelectItem>{item.name}</SelectItem>}
                                            </Select>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.checkboxContainer}>
                                    <input
                                        type="checkbox"
                                        id="activeCheckbox"
                                        className={styles.checkbox}
                                        checked={formData.active}
                                        onChange={e => setFormData({ ...formData, active: e.target.checked })}
                                    />
                                    <label htmlFor="activeCheckbox" className={styles.label} style={{ cursor: 'pointer' }}>{t('active_checkbox')}</label>
                                </div>

                                <div className={styles.formActions}>
                                    <Button variant="ghost" onPress={() => setView('list')}>{t('cancel')}</Button>
                                    <Button variant="primary" type="submit"><MdSave size={18} /> {t('save')}</Button>
                                </div>
                            </>
                        )}
                    </form>
                </div>
            )}

            <Modal isOpen={isPickerOpen} onOpenChange={setIsPickerOpen} title={t('select_resource')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '400px' }}>
                    {pickerPath.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Button variant="ghost" onPress={handlePickerBack} style={{ padding: '4px 8px' }}>
                                <MdArrowBack /> {t('back_up')}
                            </Button>
                            <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                                / {pickerPath.map(p => p.name).join(' / ')}
                            </span>
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}>
                        {pickerLoading ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>{t('loading')}</div>
                        ) : pickerItems.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Empty directory</div>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {pickerItems.map(item => (
                                    <li key={item.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                                        <button
                                            onClick={() => handlePickerNavigate(item)}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '12px 16px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'hsl(var(--foreground))',
                                                cursor: 'pointer',
                                                textAlign: 'left'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'hsl(var(--accent))'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {item.type === 'folder' ? <MdFolder size={24} color="hsl(var(--primary))" /> :
                                                item.type === 'playlist' ? <MdPlaylistPlay size={24} color="hsl(var(--primary))" /> :
                                                    <MdInsertDriveFile size={24} color="hsl(var(--muted-foreground))" />}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 500 }}>{item.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                                                    {item.type === 'folder' ? t('folder') : item.type === 'playlist' ? t('playlist') : t('file')}
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                        <Button variant="ghost" onPress={() => setIsPickerOpen(false)}>{t('close')}</Button>
                    </div>
                </div>
            </Modal>

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
