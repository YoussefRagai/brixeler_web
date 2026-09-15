"use client";

import { useId, useRef, useState } from "react";

type DeveloperMediaFieldProps = {
  label: string;
  description?: string;
  fileName: string;
  urlName?: string;
  urlLabel?: string;
  accept: string;
  multiple?: boolean;
  required?: boolean;
  defaultUrl?: string;
  currentValue?: string | null;
  urlPlaceholder?: string;
  onFilesSelected?: (files: File[]) => void;
};

function acceptsFile(file: File, accept: string) {
  return accept
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .some((rule) => {
      if (!rule) return false;
      if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
      if (rule.endsWith("/*")) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
      return file.type.toLowerCase() === rule;
    });
}

export function DeveloperMediaField({
  label,
  description,
  fileName,
  urlName,
  urlLabel = "Or paste a URL",
  accept,
  multiple = false,
  required = false,
  defaultUrl,
  currentValue,
  urlPlaceholder = "https://…",
  onFilesSelected,
}: DeveloperMediaFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [dropError, setDropError] = useState("");

  const captureFiles = (files: File[]) => {
    const allowed = files.filter((file) => acceptsFile(file, accept));
    if (!allowed.length) {
      setDropError("That file type is not supported here.");
      return;
    }
    const selected = multiple ? allowed : allowed.slice(0, 1);
    const transfer = new DataTransfer();
    selected.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
    setSelectedFiles(selected.map((file) => file.name));
    setDropError(allowed.length < files.length ? "Some unsupported files were skipped." : "");
    onFilesSelected?.(selected);
  };

  return (
    <fieldset className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <legend className="px-1 text-sm font-semibold text-neutral-950">{label}</legend>
      {description ? <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p> : null}
      {currentValue && ["project_images", "project_logo", "project_brochure", "project_masterplan", "voice_notes", "project_videos", "project_inventory", "phaseHeroImage", "phaseMasterplan"].includes(fileName) ? <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" name={`${fileName}_remove`} value="1" />Remove current media when saved (a new upload takes precedence)</label> : null}
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          captureFiles(Array.from(event.dataTransfer.files));
        }}
        className={`mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
          dragging ? "border-[#7f981d] bg-[#f4f8df]" : "border-black/20 bg-white hover:border-black/40"
        }`}
      >
        <span className="text-sm font-semibold text-neutral-900">Drop {multiple ? "files" : "a file"} here</span>
        <span className="mt-1 text-xs text-neutral-500">or click to browse your device</span>
        {selectedFiles.length ? (
          <span className="mt-3 max-w-full truncate rounded-full bg-[#eff7c9] px-3 py-1 text-xs font-medium text-[#405000]">
            {selectedFiles.join(", ")}
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          name={fileName}
          type="file"
          accept={accept}
          multiple={multiple}
          required={required && !urlName && !defaultUrl && !currentValue}
          aria-required={required}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            setSelectedFiles(files.map((file) => file.name));
            setDropError("");
            onFilesSelected?.(files);
          }}
          className="sr-only"
        />
      </label>
      <p aria-live="polite" className={`mt-2 text-xs ${dropError ? "text-rose-700" : "text-neutral-500"}`}>
        {dropError || (currentValue ? `Current file: ${currentValue}` : `Accepted: ${accept}`)}
      </p>
      {urlName ? (
        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{urlLabel}</span>
          {multiple ? (
            <textarea
              name={urlName}
              defaultValue={defaultUrl}
              placeholder={urlPlaceholder}
              className="mt-2 min-h-20 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-black/40 focus:ring-2 focus:ring-[#dff579]"
            />
          ) : (
            <input
              name={urlName}
              type="url"
              defaultValue={defaultUrl}
              placeholder={urlPlaceholder}
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-black/40 focus:ring-2 focus:ring-[#dff579]"
            />
          )}
        </label>
      ) : null}
    </fieldset>
  );
}
