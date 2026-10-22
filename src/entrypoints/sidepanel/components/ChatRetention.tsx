// FR-016 / constitution I (003 contracts/ask-ui.md row 8a): what the selected chat provider receives and keeps, as
// its own pages say (research R11, re-read 2026-10-09). Shown in Settings and first-run setup.
import { useId } from 'react';
import type { ChatProviderId } from '../../../core/chat/models';

const DISCLOSURES: Readonly<Record<ChatProviderId, { heading: string; text: string; link: string; href: string }>> = {
  anthropic: {
    heading: 'What Anthropic keeps',
    text: 'Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to Anthropic. Anthropic deletes API requests and answers within 30 days, keeps content its safety systems flag for up to 2 years, and does not train its models on API data by default.',
    link: 'Anthropic privacy policy',
    href: 'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data',
  },
  openai: {
    heading: 'What OpenAI keeps',
    text: 'Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to OpenAI, with storage turned off. OpenAI keeps API requests for abuse monitoring for up to 30 days and does not train its models on API data by default.',
    link: 'OpenAI data controls',
    href: 'https://developers.openai.com/api/docs/guides/your-data',
  },
};

export function ChatRetention({ provider, headingLevel = 3 }: { provider: ChatProviderId; headingLevel?: 2 | 3 | 4 }) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const d = DISCLOSURES[provider];
  return (
    <section aria-labelledby={id} className="retention">
      <Heading id={id}>{d.heading}</Heading>
      <p>{d.text}</p>
      <p>
        <a href={d.href} target="_blank" rel="noreferrer">
          {d.link}
        </a>
      </p>
    </section>
  );
}
