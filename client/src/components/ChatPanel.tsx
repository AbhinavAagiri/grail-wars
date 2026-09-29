import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { CLASS_META, LIMITS, type ChatMessage } from '@hgd/shared';

export function ChatPanel({
  messages,
  onSend,
  disabled,
  openingStatements,
  canSpeak = true,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
  openingStatements?: boolean;
  canSpeak?: boolean;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const reactions = ['👍', '🔥', '😂', '🤔'];

  return (
    <div className="hgd-card flex h-full min-h-[280px] flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="hgd-heading text-[13px] uppercase tracking-wide">Argument</h3>
        {openingStatements && (
          <span className="rounded bg-gold px-2 py-[2px] text-[10px] font-black uppercase text-[#1a1408]">
            Opening statements
          </span>
        )}
      </div>

      <div ref={listRef} className="hgd-scroll flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-[12px] text-muted">No arguments yet. Make the case for your Servant.</p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="text-[12.5px]">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-gold">{message.nickname}</span>
              {message.badge && (
                <span
                  className="rounded px-1 text-[9.5px] font-bold uppercase"
                  style={{ color: CLASS_META[message.badge.cls].color, background: 'rgba(36,36,46,.9)' }}
                >
                  {CLASS_META[message.badge.cls].icon} {message.badge.label}
                </span>
              )}
            </div>
            <p className="text-ink">{message.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {reactions.map((reaction) => (
          <button
            key={reaction}
            type="button"
            className="rounded-full border border-border bg-surface-2 px-2 py-[2px] text-[13px] hover:border-gold-dark"
            onClick={() => onSend(`${reaction} reacts`)}
            disabled={disabled || !canSpeak}
            aria-label={`React ${reaction}`}
          >
            {reaction}
          </button>
        ))}
        <button
          type="button"
          className="rounded-full border border-border bg-surface-2 px-2 py-[2px] text-[11px] text-muted hover:border-gold-dark"
          onClick={() => setText((current) => (current.startsWith('[Feat]') ? current : `[Feat] ${current}`))}
          disabled={disabled || !canSpeak}
        >
          cite a feat
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="hgd-input !min-h-[40px] !text-[13px]"
          placeholder={canSpeak ? 'Argue your case…' : 'Only the two owners may speak right now'}
          value={text}
          maxLength={LIMITS.CHAT_MAX}
          disabled={disabled || !canSpeak}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button type="button" className="hgd-btn hgd-btn-primary !min-h-[40px]" onClick={submit} disabled={disabled || !canSpeak}>
          Send
        </button>
      </div>
      <p className={clsx('mt-1 text-[10.5px] text-muted')}>{text.length}/{LIMITS.CHAT_MAX}</p>
    </div>
  );
}
