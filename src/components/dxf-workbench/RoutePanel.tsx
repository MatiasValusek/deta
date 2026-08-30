import { useState } from "react";
import {
  equipmentCode,
  formatEquipmentDemand,
  hasPendingDemand,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import type {
  PhysicalRouteEditSelection,
  PhysicalRouteSnapOptions,
} from "@/lib/routing/physicalRouteEditing";
import type {
  AutomaticRouteProposal,
  RouteDraft,
  RouteIntentConnection,
  RouteIntentDraft,
  RouteIntentEndpoint,
} from "@/lib/routing/types";
import {
  routeProposalAcceptanceBlockReason,
  routeProposalCanBeAccepted,
} from "@/lib/routing/proposalAcceptance";

type RouteApplianceStatus = {
  equipment: WorkbenchEquipment;
  isConnected: boolean;
  isInvalid: boolean;
};

type RoutePanelProps = {
  applianceStatuses: RouteApplianceStatus[];
  connectedCount: number;
  derivationCount: number;
  draft: RouteDraft | null;
  error: string | null;
  equipment: WorkbenchEquipment[];
  hasAppliances: boolean;
  hasSupply: boolean;
  isGeneratingProposal: boolean;
  isComplete: boolean;
  isPlanActive: boolean;
  isSectionContent?: boolean;
  lengthLabel: string;
  pendingDemandCount: number;
  planReady: boolean;
  proposal: AutomaticRouteProposal | null;
  proposalMarginInput: string;
  proposalOutdated: boolean;
  proposalRequiresScale: boolean;
  restrictionCount: number;
  selectedEdit: PhysicalRouteEditSelection | null;
  snapOptions: PhysicalRouteSnapOptions;
  intentConnections: RouteIntentConnection[];
  intentDraft: RouteIntentDraft | null;
  segmentCount: number;
  showRoute: boolean;
  onAcceptProposal: () => void;
  onCancelIntentDraft: () => void;
  onClearNetwork: () => void;
  onClearIntentConnections: () => void;
  onClearRouteSelection: () => void;
  onConnectAppliance: () => void;
  onContinueToReview: () => void;
  onDeleteSelectedVertex: () => void;
  onDeleteIntentConnection: (connectionId: string) => void;
  onDiscardProposal: () => void;
  onDisconnectAppliance: (equipmentId: string) => void;
  onEditInstallation: () => void;
  onEditProposal: () => void;
  onGenerateProposal: () => void;
  onGoToPlan: () => void;
  onGoToScale: () => void;
  onInterpretIntentConnections: () => void;
  onProposalMarginChange: (value: string) => void;
  onRegenerateProposal: () => void;
  onSelectDraftTarget: (equipmentId: string) => void;
  onShowRouteChange: (show: boolean) => void;
  onSnapOptionChange: (
    option: keyof PhysicalRouteSnapOptions,
    enabled: boolean,
  ) => void;
};

export function RoutePanel({
  applianceStatuses,
  connectedCount,
  derivationCount,
  draft,
  error,
  equipment,
  hasAppliances,
  hasSupply,
  isGeneratingProposal,
  isComplete,
  isPlanActive,
  isSectionContent = false,
  lengthLabel,
  pendingDemandCount,
  planReady,
  proposal,
  proposalMarginInput,
  proposalOutdated,
  proposalRequiresScale,
  restrictionCount,
  selectedEdit,
  snapOptions,
  intentConnections,
  intentDraft,
  segmentCount,
  showRoute,
  onAcceptProposal,
  onCancelIntentDraft,
  onClearNetwork,
  onClearIntentConnections,
  onClearRouteSelection,
  onConnectAppliance,
  onContinueToReview,
  onDeleteSelectedVertex,
  onDeleteIntentConnection,
  onDiscardProposal,
  onDisconnectAppliance,
  onEditInstallation,
  onEditProposal,
  onGenerateProposal,
  onGoToPlan,
  onGoToScale,
  onInterpretIntentConnections,
  onProposalMarginChange,
  onRegenerateProposal,
  onSelectDraftTarget,
  onShowRouteChange,
  onSnapOptionChange,
}: RoutePanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const marginIsValid = parseProposalMarginInput(proposalMarginInput);
  const totalAppliances = applianceStatuses.length;
  const pendingStatuses = applianceStatuses.filter(
    (status) => !status.isConnected || status.isInvalid,
  );
  const proposalConnectedCount = proposal?.reachedEquipmentIds.length ?? 0;
  const routeState = proposal ? "proposal" : isComplete ? "confirmed" : "setup";
  const canConnect =
    planReady &&
    isPlanActive &&
    hasSupply &&
    hasAppliances &&
    !draft &&
    !intentDraft &&
    !proposal;
  const canGenerateProposal =
    planReady &&
    isPlanActive &&
    hasSupply &&
    hasAppliances &&
    !draft &&
    !intentDraft &&
    !isGeneratingProposal &&
    !proposalRequiresScale &&
    marginIsValid;
  const canRegenerateProposal =
    planReady &&
    isPlanActive &&
    hasSupply &&
    hasAppliances &&
    !draft &&
    !intentDraft &&
    !isGeneratingProposal &&
    !proposalRequiresScale &&
    marginIsValid;
  const canInterpretIntent =
    planReady &&
    isPlanActive &&
    hasSupply &&
    hasAppliances &&
    intentConnections.length > 0 &&
    !draft &&
    !intentDraft &&
    !isGeneratingProposal &&
    !proposalRequiresScale &&
    !proposal &&
    marginIsValid;

  function handleEditInstallation() {
    setAdvancedOpen(true);
    onShowRouteChange(true);
    onEditInstallation();
  }

  function handleEditProposal() {
    setAdvancedOpen(true);
    onEditProposal();
  }

  return (
    <section
      className={
        isSectionContent
          ? "bg-white px-4 py-3 text-sm"
          : "max-h-[40%] shrink-0 overflow-auto border-t border-[var(--line)] bg-white px-4 py-3 text-sm"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
            Recorrido
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {routeState === "proposal"
              ? "Propuesta lista"
              : routeState === "confirmed"
                ? "Recorrido confirmado"
                : "Recorrido pendiente"}
          </p>
        </div>
      </div>

      {!isPlanActive && planReady ? (
        <div className="mt-3 rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-xs text-[var(--warning)]">
          <div>El trazado se edita en la Planta</div>
          <button
            className="mt-2 rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
            type="button"
            onClick={onGoToPlan}
          >
            Ir a Planta
          </button>
        </div>
      ) : null}

      <RouteMainFlow
        applianceStatuses={applianceStatuses}
        canGenerateProposal={canGenerateProposal}
        canRegenerateProposal={canRegenerateProposal}
        isGeneratingProposal={isGeneratingProposal}
        pendingStatuses={pendingStatuses}
        proposal={proposal}
        proposalConnectedCount={proposalConnectedCount}
        proposalOutdated={proposalOutdated}
        proposalRequiresScale={proposalRequiresScale}
        routeState={routeState}
        totalAppliances={totalAppliances}
        onAcceptProposal={onAcceptProposal}
        onContinueToReview={onContinueToReview}
        onEditInstallation={handleEditInstallation}
        onEditProposal={handleEditProposal}
        onGenerateProposal={onGenerateProposal}
        onGoToScale={onGoToScale}
        onRegenerateProposal={onRegenerateProposal}
      />

      {pendingDemandCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--warning)]">
          Consumos pendientes: {pendingDemandCount}
        </p>
      ) : null}

      {error && !draft && !intentDraft ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      <details
        className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer font-semibold">
          Opciones avanzadas
        </summary>

        <label className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span>Mostrar red</span>
          <input
            checked={showRoute}
            type="checkbox"
            onChange={(event) => onShowRouteChange(event.target.checked)}
          />
        </label>

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_78px] gap-x-2 gap-y-1 text-xs">
        <dt>Artefactos conectados</dt>
        <dd className="text-right font-mono">
          {connectedCount} de {applianceStatuses.length}
        </dd>
        <dt>Tramos</dt>
        <dd className="text-right font-mono">{segmentCount}</dd>
        <dt>Derivaciones</dt>
        <dd className="text-right font-mono">{derivationCount}</dd>
        <dt>Intenciones</dt>
        <dd className="text-right font-mono">{intentConnections.length}</dd>
        <dt>Restricciones incumplidas</dt>
        <dd className="text-right font-mono">{restrictionCount}</dd>
        <dt>Longitud total</dt>
        <dd className="text-right">{lengthLabel}</dd>
      </dl>

      <RoutePhysicalEditControls
        disabled={!planReady || !isPlanActive || Boolean(draft) || Boolean(intentDraft) || Boolean(proposal)}
        equipment={equipment}
        selectedEdit={selectedEdit}
        snapOptions={snapOptions}
        onClearSelection={onClearRouteSelection}
        onDeleteSelectedVertex={onDeleteSelectedVertex}
        onSnapOptionChange={onSnapOptionChange}
      />

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!canConnect}
          type="button"
          onClick={onConnectAppliance}
        >
          Conectar
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={
            !planReady ||
            segmentCount === 0 ||
            Boolean(draft) ||
            Boolean(intentDraft) ||
            Boolean(proposal)
          }
          type="button"
          onClick={onClearNetwork}
        >
          Borrar red
        </button>
      </div>

      <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">Conexiones manuales</div>
            <p className="mt-1 text-[var(--muted)]">
              Boceto de relaciones para interpretar despues.
            </p>
          </div>
          <button
            className="shrink-0 rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
            disabled={intentConnections.length === 0 || Boolean(intentDraft)}
            type="button"
            onClick={onClearIntentConnections}
          >
            Limpiar
          </button>
        </div>

        {intentConnections.length === 0 ? (
          <div className="mt-2 rounded border border-[var(--line)] px-2 py-1 text-[var(--muted)]">
            Sin conexiones manuales.
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {intentConnections.map((connection) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border border-[var(--line)] px-2 py-1"
                key={connection.id}
              >
                <span className="truncate">
                  {intentConnectionLabel(connection, equipment)}
                </span>
                <button
                  className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
                  disabled={Boolean(intentDraft)}
                  type="button"
                  onClick={() => onDeleteIntentConnection(connection.id)}
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        )}

        {proposalRequiresScale ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[#ecd5ad] bg-[#fff9ec] px-2 py-1 text-[var(--warning)]">
            <span>Podes dibujar conexiones. Confirma la escala para interpretar.</span>
            <button
              className="shrink-0 rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
              type="button"
              onClick={onGoToScale}
            >
              Ir a Escala
            </button>
          </div>
        ) : null}

        <button
          className="mt-2 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!canInterpretIntent}
          type="button"
          onClick={onInterpretIntentConnections}
        >
          {isGeneratingProposal ? "Interpretando..." : "Interpretar trazado"}
        </button>
      </section>

      <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">Propuesta automatica</div>
            <p className="mt-1 text-[var(--muted)]">
              {proposalRequiresScale
                ? "Confirma la escala de la Planta"
                : "Recorrido ortogonal editable al aceptar."}
            </p>
          </div>
          {proposalRequiresScale ? (
            <button
              className="shrink-0 rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
              type="button"
              onClick={onGoToScale}
            >
              Ir a Escala
            </button>
          ) : null}
        </div>

        <label className="mt-2 block text-[var(--muted)]">
          <span className="block">Margen geometrico</span>
          <span className="mt-1 flex items-center gap-1">
            <input
              className="min-w-0 flex-1 rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
              inputMode="decimal"
              name="route-proposal-margin"
              type="text"
              value={proposalMarginInput}
              onChange={(event) => onProposalMarginChange(event.target.value)}
            />
            <span>m</span>
          </span>
          <span className="mt-1 block text-[10px]">
            Ayuda a separar el recorrido de obstaculos. No representa una distancia normativa.
          </span>
        </label>
        {!marginIsValid ? (
          <div className="mt-1 text-[10px] text-red-700">
            Ingresá un margen mayor o igual a cero.
          </div>
        ) : null}

        <button
          className="mt-2 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!canGenerateProposal}
          type="button"
          onClick={onGenerateProposal}
        >
          {isGeneratingProposal ? "Generando propuesta..." : proposal ? "Regenerar" : "Generar propuesta"}
        </button>

        {proposal ? (
          <ProposalSummary
            applianceStatuses={applianceStatuses}
            isOutdated={proposalOutdated}
            proposal={proposal}
            onAcceptProposal={onAcceptProposal}
            onDiscardProposal={onDiscardProposal}
            onGenerateProposal={onRegenerateProposal}
          />
        ) : null}
      </section>

      <p className="mt-2 text-xs text-[var(--muted)]">
        {prerequisiteMessage({
          connectedCount,
          hasAppliances,
          hasSupply,
          totalAppliances: applianceStatuses.length,
        })}
      </p>

      {pendingDemandCount > 0 ? (
        <p className="mt-1 text-xs text-[var(--warning)]">
          Consumos pendientes: {pendingDemandCount}
        </p>
      ) : null}

      {error && !draft && !intentDraft ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {intentDraft ? (
        <RouteIntentDraftControls
          draft={intentDraft}
          equipment={equipment}
          onCancelDraft={onCancelIntentDraft}
        />
      ) : null}

      {draft ? (
        <RouteDraftControls
          applianceStatuses={applianceStatuses}
          draft={draft}
          onSelectDraftTarget={onSelectDraftTarget}
        />
      ) : null}

      <section className="mt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
          Artefactos
        </h3>
        {applianceStatuses.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            Falta colocar al menos un artefacto.
          </p>
        ) : (
          <div className="space-y-1">
            {applianceStatuses.map((status) => (
              <div
                className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                key={status.equipment.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      <span className="mr-2 font-mono">
                        {equipmentCode(status.equipment.type)}
                      </span>
                      {status.equipment.name}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {status.isInvalid
                        ? "Ruta inválida"
                        : status.isConnected
                          ? "Conectado"
                          : "Sin conectar"}
                      {hasPendingDemand(status.equipment)
                        ? ` · ${formatEquipmentDemand(status.equipment)}`
                        : ""}
                    </div>
                  </div>
                  {status.isConnected ? (
                    <button
                      className="shrink-0 rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
                      disabled={
                        Boolean(draft) || Boolean(intentDraft) || Boolean(proposal)
                      }
                      type="button"
                      onClick={() => onDisconnectAppliance(status.equipment.id)}
                    >
                      Desconectar
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </details>
    </section>
  );
}

function RouteMainFlow({
  applianceStatuses,
  canGenerateProposal,
  canRegenerateProposal,
  isGeneratingProposal,
  pendingStatuses,
  proposal,
  proposalConnectedCount,
  proposalOutdated,
  proposalRequiresScale,
  routeState,
  totalAppliances,
  onAcceptProposal,
  onContinueToReview,
  onEditInstallation,
  onEditProposal,
  onGenerateProposal,
  onGoToScale,
  onRegenerateProposal,
}: {
  applianceStatuses: RouteApplianceStatus[];
  canGenerateProposal: boolean;
  canRegenerateProposal: boolean;
  isGeneratingProposal: boolean;
  pendingStatuses: RouteApplianceStatus[];
  proposal: AutomaticRouteProposal | null;
  proposalConnectedCount: number;
  proposalOutdated: boolean;
  proposalRequiresScale: boolean;
  routeState: "setup" | "proposal" | "confirmed";
  totalAppliances: number;
  onAcceptProposal: () => void;
  onContinueToReview: () => void;
  onEditInstallation: () => void;
  onEditProposal: () => void;
  onGenerateProposal: () => void;
  onGoToScale: () => void;
  onRegenerateProposal: () => void;
}) {
  if (routeState === "confirmed") {
    return (
      <section className="mt-3 rounded border border-[#b7d8c2] bg-[#f3fbf5] px-3 py-2 text-xs">
        <div className="font-semibold text-[#1f6f3a]">
          Recorrido confirmado
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
            type="button"
            onClick={onEditInstallation}
          >
            Editar instalacion
          </button>
          <button
            className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)]"
            type="button"
            onClick={onContinueToReview}
          >
            Continuar a Revisar
          </button>
        </div>
      </section>
    );
  }

  if (routeState === "proposal" && proposal) {
    const canAcceptProposal = routeProposalCanBeAccepted(
      proposal,
      totalAppliances,
      proposalOutdated,
    );
    const acceptBlockReason = routeProposalAcceptanceBlockReason(
      proposal,
      totalAppliances,
      proposalOutdated,
    );
    const unreachedNames = proposal.unreachedEquipmentIds
      .map(
        (equipmentId) =>
          applianceStatuses.find((status) => status.equipment.id === equipmentId)
            ?.equipment.name ?? equipmentId,
      )
      .sort();

    return (
      <section className="mt-3 rounded border border-[#8db7e8] bg-[#f1f7ff] px-3 py-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-[#15599f]">Propuesta lista</div>
            <p className="mt-1 text-[var(--muted)]">
              La propuesta conecta {proposalConnectedCount} de {totalAppliances} artefactos
            </p>
          </div>
          <span className="rounded border border-[#8db7e8] bg-white px-2 py-0.5 font-mono text-[10px] uppercase text-[#15599f]">
            propuesta
          </span>
        </div>

        {unreachedNames.length > 0 ? (
          <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
            Pendientes: {unreachedNames.join(", ")}
          </div>
        ) : null}

        {proposalOutdated ? (
          <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
            La propuesta esta desactualizada. Regenerala antes de aceptar.
          </div>
        ) : null}

        <div className="mt-2 grid grid-cols-3 gap-1">
          <button
            className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
            disabled={!canAcceptProposal}
            type="button"
            onClick={onAcceptProposal}
          >
            Aceptar
          </button>
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
            disabled={proposalOutdated || proposal.segmentCount === 0}
            type="button"
            onClick={onEditProposal}
          >
            Editar
          </button>
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
            disabled={!canRegenerateProposal}
            type="button"
            onClick={onRegenerateProposal}
          >
            Regenerar
          </button>
        </div>
        {!canAcceptProposal && acceptBlockReason ? (
          <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
            {acceptBlockReason}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="font-semibold">Artefactos pendientes</div>
      {pendingStatuses.length === 0 ? (
        <p className="mt-1 text-[var(--muted)]">
          No hay artefactos pendientes.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {pendingStatuses.map((status) => (
            <div
              className="rounded border border-[var(--line)] bg-white px-2 py-1"
              key={status.equipment.id}
            >
              <span className="mr-2 font-mono">
                {equipmentCode(status.equipment.type)}
              </span>
              {status.equipment.name}
              {status.isInvalid ? (
                <span className="ml-2 text-red-700">ruta invalida</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {proposalRequiresScale ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[#ecd5ad] bg-[#fff9ec] px-2 py-1 text-[var(--warning)]">
          <span>Confirma la escala de la Planta.</span>
          <button
            className="shrink-0 rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
            type="button"
            onClick={onGoToScale}
          >
            Ir a Escala
          </button>
        </div>
      ) : null}

      <button
        className="mt-2 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
        disabled={!canGenerateProposal}
        type="button"
        onClick={onGenerateProposal}
      >
        {isGeneratingProposal ? "Generando recorrido..." : "Generar recorrido"}
      </button>
    </section>
  );
}

function ProposalSummary({
  applianceStatuses,
  isOutdated,
  proposal,
  onAcceptProposal,
  onDiscardProposal,
  onGenerateProposal,
}: {
  applianceStatuses: RouteApplianceStatus[];
  isOutdated: boolean;
  proposal: AutomaticRouteProposal;
  onAcceptProposal: () => void;
  onDiscardProposal: () => void;
  onGenerateProposal: () => void;
}) {
  const unreachedNames = proposal.unreachedEquipmentIds
    .map(
      (equipmentId) =>
        applianceStatuses.find((status) => status.equipment.id === equipmentId)
          ?.equipment.name ?? equipmentId,
    )
    .sort();
  const canAcceptProposal = routeProposalCanBeAccepted(
    proposal,
    applianceStatuses.length,
    isOutdated,
  );
  const acceptBlockReason = routeProposalAcceptanceBlockReason(
    proposal,
    applianceStatuses.length,
    isOutdated,
  );

  return (
    <section className="mt-3 border-t border-[var(--line)] pt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">
          {isOutdated ? "Propuesta desactualizada" : "Resumen"}
        </div>
        <span className="font-mono text-[10px] uppercase text-[var(--muted)]">
          {proposal.status}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_72px] gap-x-2 gap-y-1">
        <dt>Artefactos conectados</dt>
        <dd className="text-right font-mono">
          {proposal.reachedEquipmentIds.length} de {applianceStatuses.length}
        </dd>
        <dt>Sin ruta</dt>
        <dd className="text-right font-mono">{proposal.unreachedEquipmentIds.length}</dd>
        <dt>Longitud estimada</dt>
        <dd className="text-right">{formatMeters(proposal.lengthMeters)}</dd>
        <dt>Tramos</dt>
        <dd className="text-right font-mono">{proposal.segmentCount}</dd>
        <dt>Derivaciones</dt>
        <dd className="text-right font-mono">{proposal.derivationCount}</dd>
        <dt>Giros</dt>
        <dd className="text-right font-mono">{proposal.turnCount}</dd>
        <dt>Restricciones incumplidas</dt>
        <dd className="text-right font-mono">{proposal.validation.restrictionCount}</dd>
      </dl>

      {unreachedNames.length > 0 ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          Sin ruta: {unreachedNames.join(", ")}
        </div>
      ) : null}

      {isOutdated ? (
        <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
          Cambiaron equipos, escala o restricciones. Regenera antes de aceptar.
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!canAcceptProposal}
          type="button"
          onClick={onAcceptProposal}
        >
          Aceptar
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onGenerateProposal}
        >
          Regenerar
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onDiscardProposal}
        >
          Descartar
        </button>
      </div>
      {!canAcceptProposal && acceptBlockReason ? (
        <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
          {acceptBlockReason}
        </div>
      ) : null}
    </section>
  );
}

function RoutePhysicalEditControls({
  disabled,
  equipment,
  selectedEdit,
  snapOptions,
  onClearSelection,
  onDeleteSelectedVertex,
  onSnapOptionChange,
}: {
  disabled: boolean;
  equipment: WorkbenchEquipment[];
  selectedEdit: PhysicalRouteEditSelection | null;
  snapOptions: PhysicalRouteSnapOptions;
  onClearSelection: () => void;
  onDeleteSelectedVertex: () => void;
  onSnapOptionChange: (
    option: keyof PhysicalRouteSnapOptions,
    enabled: boolean,
  ) => void;
}) {
  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">Edicion fisica</div>
          <p className="mt-1 truncate text-[var(--muted)]">
            {routeEditSelectionLabel(selectedEdit, equipment)}
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!selectedEdit}
          type="button"
          onClick={onClearSelection}
        >
          Soltar
        </button>
      </div>

      {selectedEdit?.kind === "vertex" ? (
        <button
          className="mt-2 w-full rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={disabled}
          type="button"
          onClick={onDeleteSelectedVertex}
        >
          Borrar vertice
        </button>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-1">
        <SnapToggle
          checked={snapOptions.enabled}
          disabled={disabled}
          label="Snap"
          option="enabled"
          onChange={onSnapOptionChange}
        />
        <SnapToggle
          checked={snapOptions.axes}
          disabled={disabled || !snapOptions.enabled}
          label="Ejes X/Y"
          option="axes"
          onChange={onSnapOptionChange}
        />
        <SnapToggle
          checked={snapOptions.vertices}
          disabled={disabled || !snapOptions.enabled}
          label="Vertices"
          option="vertices"
          onChange={onSnapOptionChange}
        />
        <SnapToggle
          checked={snapOptions.structure}
          disabled={disabled || !snapOptions.enabled}
          label="Muros"
          option="structure"
          onChange={onSnapOptionChange}
        />
        <SnapToggle
          checked={snapOptions.orthogonal}
          disabled={disabled || !snapOptions.enabled}
          label="Ortogonal"
          option="orthogonal"
          onChange={onSnapOptionChange}
        />
      </div>
    </section>
  );
}

function SnapToggle({
  checked,
  disabled,
  label,
  option,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  option: keyof PhysicalRouteSnapOptions;
  onChange: (option: keyof PhysicalRouteSnapOptions, enabled: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded border border-[var(--line)] px-2 py-1">
      <input
        checked={checked}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(option, event.target.checked)}
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

function routeEditSelectionLabel(
  selection: PhysicalRouteEditSelection | null,
  equipment: WorkbenchEquipment[],
) {
  if (!selection) {
    return "Sin seleccion";
  }

  if (selection.kind === "segment") {
    return `Tramo ${selection.segmentId}`;
  }

  if (selection.kind === "vertex") {
    return `Vertice ${selection.vertexIndex + 1} de ${selection.segmentId}`;
  }

  if (selection.kind === "terminal") {
    return `Terminal ${equipmentName(selection.equipmentId, equipment)}`;
  }

  return `Nodo ${selection.nodeId}`;
}

function equipmentName(equipmentId: string, equipment: WorkbenchEquipment[]) {
  return equipment.find((item) => item.id === equipmentId)?.name ?? equipmentId;
}

function RouteIntentDraftControls({
  draft,
  equipment,
  onCancelDraft,
}: {
  draft: RouteIntentDraft;
  equipment: WorkbenchEquipment[];
  onCancelDraft: () => void;
}) {
  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">Conexion manual</div>
          <p className="mt-1 text-[var(--muted)]">
            {instructionForIntentDraft(draft)}
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onCancelDraft}
        >
          Cancelar
        </button>
      </div>

      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1">
        <div>Desde: {intentEndpointLabel(draft.from, equipment)}</div>
        <div>Hacia: {intentEndpointLabel(draft.to, equipment)}</div>
      </div>

      {draft.error ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          {draft.error}
        </div>
      ) : null}
    </section>
  );
}

function RouteDraftControls({
  applianceStatuses,
  draft,
  onSelectDraftTarget,
}: {
  applianceStatuses: RouteApplianceStatus[];
  draft: RouteDraft;
  onSelectDraftTarget: (equipmentId: string) => void;
}) {
  const target = applianceStatuses.find(
    (status) => status.equipment.id === draft.targetEquipmentId,
  )?.equipment;
  const origin = applianceStatuses.find(
    (status) => status.equipment.id === draft.originIntentEquipmentId,
  )?.equipment;

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="font-semibold">Conexión manual</div>
      <p className="mt-1 text-[var(--muted)]">{instructionForDraft(draft)}</p>

      {draft.step === "target" ? (
        <div className="mt-2 space-y-1">
          {applianceStatuses
            .filter((status) => !status.isConnected)
            .map((status) => (
              <button
                className="w-full rounded border border-[var(--line)] px-2 py-1 text-left hover:border-[var(--accent)]"
                key={status.equipment.id}
                type="button"
                onClick={() => onSelectDraftTarget(status.equipment.id)}
              >
                <span className="font-mono">{equipmentCode(status.equipment.type)}</span>{" "}
                {status.equipment.name}
              </button>
            ))}
        </div>
      ) : null}

      {origin || target ? (
        <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1">
          {origin ? <div>Desde: {origin.name}</div> : null}
          {target ? <div>Hacia: {target.name}</div> : null}
        </div>
      ) : null}

      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--muted)]">
        Los controles de dibujo estan sobre el plano.
      </div>
    </section>
  );
}

function intentConnectionLabel(
  connection: RouteIntentConnection,
  equipment: WorkbenchEquipment[],
) {
  return `${intentEndpointLabel(connection.from, equipment)} - ${intentEndpointLabel(connection.to, equipment)}`;
}

function intentEndpointLabel(
  endpoint: RouteIntentEndpoint | null,
  equipment: WorkbenchEquipment[],
) {
  if (!endpoint) {
    return "sin definir";
  }

  const item = equipment.find(
    (equipmentItem) => equipmentItem.id === endpoint.equipmentId,
  );

  if (!item) {
    return "equipo eliminado";
  }

  return item.role === "supply" ? "M" : item.name;
}

function prerequisiteMessage({
  connectedCount,
  hasAppliances,
  hasSupply,
  totalAppliances,
}: {
  connectedCount: number;
  hasAppliances: boolean;
  hasSupply: boolean;
  totalAppliances: number;
}) {
  if (!hasSupply) {
    return "Falta colocar la alimentación";
  }

  if (!hasAppliances) {
    return "Falta colocar al menos un artefacto";
  }

  if (connectedCount === totalAppliances) {
    return "Todos los artefactos están conectados";
  }

  return "Usa Conectar para dibujar relaciones manuales.";
}

function formatMeters(value: number) {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} m`;
}

function parseProposalMarginInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return normalized.length > 0 && Number.isFinite(parsed) && parsed >= 0;
}

function instructionForDraft(draft: RouteDraft) {
  if (draft.step === "target") {
    return "Elegí el artefacto sin conectar.";
  }

  if (draft.step === "origin") {
    return "Elegí el medidor, un nodo existente, un tramo o un artefacto conectado.";
  }

  if (draft.step === "drawing") {
    return "Marcá vértices y finalizá pulsando el artefacto elegido.";
  }

  return "Revisá el recorrido antes de guardar.";
}

function instructionForIntentDraft(draft: RouteIntentDraft) {
  if (draft.step === "from") {
    return "Elegi el primer punto.";
  }

  if (draft.step === "to") {
    return "Elegi el segundo punto.";
  }

  return "Guarda la conexion desde la tarjeta del plano.";
}
