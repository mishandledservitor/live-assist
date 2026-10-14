// FR-005 / design decision 19: truthful retention text, no zero-retention claim, and how to opt out of training.
import { RETENTION } from '../../../core/status/status';

export function RetentionNotice({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby="retention-heading">
      <Heading id="retention-heading">What ElevenLabs keeps</Heading>
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
    </section>
  );
}
