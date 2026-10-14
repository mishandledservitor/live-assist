import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

// T012 found that openPanelOnActionClick does NOT grant activeTab, so tabCapture fails with
// "Extension has not been invoked for the current page". The service worker must handle the
// action click itself (which grants activeTab) and open the panel from that click.

type ClickListener = (tab: { id?: number; windowId: number }) => void;

let clickListener: ClickListener | null;
let setPanelBehavior: ReturnType<typeof vi.fn>;
let open: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  clickListener = null;
  setPanelBehavior = vi.fn(() => Promise.resolve());
  open = vi.fn(() => Promise.resolve());
  vi.stubGlobal('chrome', {
    storage: { local: new FakeStorageArea(), sync: new FakeStorageArea(), onChanged: { addListener: vi.fn() } },
    sidePanel: { setPanelBehavior, open },
    action: {
      onClicked: {
        addListener: (l: ClickListener) => {
          clickListener = l;
        },
      },
    },
    tabs: { onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
    runtime: { onMessage: { addListener: vi.fn() }, onConnect: { addListener: vi.fn() } },
  });
  const background = (await import('@/entrypoints/background')).default as { main: () => void };
  background.main();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toolbar icon click', () => {
  it('does not let Chrome open the panel by itself', () => {
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it('opens the side panel for the clicked tab synchronously inside the click handler', () => {
    expect(clickListener).not.toBeNull();
    clickListener?.({ id: 7, windowId: 3 });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ tabId: 7 });
  });

  it('falls back to the window when the tab has no id', () => {
    clickListener?.({ windowId: 3 });
    expect(open).toHaveBeenCalledWith({ windowId: 3 });
  });
});
