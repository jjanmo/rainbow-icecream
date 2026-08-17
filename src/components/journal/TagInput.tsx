import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * 자유 입력 + 자동완성 태그 입력. 셋업 태그 전용 — 감정/매도사유처럼 이미 고정
 * 열거형인 값은 기존 칩 토글 UI를 그대로 쓰고 이 컴포넌트를 쓰지 않는다.
 *
 * Popover 프리미티브 대신 focus 상태 기반의 간단한 조건부 렌더를 쓴다 — 이
 * 앱의 다른 커스텀 드롭다운들과 톤을 맞췄다.
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) {
      setText('');
      return;
    }
    onChange([...value, tag]);
    setText('');
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(text);
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  const candidates = suggestions
    .filter((s) => !value.includes(s))
    .filter((s) => text === '' || s.toLowerCase().includes(text.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent p-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="h-6 min-w-20 flex-1 border-none px-1 shadow-none focus-visible:ring-0"
        />
      </div>

      {focused && candidates.length > 0 && (
        <div className="absolute top-full left-0 z-10 mt-1 flex w-full flex-wrap gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-md">
          {candidates.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
              className={cn(
                'rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
