// 005's ElevenLabs account status on the Settings screen (006 FR-011): the one line, the exact credits and the caveat
// on what the percentage covers, shown directly, and `Check again`. Failures are plain sentences.
import { ACCOUNT_ERROR_MESSAGES, describeAccount } from '../../../core/account/usage';
import type { AccountState } from '../hooks/useAccount';

export interface AccountDetailsProps {
  account: AccountState;
  now?: () => number;
  /** For tests; defaults to the browser's time zone. */
  timeZone?: string | undefined;
}

export function AccountDetails({ account, now = Date.now, timeZone }: AccountDetailsProps) {
  const { reply, busy, refresh } = account;
  let line: React.ReactNode;
  let detail: string[] = [];
  if (reply === null) line = <p className="account-line">Checking plan…</p>;
  else if (reply.ok) {
    const summary = describeAccount(reply.usage, now(), { timeZone });
    line = <p className="account-line">{summary.line}</p>;
    detail = summary.detail;
  } else line = <p className="account-line error">{ACCOUNT_ERROR_MESSAGES[reply.kind]}</p>;

  return (
    <section aria-labelledby="account-heading" aria-busy={busy} className="account">
      <div className="account-head">
        <h4 id="account-heading" tabIndex={-1}>
          ElevenLabs account
        </h4>
        {/* 018 (copy review R32): an error says what to do, so the control carries its words. */}
        <button type="button" className="secondary" aria-disabled={busy} onClick={refresh}>
          Check again
        </button>
      </div>
      {line}
      {detail.map((sentence) => (
        <p key={sentence} className="account-detail">
          {sentence}
        </p>
      ))}
    </section>
  );
}
