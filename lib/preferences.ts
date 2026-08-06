"use client";

import { MODEL_IDS, type ModelId } from "@/lib/types";

const DEFAULT_MODEL_KEY = "feather:default-model";

/** The model a new "Build a new app" session starts pre-selected with. */
export function getDefaultModel(): ModelId | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(DEFAULT_MODEL_KEY);
  return stored && (MODEL_IDS as string[]).includes(stored) ? (stored as ModelId) : null;
}

export function setDefaultModel(model: ModelId | null) {
  if (typeof window === "undefined") return;
  if (model) localStorage.setItem(DEFAULT_MODEL_KEY, model);
  else localStorage.removeItem(DEFAULT_MODEL_KEY);
}
