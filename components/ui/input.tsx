// Astryx TextInput, behind the old Input API (event-style onChange,
// optional label). Astryx requires a label and a controlled value; when
// no visible label is wanted the label is hidden but kept for screen
// readers. `type="file"` has no Astryx equivalent — it renders a plain
// native file input, since that is the browser's own control.

import * as React from "react";
import {TextInput as AstryxTextInput} from "@astryxdesign/core/TextInput";

export interface InputProps {
  id?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  isLabelHidden?: boolean;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  controlClassName?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  accept?: string;
}

const textInputTypes = new Set(['text', 'password', 'email', 'search', 'tel', 'url']);

export function Input({
  id,
  type = 'text',
  value,
  defaultValue,
  placeholder,
  label,
  isLabelHidden,
  disabled,
  required,
  autoComplete,
  className,
  controlClassName,
  onChange,
  onBlur,
  onKeyDown,
  accept,
}: InputProps) {
  if (!textInputTypes.has(type)) {
    // Native fallback (today: only type="file").
    return (
      <input
        id={id}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        accept={accept}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={className}
      />
    );
  }
  const visibleLabel = label ?? placeholder ?? id ?? 'Field';
  return (
    <AstryxTextInput
      type={type as 'text' | 'password' | 'email' | 'search' | 'tel' | 'url'}
      label={visibleLabel}
      isLabelHidden={isLabelHidden ?? !label}
      value={value ?? defaultValue ?? ''}
      onChange={(_v, e) => onChange?.(e)}
      placeholder={placeholder}
      isDisabled={disabled}
      isRequired={required}
      autoComplete={autoComplete}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      containerClassName={className}
      controlClassName={controlClassName}
      width="100%"
    />
  );
}
