import { createPointPair } from "@/lib/calibration/calibration";
import { CALIBRATION_UNITS } from "@/lib/calibration/units";
import type {
  CalibrationUnit,
  ConfirmedCalibration,
  PendingCalibration,
} from "@/lib/calibration/types";
import type { Point2D } from "@/lib/geometry/types";

export type CalibrationToolMode = "idle" | "calibrate" | "measure";

export type SourceCalibrationState = {
  toolMode: CalibrationToolMode;
  calibration: ConfirmedCalibration | null;
  draft: PendingCalibration;
  measurementPoints: Point2D[];
  error: string | null;
};

type CalibrationPanelProps = {
  isSectionContent?: boolean;
  sourceReady: boolean;
  state: SourceCalibrationState;
  onCancel: () => void;
  onConfirm: () => void;
  onDistanceChange: (value: string) => void;
  onModeChange: (mode: CalibrationToolMode) => void;
  onUnitChange: (unit: CalibrationUnit) => void;
};

export function CalibrationPanel({
  isSectionContent = false,
  sourceReady,
  state,
  onCancel,
  onConfirm,
  onDistanceChange,
  onModeChange,
  onUnitChange,
}: CalibrationPanelProps) {
  const calibrationPair = createPointPair(state.draft.points);
  const isCalibrating = state.toolMode === "calibrate";
  const containerClassName = isSectionContent
    ? "bg-white px-4 py-3 text-sm"
    : "shrink-0 border-t border-[var(--line)] bg-white px-4 py-3 text-sm";

  if (isCalibrating) {
    return (
      <section className={containerClassName}>
        <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
          Calibrar escala
        </h2>

        <p className="mt-1 text-xs text-[var(--muted)]">
          Marca 2 puntos de referencia en la Planta.
        </p>
        <p className="mt-2 rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">
          {Math.min(state.draft.points.length, 2)} de 2 puntos marcados
        </p>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_120px] gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-xs text-[var(--muted)]">
              Distancia real
            </span>
            <input
              className="w-full rounded border border-[var(--line)] px-2 py-1"
              inputMode="decimal"
              name="calibration-distance"
              placeholder="10"
              type="text"
              value={state.draft.distanceOriginal}
              onChange={(event) => onDistanceChange(event.target.value)}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--muted)]">
              Unidad
            </span>
            <select
              className="w-full rounded border border-[var(--line)] px-2 py-1"
              value={state.draft.unit}
              onChange={(event) =>
                onUnitChange(event.target.value as CalibrationUnit)
              }
            >
              {CALIBRATION_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
            disabled={!sourceReady || !calibrationPair}
            type="button"
            onClick={onConfirm}
          >
            Confirmar
          </button>
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
            type="button"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>

        {state.error ? (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {state.error}
          </div>
        ) : null}
      </section>
    );
  }

  if (state.calibration) {
    return (
      <section className={containerClassName}>
        <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
          Escala confirmada
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Referencia usada: {formatDistance(state.calibration.distanceOriginal)}{" "}
          {state.calibration.unit}
        </p>
        <button
          className="mt-3 rounded border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium hover:border-[var(--accent)]"
          disabled={!sourceReady}
          type="button"
          onClick={() => onModeChange("calibrate")}
        >
          Volver a calibrar
        </button>

        {state.error ? (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {state.error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={containerClassName}>
      <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
        Escala
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Marca dos puntos y carga la distancia real entre ellos.
      </p>
      <div className="mt-3">
        <button
          className="w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!sourceReady}
          type="button"
          onClick={() => onModeChange("calibrate")}
        >
          Calibrar escala
        </button>
      </div>

      {state.error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {state.error}
        </div>
      ) : null}
    </section>
  );
}

function formatDistance(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 4,
  }).format(value);
}
