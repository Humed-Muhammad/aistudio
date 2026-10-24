import type React from "react";
import type { Kit, Theme } from "../graphicKits";

// The graphics library. Every graphic is two files with the same name, in elements/pack (shipped) or
// elements/mine (made by you or Claude):
//   name.json  what it is and what can be edited (ElementMeta)
//   name.tsx   a default-exported React component that draws it (ElementProps)
// scripts/elements.mjs lists them in registry.gen.ts; shorts.py reads the .json files to check plans.

export type FieldType = "text" | "longtext" | "color" | "number" | "select" | "toggle" | "list";
export type FieldValue = string | number | boolean | string[];

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  default: FieldValue;
  /** select: the choices. */
  options?: string[];
  /** number: range and step of the slider. */
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
};

export type ElementMeta = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Default length in seconds when added. */
  duration: number;
  /** anchored: drawn around a point (x, y) and scaled by size. full: covers the whole frame. */
  layout: "anchored" | "full";
  x: number;
  y: number;
  /** Which moment the library thumbnail shows, as a fraction of the duration (default 0.55). */
  poster?: number;
  /** Sound family played when it appears (when automatic sound is on), or "none". */
  sound: string;
  fields: Field[];
};

export type ElementValues = Record<string, FieldValue>;

export type ElementProps = {
  /** Field values: the defaults with this graphic's edits on top. */
  v: ElementValues;
  /** The video's graphic style: theme for graphics over video, kit for both variants. */
  theme: Theme;
  kit: Kit;
  /** The graphic's accent colour (its own, else the video accent). */
  accent: string;
  durationInFrames: number;
  /** Frame size; designs are made for 1080 wide, k = width / 1080. */
  width: number;
  height: number;
  k: number;
};

export type ElementEntry = {
  meta: ElementMeta;
  Component: React.FC<ElementProps>;
  source: "pack" | "mine";
};
