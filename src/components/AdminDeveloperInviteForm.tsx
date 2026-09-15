"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useActionState } from "react";

export type DeveloperInviteActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type DeveloperInviteAction = (
  previousState: DeveloperInviteActionState,
  formData: FormData,
) => Promise<DeveloperInviteActionState>;

type DeveloperOption = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
};

type DemoBatchOption = {
  batch_key: string;
  label: string;
};

type Props = {
  developers: DeveloperOption[];
  demoBatches: DemoBatchOption[];
  action: DeveloperInviteAction;
};

const initialState: DeveloperInviteActionState = { status: "idle", message: "" };

const initialFormValues = {
  developerName: "",
  contactEmail: "",
  contactPhone: "",
  memberEmail: "",
  demoBatch: "",
};

type InviteFormValues = typeof initialFormValues;

export function AdminDeveloperInviteForm({ developers, demoBatches, action }: Props) {
  const [existingDeveloperId, setExistingDeveloperId] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [formValues, setFormValues] = useState<InviteFormValues>(initialFormValues);
  const requestIdSeed = useId();
  const requestIdInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string | null>(null);

  const resetRequestId = useCallback(() => {
    requestIdRef.current = null;
    if (requestIdInputRef.current) requestIdInputRef.current.value = requestIdSeed;
  }, [requestIdSeed]);

  const resetForm = useCallback(() => {
    resetRequestId();
    setFormValues(initialFormValues);
    setExistingDeveloperId("");
    setIsDemo(false);
  }, [resetRequestId]);

  const actionWithReset = useCallback(
    async (previousState: DeveloperInviteActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") resetForm();
      return nextState;
    },
    [action, resetForm],
  );
  const [state, formAction, pending] = useActionState(actionWithReset, initialState);

  const updateFormValue = (field: keyof InviteFormValues, value: string) => {
    resetRequestId();
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const prepareRequest = (event: React.FormEvent<HTMLFormElement>) => {
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    const input = event.currentTarget.elements.namedItem("inviteRequestId");
    if (input instanceof HTMLInputElement) input.value = requestId;
  };

  const selectedDeveloper = developers.find((developer) => developer.id === existingDeveloperId) ?? null;
  const isCreating = !selectedDeveloper;

  return (
    <form
      action={formAction}
      onSubmit={prepareRequest}
      className="grid gap-4 rounded-2xl border border-black/10 bg-[#f8f8f8] p-4 text-sm text-neutral-700 md:grid-cols-2"
    >
      <input ref={requestIdInputRef} type="hidden" name="inviteRequestId" defaultValue={requestIdSeed} readOnly />
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Existing developer</span>
        <select
          name="existingDeveloperId"
          value={existingDeveloperId}
          onChange={(event) => {
            resetRequestId();
            setExistingDeveloperId(event.target.value);
          }}
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]"
        >
          <option value="">Create new</option>
          {developers.map((developer) => (
            <option key={developer.id} value={developer.id}>
              {developer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 md:col-span-2">
        <input
          type="checkbox"
          name="isDemo"
          checked={isDemo}
          onChange={(event) => {
            resetRequestId();
            setIsDemo(event.target.checked);
          }}
          disabled={!isCreating || demoBatches.length === 0}
          className="h-4 w-4 accent-amber-700"
        />
        <span>
          <span className="block font-semibold">Mark new developer as demo data</span>
          <span className="block text-xs text-amber-800">
            The invite still sends to the member email, but the records stay out of mobile and can be removed by batch.
          </span>
        </span>
      </label>
      {isDemo && isCreating ? (
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Demo batch</span>
          <select
            name="demoBatch"
            required
            value={formValues.demoBatch}
            onChange={(event) => updateFormValue("demoBatch", event.target.value)}
            className="rounded-2xl border border-amber-300 bg-white px-3 py-2 text-[#050505]"
          >
            <option value="" disabled>
              Select an active batch
            </option>
            {demoBatches.map((batch) => (
              <option key={batch.batch_key} value={batch.batch_key}>
                {batch.label} ({batch.batch_key})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer name</span>
        <input
          name="developerName"
          required={isCreating}
          disabled={!isCreating}
          value={formValues.developerName}
          onChange={(event) => updateFormValue("developerName", event.target.value)}
          placeholder="Atlas Developments"
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505] disabled:bg-black/[0.03] disabled:text-neutral-400"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Contact email</span>
        <input
          type="email"
          name="contactEmail"
          disabled={!isCreating}
          value={formValues.contactEmail}
          onChange={(event) => updateFormValue("contactEmail", event.target.value)}
          placeholder="partners@developer.com"
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505] disabled:bg-black/[0.03] disabled:text-neutral-400"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Contact phone</span>
        <input
          name="contactPhone"
          disabled={!isCreating}
          value={formValues.contactPhone}
          onChange={(event) => updateFormValue("contactPhone", event.target.value)}
          placeholder="+20 100 000 0000"
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505] disabled:bg-black/[0.03] disabled:text-neutral-400"
        />
      </label>
      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Member email</span>
        <input
          type="email"
          name="memberEmail"
          required
          value={formValues.memberEmail}
          onChange={(event) => updateFormValue("memberEmail", event.target.value)}
          placeholder="member@developer.com"
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]"
        />
      </label>
      {selectedDeveloper ? (
        <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 md:col-span-2">
          Contact details stay unchanged when an existing developer is selected. Only the member invitation is added.
        </p>
      ) : null}
      {state.status !== "idle" ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
            state.status === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {state.message}
        </p>
      ) : null}
      <div className="space-y-2 md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending invite…" : "Send invite"}
        </button>
        <p className="text-xs text-neutral-500">
          New developer records are created only after the invitation is accepted by Auth. Failed writes are reported so
          they can be retried safely.
        </p>
      </div>
    </form>
  );
}
