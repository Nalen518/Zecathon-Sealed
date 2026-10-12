import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { RadioOption } from "../../../components/RadioOption/RadioOption";
import { SiteHeader } from "../../../components/SiteHeader/SiteHeader";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { Tag } from "../../../components/Tag/Tag";
import { TextLink } from "../../../components/TextLink/TextLink";
import { bundled } from "../../../lib/config";
import { QUESTIONS, resultTitle, type Option } from "./questions";
import "../AppScreen.css";
import "./SafetyCheck.css";

/**
 * Figma: Sender screens / Safety check — Question, Result. FR-10, T-10.
 * Runs fully offline. Answers live in this component's state only (D-20): nothing is sent or stored.
 */
export function SafetyCheck() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  if (!bundled.ok) return null;
  const network = bundled.config.network;

  const restart = () => {
    setAnswers({});
    setIndex(0);
    setDone(false);
  };

  return (
    <div className="app-page">
      <SiteHeader network={network} />
      <main id="main" className="app-main">
        <div className="container">
          {done ? (
            <Result answers={answers} onRestart={restart} />
          ) : (
            <QuestionStep
              key={index}
              index={index}
              headingRef={headingRef}
              value={answers[QUESTIONS[index]!.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [QUESTIONS[index]!.id]: v }))}
              onNext={() => (index + 1 < QUESTIONS.length ? setIndex(index + 1) : setDone(true))}
            />
          )}
        </div>
      </main>
      <SlimFooter />
    </div>
  );
}

function QuestionStep({
  index,
  value,
  onChange,
  onNext,
  headingRef,
}: {
  index: number;
  value: string | undefined;
  onChange: (value: string) => void;
  onNext: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const q = QUESTIONS[index]!;
  const last = index === QUESTIONS.length - 1;

  // Move focus to the new question so keyboard and screen reader users follow along.
  useEffect(() => {
    if (index > 0) headingRef.current?.focus();
  }, [index, headingRef]);

  return (
    <div className="safety-columns">
      <form
        className="safety-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onNext();
        }}
      >
        <div className="safety-meta">
          <p className="text-mono-eyebrow muted">
            Safety check · question {index + 1} of {QUESTIONS.length}
          </p>
          <Tag tone="success">Runs offline</Tag>
        </div>
        <fieldset className="safety-fieldset">
          <legend className="safety-legend">
            <h1 ref={headingRef} tabIndex={-1} className="text-heading-h2">
              {q.question}
            </h1>
          </legend>
          <p className="text-body-lead muted">{q.lead}</p>
          <div className="safety-options">
            {q.options.map((o) => (
              <RadioOption
                key={o.value}
                name={q.id}
                value={o.value}
                label={o.label}
                hint={o.hint}
                checked={value === o.value}
                onChange={onChange}
              />
            ))}
          </div>
        </fieldset>
        <div className="actions">
          <Button variant="primary" type="submit" disabled={!value}>
            {last ? "See the result" : "Next question"}
          </Button>
          <TextLink to="/write">Skip the check</TextLink>
        </div>
      </form>
      <aside className="card safety-why" aria-labelledby="why-title">
        <h2 id="why-title" className="text-heading-h3">
          Why these questions
        </h2>
        <p className="text-body-default">
          Three questions: where your ZEC came from, when you moved it, and how you are connected. Together they show
          what could link you to the tip.
        </p>
        <p className="text-body-default-medium">
          Your answers stay in this tab. Nothing is sent or saved. Close the tab and they are gone.
        </p>
      </aside>
    </div>
  );
}

function Result({ answers, onRestart }: { answers: Record<string, string>; onRestart: () => void }) {
  const picked: Option[] = QUESTIONS.map((q) => q.options.find((o) => o.value === answers[q.id])).filter(
    (o): o is Option => Boolean(o),
  );
  const warnings = picked.filter((o) => o.risk === "warning");
  const oks = picked.filter((o) => o.risk === "ok");
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  return (
    <div className="app-stack">
      <div className="app-heading">
        <p className="text-mono-eyebrow eyebrow">Safety check · your result</p>
        <h1 ref={titleRef} tabIndex={-1} className="text-heading-h2">
          {resultTitle(warnings.length)}
        </h1>
        <p className="text-body-lead lead">
          This check lowers your risk. It cannot remove it. Studies that traced Zcash payments used data from 2017 and
          2018, so nobody knows how well tracing works today.
        </p>
      </div>
      <div className="safety-results">
        {warnings.map((o) => (
          <Callout key={o.result.title} tone="warning" title={o.result.title}>
            {o.result.body}
          </Callout>
        ))}
        {oks.map((o) => (
          <Callout key={o.result.title} tone="success" title={o.result.title}>
            {o.result.body}
          </Callout>
        ))}
      </div>
      <div className="actions">
        <Button variant="primary" to="/write">
          Write a tip
        </Button>
        <Button variant="secondary" showIcon={false} onClick={onRestart}>
          Start the check again
        </Button>
      </div>
    </div>
  );
}
