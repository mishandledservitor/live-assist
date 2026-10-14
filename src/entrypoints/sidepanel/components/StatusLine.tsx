// The status line (006 US2; constitution IV): one dot per dependency with a short word, its state spoken and in the
// tooltip, expanding only for a problem — with the reason and, for the microphone, the fix.
import type { StatusSnapshot } from '../../../core/status/status';
import { statusDots, type StatusDot } from '../status-view';

export interface StatusLineProps {
  status: StatusSnapshot;
  /** A meeting is being transcribed (missing speaker names then count as a problem). */
  running: boolean;
  onFixMic: () => void;
}

function Dot({ dot }: { dot: StatusDot }) {
  const name = `${dot.label}: ${dot.text}`;
  return (
    <li className="status-dot" title={name}>
      <span className={`dot dot-${dot.tone}`} aria-hidden="true" />
      <span aria-hidden="true">{dot.label}</span>
      <span className="sr-only">{name}</span>
    </li>
  );
}

export function StatusLine({ status, running, onFixMic }: StatusLineProps) {
  const { dots, problems } = statusDots(status, { running });
  return (
    <section aria-label="Status" className="status-line">
      <div aria-live="polite">
        <ul className="status-dots">
          {dots.map((d) => (
            <Dot key={d.key} dot={d} />
          ))}
        </ul>
        {problems.length > 0 && (
          <ul className="status-problems">
            {problems.map((p) => (
              <li key={p.key} className="status-problem">
                <span className="problem-label" aria-hidden="true">
                  {p.label}
                </span>{' '}
                <span aria-hidden="true">{p.text}</span>
                {p.action === 'allow-mic' && (
                  <>
                    {' '}
                    <button type="button" onClick={onFixMic}>
                      Allow microphone
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
