import React from 'react';
import {
    Button,
    FieldError,
    Label,
    ListBox,
    ListBoxItem,
    Popover,
    Select as AriaSelect,
    SelectValue,
    Text,
    SelectProps as AriaSelectProps,
    ValidationResult
} from 'react-aria-components';
import { MdExpandMore, MdCheck } from 'react-icons/md';
import styles from './Select.module.css';

export interface SelectProps<T extends object> extends Omit<AriaSelectProps<T>, 'children'> {
    label?: string;
    description?: string;
    errorMessage?: string | ((validation: ValidationResult) => string);
    items?: Iterable<T>;
    children: React.ReactNode | ((item: T) => React.ReactNode);
}

export function Select<T extends object>({ label, description, errorMessage, children, items, className, ...props }: SelectProps<T>) {
    return (
        <AriaSelect {...props} className={({ isDisabled }) => `${styles.select} ${isDisabled ? styles.disabled : ''} ${className || ''}`}>
            {label && <Label className={styles.label}>{label}</Label>}

            <Button className={styles.button}>
                <SelectValue className={styles.value} />
                <MdExpandMore size={20} className={styles.icon} />
            </Button>

            {description && <Text className={styles.description} slot="description">{description}</Text>}
            <FieldError className={styles.error}>{errorMessage}</FieldError>

            <Popover className={styles.popover} placement="bottom start">
                <ListBox items={items} className={styles.listbox}>
                    {children}
                </ListBox>
            </Popover>
        </AriaSelect>
    );
}

export function SelectItem(props: any) {
    return (
        <ListBoxItem {...props} className={({ isFocused, isSelected }) => `
      ${styles.item}
      ${isFocused ? styles.focusedItem : ''}
      ${isSelected ? styles.selectedItem : ''}
    `}>
            {({ isSelected }) => (
                <>
                    <span className={styles.itemText}>{props.children}</span>
                    {isSelected && <MdCheck size={16} className={styles.checkIcon} />}
                </>
            )}
        </ListBoxItem>
    );
}
