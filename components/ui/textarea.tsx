// Astryx TextArea, behind the old Textarea API (event-style onChange,
// optional label). Same label rule as Input: a label is always present
// for accessibility, hidden when the caller does not want it visible.

import * as React from "react";
import {TextArea as AstryxTextArea} from "@astryxdesign/core/TextArea";

export interface TextareaProps {
  id?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  isLabelHidden?: boolean;
  disabled?: boolean;
  required?: boolean;
  rows?: number;
  className?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
}

export function Textarea({
  id,
  value,
  defaultValue,
  placeholder,
  label,
  isLabelHidden,
  disabled,
  required,
  rows,
  className,
  onChange,
  onBlur,
}: TextareaProps) {
  const visibleLabel = label ?? placeholder ?? id ?? 'Field';
  return (
    <AstryxTextArea
      label={visibleLabel}
      isLabelHidden={isLabelHidden ?? !label}
      value={value ?? defaultValue ?? ''}
      onChange={(_v, e) => onChange?.(e)}
      placeholder={placeholder}
      isDisabled={disabled}
      isRequired={required}
      rows={rows}
      onBlur={onBlur}
      containerClassName={className}
      width="100%"
    />
  );
}
