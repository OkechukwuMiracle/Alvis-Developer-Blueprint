import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Alvis · Keep the judgment. Share the knowledge.",
  description:
    "Preserve expert judgment with evidence-linked, reviewed knowledge and contextual manufacturing training.",
};
const steps = [
  [
    "Capture",
    "Record a short, consented training task. Preserve its recording and timestamped transcript.",
  ],
  [
    "Debrief",
    "Explain the signal, reasoning, exceptions and observed outcome. Unknowns stay visible.",
  ],
  [
    "Review",
    "A designated reviewer checks the draft and evidence before publication.",
  ],
  [
    "Retrieve",
    "Ask an asset-specific question and inspect the reviewed sources behind a generated explanation.",
  ],
  [
    "Practice",
    "Follow stored, reviewed steps in a supervised simulation with prerequisites and stop conditions.",
  ],
  [
    "Learn",
    "Complete a separately reviewed short lesson and see your knowledge-check history.",
  ],
];
export default function Landing() {
  return (
    <div className="public-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Link className="brand" href="/" aria-label="Alvis home">
          alvis.
        </Link>
        <nav aria-label="Public navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#use-cases">Use cases</a>
          <a href="#about">About</a>
          <a href="#faqs">FAQs</a>
          <Link href="/login">Sign in</Link>
          <Link className="button" href="/signup">
            Get started
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="public-hero">
          <div>
            <p className="eyebrow">The experience behind the instruction</p>
            <h1>
              Keep the judgment.
              <br />
              Share the knowledge.
            </h1>
            <p className="hero-copy">
              Your experts know what to notice, why it matters, and when an
              approach does not apply. Alvis helps preserve that reasoning as
              reviewed, searchable knowledge your team can learn from.
            </p>
            <div className="public-actions">
              <Link className="button" href="/signup">
                Get started
              </Link>
              <a className="button secondary" href="#how-it-works">
                See how it works
              </a>
            </div>
            <p className="muted">
              Starting with manufacturing maintenance training.
            </p>
          </div>
          <aside className="judgment-card">
            <span className="badge">
              Illustrative workflow · no customer data
            </span>
            <h2>More than a recording</h2>
            <p>
              <strong>What did you notice?</strong>
              <br />
              Preserve the observable signal.
            </p>
            <p>
              <strong>Why that choice?</strong>
              <br />
              Capture the expert’s reason.
            </p>
            <p>
              <strong>When would it not apply?</strong>
              <br />
              Keep exceptions close.
            </p>
            <div className="notice">
              Evidence → expert explanation → human review
            </div>
          </aside>
        </section>
        <section className="public-section" id="how-it-works">
          <h2>Use Alvis personally or with your organization</h2>
          <p>Individuals can contribute experience, review community submissions, ask questions and learn without joining a company. Organization workspaces retain their private invitations, roles and knowledge. Community roles are self-selected and do not verify professional credentials.</p>
          <Link className="button" href="/community/library">Browse community knowledge</Link>
          <p className="eyebrow">How it works</p>
          <h2>A traceable path from experience to learning</h2>
          <div className="workflow-grid">
            {steps.map(([title, text], i) => (
              <article className="panel" key={title}>
                <span className="eyebrow">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section" id="use-cases">
          <p className="eyebrow">Use cases</p>
          <h2>Help a team understand the reasoning</h2>
          <div className="workflow-grid">
            {[
              [
                "Experienced contributors",
                "Capture a simulated task and explain the judgment a recording cannot reveal on its own.",
              ],
              [
                "Designated reviewers",
                "Check source support, applicability and missing information before knowledge or lessons become available.",
              ],
              [
                "Maintenance learners",
                "Find approved asset-specific knowledge, inspect citations, practise reviewed steps and check understanding.",
              ],
            ].map(([title, text]) => (
              <article className="panel" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section" id="about">
          <p className="eyebrow">About Alvis</p>
          <h2>Expertise should remain available to the team</h2>
          <p>
            Alvis connects observations, decisions, reasons and exceptions to
            their sources. Generated explanations are labeled separately from
            expert-approved material.
          </p>
          <div className="notice">
            <strong>Current scope: a manufacturing training capstone.</strong>
            <p>
              Short recordings, reviewed knowledge and lessons, approved
              retrieval, supervised simulation guides and knowledge checks.
              Alvis does not operate equipment, diagnose faults from sound,
              certify practical competence or replace site-approved procedures.
              Missing, conflicting or hazardous information requires
              clarification, abstention or supervisor escalation. Processing
              requires configured external services.
            </p>
          </div>
        </section>
        <section className="public-section" id="faqs">
          <p className="eyebrow">FAQs</p>
          <h2>Before you start</h2>
          {[
            [
              "Who can join my organization?",
              "Anyone can register and create an empty organization. Joining an existing organization requires an administrator’s invitation to your verified email.",
            ],
            [
              "Does AI publish knowledge?",
              "No. Generated drafts remain unverified. A designated reviewer must approve knowledge; lessons require separate review.",
            ],
            [
              "What if evidence is missing?",
              "Missing information stays visible. Alvis asks follow-up questions or withholds an unsupported answer.",
            ],
            [
              "What does a passed assessment mean?",
              "Knowledge check passed records a three-question assessment. It is not certification or demonstrated practical competence.",
            ],
            [
              "Are examples customer results?",
              "No. Supplied manufacturing examples are synthetic and belong only in a labeled demo workspace. New organizations start empty.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="public-section public-cta">
          <h2>Start with your team’s experience.</h2>
          <p>
            Create an account, verify your email and establish your workspace.
          </p>
          <Link className="button" href="/signup">
            Create an account
          </Link>
        </section>
      </main>
      <footer className="public-footer">
        <Link href="/">alvis.</Link>
        <span>Reviewed knowledge. Contextual learning.</span>
        <Link href="/login">Sign in</Link>
      </footer>
    </div>
  );
}
