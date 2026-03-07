import {
    Button,
    Calendar as AriaCalendar,
    CalendarCell,
    CalendarGrid,
    CalendarGridBody,
    CalendarGridHeader,
    CalendarHeaderCell,
    DatePicker as AriaDatePicker,
    DateInput,
    DateSegment,
    Dialog,
    Group,
    Heading,
    Label,
    Popover,
    Text,
    FieldError,
    type DatePickerProps as AriaDatePickerProps,
    type DateValue,
    type ValidationResult
} from 'react-aria-components';
import { MdChevronLeft, MdChevronRight, MdCalendarToday } from 'react-icons/md';
import styles from './Calendar.module.css';

export interface DatePickerProps extends AriaDatePickerProps<DateValue> {
    label?: string;
    description?: string;
    errorMessage?: string | ((validation: ValidationResult) => string);
}

export function DatePicker({ label, description, errorMessage, className, ...props }: DatePickerProps) {
    return (
        <AriaDatePicker
            {...props}
            className={({ isDisabled }) => `${styles.datePicker} ${isDisabled ? styles.disabled : ''} ${className || ''}`}
        >
            {label && <Label className={styles.label}>{label}</Label>}

            <Group className={styles.fieldGroup}>
                <DateInput className={styles.dateInput}>
                    {(segment) => <DateSegment segment={segment} className={styles.dateSegment} />}
                </DateInput>
                <Button className={styles.calendarButton}>
                    <MdCalendarToday size={18} />
                </Button>
            </Group>

            {description && <Text className={styles.description} slot="description">{description}</Text>}
            <FieldError className={styles.error}>{errorMessage}</FieldError>

            <Popover className={styles.popover} placement="bottom start" offset={8}>
                <Dialog className={styles.dialog}>
                    <AriaCalendar className={styles.calendar}>
                        <header className={styles.header}>
                            <Button slot="previous" className={styles.navButton}><MdChevronLeft size={20} /></Button>
                            <Heading className={styles.heading} />
                            <Button slot="next" className={styles.navButton}><MdChevronRight size={20} /></Button>
                        </header>

                        <CalendarGrid className={styles.grid}>
                            <CalendarGridHeader>
                                {(day) => <CalendarHeaderCell className={styles.headerCell}>{day}</CalendarHeaderCell>}
                            </CalendarGridHeader>
                            <CalendarGridBody>
                                {(date) => (
                                    <CalendarCell date={date} className={({ isSelected, isDisabled, isOutsideVisibleRange, isHovered, isFocusVisible }) => `
                    ${styles.cell}
                    ${isSelected ? styles.selected : ''}
                    ${isDisabled ? styles.disabledCell : ''}
                    ${isOutsideVisibleRange ? styles.outsideRange : ''}
                    ${isHovered && !isDisabled && !isSelected ? styles.hovered : ''}
                    ${isFocusVisible ? styles.focused : ''}
                  `} />
                                )}
                            </CalendarGridBody>
                        </CalendarGrid>
                    </AriaCalendar>
                </Dialog>
            </Popover>
        </AriaDatePicker>
    );
}
