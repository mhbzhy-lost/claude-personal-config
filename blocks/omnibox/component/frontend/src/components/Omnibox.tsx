import { Dropdown, Input, Modal } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useCallback, useState } from 'react';
import { useHotkey } from '../hooks/useHotkey';
import { OmniboxPanel } from './OmniboxPanel';
import type { OmniboxProps } from '../types';

/**
 * Two modes:
 * - 'modal':   hotkey-launched fullscreen overlay (Cmd/Ctrl+K by default)
 * - 'inline':  always-visible search Input + dropdown panel on focus
 *
 * Both modes share `OmniboxPanel` for results rendering + keyboard nav.
 */
export function Omnibox({
  mode,
  query,
  onQueryChange,
  groups,
  loading,
  empty,
  defaultGroup,
  open: openProp,
  onOpenChange,
  hotkey = 'mod+k',
  inlineWidth = 320,
  placeholder,
  loadingText,
  className,
}: OmniboxProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setOpenInternal(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );

  useHotkey(mode === 'modal' && hotkey ? hotkey : false, () => setOpen(true));

  if (mode === 'modal') {
    return (
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        destroyOnClose
        width={640}
        styles={{
          body: { padding: 0 },
          mask: { backdropFilter: 'blur(2px)' },
        }}
        rootClassName={['ob-modal', className].filter(Boolean).join(' ')}
        aria-label="搜索"
      >
        <OmniboxPanel
          query={query}
          onQueryChange={onQueryChange}
          groups={groups}
          loading={loading}
          empty={empty}
          defaultGroup={defaultGroup}
          placeholder={placeholder}
          loadingText={loadingText}
          onCommitted={() => setOpen(false)}
        />
      </Modal>
    );
  }

  // inline mode
  const [inlineOpen, setInlineOpen] = useState(false);
  return (
    <Dropdown
      open={inlineOpen}
      onOpenChange={setInlineOpen}
      trigger={['click']}
      placement="bottomLeft"
      overlayClassName={['ob-inline-overlay', className].filter(Boolean).join(' ')}
      dropdownRender={() => (
        <div className="ob-inline-card" style={{ width: inlineWidth }}>
          <OmniboxPanel
            query={query}
            onQueryChange={onQueryChange}
            groups={groups}
            loading={loading}
            empty={empty}
            defaultGroup={defaultGroup}
            placeholder={placeholder}
            loadingText={loadingText}
            onCommitted={() => setInlineOpen(false)}
          />
        </div>
      )}
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder={placeholder ?? '搜索…'}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setInlineOpen(true)}
        style={{ width: inlineWidth }}
        allowClear
      />
    </Dropdown>
  );
}
