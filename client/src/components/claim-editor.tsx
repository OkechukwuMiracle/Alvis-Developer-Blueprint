"use client";
import type { Claim } from "@/lib/content";
export function ClaimEditor({
  label,
  claim,
  sourceIds,
  onChange,
}: {
  label: string;
  claim: Claim;
  sourceIds: string[];
  onChange: (claim: Claim) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="font-bold">{label}</legend>
      <label className="text-sm">
        Claim text
        <textarea
          aria-label={label + " text"}
          value={claim.text ?? ""}
          disabled={claim.basis === "unknown"}
          onChange={(e) => onChange({ ...claim, text: e.target.value || null })}
        />
      </label>
      <label className="text-sm">
        Basis
        <select
          aria-label={label + " basis"}
          value={claim.basis}
          onChange={(e) => {
            const basis = e.target.value as Claim["basis"];
            onChange(
              basis === "unknown"
                ? { basis, text: null, evidence_ids: [] }
                : { ...claim, basis },
            );
          }}
        >
          <option value="explicit">Explicit</option>
          <option value="inferred">Inferred</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <p className="muted text-sm mt-3">Linked evidence</p>
      {sourceIds.map((id, i) => (
        <label key={id} className="flex gap-3 items-center text-sm font-normal">
          <input
            className="!w-5 !min-h-5"
            type="checkbox"
            disabled={claim.basis === "unknown"}
            checked={claim.evidence_ids.includes(id)}
            onChange={(e) =>
              onChange({
                ...claim,
                evidence_ids: e.target.checked
                  ? [...claim.evidence_ids, id]
                  : claim.evidence_ids.filter((x) => x !== id),
              })
            }
          />
          Source {i + 1} <span className="text-xs break-all">{id}</span>
        </label>
      ))}
    </fieldset>
  );
}
