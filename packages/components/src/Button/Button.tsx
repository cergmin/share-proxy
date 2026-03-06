import React from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import styles from './Button.module.css';

export interface ButtonProps extends AriaButtonProps {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    children: React.ReactNode;
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
    return (
        <AriaButton
            {...props}
            className={({ isPressed, isHovered, isFocusVisible }) => `
        ${styles.button} 
        ${styles[variant]} 
        ${isPressed ? styles.pressed : ''} 
        ${isHovered ? styles.hovered : ''} 
        ${isFocusVisible ? styles.focused : ''}
        ${typeof className === 'function' ? className({ isPressed, isHovered, isFocusVisible } as any) : className || ''}
      `}
        >
            {children}
        </AriaButton>
    );
}
