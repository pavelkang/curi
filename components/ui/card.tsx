// Astryx Card, behind the old import path. Astryx has no CardHeader /
// CardTitle / CardDescription / CardContent / CardFooter subcomponents —
// pages compose Astryx Heading, Text and VStack inside the Card instead,
// and nested cards are out (Astryx: cards are the exception, never
// nested). Only `Card` is exported from here now.

import * as React from "react";
import {Card as AstryxCard} from "@astryxdesign/core/Card";

export interface CardProps {
  className?: string;
  children?: React.ReactNode;
}

export function Card({className, children}: CardProps) {
  return (
    <AstryxCard className={className} elevation="none">
      {children}
    </AstryxCard>
  );
}
