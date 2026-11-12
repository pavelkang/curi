// Astryx Button, behind the old shadcn-style import path so call sites
// keep `import { Button } from "@/components/ui/button"`.
//
// Mapping: default → primary, outline/secondary → secondary,
// ghost/link → ghost, destructive → destructive. Astryx Button takes a
// `label` (required, also the accessible name); string children become
// the label, and element children (icons) still render via `children`.
// Links use Astryx's native href + Next Link (`as`), not asChild.

import * as React from "react";
import Link from "next/link";
import {Button as AstryxButton} from "@astryxdesign/core/Button";

type AstryxVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type AstryxSize = 'sm' | 'md' | 'lg';

const variantMap: Record<string, AstryxVariant> = {
  default: 'primary',
  destructive: 'destructive',
  outline: 'secondary',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'ghost',
};

const sizeMap: Record<string, AstryxSize> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
};

export interface ButtonProps {
  variant?: keyof typeof variantMap;
  size?: keyof typeof sizeMap;
  label?: string;
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export function Button({
  variant = 'default',
  size = 'default',
  label,
  href,
  type = 'button',
  disabled,
  isLoading,
  className,
  style,
  onClick,
  children,
}: ButtonProps) {
  const textLabel =
    label ??
    React.Children.toArray(children)
      .filter((c): c is string => typeof c === 'string')
      .join('')
      .trim();
  // Secondary is a pale neutral fill with no border, which reads as a
  // disabled button. A visible edge makes an enabled secondary button
  // look enabled. It has to be an inline style: Astryx sets
  // borderWidth: 0 in unlayered StyleX, which beats Tailwind's layered
  // `border` utility. Primary/ghost/destructive are untouched.
  const mergedStyle =
    variant === 'secondary'
      ? { border: '1px solid var(--color-border-emphasized)', ...style }
      : style;
  return (
    <AstryxButton
      label={textLabel || 'Button'}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      type={type}
      isDisabled={disabled}
      isLoading={isLoading}
      className={className}
      style={mergedStyle}
      onClick={onClick}
      {...(href ? {href, as: Link} : {})}
    >
      {children}
    </AstryxButton>
  );
}

export {type AstryxVariant, type AstryxSize};
