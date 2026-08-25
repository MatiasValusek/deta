import { createPointPair, measureCalibratedDistance } from "@/lib/calibration/calibration";
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
  sourceLabel: string;
  sourceReady: boolean;
  state: SourceCalibrationState;
  onCancel: () => void;
  onConfirm: () => void;
  onDistanceChange: (value: string) => void;
  onModeChange: (mode: CalibrationToolMode) => void;
  onReset: () => void;
  onUnitChange: (unit: CalibrationUnit) => void;
};

export function CalibrationPanel({
  isSectionContent = false,
  sourceLabel,
  sourceReady,
  state,
  onCancel,
  onConfirm,
  onDistanceChange,
  onModeChange,
  onReset,
  onUnitChange,
}: CalibrationPanelProps) {
  const calibrationPair = createPointPair(state.draft.points);
  const measurementPair = createPointPair(state.measurementPoints);
  const measurement =
    measurementPair && state.calibration
      ? measureCalibratedDistance(measurementPair, state.calibration)
      : null;

  return (
    <section
      className={
        isSectionContent
          ? "bg-white px-4 py-3 text-sm"
          : "shrink-0 border-t border-[var(--line)] bg-white px-4 py-3 text-sm"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
            Escala
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{sourceLabel}</p>
        </div>
        <span className="rounded border border-[var(--line)] px-2 py-1 text-xs">
          {state.calibration ? "Escala confirmada" : "Pendiente"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
          disabled={!sourceReady}
          type="button"
          onClick={() => onModeChange("calibrate")}
        >
          Calibrar escala
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
          disabled={!sourceReady || !state.calibration}
          type="button"
          onClick={() => onModeChange("measure")}
        >
          Medir
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
          disabled={!sourceReady || state.toolMode === "idle"}
          type="button"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
          disabled={
            !sourceReady || (!state.calibration && state.draft.points.length === 0)
          }
          type="button"
          onClick={onReset}
        >
          Restablecer
        </button>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        {instructionForState(state)}
      </p>

      {state.toolMode === "calibrate" && calibrationPair ? (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_120px] gap-2">
          <input
            className="min-w-0 rounded border border-[var(--line)] px-2 py-1"
            name="calibration-distance"
            inputMode="decimal"
            placeholder="Distancia real"
            type="text"
            value={state.draft.distanceOriginal}
            onChange={(event) => onDistanceChange(event.target.value)}
          />
          <select
            className="rounded border border-[var(--line)] px-2 py-1"
            value={state.draft.unit}
            onChange={(event) => onUnitChange(event.target.value as CalibrationUnit)}
          >
            {CALIBRATION_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
          <button
            className="col-span-2 rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-white hover:bg-[var(--accent-strong)]"
            type="button"
            onClick={onConfirm}
          >
            Confirmar escala
          </button>
        </div>
      ) : null}

      {state.calibration ? (
        <dl className="mt-3 grid grid-cols-[130px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
          <dt className="text-[var(--muted)]">Distancia</dt>
          <dd>{formatDistance(state.calibration.distanceOriginal)} {state.calibration.unit}</dd>
          <dt className="text-[var(--muted)]">Milimetros</dt>
          <dd>{formatDistance(state.calibration.distanceMillimeters)} mm</dd>
          <dt className="text-[var(--muted)]">Factor</dt>
          <dd>{formatDistance(state.calibration.millimetersPerSourceUnit)} mm/u</dd>
        </dl>
      ) : null}

      {measurement ? (
        <div className="mt-3 rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-xs">
          Medicion: {formatDistance(measurement.distanceMillimeters)} mm
        </div>
      ) : null}

      {state.error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {state.error}
        </div>
      ) : null}
    </section>
  );
}

function instructionForState(state: SourceCalibrationState) {
  if (state.toolMode === "calibrate") {
    if (state.draft.points.length === 0) {
      return "Seleccione el primer punto.";
    }

    if (state.draft.points.length === 1) {
      return "Seleccione el segundo punto.";
    }

    return "Ingrese la distancia real y confirme.";
  }

  if (state.toolMode === "measure") {
    if (state.measurementPoints.length === 0) {
      return "Seleccione el primer punto de medicion.";
    }

    if (state.measurementPoints.length === 1) {
      return "Seleccione el segundo punto de medicion.";
    }

    return "Medicion calculada con la escala confirmada.";
  }

  return "Use dos puntos para confirmar escala o medir.";
}

function formatDistance(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 4,
  }).format(value);
}
