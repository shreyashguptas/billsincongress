"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { getConvexUrl } from "@/lib/constants/convex";

const convex = new ConvexReactClient(getConvexUrl());

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
