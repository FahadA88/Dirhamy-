import { useEffect, useRef, useState } from 'react';
import { KINDS, kindOf, searchLibrary } from '../../library/library';
import { HomeLayoutProps } from './types';

interface Line { text: string; kind: 'in' | 'out' | 'err' }

const HELP = [
  'Commands:',
  '  <text>              filter games by name, as you type',
  '  list                list every game',
  '  list --family <id>  list games of one kind (try: trick, rummy, solitaire…)',
  '  open <name>          open a game by name',
  '  play <name>          jump straight into a game by name',
  '  clear                clear the screen',
  '  help                 this message',
].join('\n');

/** A prompt, not a picture of one — every line typed here really filters or opens the real
 *  library. */
export function TerminalLayout({ games, onOpen, onPlay }: HomeLayoutProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Line[]>([{ text: `${games.length} games on the shelf. Type "help" to see what this does.`, kind: 'out' }]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history]);

  const live = input.trim()
    ? searchLibrary(games, { query: input.trim() }, 'trending').slice(0, 8)
    : [];

  function push(...lines: Line[]) { setHistory((h) => [...h, ...lines]); }

  function findByName(name: string) {
    const q = name.trim().toLowerCase();
    return games.find((g) => g.definition.meta.name.toLowerCase() === q)
      ?? games.find((g) => g.definition.meta.name.toLowerCase().includes(q));
  }

  function run(raw: string) {
    const cmd = raw.trim();
    push({ text: `> ${raw}`, kind: 'in' });
    if (!cmd) return;
    if (cmd === 'clear') { setHistory([]); return; }
    if (cmd === 'help') { push({ text: HELP, kind: 'out' }); return; }
    if (cmd === 'list' || cmd.startsWith('list ')) {
      const m = cmd.match(/--family[= ](\S+)/);
      const list = m ? games.filter((g) => kindOf(g.definition) === m[1]) : games;
      if (m && list.length === 0) {
        const ids = KINDS.filter((k) => k.id).map((k) => k.id).join(', ');
        push({ text: `No games of kind "${m[1]}". Try one of: ${ids}`, kind: 'err' });
        return;
      }
      push({ text: list.map((g) => `  ${g.definition.meta.name}`).join('\n') || '  (nothing)', kind: 'out' });
      return;
    }
    if (cmd.startsWith('open ') || cmd.startsWith('play ')) {
      const isPlay = cmd.startsWith('play ');
      const name = cmd.slice(5);
      const g = findByName(name);
      if (!g) { push({ text: `No game matches "${name}".`, kind: 'err' }); return; }
      push({ text: `Opening ${g.definition.meta.name}…`, kind: 'out' });
      if (isPlay) onPlay(g); else onOpen(g.id);
      return;
    }
    const g = findByName(cmd);
    if (g) { push({ text: `Found ${g.definition.meta.name}. Opening…`, kind: 'out' }); onOpen(g.id); return; }
    push({ text: `Not sure what "${cmd}" means. Type "help".`, kind: 'err' });
  }

  return (
    // The whole panel is dressing around the real control, the input below it — clicking
    // anywhere in it just moves focus there, the same as clicking anywhere in a text field's
    // padding would. The input itself carries the actual keyboard interaction.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="hl-terminal" onClick={() => inputRef.current?.focus()}>
      <div className="hl-terminal-scroll" ref={scrollRef}>
        {history.map((l, i) => (
          <pre key={i} className={`hl-terminal-line ${l.kind}`}>{l.text}</pre>
        ))}
        {live.length > 0 && (
          <div className="hl-terminal-suggest" role="listbox" aria-label="Matching games">
            {live.map((g) => (
              <button key={g.id} role="option" aria-selected={false} onClick={() => onOpen(g.id)}>
                {g.definition.meta.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="hl-terminal-prompt"
        onSubmit={(e) => { e.preventDefault(); run(input); setInput(''); }}
      >
        <span aria-hidden="true">❯</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type a game name, or `help`…"
          aria-label="Terminal command"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
}
