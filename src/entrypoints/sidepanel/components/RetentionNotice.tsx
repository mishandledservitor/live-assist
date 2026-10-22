// FR-005 / design decision 19: truthful retention text, no zero-retention claim, and how to opt out of training.
import { RETENTION } from '../../../core/status/status';

const HEADING = 'What ElevenLabs keeps';

/** `collapsible` (Settings, 018 decision 109): a disclosure, closed by default, its summary the heading text. */
export function RetentionNotice({
  headingLevel = 2,
  collapsible = false,
}: {
  headingLevel?: 2 | 3;
  collapsible?: boolean;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const body = (
    <>
      <p>{RETENTION.summary}</p>
      <p>ElevenLabs bills about the length of each meeting.</p>
      <p>
        To stop your audio being used for training, sign in to ElevenLabs, open your account settings and turn off
        &ldquo;Improve the models for everyone&rdquo;. Details:{' '}
        <a href={RETENTION.helpUrl} target="_blank" rel="noreferrer">
          ElevenLabs privacy policy
        </a>
        .
      </p>
    </>
  );
  if (collapsible)
    return (
      <details className="retention">
        <summary>{HEADING}</summary>
        {body}
      </details>
    );
  return (
    <section aria-labelledby="retention-heading" className="retention">
      <Heading id="retention-heading">{HEADING}</Heading>
      {body}
    </section>
  );
}
