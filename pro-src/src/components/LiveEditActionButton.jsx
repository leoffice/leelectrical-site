// Action button with long-press edit menu (hide / relabel / suggest).
import React, { useCallback } from "react";
import { useLongPress } from "../lib/useLongPress.js";
import { useLiveEdit } from "./LiveEditProvider.jsx";
import LiveEditActionMenu from "./LiveEditActionMenu.jsx";

export default function LiveEditActionButton({
  editKey,
  label,
  icon,
  primary,
  onClick,
  className = "",
  testId,
  ...rest
}) {
  const { isHidden, labelFor, menu, setMenu, setStyleTarget, hideElement, relabelElement, openSuggest } = useLiveEdit();

  if (isHidden(editKey)) return null;

  const displayLabel = labelFor(editKey, label);

  const showMenu = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenu({
        key: editKey,
        label: displayLabel,
        anchor: { x: rect.left, y: rect.bottom + 6 },
      });
    },
    [displayLabel, editKey, setMenu]
  );

  const press = useLongPress(showMenu, { delay: 700, onClick });

  const btnClass = primary
    ? "btn-brand w-full"
    : "btn bg-slate-100 text-slate-800 w-full";

  return (
    <>
      <button
        type="button"
        className={`${btnClass} ${className}`}
        data-testid={testId}
        data-live-edit-key={editKey}
        {...press}
        {...rest}
      >
        {icon} {displayLabel}
      </button>
      {menu?.key === editKey ? (
        <LiveEditActionMenu
          anchor={menu.anchor}
          label={displayLabel}
          onEdit={() => relabelElement(editKey, displayLabel)}
          onStyle={() => setStyleTarget({ key: editKey, label: displayLabel })}
          onDelete={() => {
            if (window.confirm(`Hide "${displayLabel}"? You can revert from the bar below.`)) {
              hideElement(editKey);
            }
          }}
          onSuggest={() => openSuggest({ key: editKey, label: displayLabel })}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}