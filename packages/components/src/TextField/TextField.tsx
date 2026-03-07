import {
    TextField as AriaTextField,
    Label,
    Input,
    Text,
    FieldError,
    type TextFieldProps as AriaTextFieldProps,
    type ValidationResult
} from 'react-aria-components';
import styles from './TextField.module.css';

export interface TextFieldProps extends AriaTextFieldProps {
    label?: string;
    description?: string;
    errorMessage?: string | ((validation: ValidationResult) => string);
    placeholder?: string;
}

export function TextField({ label, description, errorMessage, placeholder, className, ...props }: TextFieldProps) {
    return (
        <AriaTextField
            {...props}
            className={({ isInvalid, isDisabled }) => `
            ${styles.field} 
            ${isInvalid ? styles.invalid : ''} 
            ${isDisabled ? styles.disabled : ''} 
            ${typeof className === 'function' ? className({ isInvalid, isDisabled } as any) : className || ''}
        `}
        >
            {label && <Label className={styles.label}>{label}</Label>}

            <Input className={styles.input} placeholder={placeholder} />

            {description && <Text className={styles.description} slot="description">{description}</Text>}

            <FieldError className={styles.error}>{errorMessage}</FieldError>
        </AriaTextField>
    );
}
