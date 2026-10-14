// 006 US3 (FR-010, FR-011, research R7): the Settings screen, opened from the gear in the same panel. Back, or Escape
// outside a text field or select, returns to the main view; the App moves focus.
import type { KeyboardEvent, ReactNode, Ref } from 'react';

export interface SettingsScreenProps {
  hidden: boolean;
  onBack: () => void;
  headingRef: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function SettingsScreen({ hidden, onBack, headingRef, children }: SettingsScreenProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.target instanceof HTMLElement && TYPING.has(e.target.tagName)) return;
    onBack();
  };
  return (
    <section aria-labelledby="settings-heading" className="settings-screen" hidden={hidden} onKeyDown={onKeyDown}>
      <div className="screen-bar">
        <button type="button" className="secondary back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h2 id="settings-heading" ref={headingRef} tabIndex={-1}>
          Settings
        </h2>
      </div>
      {children}
    </section>
  );
}
