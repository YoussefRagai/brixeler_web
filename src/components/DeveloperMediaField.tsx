"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import { createClient } from "@supabase/supabase-js";

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
  directUpload?: boolean;
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
  directUpload = false,
}: DeveloperMediaFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const uploadingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [dropError, setDropError] = useState("");

  useEffect(() => {
    if (!directUpload) return;
    const form = inputRef.current?.form;
    if (!form) return;
    const guard = (event: SubmitEvent) => {
      if (!uploadingRef.current) return;
      event.preventDefault();
      setDropError("Wait for the media upload to finish before saving.");
    };
    form.addEventListener("submit", guard, true);
    return () => form.removeEventListener("submit", guard, true);
  }, [directUpload]);

  const captureFiles = async (files: File[]) => {
    const allowed = files.filter((file) => acceptsFile(file, accept));
    if (!allowed.length) {
      setDropError("That file type is not supported here.");
      return;
    }
    const selected = multiple ? allowed : allowed.slice(0, 1);
    const maxUrls = fileName === "project_images" ? 20 : fileName === "voice_notes" || fileName === "project_videos" ? 10 : null;
    const existingUrls = urlRef.current?.value.split(/[\n,]/).filter((value) => value.trim()).length ?? 0;
    if (directUpload && maxUrls != null && selected.length + existingUrls > maxUrls) {
      setDropError(`This field accepts at most ${maxUrls} files or URLs.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setSelectedFiles(selected.map((file) => file.name));
    setDropError(allowed.length < files.length ? "Some unsupported files were skipped." : "");
    if (directUpload && urlName) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        setDropError("Uploads are unavailable. Paste a hosted URL or contact support.");
        return;
      }
      uploadingRef.current = true;
      setUploading(true);
      if (inputRef.current) inputRef.current.value = "";
      try {
        const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
        const uploadedUrls: string[] = [];
        for (const file of selected) {
          const response = await fetch("/api/developer/project-media/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: fileName, name: file.name, type: file.type, size: file.size }),
          });
          const signed = await response.json() as { bucket?: string; path?: string; token?: string; publicUrl?: string; error?: string };
          if (!response.ok || !signed.bucket || !signed.path || !signed.token || !signed.publicUrl) {
            throw new Error(signed.error || "Could not prepare the upload.");
          }
          const contentType = file.type || (file.name.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : undefined);
          const { error } = await client.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, file, { contentType });
          if (error) throw error;
          uploadedUrls.push(signed.publicUrl);
          if (urlRef.current) {
            const previous = urlRef.current.value.trim();
            urlRef.current.value = multiple ? [previous, signed.publicUrl].filter(Boolean).join("\n") : signed.publicUrl;
            urlRef.current.dispatchEvent(new Event("input", { bubbles: true }));
            urlRef.current.form?.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        const removeCheckbox = inputRef.current?.closest("fieldset")?.querySelector<HTMLInputElement>(`input[name="${fileName}_remove"]`);
        if (removeCheckbox) removeCheckbox.checked = false;
        setDropError(`${uploadedUrls.length} file${uploadedUrls.length === 1 ? "" : "s"} uploaded. Save the project to attach ${uploadedUrls.length === 1 ? "it" : "them"}.`);
        onFilesSelected?.(selected);
      } catch (error) {
        setDropError(error instanceof Error ? `Upload failed: ${error.message}. Try again or paste a URL.` : "Upload failed. Try again or paste a URL.");
      } finally {
        uploadingRef.current = false;
        setUploading(false);
      }
      return;
    }
    const transfer = new DataTransfer();
    selected.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
    onFilesSelected?.(selected);
  };

  return (
    <fieldset className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <legend className="px-1 text-sm font-semibold text-neutral-950">{label}</legend>
      {description ? <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p> : null}
      {directUpload ? <p className="mt-1 text-xs text-neutral-600">Files upload separately, then attach when you save. You can also paste a hosted URL.</p> : null}
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
          void captureFiles(Array.from(event.dataTransfer.files));
        }}
        className={`mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
          dragging ? "border-[#7f981d] bg-[#f4f8df]" : "border-black/20 bg-white hover:border-black/40"
        }`}
      >
        <span className="text-sm font-semibold text-neutral-900">{uploading ? "Uploading…" : `Drop ${multiple ? "files" : "a file"} here`}</span>
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
            if (files.length) void captureFiles(files);
          }}
          className="sr-only"
        />
      </label>
      <p aria-live="polite" data-media-uploading={uploading ? "true" : undefined} className={`mt-2 text-xs ${dropError.startsWith("Upload failed") || dropError.startsWith("Wait") ? "text-rose-700" : "text-neutral-600"}`}>
        {dropError || (currentValue ? `Current file: ${currentValue}` : `Accepted: ${accept}`)}
      </p>
      {urlName ? (
        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{urlLabel}</span>
          {multiple ? (
            <textarea
              ref={urlRef as Ref<HTMLTextAreaElement>}
              name={urlName}
              defaultValue={defaultUrl}
              placeholder={urlPlaceholder}
              className="mt-2 min-h-20 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-black/40 focus:ring-2 focus:ring-[#dff579]"
            />
          ) : (
            <input
              ref={urlRef as Ref<HTMLInputElement>}
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
