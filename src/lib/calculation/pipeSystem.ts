import type { DemandUnit } from "@/lib/equipment/types";
import type { RouteAccessoryType } from "@/lib/routing/types";

export type PipeSystemIdentity = {
  id: string;
  name: string;
  version?: string;
};

export type PipeSystemResolutionStatus =
  | "resolved"
  | "unresolved"
  | "unsupported";

export type PipeSystemResolution<T> =
  | {
      data?: Record<string, unknown>;
      explanation: string;
      status: "resolved";
      value: T;
    }
  | {
      data?: Record<string, unknown>;
      reason: string;
      status: Exclude<PipeSystemResolutionStatus, "resolved">;
    };

export type PipeDiameterReference = {
  id: string;
  internalDiameterMillimeters?: number;
  label: string;
  nominalDiameter?: string;
};

export type PipeSegmentPipeContext = {
  conditions?: Record<string, unknown>;
  diameter?: PipeDiameterReference;
  material?: string;
};

export type PipeAccessoryEquivalentLengthContext = {
  accessory: {
    id: string;
    quantity: number;
    type: RouteAccessoryType;
  };
  pipe?: PipeSegmentPipeContext;
  segment: {
    accumulatedFlow: number | null;
    accumulatedFlowUnit: DemandUnit | null;
    drawingLength: number;
    id: string;
    physicalLengthMeters: number | null;
  };
};

export type PipeAvailableDiametersContext = {
  pipe?: PipeSegmentPipeContext;
};

export type PipeSegmentSizingContext = {
  accessoryEquivalentLengthMeters: number | null;
  accumulatedFlow: number | null;
  accumulatedFlowUnit: DemandUnit | null;
  calculationLengthMeters: number | null;
  physicalLengthMeters: number | null;
  pipe?: PipeSegmentPipeContext;
  segmentId: string;
};

export type PipeSegmentSizingResult = {
  selectedDiameter: PipeDiameterReference;
  explanation: string;
  usedData?: Record<string, unknown>;
};

export type PipeSystem = {
  getAvailableDiameters(
    context?: PipeAvailableDiametersContext,
  ): PipeSystemResolution<PipeDiameterReference[]>;
  identity: PipeSystemIdentity;
  resolveAccessoryEquivalentLength(
    context: PipeAccessoryEquivalentLengthContext,
  ): PipeSystemResolution<number>;
  sizeSegment(
    context: PipeSegmentSizingContext,
  ): PipeSystemResolution<PipeSegmentSizingResult>;
};

export const UNCONFIGURED_PIPE_SYSTEM: PipeSystem = {
  getAvailableDiameters: () => ({
    reason: "No hay un sistema de canerias configurado.",
    status: "unresolved",
  }),
  identity: {
    id: "unconfigured",
    name: "Sin configurar",
  },
  resolveAccessoryEquivalentLength: () => ({
    reason:
      "No hay un sistema de canerias configurado para resolver la longitud equivalente.",
    status: "unresolved",
  }),
  sizeSegment: () => ({
    reason:
      "No hay un sistema de canerias configurado para dimensionar el tramo.",
    status: "unresolved",
  }),
};
