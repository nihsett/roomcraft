import { useState } from 'react';
import { CATALOG } from '../catalog';
import { useStore } from '../store';
import type { Rotation } from '../types';
import { ToolLog } from './ToolLog';

export function Sidebar() {
  const room = useStore((state) => state.room);
  const items = useStore((state) => state.items);
  const clearanceCm = useStore((state) => state.clearanceCm);
  const selectedId = useStore((state) => state.selectedId);
  const rotateItem = useStore((state) => state.rotateItem);
  const removeItem = useStore((state) => state.removeItem);
  const appendJournal = useStore((state) => state.appendJournal);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId);
  const doors = room.openings.filter((opening) => opening.kind === 'door').length;
  const windows = room.openings.filter((opening) => opening.kind === 'window').length;

  const rotateSelected = () => {
    if (!selected) return;
    const nextRotation = ((selected.rotation + 90) % 360) as Rotation;
    const result = rotateItem(selected.id, nextRotation);
    if (result === true) {
      appendJournal({
        action: 'rotate',
        itemId: selected.id,
        from: { rotation: selected.rotation },
        to: { rotation: nextRotation },
      });
      setNotice(`${selected.label} rotated`);
    } else {
      setNotice(result);
    }
  };

  const removeSelected = () => {
    if (!selected) return;
    const removedId = selected.id;
    const result = removeItem(removedId);
    if (result === true) {
      appendJournal({ action: 'remove', itemId: removedId });
      setNotice(`${selected.label} removed`);
    } else {
      setNotice(result);
    }
  };

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-[#e8e3dd] bg-white md:w-[340px] md:border-l md:border-t-0">
      <div className="shrink-0 border-b border-[#eee9e3] px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Current canvas</p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-[#312e2b]">Living room</h2>
          </div>
          <span className="rounded-full bg-[#f5f2ee] px-2.5 py-1 text-[10px] font-semibold text-[#81786f]">LIVE</span>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-[#eee9e3] rounded-xl border border-[#eee9e3] bg-[#fcfbfa] py-2.5">
          <Stat value={`${room.width}×${room.depth}`} label="cm room" />
          <Stat value={String(items.length)} label="pieces" />
          <Stat value={`${doors}/${windows}`} label="doors · windows" />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f4f7f2] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-sm shadow-sm" aria-hidden="true">⌁</span>
            <span className="text-[11px] font-medium text-[#647265]">Walkway clearance</span>
          </div>
          <span className="text-[12px] font-semibold tabular-nums text-[#3d7758]">{clearanceCm} cm{clearanceCm >= 90 ? ' · ♿' : ''}</span>
        </div>
      </div>

      <div className="shrink-0 border-b border-[#eee9e3] px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Selection</p>
          {selected && <span className="font-mono text-[9px] text-[#afa69e]">{selected.id}</span>}
        </div>
        {selected ? (
          <div className="mt-2.5 rounded-xl border border-[#e7e1da] bg-[#fcfbfa] p-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg shadow-sm" aria-hidden="true">{CATALOG[selected.type]?.icon ?? '▦'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#4e4944]">{selected.label}</p>
                <p className="mt-0.5 text-[10px] tabular-nums text-[#9f968d]">{selected.x}, {selected.y} cm · {selected.rotation}°</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={rotateSelected} className="control-button flex-1">↻ Rotate</button>
              <button type="button" onClick={removeSelected} className="control-button control-button-danger flex-1">Remove</button>
            </div>
            {notice && <p className="mt-2 truncate text-[10px] text-[#9b938a]" title={notice}>{notice}</p>}
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-5 text-[#aaa29a]">Click a piece to inspect it. Drag to reposition, press <kbd>R</kbd> to rotate.</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4">
          <div>
            <p className="eyebrow">Agent activity</p>
            <p className="mt-1 text-[10px] text-[#b0a8a0]">Tool calls appear here in real time</p>
          </div>
          <span className="text-[18px] text-[#c8c0b7]" aria-hidden="true">⋯</span>
        </div>
        <ToolLog />
      </div>
    </aside>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-[12px] font-semibold tabular-nums text-[#5d5751]">{value}</p>
      <p className="mt-0.5 text-[9px] text-[#aaa19a]">{label}</p>
    </div>
  );
}
