export type ProjectWorkspaceSection = "overview" | "phases" | "inventory" | "commercial" | "review" | "settings";
export type ProjectInventoryView = "types" | "units";

const PROJECT_WORKSPACE_SECTIONS: readonly ProjectWorkspaceSection[] = [
  "overview",
  "phases",
  "inventory",
  "commercial",
  "review",
  "settings",
];

export function normalizeProjectWorkspaceSection(value: string | null | undefined, canManageProjects: boolean): ProjectWorkspaceSection {
  if (!canManageProjects) return "inventory";
  return PROJECT_WORKSPACE_SECTIONS.includes(value as ProjectWorkspaceSection)
    ? value as ProjectWorkspaceSection
    : "overview";
}

export function defaultProjectInventoryView(canManageProjects: boolean): ProjectInventoryView {
  return canManageProjects ? "types" : "units";
}

export function normalizeProjectInventoryView(value: string | null | undefined, canManageProjects: boolean): ProjectInventoryView {
  if (value === "types" || value === "units") return value;
  return defaultProjectInventoryView(canManageProjects);
}

export function projectSectionQuery(section: ProjectWorkspaceSection, options?: { phaseId?: string | null; inventoryView?: ProjectInventoryView }): string {
  const params = new URLSearchParams({ section });
  if (options?.inventoryView) params.set("inventoryView", options.inventoryView);
  if (options?.phaseId) params.set("phase", options.phaseId);
  return params.toString();
}

export function projectSetupAction(input: {
  projectId: string;
  missing: string[];
  activePhaseCount: number;
  selectedPhaseId?: string | null;
  incompleteUnitTypeId?: string | null;
  incompleteUnitTypePhaseId?: string | null;
  incompleteUnitTypeArchived?: boolean;
}): { label: string; href: string } {
  if (input.missing.includes("Project name") || input.missing.includes("Description") || input.missing.includes("Location") || input.missing.includes("Project type")) {
    return { label: "Complete project details", href: `/developer/projects/${input.projectId}?${projectSectionQuery("settings", { phaseId: input.selectedPhaseId })}&settings=1#project-settings` };
  }
  if (input.missing.includes("Hero media")) {
    return { label: "Add hero media", href: `/developer/projects/${input.projectId}?${projectSectionQuery("settings", { phaseId: input.selectedPhaseId })}&settings=1#project-media` };
  }
  if (input.missing.includes("Unit inventory")) {
    return input.activePhaseCount
      ? { label: "Add a unit type", href: `/developer/projects/${input.projectId}?${projectSectionQuery("inventory", { inventoryView: "types", phaseId: input.selectedPhaseId })}&addUnitType=1#add-property-types` }
      : { label: "Create the first phase", href: `/developer/projects/${input.projectId}?section=phases&phase=new#new-project-phase` };
  }
  if (input.missing.includes("Unit details")) {
    if (input.incompleteUnitTypeId) {
      const phaseId = input.incompleteUnitTypePhaseId ?? input.selectedPhaseId;
      if (input.incompleteUnitTypeArchived) {
        return { label: "Restore archived unit type", href: `/developer/projects/${input.projectId}?${projectSectionQuery("inventory", { inventoryView: "types", phaseId })}&inventory=archived#unit-type-row-${encodeURIComponent(input.incompleteUnitTypeId)}` };
      }
      return { label: "Complete unit details", href: `/developer/projects/${input.projectId}?${projectSectionQuery("inventory", { inventoryView: "types", phaseId })}&editUnitType=${encodeURIComponent(input.incompleteUnitTypeId)}#unit-type-editor-${encodeURIComponent(input.incompleteUnitTypeId)}` };
    }
    return { label: "Complete unit details", href: `/developer/projects/${input.projectId}?${projectSectionQuery("inventory", { inventoryView: "types", phaseId: input.selectedPhaseId })}&addUnitType=1#add-property-types` };
  }
  return { label: "Open review", href: `/developer/projects/${input.projectId}?${projectSectionQuery("review", { phaseId: input.selectedPhaseId })}#project-review` };
}
