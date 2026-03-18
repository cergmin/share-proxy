import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSettings } from '../components/SettingsProvider';
import { api } from '../lib/api';
import styles from './Page.module.css';
import {
    MdAdd,
    MdArrowBack,
    MdCheck,
    MdClose,
    MdContentCopy,
    MdDelete,
    MdDoNotDisturbAlt,
    MdEdit,
    MdFolder,
    MdInsertDriveFile,
    MdLink,
    MdLock,
    MdPlaylistPlay,
    MdPublic,
    MdSave,
} from 'react-icons/md';
import { Button, TextField, Select, SelectItem, DatePicker, RadioGroup, Radio, Modal } from '@share-proxy/components';
import { useTranslation } from 'react-i18next';
import { parseDateTime } from '@internationalized/date';

type Source = { id: string; name: string; type: string };
type Resource = { id: string; name: string; type: string; externalId: string; sourceId: string };
type AccessRule = { id?: string; type: 'public' | 'password' };
type LinkItem = {
    accessRules: AccessRule[];
    active: boolean;
    createdAt: string;
    expiresAt: string | null;
    id: string;
    resource: Resource;
    viewerUrl: string;
};

type AccessRuleFormItem = {
    clientId: string;
    id?: string;
    password: string;
    type: 'public' | 'password';
};

type FormState = {
    accessRules: AccessRuleFormItem[];
    active: boolean;
    expirationType: 'none' | 'specific' | 'relative';
    expiresAt: string;
    externalId: string;
    name: string;
    relativeUnit: 'hours' | 'days' | 'weeks';
    relativeValue: number;
    sourceId: string;
    type: string;
};

const RESOURCE_TYPES = [
    { id: 'file', name: 'File' },
    { id: 'folder', name: 'Folder' },
    { id: 'playlist', name: 'Playlist' },
];

function createAccessRuleItem(type: 'public' | 'password' = 'public', rule?: AccessRule): AccessRuleFormItem {
    return {
        clientId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        id: rule?.id,
        type,
        password: '',
    };
}

function createEmptyFormData(defaultSourceId = ''): FormState {
    return {
        sourceId: defaultSourceId,
        externalId: '',
        name: '',
        type: 'file',
        active: true,
        expiresAt: '',
        expirationType: 'none',
        relativeValue: 1,
        relativeUnit: 'hours',
        accessRules: [],
    };
}

function getAccessWarning(rules: AccessRuleFormItem[], t: (key: string) => string): string | null {
    if (rules.length === 0) {
        return t('link_access_warning_empty');
    }

    if (rules.some((rule) => rule.type === 'public') && rules.length > 1) {
        return t('link_access_warning_public_override');
    }

    return null;
}

export function Links() {
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
    const [pickerPath, setPickerPath] = useState<{ id: string; name: string }[]>([]);

    const [alertState, setAlertState] = useState({ isOpen: false, message: '', title: '' });
    const [confirmState, setConfirmState] = useState({ isOpen: false, message: '', targetId: '' });

    const [formData, setFormData] = useState<FormState>(createEmptyFormData());

    const fetchData = async () => {
        setLoading(true);
        try {
            const [linksData, sourcesData] = await Promise.all([
                api.get('/api/links'),
                api.get('/api/sources'),
            ]);
            setLinks(linksData);
            setSources(sourcesData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
    }, []);

    const fetchTree = async (parentId?: string) => {
        if (!formData.sourceId) {
            return;
        }

        setPickerLoading(true);
        try {
            let url = `/api/sources/${formData.sourceId}/tree`;
            if (parentId) {
                url += `?parentId=${parentId}`;
            }
            const data = await api.get(url);
            setPickerItems(data || []);
        } catch (error: any) {
            setAlertState({ isOpen: true, message: `Error fetching directory: ${error.message}`, title: 'Error' });
        } finally {
            setPickerLoading(false);
        }
    };

    const openPicker = () => {
        if (!formData.sourceId) {
            return;
        }

        setPickerPath([]);
        setPickerItems([]);
        setIsPickerOpen(true);
        void fetchTree();
    };

    const handlePickerNavigate = (item: any) => {
        if (item.type === 'folder') {
            setPickerPath((prev) => [...prev, { id: item.id, name: item.name }]);
            void fetchTree(item.id);
            return;
        }

        setFormData((prev) => ({
            ...prev,
            externalId: item.id,
            name: prev.name || item.name,
            type: item.type,
        }));
        setIsPickerOpen(false);
    };

    const handlePickerBack = () => {
        const newPath = [...pickerPath];
        newPath.pop();
        setPickerPath(newPath);
        const parentId = newPath.length > 0 ? newPath[newPath.length - 1].id : undefined;
        void fetchTree(parentId);
    };

    const handleAddRule = () => {
        setFormData((prev) => ({
            ...prev,
            accessRules: [...prev.accessRules, createAccessRuleItem()],
        }));
    };

    const handleRuleChange = (
        clientId: string,
        patch: Partial<Pick<AccessRuleFormItem, 'password' | 'type'>>,
    ) => {
        setFormData((prev) => ({
            ...prev,
            accessRules: prev.accessRules.map((rule) => {
                if (rule.clientId !== clientId) {
                    return rule;
                }

                if (patch.type && patch.type !== rule.type) {
                    return {
                        ...rule,
                        id: undefined,
                        type: patch.type,
                        password: '',
                    };
                }

                return {
                    ...rule,
                    ...patch,
                };
            }),
        }));
    };

    const handleRemoveRule = (clientId: string) => {
        setFormData((prev) => ({
            ...prev,
            accessRules: prev.accessRules.filter((rule) => rule.clientId !== clientId),
        }));
    };

    const copyViewerUrl = async (viewerUrl: string) => {
        try {
            if (!navigator.clipboard) {
                throw new Error(t('copy_not_supported'));
            }
            await navigator.clipboard.writeText(viewerUrl);
            setAlertState({ isOpen: true, message: t('viewer_url_copied'), title: t('notification') });
        } catch (error: any) {
            setAlertState({ isOpen: true, message: error.message, title: t('notification') });
        }
    };

    const buildAccessRulesPayload = () => {
        const payload = formData.accessRules.map((rule) => {
            if (rule.type === 'public') {
                return rule.id ? { id: rule.id, type: 'public' as const } : { type: 'public' as const };
            }

            if (!rule.id && !rule.password.trim()) {
                throw new Error(t('password_rule_required'));
            }

            if (rule.id && !rule.password.trim()) {
                return { id: rule.id, type: 'password' as const };
            }

            return rule.id
                ? { id: rule.id, type: 'password' as const, password: rule.password.trim() }
                : { type: 'password' as const, password: rule.password.trim() };
        });

        return payload;
    };

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();

        try {
            let finalExpiresAt: string | null = null;

            if (formData.expirationType === 'specific' && formData.expiresAt) {
                finalExpiresAt = new Date(formData.expiresAt).toISOString();
            } else if (formData.expirationType === 'relative') {
                const now = new Date();
                const value = Number(formData.relativeValue);
                if (formData.relativeUnit === 'hours') now.setHours(now.getHours() + value);
                if (formData.relativeUnit === 'days') now.setDate(now.getDate() + value);
                if (formData.relativeUnit === 'weeks') now.setDate(now.getDate() + value * 7);
                finalExpiresAt = now.toISOString();
            }

            const payload = {
                sourceId: formData.sourceId,
                externalId: formData.externalId,
                name: formData.name,
                type: formData.type,
                active: formData.active,
                expiresAt: finalExpiresAt,
                accessRules: buildAccessRulesPayload(),
            };

            if (editingId) {
                await api.put(`/api/links/${editingId}`, payload);
            } else {
                await api.post('/api/links', payload);
            }

            setView('list');
            await fetchData();
        } catch (error: any) {
            setAlertState({ isOpen: true, message: t('error_saving_link') + error.message, title: 'Error' });
        }
    };

    const handleDeleteClick = (id: string) => {
        setConfirmState({ isOpen: true, message: t('delete_link_confirm'), targetId: id });
    };

    const executeDelete = async () => {
        if (!confirmState.targetId) {
            return;
        }

        try {
            await api.delete(`/api/links/${confirmState.targetId}`);
            setConfirmState({ isOpen: false, message: '', targetId: '' });
            await fetchData();
        } catch (error: any) {
            setConfirmState({ isOpen: false, message: '', targetId: '' });
            setAlertState({ isOpen: true, message: t('error_deleting_link') + error.message, title: 'Error' });
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
            relativeUnit: 'hours',
            accessRules: link.accessRules.map((rule) => createAccessRuleItem(rule.type, rule)),
        });
        setEditingId(link.id);
        setView('form');
    };

    const openNew = () => {
        setFormData(createEmptyFormData(sources[0]?.id || ''));
        setEditingId(null);
        setView('form');
    };

    const accessWarning = getAccessWarning(formData.accessRules, t);

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
                                        <th>{t('viewer_url')}</th>
                                        <th>{t('status')}</th>
                                        <th>{t('target_id')}</th>
                                        <th>{t('created')}</th>
                                        <th style={{ textAlign: 'right' }}>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {links.map((link) => (
                                        <tr key={link.id}>
                                            <td style={{ fontWeight: 500 }}>{link.resource.name}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{link.resource.type}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
                                                    <a
                                                        href={link.viewerUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            color: 'hsl(var(--primary))',
                                                            textDecoration: 'none',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <MdLink size={16} />
                                                        <span>{link.viewerUrl}</span>
                                                    </a>
                                                    <button
                                                        className={styles.iconBtn}
                                                        onClick={() => void copyViewerUrl(link.viewerUrl)}
                                                        aria-label={t('copy_viewer_url')}
                                                        title={t('copy_viewer_url')}
                                                    >
                                                        <MdContentCopy />
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: link.active ? 'hsl(142 76% 36%)' : 'hsl(var(--destructive))' }}>
                                                    {link.active ? <MdCheck size={16} /> : <MdDoNotDisturbAlt size={16} />}
                                                    {link.active ? t('active') : t('inactive')}
                                                </span>
                                            </td>
                                            <td style={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}>
                                                {link.resource.externalId.length > 15 ? `${link.resource.externalId.slice(0, 15)}...` : link.resource.externalId}
                                            </td>
                                            <td style={{ color: 'hsl(var(--muted-foreground))' }}>{new Date(link.createdAt).toLocaleDateString()}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className={styles.iconBtn}
                                                    onClick={() => openEdit(link)}
                                                    aria-label={t('edit_link')}
                                                    title={t('edit_link')}
                                                >
                                                    <MdEdit />
                                                </button>
                                                <button
                                                    className={`${styles.iconBtn} ${styles.danger}`}
                                                    onClick={() => handleDeleteClick(link.id)}
                                                    aria-label={t('delete')}
                                                    title={t('delete')}
                                                >
                                                    <MdDelete />
                                                </button>
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
                                    selectedKey={formData.sourceId}
                                    onSelectionChange={(key) => key && setFormData((prev) => ({ ...prev, sourceId: key.toString() }))}
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
                                        onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                                        isRequired
                                    />
                                    <Select
                                        label={t('resource_type')}
                                        selectedKey={formData.type}
                                        onSelectionChange={(key) => key && setFormData((prev) => ({ ...prev, type: key.toString() }))}
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
                                        onChange={(value) => setFormData((prev) => ({ ...prev, externalId: value }))}
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
                                        onChange={(value) => setFormData((prev) => ({ ...prev, expirationType: value as FormState['expirationType'] }))}
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
                                            onChange={(value) => setFormData((prev) => ({ ...prev, expiresAt: value ? value.toString().slice(0, 16) : '' }))}
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
                                                onChange={(value) => setFormData((prev) => ({
                                                    ...prev,
                                                    relativeValue: Math.max(1, Number.parseInt(value, 10) || 1),
                                                }))}
                                            />
                                            <Select
                                                label={t('unit')}
                                                selectedKey={formData.relativeUnit}
                                                onSelectionChange={(key) => key && setFormData((prev) => ({ ...prev, relativeUnit: key.toString() as FormState['relativeUnit'] }))}
                                                items={[
                                                    { id: 'hours', name: t('hours') },
                                                    { id: 'days', name: t('days') },
                                                    { id: 'weeks', name: t('weeks') },
                                                ]}
                                            >
                                                {(item: any) => <SelectItem>{item.name}</SelectItem>}
                                            </Select>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                        <div>
                                            <div className={styles.label}>{t('access_rules')}</div>
                                            <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', marginTop: '4px' }}>
                                                {t('access_rules_description')}
                                            </div>
                                        </div>
                                        <Button variant="secondary" onPress={handleAddRule}>
                                            <MdAdd size={18} /> {t('add_rule')}
                                        </Button>
                                    </div>

                                    {accessWarning && (
                                        <div style={{
                                            borderRadius: '14px',
                                            padding: '12px 14px',
                                            background: 'hsl(var(--accent) / 0.7)',
                                            color: 'hsl(var(--foreground))',
                                            fontSize: '0.875rem',
                                        }}>
                                            {accessWarning}
                                        </div>
                                    )}

                                    {formData.accessRules.length === 0 ? (
                                        <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                                            {t('no_access_rules')}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {formData.accessRules.map((rule) => (
                                                <div
                                                    key={rule.clientId}
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: 'minmax(180px, 220px) 1fr auto',
                                                        gap: '12px',
                                                        alignItems: 'end',
                                                        padding: '14px',
                                                        borderRadius: '16px',
                                                        border: '1px solid hsl(var(--border))',
                                                    }}
                                                >
                                                    <label className={styles.formGroup}>
                                                        <span className={styles.label}>{t('rule_type')}</span>
                                                        <select
                                                            className={styles.select}
                                                            value={rule.type}
                                                            onChange={(event) => handleRuleChange(rule.clientId, { type: event.target.value as AccessRuleFormItem['type'] })}
                                                        >
                                                            <option value="public">{t('rule_public')}</option>
                                                            <option value="password">{t('rule_password')}</option>
                                                        </select>
                                                    </label>

                                                    {rule.type === 'password' ? (
                                                        <div className={styles.formGroup}>
                                                            <TextField
                                                                label={t('password')}
                                                                type="password"
                                                                value={rule.password}
                                                                onChange={(value) => handleRuleChange(rule.clientId, { password: value })}
                                                                placeholder={rule.id ? t('password_keep_placeholder') : t('password_new_placeholder')}
                                                            />
                                                            {rule.id && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                                                                    <MdLock size={14} />
                                                                    {t('password_keep_hint')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            color: 'hsl(142 76% 36%)',
                                                            fontSize: '0.9rem',
                                                            minHeight: '52px',
                                                        }}>
                                                            <MdPublic size={18} />
                                                            <span>{t('rule_public_hint')}</span>
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className={`${styles.iconBtn} ${styles.danger}`}
                                                        onClick={() => handleRemoveRule(rule.clientId)}
                                                        aria-label={t('delete')}
                                                        title={t('delete')}
                                                    >
                                                        <MdDelete />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className={styles.checkboxContainer}>
                                    <input
                                        type="checkbox"
                                        id="activeCheckbox"
                                        className={styles.checkbox}
                                        checked={formData.active}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, active: event.target.checked }))}
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
                                / {pickerPath.map((item) => item.name).join(' / ')}
                            </span>
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}>
                        {pickerLoading ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>{t('loading')}</div>
                        ) : pickerItems.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>{t('empty_directory')}</div>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {pickerItems.map((item) => (
                                    <li key={item.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                                        <button
                                            type="button"
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
                                                textAlign: 'left',
                                            }}
                                            onMouseOver={(event) => { event.currentTarget.style.background = 'hsl(var(--accent))'; }}
                                            onMouseOut={(event) => { event.currentTarget.style.background = 'transparent'; }}
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

            <Modal isOpen={alertState.isOpen} onOpenChange={(isOpen) => setAlertState((prev) => ({ ...prev, isOpen }))} title={alertState.title || t('notification')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <p style={{ margin: 0 }}>{alertState.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="primary" onPress={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}>
                            {t('close')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={confirmState.isOpen} onOpenChange={(isOpen) => setConfirmState((prev) => ({ ...prev, isOpen }))} title={t('confirmation')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <p style={{ margin: 0 }}>{confirmState.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <Button variant="ghost" onPress={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}>
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
