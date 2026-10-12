import { useRef, useState } from "react";
import {
  IconAlertCircle,
  IconFileText,
  IconLoader2,
  IconUpload,
  IconX,
} from
  "@tabler/icons-react";
import { useNavigate } from "react-router";
import {
  createShipmentImportDraft,
  savePendingImportDraft,
} from "../shipment-import";

export default function LandingUpload() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (selected: File) => {
    if (isSubmitting) return;
    setFile(selected);
    setIsSubmitting(true);
    setError(null);
    try {
      const draft = await createShipmentImportDraft(selected);
      savePendingImportDraft(draft);
      navigate("/shipments");
    } catch (cause) {
      console.error("Could not prepare the shipment file:", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare this shipment file. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) void uploadFile(droppedFile);
  };

  const handleSelect = (files: FileList | null) => {
    const selected = files?.[0];
    if (selected) void uploadFile(selected);
  };

  const openFilePicker = () => {
    if (!isSubmitting) fileInput.current?.click();
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        role="group"
        aria-label="Shipment file upload"
        tabIndex={0}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onClick={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("button, input")
          ) return;
          openFilePicker();
        }}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            openFilePicker();
          }
        }}
        className="group relative flex min-h-84 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-4xl border border-dashed border-[#d9d6cc] bg-white/80 px-6 py-10 text-center shadow-[0_18px_60px_rgba(54,50,40,0.06)] transition duration-200 hover:border-[#c7c2b6] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d97757] sm:min-h-96"
      >
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.xlsx,.docx"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            handleSelect(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#d8d5cc_0.7px,transparent_0.7px)] bg-size-[18px_18px] opacity-40"
        />
        <div className="relative flex flex-col items-center">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#f8eee9] text-[#c76649] shadow-[0_6px_20px_rgba(184,103,76,0.12)] transition duration-200 group-hover:-translate-y-0.5">
            {isSubmitting
              ? <IconLoader2 size={27} stroke={1.7} className="animate-spin" />
              : <IconUpload size={27} stroke={1.7} />}
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#d97757] text-white">
              <span className="text-base leading-none">+</span>
            </span>
          </span>

          <h2 className="mt-6 text-xl font-medium tracking-tight text-[#282724] sm:text-2xl">
            {file ? file.name : "Drop your shipment file here"}
          </h2>
          <p className="mt-2 text-sm text-[#77756e]">
            {isSubmitting
              ? "Preparing your shipment preview…"
              : file
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · Could not prepare preview`
              : "Drag it in, or browse your files"}
          </p>

          <div
            aria-label="CSV, Excel, or Word documents"
            className="mt-7 flex items-center gap-3"
          >
            <FileTypeTile kind="CSV" tone="green" />
            <FileTypeTile kind="XLSX" tone="green" />
            <FileTypeTile kind="DOCX" tone="blue" />
          </div>

        </div>
        {file && (
          <button
            type="button"
            aria-label="Remove selected file"
            disabled={isSubmitting}
            onClick={(event) => {
              event.stopPropagation();
              setFile(null);
              setError(null);
            }}
            className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#77756e] shadow-sm transition hover:bg-[#f5f4f0] hover:text-[#282724] disabled:opacity-50"
          >
            <IconX size={18} />
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 flex items-center justify-center gap-2 text-sm text-red-700"
        >
          <IconAlertCircle size={17} />
          {error}
        </p>
      )}
    </div>
  );
}

function FileTypeTile({
  kind,
  tone,
}: {
  kind: "CSV" | "XLSX" | "DOCX";
  tone: "green" | "blue";
}) {
  const color = tone === "green"
    ? "bg-[#e7f3e9] text-[#287c46]"
    : "bg-[#eaf0fb] text-[#4269a8]";

  return (
    <span
      aria-hidden="true"
      className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${color}`}
    >
      {kind === "DOCX"
        ? <IconFileText size={21} stroke={1.7} />
        : (
          <span className="grid grid-cols-2 gap-0.5">
            <span className="h-2 w-2 rounded-[1px] bg-current opacity-80" />
            <span className="h-2 w-2 rounded-[1px] bg-current opacity-55" />
            <span className="h-2 w-2 rounded-[1px] bg-current opacity-55" />
            <span className="h-2 w-2 rounded-[1px] bg-current opacity-80" />
          </span>
        )}
      <span className="absolute -bottom-1.5 rounded bg-white px-1 text-[8px] font-bold tracking-wide text-[#686761] shadow-sm">
        {kind}
      </span>
    </span>
  );
}
