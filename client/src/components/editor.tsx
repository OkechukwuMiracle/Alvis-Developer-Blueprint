"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { Content, Claim } from "@/lib/content";
import { mutate } from "@/app/actions";
import { ClaimEditor } from "./claim-editor";
function Save() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
  );
}
export function Editor({
  content,
  revisionId,
  hash,
  sourceIds: suppliedSources,
}: {
  content: Content;
  revisionId: string;
  hash: string;
  sourceIds?: string[];
}) {
  const [draft, setDraft] = useState(content);
  const sourceIds = suppliedSources ?? [
    ...new Set(
      Object.values(content).flatMap((value) => {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "evidence_ids" in value
        )
          return value.evidence_ids;
        if (Array.isArray(value))
          return value.flatMap((x) =>
            x && typeof x === "object" && "evidence_ids" in x
              ? x.evidence_ids
              : [],
          );
        return [];
      }),
    ),
  ];
  function editClaim(key: keyof Content, index: number | null, claim: Claim) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      if (index === null) Object.assign(next[key] as Claim, claim);
      else (next[key] as Claim[])[index] = claim;
      return next;
    });
  }
  return (
    <form action={mutate} className="card">
      <h2>Edit draft content</h2>
      <p className="muted">
        Choose from the linked sources. A changed claim must still be supported
        by its evidence; the reviewer checks meaning.
      </p>
      <input type="hidden" name="revision_id" value={revisionId} />
      <input type="hidden" name="hash" value={hash} />
      <input type="hidden" name="operation" value="save" />
      <input type="hidden" name="content" value={JSON.stringify(draft)} />
      {(["title", "task"] as const).map((key) => (
        <div key={key}>
          <label htmlFor={key}>{key}</label>
          <input
            id={key}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            required
          />
        </div>
      ))}
      {(
        [
          "situation",
          "signal",
          "interpretation",
          "decision",
          "reason",
          "outcome",
          "exceptions",
          "prerequisites",
          "stop_conditions",
        ] as const
      ).map((key) => {
        const values = Array.isArray(draft[key])
          ? (draft[key] as Claim[])
          : [draft[key] as Claim];
        return (
          <section key={key}>
            {values.map((claim, i) => (
              <ClaimEditor
                key={i}
                label={
                  key.replace("_", " ") +
                  (values.length > 1 ? " " + (i + 1) : "")
                }
                claim={claim}
                sourceIds={sourceIds}
                onChange={(value) =>
                  editClaim(key, Array.isArray(draft[key]) ? i : null, value)
                }
              />
            ))}
            {Array.isArray(draft[key]) && (
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      [key]: [
                        ...(draft[key] as Claim[]),
                        { text: null, basis: "unknown", evidence_ids: [] },
                      ],
                    })
                  }
                >
                  Add {key.replaceAll("_", " ")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={values.length === 0}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      [key]: (draft[key] as Claim[]).slice(0, -1),
                    })
                  }
                >
                  Remove last {key.replaceAll("_", " ")}
                </button>
              </div>
            )}{" "}
          </section>
        );
      })}
      <h3 className="mt-6">Ordered steps</h3>
      {draft.steps.map((step, i) => (
        <div key={step.order}>
          <label htmlFor={"step" + i}>Step {step.order}</label>
          <textarea
            id={"step" + i}
            value={step.instruction}
            onChange={(e) =>
              setDraft({
                ...draft,
                steps: draft.steps.map((s, j) =>
                  j === i ? { ...s, instruction: e.target.value } : s,
                ),
              })
            }
          />
          <label htmlFor={"rationale" + i}>Reason for step {step.order}</label>
          <textarea
            id={"rationale" + i}
            value={step.rationale ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                steps: draft.steps.map((s, j) =>
                  j === i ? { ...s, rationale: e.target.value } : s,
                ),
              })
            }
          />
          <label>
            <input
              type="checkbox"
              checked={step.requires_authorized_person}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  steps: draft.steps.map((s, j) =>
                    j === i
                      ? { ...s, requires_authorized_person: e.target.checked }
                      : s,
                  ),
                })
              }
            />{" "}
            Requires an authorized person
          </label>
          <fieldset>
            <legend>Evidence for step {step.order}</legend>
            {sourceIds.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={step.evidence_ids.includes(id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.map((s, j) =>
                        j === i
                          ? {
                              ...s,
                              evidence_ids: e.target.checked
                                ? [...s.evidence_ids, id]
                                : s.evidence_ids.filter((x) => x !== id),
                            }
                          : s,
                      ),
                    })
                  }
                />
                {id}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setDraft({
                ...draft,
                steps: draft.steps
                  .filter((_, j) => j !== i)
                  .map((s, j) => ({ ...s, order: j + 1 })),
              })
            }
          >
            Remove step {step.order}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary mt-3"
        onClick={() =>
          setDraft({
            ...draft,
            steps: [
              ...draft.steps,
              {
                order: draft.steps.length + 1,
                instruction: "",
                rationale: null,
                evidence_ids: [],
                requires_authorized_person: true,
              },
            ],
          })
        }
      >
        Add step
      </button>
      <label htmlFor="skills">Skill topics (one per line)</label>
      <textarea
        id="skills"
        value={draft.skill_tags.join("\n")}
        onChange={(e) =>
          setDraft({
            ...draft,
            skill_tags: e.target.value.split("\n").filter(Boolean),
          })
        }
      />
      <label htmlFor="gaps">Missing information (one per line)</label>
      <textarea
        id="gaps"
        value={draft.missing_information.join("\n")}
        onChange={(e) =>
          setDraft({
            ...draft,
            missing_information: e.target.value.split("\n").filter(Boolean),
          })
        }
      />
      <label htmlFor="conflicts">Contradictions (one per line)</label>
      <textarea
        id="conflicts"
        value={draft.contradictions.join("\n")}
        onChange={(e) =>
          setDraft({
            ...draft,
            contradictions: e.target.value.split("\n").filter(Boolean),
          })
        }
      />
      <div className="actions">
        <Save />
      </div>
    </form>
  );
}
