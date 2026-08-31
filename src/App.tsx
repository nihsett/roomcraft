import { useEffect } from 'react';
import { RoomCanvas } from './canvas/RoomCanvas';
import { useStore } from './store';
import { Header } from './ui/Header';
import { Sidebar } from './ui/Sidebar';
import { isWebMCPAvailable } from './webmcp/register';
import { registerAllStaticTools } from './webmcp/tools';
import { updateDynamicTools } from './webmcp/dynamic-tools';

export default function App() {
  const connected = isWebMCPAvailable();

  useEffect(() => {
    if (!isWebMCPAvailable()) return;
    void registerAllStaticTools().catch((error: unknown) => {
      console.error('RoomCraft WebMCP registration failed:', error);
    });
  }, []);

  useEffect(() => {
    if (!isWebMCPAvailable()) return;
    const unsubscribe = useStore.subscribe(
      (state) => state.selectedId,
      (selectedId) => { void updateDynamicTools(selectedId); },
    );
    return unsubscribe;
  }, []);

  return (
    <div className="flex h-screen min-h-[560px] flex-col overflow-hidden bg-[#fdfcfa] text-[#312e2b]">
      <Header connected={connected} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <section className="relative flex min-h-[414px] min-w-0 flex-none flex-col bg-[#f7f5f1] p-3 sm:p-5 md:min-h-0 md:flex-1">
          <div className="canvas-shell relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#e8e2da] bg-[#f4f1ec] shadow-[0_10px_35px_rgba(62,49,36,0.05)]">
            <div className="canvas-caption pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-[#e8e1d9] bg-white/80 px-2.5 py-1.5 text-[10px] font-medium text-[#9b9289] shadow-sm backdrop-blur-sm">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#c8b8a5] align-middle" />
              Drag pieces to design your room
            </div>
            <RoomCanvas />
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-[#e8e1d9] bg-white/75 px-2.5 py-1.5 text-[10px] text-[#9b9289] shadow-sm backdrop-blur-sm">
              <kbd>R</kbd> rotate <span className="mx-1 text-[#d2cbc3]">·</span> <kbd>Delete</kbd> remove
            </div>
          </div>
        </section>
        <Sidebar />
      </main>
    </div>
  );
}
