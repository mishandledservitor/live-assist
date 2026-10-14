// 013 T009: the scripted Meet adapter the runtime tests use satisfies the same contract as the real one.
import { platformAdapterContract } from '../../../contract/platform-adapter.contract';
import { FakeMeetAdapter } from '../../../support/fake-meet-adapter';

platformAdapterContract(
  'FakeMeetAdapter',
  () => new FakeMeetAdapter(),
  [new URL('https://meet.google.com/abc-defg-hij'), new URL('https://x.test/')],
  (adapter, t) => {
    if (!(adapter instanceof FakeMeetAdapter)) throw new Error('an adapter the suite did not create');
    adapter.emitText(t.turnKey, t.speakerName, t.text, { self: t.self, firstSeenAt: t.firstSeenAt });
  },
);
