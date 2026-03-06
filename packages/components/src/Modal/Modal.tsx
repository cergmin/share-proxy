import React from 'react';
import { Modal as AriaModal, Dialog, ModalOverlay, Heading, Button } from 'react-aria-components';
import styles from './Modal.module.css';

export interface ModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    title?: string;
    children: React.ReactNode;
}

export function Modal({ isOpen, onOpenChange, title, children }: ModalProps) {
    return (
        <ModalOverlay
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            className={styles.overlay}
            isDismissable
        >
            <AriaModal className={styles.modal}>
                <Dialog className={styles.dialog}>
                    {({ close }) => (
                        <>
                            {title && (
                                <div className={styles.header}>
                                    <Heading slot="title" className={styles.title}>{title}</Heading>
                                    <Button onPress={close} className={styles.closeBtn}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </Button>
                                </div>
                            )}
                            <div className={styles.content}>
                                {children}
                            </div>
                        </>
                    )}
                </Dialog>
            </AriaModal>
        </ModalOverlay>
    );
}
