/**
 * Client patch: the gate board loses the typing and gains the truck's return.
 *
 * Removing: the "Log pre-app truck" button and its form (filing trucks as out by
 * hand — the yard keeps itself true now, so nobody types it).
 * Adding: "Return a truck" — the guard names the truck he can see, and the
 * server closes any dispatch naming it, frees the driver, sends it to Check Up.
 *
 * Anchors are LINE ARRAYS (joined by the caller) so no newline escape can be
 * mangled on the way into the file. The whole file is CRLF, so it is normalised
 * to LF for the edits and restored to CRLF on write.
 */
const fs = require('fs');

const FILE = 'src/routes/workspace.app.gate.tsx';
const raw = fs.readFileSync(FILE, 'utf8');
let src = raw.replace(/\r\n/g, '\n');

const L = (...lines) => lines.join('\n');

function cut(fromLines, toLines, replacement = '') {
  const from = L(...fromLines);
  const to = L(...toLines);
  const a = src.indexOf(from);
  if (a === -1) throw new Error('anchor not found: ' + from.slice(0, 70));
  const b = src.indexOf(to, a);
  if (b === -1) throw new Error('end anchor not found: ' + to.slice(0, 70));
  src = src.slice(0, a) + replacement + src.slice(b);
}

// 1. the hand-filing state, its comment and its handler
cut(
  [
    '  /*',
    '   * PRE-APP RECONCILIATION.',
  ],
  [
    '  const handleLogReturn = async (trip: Trip) => {',
  ],
  [
    '  /*',
    "   * THE TRUCK'S OWN RETURN.",
    '   *',
    '   * A dispatch return closes its own circle. This is for the trucks that left',
    '   * before the app went live: they are physically out, the yard register knows',
    '   * it, and there is no dispatch to stamp — so the guard names the truck in',
    '   * front of him and the platform closes anything naming it, frees the driver',
    '   * and sends the truck to engineering. Nothing is typed that the system can',
    '   * work out for itself.',
    '   */',
    '  const [returnTruckOpen, setReturnTruckOpen] = useState(false);',
    '  const [returnTruckQuery, setReturnTruckQuery] = useState("");',
    '  const [returnTruckBusy, setReturnTruckBusy] = useState<string | null>(null);',
    '  const [yardTrucks, setYardTrucks] = useState<',
    '    { id: string; capId: string; registration: string; status: string }[]',
    '  >([]);',
    '',
    '  /** The yard register, out-of-yard trucks first: that is who comes home. */',
    '  const openReturnTruck = async () => {',
    '    setReturnTruckOpen(true);',
    '    setReturnTruckQuery("");',
    '    try {',
    '      const heads = await fleetService.listHeads();',
    '      setYardTrucks(',
    '        heads.map((h) => ({',
    '          id: String(h.id),',
    '          capId: String(h.capNumber ?? h.number ?? ""),',
    '          registration: String(h.registration ?? ""),',
    '          status: String(h.status ?? ""),',
    '        })),',
    '      );',
    '    } catch (err) {',
    '      toast.error(err instanceof Error ? err.message : "Could not read the yard register");',
    '    }',
    '  };',
    '',
    '  const handleReturnTruck = async (truck: { id: string; capId: string; registration: string }) => {',
    '    setReturnTruckBusy(truck.id);',
    '    try {',
    '      const res = await tripService.returnTruckToYard(truck.registration || truck.capId);',
    '      const named = res.truck ? `${res.truck.capId} (${res.truck.registration})` : truck.registration;',
    '      toast.success(',
    '        res.dispatchClosed',
    '          ? `${named} is back — ${res.dispatchClosed} open dispatch${res.dispatchClosed === 1 ? "" : "es"} closed, driver freed, truck to Check Up.`',
    '          : `${named} is back and sent to Check Up.`,',
    '      );',
    '      setReturnTruckOpen(false);',
    '      await refresh();',
    '    } catch (err) {',
    '      toast.error(err instanceof Error ? err.message : "Could not log the truck back in");',
    '    } finally {',
    '      setReturnTruckBusy(null);',
    '    }',
    '  };',
    '',
    '',
  ].join('\n'),
);

// 2. the effect that set the (now removed) filing permission
cut(
  ['    setCanFilePreApp(', '      rolesCanWorkTheGate() || authService.getRoles().includes("Transport Manager"),'],
  ['    );'],
  '',
);

// 4. the toolbar: the filing button becomes the truck's return
cut(
  ['          {/* Trucks that left before go-live: file them as out so their return'],
  ['          <button', '            type="button"', '            onClick={() => openLogModal()}'],
  [
    '          {/* A truck that left without a dispatch still has to be able to come',
    '              home: name it and the platform does the rest. */}',
    '          <button',
    '            type="button"',
    '            onClick={() => void openReturnTruck()}',
    '            className="flex h-9 items-center gap-1.5 rounded border border-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-[#1B2432] hover:bg-[#F1F2F4]"',
    '          >',
    '            <History className="size-4" strokeWidth={2} />',
    '            Return a truck',
    '          </button>',
    '',
  ].join('\n'),
);

// 5. the filing modal becomes the truck picker
cut(
  ['      {/* RECONCILIATION: a truck that left before the app went live. */}'],
  ['      {canWorkGate && logOpen && ('],
  [
    '      {/* RETURN A TRUCK: for the fleet that left before the app went live. */}',
    '      {returnTruckOpen && (',
    '        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">',
    '          <div className="flex max-h-[90vh] w-[460px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">',
    '            <div className="flex flex-col gap-1">',
    '              <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Return a truck</h3>',
    '              <p className="text-[12.5px] text-[#5C6470]">',
    '                Pick the truck at the gate. Anything still open against it is closed, its driver goes back on',
    '                the board, and the truck goes to engineering as Check Up — no dates to type.',
    '              </p>',
    '            </div>',
    '            <input',
    '              className="h-10 rounded border border-[#E2E5E9] px-3 text-sm"',
    '              placeholder="Search cap number or plate"',
    '              value={returnTruckQuery}',
    '              onChange={(e) => setReturnTruckQuery(e.target.value)}',
    '            />',
    '            <div className="flex max-h-[320px] flex-col divide-y divide-[#E2E5E9] overflow-y-auto rounded border border-[#E2E5E9]">',
    '              {yardTrucks.length === 0 ? (',
    '                <p className="p-4 text-center text-[13px] text-[#8E95A1]">Reading the yard register…</p>',
    '              ) : (',
    '                (() => {',
    '                  const q = returnTruckQuery.trim().toLowerCase();',
    '                  const ranked = [...yardTrucks].sort((a, b) => {',
    '                    const rank = (t: { status: string }) => (/out of yard|assigned/i.test(t.status) ? 0 : 1);',
    '                    return rank(a) - rank(b) || a.capId.localeCompare(b.capId);',
    '                  });',
    '                  const list = q',
    '                    ? ranked.filter((t) => `${t.capId} ${t.registration}`.toLowerCase().includes(q))',
    '                    : ranked;',
    '                  if (list.length === 0) {',
    '                    return <p className="p-4 text-center text-[13px] text-[#8E95A1]">No truck matches that.</p>;',
    '                  }',
    '                  return list.slice(0, 60).map((t) => (',
    '                    <button',
    '                      key={t.id}',
    '                      type="button"',
    '                      disabled={returnTruckBusy !== null}',
    '                      onClick={() => void handleReturnTruck(t)}',
    '                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#F7F8F9] disabled:opacity-60"',
    '                    >',
    '                      <span className="text-[13.5px] text-[#344256]">',
    '                        {t.capId} {t.registration ? `(${t.registration})` : ""}',
    '                      </span>',
    '                      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">',
    '                        {returnTruckBusy === t.id ? "Returning…" : t.status}',
    '                      </span>',
    '                    </button>',
    '                  ));',
    '                })()',
    '              )}',
    '            </div>',
    '            <div className="flex items-center justify-end">',
    '              <button',
    '                type="button"',
    '                onClick={() => setReturnTruckOpen(false)}',
    '                className="text-[14px] font-bold text-[#ED351D]"',
    '              >',
    '                Close',
    '              </button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      )}',
    '',
    '',
  ].join('\n'),
);

fs.writeFileSync(FILE, src.replace(/\n/g, '\r\n'));
console.log('gate board patched. remaining backfill refs:', (src.match(/backfill/gi) || []).length);
