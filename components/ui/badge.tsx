// Astryx Badge, behind the old import path. Astryx reserves badges for
// status and category, one or two words — no badge as decoration.
// Mapping: default → purple (Curi violet), secondary/outline → neutral,
// destructive → error. `label` is the badge text.

import * as React from "react";
import {Badge as AstryxBadge} from "@astryxdesign/core/Badge";

type AstryxBadgeVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'purple';

const variantMap: Record<string, AstryxBadgeVariant> = {
  default: 'purple',
  secondary: 'neutral',
  destructive: 'error',
  outline: 'neutral',
};

export interface BadgeProps {
  variant?: keyof typeof variantMap;
  className?: string;
  children?: React.ReactNode;
}

export function Badge({variant = 'default', className, children}: BadgeProps) {
  const label =
    React.Children.toArray(children)
      .filter((c): c is string => typeof c === 'string')
      .join('')
      .trim() || 'Badge';
  return <AstryxBadge label={label} variant={variantMap[variant]} className={className} />;
}
