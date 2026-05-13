import { Empty, Input, Spin } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef } from 'react';
import { useFlatIndex } from '../hooks/useFlatIndex';
import type { SearchGroup } from '../types';

export interface OmniboxPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  groups: SearchGroup[];
  loading?: boolean;
  empty?: React.ReactNode;
  placeholder?: string;
  loadingText?: string;
  defaultGroup?: SearchGroup;
  /** Called when the user picks an item (after its onSelect fires) so the host can close the panel etc. */
  onCommitted?: () => void;
  /** Focus the input on mount (programmatic; not the `autoFocus` html attr). Default true. */
  focusOnMount?: boolean;
}

/**
 * Shared search panel used inside both modal and inline modes.
 * Owns: input focus, keyboard nav, active highlight, group rendering.
 */
export function OmniboxPanel({
  query,
  onQueryChange,
  groups,
  loading,
  empty,
  placeholder = '搜索…',
  loadingText = '搜索中…',
  defaultGroup,
  onCommitted,
  focusOnMount = true,
}: OmniboxPanelProps) {
  const inputRef = useRef<InputRef>(null);

  const effective = useMemo<SearchGroup[]>(() => {
    const useDefault = query.trim().length === 0 && defaultGroup && defaultGroup.items.length > 0;
    if (useDefault) return [defaultGroup as SearchGroup];
    return groups;
  }, [query, groups, defaultGroup]);

  const { flat, activeKey, setActiveKey, move, commit } = useFlatIndex(effective);
  const totalItems = flat.length;

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(+1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      if (commit()) {
        e.preventDefault();
        onCommitted?.();
      }
    }
  };

  return (
    <div
      className="ob-panel"
      role="combobox"
      aria-expanded={true}
      aria-haspopup="listbox"
      aria-controls="ob-listbox"
      aria-label="搜索"
    >
      <div className="ob-panel__input">
        <Input
          ref={inputRef}
          size="large"
          prefix={<SearchOutlined />}
          placeholder={placeholder}
          value={query}
          allowClear
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          bordered={false}
          aria-autocomplete="list"
          aria-controls="ob-listbox"
        />
      </div>
      <div
        id="ob-listbox"
        className="ob-panel__list"
        role="listbox"
        aria-busy={loading || undefined}
      >
        {loading && totalItems === 0 ? (
          <div className="ob-panel__empty">
            <Spin /> <span style={{ marginLeft: 12 }}>{loadingText}</span>
          </div>
        ) : totalItems === 0 ? (
          <div className="ob-panel__empty">{empty ?? <Empty description="无匹配结果" />}</div>
        ) : (
          effective.map((g) => (
            <div key={g.key} className="ob-panel__group">
              {g.title ? <div className="ob-panel__group-title">{g.title}</div> : null}
              {g.items.map((it) => {
                const active = it.key === activeKey;
                return (
                  <div
                    key={it.key}
                    role="option"
                    aria-selected={active}
                    aria-disabled={it.disabled || undefined}
                    tabIndex={-1}
                    className={
                      'ob-panel__item' +
                      (active ? ' ob-panel__item--active' : '') +
                      (it.disabled ? ' ob-panel__item--disabled' : '')
                    }
                    onMouseEnter={() => !it.disabled && setActiveKey(it.key)}
                    onClick={() => {
                      if (it.disabled) return;
                      it.onSelect();
                      onCommitted?.();
                    }}
                    onKeyDown={(e) => {
                      // Item is tabIndex=-1; primary keyboard flow runs on the
                      // input above (↑↓/Enter). This handler exists to satisfy
                      // a11y lint and to support pointer-then-keyboard combos.
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      if (it.disabled) return;
                      e.preventDefault();
                      it.onSelect();
                      onCommitted?.();
                    }}
                  >
                    {it.icon ? <span className="ob-panel__item-icon">{it.icon}</span> : null}
                    <div className="ob-panel__item-body">
                      <div className="ob-panel__item-label">{it.label}</div>
                      {it.description ? (
                        <div className="ob-panel__item-desc">{it.description}</div>
                      ) : null}
                    </div>
                    {it.hint ? <span className="ob-panel__item-hint">{it.hint}</span> : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
