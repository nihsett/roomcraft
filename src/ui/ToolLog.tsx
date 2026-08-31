import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function ToolLog() {
  const toolLog = useStore((state) => state.toolLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [toolLog.length]);

  return (
    <div ref={scrollRef} className="tool-log min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
      {toolLog.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#e7e0d8] bg-[#fcfbf9] px-3 py-4 text-center">
          <div className="mb-1 text-base text-[#c0b8ae]" aria-hidden="true">◌</div>
          <p className="text-[11px] leading-4 text-[#aaa29a]">Waiting for agent tool calls</p>
          <p className="mt-1 text-[10px] leading-4 text-[#c6bfb7]">Ask an AI agent to rearrange the room.</p>
        </div>
      )}
      <div className="space-y-2">
        {toolLog.map((entry, index) => (
          <div key={`${entry.ts}-${index}`} className="rounded-xl border border-[#eee9e3] bg-[#fcfbfa] px-3 py-2.5 shadow-[0_1px_1px_rgba(43,35,27,0.02)]">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.result === 'ok' ? 'bg-[#20a66c]' : 'bg-[#e35b4f]'}`} />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold text-[#514b45]">{entry.name}</span>
              <span className="shrink-0 text-[9px] tabular-nums text-[#b2aaa2]">
                {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            {Object.keys(entry.args).length > 0 && (
              <pre className="mt-1.5 truncate pl-3.5 font-mono text-[9px] leading-4 text-[#a19a92]">{JSON.stringify(entry.args)}</pre>
            )}
            {entry.detail && <p className="mt-1 pl-3.5 text-[10px] leading-4 text-[#d1544a]">{entry.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
