import { createContext, useContext } from 'react';
import {
    RadioGroup as AriaRadioGroup,
    Radio as AriaRadio,
    Label,
    type RadioGroupProps as AriaRadioGroupProps,
    type RadioProps as AriaRadioProps,
} from 'react-aria-components';
import styles from './RadioGroup.module.css';

const RadioContext = createContext<{ variant: 'default' | 'tabs' }>({ variant: 'default' });

export interface RadioGroupProps extends AriaRadioGroupProps {
    label?: string;
    description?: string;
    errorMessage?: string;
    variant?: 'default' | 'tabs';
    children: React.ReactNode;
}

export function RadioGroup({ label, description, errorMessage, variant = 'default', children, ...props }: RadioGroupProps) {
    return (
        <RadioContext.Provider value={{ variant }}>
            <AriaRadioGroup {...props} className={styles.group}>
                {label && <Label className={styles.label}>{label}</Label>}
                <div className={`${styles.options} ${styles[`options-${variant}`]}`}>
                    {children}
                </div>
                {description && <div className={styles.description} slot="description">{description}</div>}
                {errorMessage && <div className={styles.error} slot="errorMessage">{errorMessage}</div>}
            </AriaRadioGroup>
        </RadioContext.Provider>
    );
}

export function Radio({ children, ...props }: AriaRadioProps) {
    const { variant } = useContext(RadioContext);

    return (
        <AriaRadio {...props} className={({ isFocusVisible, isSelected, isDisabled }) => `
            ${styles.radio}
            ${styles[`radio-${variant}`]}
            ${isSelected ? styles.selected : ''}
            ${isFocusVisible ? styles.focusVisible : ''}
            ${isDisabled ? styles.disabled : ''}
        `}>
            {(renderProps) => (
                <>
                    {variant === 'default' && <div className={styles.indicator} />}
                    {typeof children === 'function' ? children(renderProps) : children}
                </>
            )}
        </AriaRadio>
    );
}
