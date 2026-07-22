import { useState } from "react";

/**
 * Local draft state for an inline-editable field that commits on blur
 * instead of on every keystroke (avoids a DB write per keypress).
 */
export function useEditableField<T>(value: T, onCommit: (value: T) => void) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  // Adjust state during render when the source value changes underneath us
  // (e.g. another query refetch) — see https://react.dev/learn/you-might-not-need-an-effect
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  return {
    value: draft,
    onChange: setDraft,
    onBlur: () => {
      if (draft !== value) onCommit(draft);
    },
  };
}

/**
 * Same idea as useEditableField, but keeps the draft as raw text instead of
 * a number. A controlled `type="number"` input whose value starts at 0 can't
 * be typed into normally — typing "1" after "0" needs the "0" cleared first,
 * which the browser handles in a cursor-dependent way, producing artifacts
 * like "010". Parsing only happens on blur, so use `type="text"` with
 * `inputMode="decimal"` for the input, not `type="number"`.
 */
export function useEditableNumberField(value: number, onCommit: (value: number) => void) {
  const [draft, setDraft] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }

  return {
    value: draft,
    onChange: setDraft,
    onBlur: () => {
      const parsed = parseFloat(draft) || 0;
      if (parsed !== value) onCommit(parsed);
      setDraft(String(parsed));
    },
  };
}
