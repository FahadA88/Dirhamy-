import { useDismissable } from './useEscape';

// One shared "are you sure" for every action in the app that can't be undone once it runs —
// resetting every setting, unpublishing a game, restarting a live match, deleting a rule. Before
// this each of those just fired on a single click; this is the one place that pattern gets built
// once and reused, rather than reinvented (or skipped) at each call site.
export function Confirm({
  title, body, confirmLabel = 'Yes, do it', cancelLabel = 'Cancel', onConfirm, onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useDismissable(true, onCancel);
  return (
    // Click-outside-to-cancel is a supplementary mouse/touch shortcut, not the only way out —
    // useDismissable above already wires Escape, and Cancel is a real, reachable button. The
    // backdrop itself has no business being tab-stoppable or role="button": it isn't a control,
    // it's the rest of the page dimmed out.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="modal" onClick={onCancel}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className="modal-box confirm-box" ref={ref} role="alertdialog" aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button className="ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="ghost danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
