export function Header({ connected }: { connected: boolean }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-[#e8e3dd] bg-[#fdfcfa] px-5 py-3.5 sm:px-7">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#292724] text-lg shadow-sm" aria-hidden="true">
          ✦
        </div>
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-[#292724]">RoomCraft</h1>
          <p className="text-[11px] font-medium tracking-[0.02em] text-[#9b938a]">Design together, in real time</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-[#e8e3dd] bg-white px-3 py-1.5 text-[11px] font-medium text-[#777069] shadow-sm" title={connected ? 'WebMCP tools are available to an AI agent' : 'Enable WebMCP in a supported browser to connect an AI agent'}>
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#22aa70] shadow-[0_0_0_3px_rgba(34,170,112,0.12)]' : 'bg-[#e2ad43]'}`} />
        <span className="hidden sm:inline">{connected ? 'WebMCP connected' : 'WebMCP not detected'}</span>
        <span className="sm:hidden">{connected ? 'Connected' : 'Offline'}</span>
      </div>
    </header>
  );
}
