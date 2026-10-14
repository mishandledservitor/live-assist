// 006 US4 (FR-014, FR-015): 005's account status as a small header badge — the share of credits left, or a mark —
// named and titled with the full sentence. Activating it opens the account details on the Settings screen.
import { describeBadge } from '../../../core/account/usage';
import type { AccountState } from '../hooks/useAccount';

export interface CreditsBadgeProps {
  account: AccountState;
  onOpenAccount: () => void;
  now?: () => number;
  /** For tests; defaults to the browser's time zone. */
  timeZone?: string | undefined;
}

export function CreditsBadge({ account, onOpenAccount, now = Date.now, timeZone }: CreditsBadgeProps) {
  const view = describeBadge(account.reply, now(), { timeZone });
  return (
    <button
      type="button"
      className={`credits-badge mark-${view.mark}`}
      aria-label={view.name}
      title={view.name}
      aria-busy={account.busy}
      onClick={onOpenAccount}
    >
      {view.text}
    </button>
  );
}
