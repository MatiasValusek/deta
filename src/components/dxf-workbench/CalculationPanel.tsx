import { useEffect, useState } from "react";
import {
  demandUnitLabel,
  hasPendingDemand,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  equivalentLengthSourceLabel,
  formatCalculationMeters,
  formatTechnicalFlow,
  routeAccessoryTypeLabel,
  technicalCalculationStatusLabel,
  type TechnicalCalculationResult,
  type TechnicalRouteAccessoryContribution,
  type TechnicalRouteAccessoryResolution,
  type TechnicalSegmentAccessoryResult,
  type TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";

type CalculationPanelProps = {
  equipment: WorkbenchEquipment[];
  hasPendingProposal: boolean;
  isPlanActive: boolean;
  planReady: boolean;
  result: TechnicalCalculationResult | null;
  onGoToPlan: () => void;
};

export function CalculationPanel({
  equipment,
  hasPendingProposal,
  isPlanActive,
  planReady,
  result,
  onGoToPlan,
}: CalculationPanelProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const selectedSegment =
    result?.segments.find((segment) => segment.segmentId === selectedSegmentId) ??
    result?.segments[0] ??
    null;

  useEffect(() => {
    if (!result?.segments.some((segment) => segment.segmentId === selectedSegmentId)) {
      setSelectedSegmentId(result?.segments[0]?.segmentId ?? null);
    }
  }, [result, selectedSegmentId]);

  return (
    <section className="bg-white px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="sr-only">Cálculo</h2>
          <p className="text-xs text-[var(--muted)]">
            {result ? technicalCalculationStatusLabel(result.status) : "Sin Planta"}
          </p>
        </div>
        {!isPlanActive && planReady ? (
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)]"
            type="button"
            onClick={onGoToPlan}
          >
            Ir a Planta
          </button>
        ) : null}
      </div>

      {!planReady ? (
        <div className="mt-3 rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-xs text-[var(--warning)]">
          Agregá una Planta para calcular.
        </div>
      ) : null}

      {hasPendingProposal ? (
        <div className="mt-3 rounded border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-xs text-[#1d4ed8]">
          Hay una propuesta pendiente. El cálculo usa solo la red confirmada.
        </div>
      ) : null}

      {result ? (
        <>
          <CalculationSummary result={result} />
          <CalculationIssues result={result} />
          <SegmentList
            result={result}
            selectedSegmentId={selectedSegment?.segmentId ?? null}
            onSelectSegment={setSelectedSegmentId}
          />
          {selectedSegment ? (
            <SegmentDetail
              equipment={equipment}
              result={result}
              segment={selectedSegment}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CalculationSummary({ result }: { result: TechnicalCalculationResult }) {
  const totalFlow = formatTechnicalFlow(
    result.totals.accumulatedFlow,
    result.totals.accumulatedFlowUnit,
  );
  const physicalLength = formatCalculationMeters(result.totals.physicalLengthMeters);
  const equivalentLength = formatCalculationMeters(
    result.totals.accessoryEquivalentLengthMeters,
    "Pendiente",
  );
  const calculationLength = formatTotalCalculationLength(result);

  return (
    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1 text-xs">
      <dt>Tramos</dt>
      <dd className="text-right font-mono">{result.totals.segmentCount}</dd>
      <dt>Dimensionados</dt>
      <dd className="text-right font-mono">
        {result.totals.dimensionedSegmentCount}/{result.totals.segmentCount}
      </dd>
      <dt>Artefactos</dt>
      <dd className="text-right font-mono">{result.totals.applianceCount}</dd>
      <dt>Consumo total</dt>
      <dd className="text-right">{totalFlow}</dd>
      <dt>Sistema canerias</dt>
      <dd className="text-right">{formatPipeSystemLabel(result)}</dd>
      <dt>Longitud fisica</dt>
      <dd className="text-right">{physicalLength}</dd>
      <dt>Equiv. accesorios tramo</dt>
      <dd className="text-right">{equivalentLength}</dd>
      <dt>Long. calculo prov.</dt>
      <dd className="text-right">{calculationLength}</dd>
    </dl>
  );
}

function CalculationIssues({ result }: { result: TechnicalCalculationResult }) {
  if (result.issues.length === 0) {
    return null;
  }

  const tone =
    result.status === "invalid"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-[#f1d28a] bg-[#fffaf0] text-[var(--warning)]";

  return (
    <div className={`mt-3 rounded border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold">
        {result.status === "invalid" ? "Red no calculable" : "Datos pendientes"}
      </div>
      <ul className="mt-1 space-y-1">
        {result.issues.slice(0, 5).map((issue, index) => (
          <li key={`${issue.code}:${issue.accessoryId ?? ""}:${issue.segmentId ?? ""}:${issue.equipmentId ?? ""}:${index}`}>
            {issue.message}
          </li>
        ))}
      </ul>
      {result.issues.length > 5 ? (
        <div className="mt-1">+ {result.issues.length - 5} observaciones</div>
      ) : null}
    </div>
  );
}

function SegmentList({
  result,
  selectedSegmentId,
  onSelectSegment,
}: {
  result: TechnicalCalculationResult;
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
}) {
  if (result.segments.length === 0) {
    return (
      <div className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
        Primero aceptá un trazado para calcular.
      </div>
    );
  }

  return (
    <section className="mt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        Tramos
      </h3>
      <div className="space-y-1">
        {result.segments.map((segment) => (
          <button
            className={`w-full rounded border px-2 py-1 text-left text-xs hover:border-[var(--accent)] ${
              segment.segmentId === selectedSegmentId
                ? "border-[var(--accent)] bg-[#f0f7ff]"
                : "border-[var(--line)]"
            }`}
            key={segment.segmentId}
            type="button"
            onClick={() => onSelectSegment(segment.segmentId)}
          >
            <div className="font-medium">
              {segmentLabel(segment, result.nodeLabels)}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">
              {formatTechnicalFlow(segment.accumulatedFlow, segment.accumulatedFlowUnit)}
              {" - "}
              {formatGoverningRouteLength(segment)}
              {" - "}
              {formatSegmentDiameter(segment)}
              {" - "}
              {segment.downstreamApplianceIds.length}{" "}
              {segment.downstreamApplianceIds.length === 1 ? "artefacto" : "artefactos"}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SegmentDetail({
  equipment,
  result,
  segment,
}: {
  equipment: WorkbenchEquipment[];
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
}) {
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <h3 className="font-semibold">Tramo {segmentLabel(segment, result.nodeLabels)}</h3>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Longitud dibujada</dt>
        <dd className="text-right">{formatDrawingLength(segment.drawingLength)}</dd>
        <dt>Longitud del tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.segmentPhysicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.accessoryEquivalentLengthMeters, "Pendiente")}
        </dd>
        <dt>Long. prov. 08B2</dt>
        <dd className="text-right">{formatSegmentCalculationLength(segment)}</dd>
        <dt>Consumo acumulado</dt>
        <dd className="text-right">
          {formatTechnicalFlow(segment.accumulatedFlow, segment.accumulatedFlowUnit)}
        </dd>
      </dl>

      <RouteBasisDetail
        equipmentById={equipmentById}
        result={result}
        segment={segment}
      />
      <AccessoryList accessories={segment.accessories} />
      <SegmentDimensioning result={result} segment={segment} />

      <div className="mt-2">
        <div className="font-semibold text-[var(--muted)]">Alimenta</div>
        {segment.downstreamApplianceIds.length === 0 ? (
          <div className="mt-1 text-[var(--muted)]">Sin artefactos aguas abajo.</div>
        ) : (
          <ul className="mt-1 space-y-1">
            {segment.downstreamApplianceIds.map((equipmentId) => {
              const item = equipmentById.get(equipmentId);

              return (
                <li key={equipmentId}>
                  {item?.name ?? equipmentId} - {equipmentDemandLabel(item)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RouteBasisDetail({
  equipmentById,
  result,
  segment,
}: {
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
}) {
  const resolution = segment.governingRouteResolution;

  if (resolution.status !== "resolved") {
    return (
      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2">
        <div className="font-semibold text-[var(--muted)]">
          Recorrido de calculo
        </div>
        <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
          <dt>Extremo desfavorable</dt>
          <dd className="text-right">Pendiente</dd>
          <dt>Longitud inicial de calculo</dt>
          <dd className="text-right">Pendiente</dd>
        </dl>
        <div className="mt-1 text-[var(--warning)]">
          {resolution.status === "unsupported"
            ? `No soportado: ${resolution.reason}`
            : resolution.reason}
        </div>
      </div>
    );
  }

  const route = resolution.value;
  const terminal = equipmentById.get(route.terminalEquipmentId);
  const routeAccessoryResolution =
    result.routeAccessoryResolutions[route.routeId] ?? null;

  return (
    <div className="mt-2 rounded border border-[var(--line)] px-2 py-2">
      <div className="font-semibold text-[var(--muted)]">
        Recorrido de calculo
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Extremo desfavorable</dt>
        <dd className="text-right">{terminal?.name ?? route.terminalEquipmentId}</dd>
        <dt>Longitud inicial de calculo</dt>
        <dd className="text-right">
          {formatCalculationMeters(route.physicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios recorrido</dt>
        <dd className="text-right">
          {formatRouteAccessoryEquivalentLength(routeAccessoryResolution)}
        </dd>
        <dt>Longitud dimensionado</dt>
        <dd className="text-right">
          {formatRouteSizingLength(routeAccessoryResolution)}
        </dd>
      </dl>
      <div className="mt-1">
        <div className="text-[var(--muted)]">Recorrido de calculo</div>
        <div className="break-words font-mono text-[11px]">
          {formatTechnicalRoutePath(route.nodeIds, result.nodeLabels)}
        </div>
      </div>
      <RouteAccessoryContributionList
        resolution={routeAccessoryResolution}
        result={result}
      />
      {route.tiedRouteIds.length > 1 ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          Empate resuelto por id de terminal.
        </div>
      ) : null}
    </div>
  );
}

function SegmentDimensioning({
  result,
  segment,
}: {
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
}) {
  const resolution = segment.dimensioningResolution;

  if (resolution.status !== "resolved") {
    return (
      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2">
        <div className="font-semibold text-[var(--muted)]">
          Dimensionado SIGAS provisional
        </div>
        <div className="mt-1 text-[var(--warning)]">
          {resolution.status === "unsupported"
            ? `No soportado: ${resolution.reason}`
            : resolution.reason}
        </div>
      </div>
    );
  }

  const sizing = resolution.value.sizingResult;
  const usedData = sizing.usedData ?? {};

  return (
    <div className="mt-2 rounded border border-[var(--line)] px-2 py-2">
      <div className="font-semibold text-[var(--muted)]">
        Dimensionado SIGAS provisional
      </div>
      <div className="mt-1 text-[10px] text-[var(--muted)]">
        Usa longitud local y accesorios locales; falta adoptar longitud por recorrido.
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Diametro calculado</dt>
        <dd className="text-right">{formatDiameterReference(resolution.value.calculatedDiameter)}</dd>
        <dt>Longitud tabulada</dt>
        <dd className="text-right">
          {formatRecordMeters(usedData, "tabulatedLengthMeters")}
        </dd>
        <dt>Capacidad tabulada</dt>
        <dd className="text-right">
          {formatRecordFlow(usedData, "capacityM3h")}
        </dd>
        <dt>Sistema</dt>
        <dd className="text-right">{formatPipeSystemLabel(result)}</dd>
        <dt>Fuente</dt>
        <dd className="text-right">
          {formatRecordSource(usedData)}
        </dd>
      </dl>
    </div>
  );
}

function RouteAccessoryContributionList({
  resolution,
  result,
}: {
  resolution: TechnicalRouteAccessoryResolution | null;
  result: TechnicalCalculationResult;
}) {
  if (!resolution) {
    return (
      <div className="mt-2 text-[var(--warning)]">
        Accesorios del recorrido pendientes.
      </div>
    );
  }

  if (resolution.contributions.length === 0) {
    return (
      <div className="mt-2 text-[var(--muted)]">
        Sin accesorios en el recorrido.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="font-semibold text-[var(--muted)]">
        Accesorios del recorrido
      </div>
      <ul className="mt-1 space-y-1">
        {resolution.contributions.map((contribution, index) => (
          <RouteAccessoryContributionItem
            contribution={contribution}
            key={`${contribution.ownerSegmentId}:${contribution.accessoryId}:${index}`}
            result={result}
          />
        ))}
      </ul>
      {resolution.status !== "resolved" && resolution.reasons.length > 0 ? (
        <div className="mt-1 text-[var(--warning)]">
          {resolution.reasons.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function RouteAccessoryContributionItem({
  contribution,
  result,
}: {
  contribution: TechnicalRouteAccessoryContribution;
  result: TechnicalCalculationResult;
}) {
  const ownerSegment = result.segments.find(
    (segment) => segment.segmentId === contribution.ownerSegmentId,
  );

  return (
    <li>
      <div className="break-words">
        <span className="font-mono">
          {ownerSegment
            ? segmentLabel(ownerSegment, result.nodeLabels)
            : contribution.ownerSegmentId}
        </span>
        {" - "}
        {formatContributionDiameter(contribution)}
        {" - "}
        {formatContributionName(contribution)}
        {" x "}
        {formatAccessoryQuantity(contribution.quantity)}
        {" - "}
        {formatCalculationMeters(
          contribution.totalEquivalentLengthMeters,
          "Pendiente",
        )}
      </div>
      {contribution.status !== "resolved" && contribution.reason ? (
        <div className="mt-0.5 text-[10px] text-[var(--warning)]">
          {contribution.reason}
        </div>
      ) : null}
    </li>
  );
}

function AccessoryList({
  accessories,
}: {
  accessories: TechnicalSegmentAccessoryResult[];
}) {
  if (accessories.length === 0) {
    return (
      <div className="mt-2 text-[var(--muted)]">Sin accesorios asociados.</div>
    );
  }

  const summaries = accessorySummariesByType(accessories);

  return (
    <div className="mt-2">
      <div className="font-semibold text-[var(--muted)]">Accesorios del tramo</div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        {summaries.map((summary) => (
          <AccessorySummaryRow key={summary.type} summary={summary} />
        ))}
      </dl>
    </div>
  );
}

function AccessorySummaryRow({
  summary,
}: {
  summary: AccessoryTypeSummary;
}) {
  return (
    <>
      <dt>
        {routeAccessoryTypeLabel(summary.type)} x {formatAccessoryQuantity(summary.quantity)}
        <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
          {summary.sourceLabels.join(", ")}
        </span>
        {summary.reasonLabels.length > 0 ? (
          <span className="mt-0.5 block text-[10px] text-[var(--warning)]">
            {summary.reasonLabels.join(", ")}
          </span>
        ) : null}
      </dt>
      <dd className="text-right">
        {formatCalculationMeters(summary.totalEquivalentLengthMeters, "Pendiente")}
      </dd>
    </>
  );
}

function segmentLabel(
  segment: TechnicalSegmentResult,
  labels: Record<string, string>,
) {
  return `${labels[segment.fromNodeId] ?? segment.fromNodeId} -> ${labels[segment.toNodeId] ?? segment.toNodeId}`;
}

type AccessoryTypeSummary = {
  quantity: number;
  reasonLabels: string[];
  sourceLabels: string[];
  totalEquivalentLengthMeters: number | null;
  type: TechnicalSegmentAccessoryResult["type"];
};

function accessorySummariesByType(
  accessories: TechnicalSegmentAccessoryResult[],
): AccessoryTypeSummary[] {
  const byType = new Map<
    TechnicalSegmentAccessoryResult["type"],
    AccessoryTypeSummary
  >();

  for (const accessory of accessories) {
    const current = byType.get(accessory.type) ?? {
      quantity: 0,
      reasonLabels: [],
      sourceLabels: [],
      totalEquivalentLengthMeters: 0,
      type: accessory.type,
    };
    const sourceLabel = equivalentLengthSourceLabel(
      accessory.equivalentLengthSource,
    );

    current.quantity += accessory.quantity;

    if (!current.sourceLabels.includes(sourceLabel)) {
      current.sourceLabels.push(sourceLabel);
      current.sourceLabels.sort();
    }

    if (accessory.equivalentLengthResolution.status !== "resolved") {
      const reasonLabel =
        accessory.equivalentLengthResolution.status === "unsupported"
          ? `No soportado: ${accessory.equivalentLengthResolution.reason}`
          : accessory.equivalentLengthResolution.reason;

      if (!current.reasonLabels.includes(reasonLabel)) {
        current.reasonLabels.push(reasonLabel);
        current.reasonLabels.sort();
      }
    }

    current.totalEquivalentLengthMeters =
      current.totalEquivalentLengthMeters === null ||
      accessory.totalEquivalentLengthMeters === null
        ? null
        : current.totalEquivalentLengthMeters +
          accessory.totalEquivalentLengthMeters;

    byType.set(accessory.type, current);
  }

  return [...byType.values()].sort((first, second) =>
    routeAccessoryTypeLabel(first.type).localeCompare(
      routeAccessoryTypeLabel(second.type),
    ),
  );
}

function formatTotalCalculationLength(result: TechnicalCalculationResult) {
  if (result.totals.calculationLengthMeters !== null) {
    return formatCalculationMeters(result.totals.calculationLengthMeters);
  }

  if (result.totals.physicalLengthMeters === null) {
    return "Escala pendiente";
  }

  if (result.totals.accessoryEquivalentLengthMeters === null) {
    return "Equiv. pendiente";
  }

  return "Pendiente";
}

function formatSegmentCalculationLength(segment: TechnicalSegmentResult) {
  if (segment.calculationLengthMeters !== null) {
    return formatCalculationMeters(segment.calculationLengthMeters);
  }

  if (segment.physicalLengthMeters === null) {
    return "Escala pendiente";
  }

  if (segment.accessoryEquivalentLengthMeters === null) {
    return "Equiv. pendiente";
  }

  return "Pendiente";
}

function formatGoverningRouteLength(segment: TechnicalSegmentResult) {
  if (segment.governingRoutePhysicalLengthMeters !== null) {
    return `Long. inicial ${formatCalculationMeters(
      segment.governingRoutePhysicalLengthMeters,
    )}`;
  }

  return "Long. inicial pendiente";
}

function formatRouteAccessoryEquivalentLength(
  resolution: TechnicalRouteAccessoryResolution | null,
) {
  return resolution
    ? formatCalculationMeters(
        resolution.governingRouteAccessoryEquivalentLengthMeters,
        "Pendiente",
      )
    : "Pendiente";
}

function formatRouteSizingLength(
  resolution: TechnicalRouteAccessoryResolution | null,
) {
  return resolution
    ? formatCalculationMeters(resolution.sizingLengthMeters, "Pendiente")
    : "Pendiente";
}

function formatTechnicalRoutePath(
  nodeIds: string[],
  labels: Record<string, string>,
) {
  return nodeIds.map((nodeId) => labels[nodeId] ?? nodeId).join(" -> ");
}

function formatContributionDiameter(
  contribution: TechnicalRouteAccessoryContribution,
) {
  if (contribution.equivalentLengthSource === "manual") {
    return contribution.diameter
      ? formatCompactDiameterReference(contribution.diameter)
      : "Manual";
  }

  return contribution.diameter
    ? formatCompactDiameterReference(contribution.diameter)
    : "Diam. pendiente";
}

function formatContributionName(
  contribution: TechnicalRouteAccessoryContribution,
) {
  const tableLabel = recordStringValue(
    contribution.equivalentLengthResolution.data,
    "tableLabel",
  );

  return (
    tableLabel ??
    contribution.catalogCode ??
    routeAccessoryTypeLabel(contribution.type)
  );
}

function formatSegmentDiameter(segment: TechnicalSegmentResult) {
  if (segment.dimensioningResolution.status === "resolved") {
    return formatDiameterReference(
      segment.dimensioningResolution.value.calculatedDiameter,
    );
  }

  return segment.dimensioningResolution.status === "unsupported"
    ? "No soportado"
    : "Pendiente";
}

function formatDiameterReference(
  diameter: TechnicalSegmentResult["calculatedDiameter"],
) {
  if (!diameter) {
    return "Pendiente";
  }

  const external = formatOptionalNumber(diameter.externalDiameterMillimeters);
  const internal = formatOptionalNumber(diameter.internalDiameterMillimeters);

  if (external && internal) {
    return `DE ${external} mm / DI ${internal} mm`;
  }

  if (external) {
    return `DE ${external} mm`;
  }

  return diameter.label;
}

function formatCompactDiameterReference(
  diameter: TechnicalRouteAccessoryContribution["diameter"],
) {
  if (!diameter) {
    return "Diam. pendiente";
  }

  const external = formatOptionalNumber(diameter.externalDiameterMillimeters);

  return external ? `DE ${external} mm` : diameter.label;
}

function formatRecordMeters(data: Record<string, unknown>, key: string) {
  const value = finiteRecordNumber(data, key);

  return value === null ? "Pendiente" : formatCalculationMeters(value);
}

function formatRecordFlow(data: Record<string, unknown>, key: string) {
  const value = finiteRecordNumber(data, key);

  return value === null
    ? "Pendiente"
    : `${formatOptionalNumber(value)} m3/h`;
}

function formatRecordSource(data: Record<string, unknown>) {
  const sourceTable = recordStringValue(data, "sourceTable");
  const sourceFile = recordStringValue(data, "sourceFile");

  return [sourceTable, sourceFile].filter(Boolean).join(" - ") || "Pendiente";
}

function finiteRecordNumber(data: Record<string, unknown>, key: string) {
  const value = data[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordStringValue(
  data: Record<string, unknown> | undefined,
  key: string,
) {
  const value = data?.[key];

  return typeof value === "string" ? value : null;
}

function formatOptionalNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatDrawingLength(value: number) {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} u`;
}

function formatAccessoryQuantity(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  });
}

function formatPipeSystemLabel(result: TechnicalCalculationResult) {
  return result.pipeSystem.version
    ? `${result.pipeSystem.name} ${result.pipeSystem.version}`
    : result.pipeSystem.name;
}

function equipmentDemandLabel(equipment: WorkbenchEquipment | undefined) {
  if (!equipment || hasPendingDemand(equipment)) {
    return "Pendiente";
  }

  return `${equipment.demandValue?.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${demandUnitLabel(equipment.demandUnit as NonNullable<typeof equipment.demandUnit>)}`;
}
