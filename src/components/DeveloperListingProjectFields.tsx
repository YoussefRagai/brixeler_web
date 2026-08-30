"use client";

import { useMemo, useState } from "react";

type ProjectPhase = {
  id: string;
  name: string;
  phase_order: number;
};

type Project = {
  id: string;
  name: string;
  phases: ProjectPhase[];
};

export function DeveloperListingProjectFields({
  projects,
  initialProjectId,
  initialPhaseId,
}: {
  projects: Project[];
  initialProjectId?: string | null;
  initialPhaseId?: string | null;
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const initialProject = projects.find((project) => project.id === projectId);
  const initialPhase = initialProject?.phases.some((phase) => phase.id === initialPhaseId)
    ? initialPhaseId ?? ""
    : initialProject?.phases[0]?.id ?? "";
  const [phaseId, setPhaseId] = useState(initialPhase);
  const phases = useMemo(
    () => projects.find((project) => project.id === projectId)?.phases ?? [],
    [projects, projectId],
  );

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Linked project</span>
        <select
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          name="projectId"
          value={projectId}
          onChange={(event) => {
            const nextProjectId = event.target.value;
            const nextPhases = projects.find((project) => project.id === nextProjectId)?.phases ?? [];
            setProjectId(nextProjectId);
            setPhaseId(nextPhases[0]?.id ?? "");
          }}
        >
          <option value="">No linked project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Release phase</span>
        <select
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          name="phaseId"
          value={phaseId}
          onChange={(event) => setPhaseId(event.target.value)}
          disabled={!projectId || !phases.length}
        >
          <option value="">{projectId ? "Choose a release phase" : "Select a project first"}</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>{phase.phase_order}. {phase.name}</option>
          ))}
        </select>
        <span className="text-xs text-neutral-500">Changing the project resets the phase to that project’s first active release.</span>
      </label>
    </div>
  );
}
