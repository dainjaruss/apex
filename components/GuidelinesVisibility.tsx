// components/GuidelinesVisibility.tsx
//
// Shared visibility flag for the inline BUPERS guideline banners. Provided once by
// EvaluationForm and consumed by BupersGuidelinesInline, so a single "Field
// Guidelines" toggle hides/shows every banner without threading props through each
// block. Power users who don't need the reference can turn it off.

"use client";

import { createContext, useContext } from "react";

export const GuidelinesVisibilityContext = createContext<boolean>(true);

export const useGuidelinesVisible = () =>
  useContext(GuidelinesVisibilityContext);
