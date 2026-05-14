import { View, Text, Input } from '@tarojs/components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OmniboxProps, SearchItem, SearchGroup } from '../types';

function OmniboxPanel({
  groups,
  loading,
  empty,
  defaultGroup,
  onSelect,
  loadingText,
}: {
  groups: SearchGroup[];
  loading: boolean;
  empty?: React.ReactNode;
  defaultGroup?: SearchGroup;
  onSelect: (item: SearchItem) => void;
  loadingText?: string;
}) {
  const hasItems = groups.some((g) => g.items.length > 0);
  const allGroups = defaultGroup ? [defaultGroup, ...groups] : groups;

  if (loading) {
    return (
      <View style={{ padding: '24px', textAlign: 'center', color: '#999' }}>
        <Text>{loadingText ?? '搜索中…'}</Text>
      </View>
    );
  }

  if (!hasItems && !defaultGroup?.items.length) {
    return (
      <View style={{ padding: '24px', textAlign: 'center', color: '#999' }}>
        {empty ?? <Text>无结果</Text>}
      </View>
    );
  }

  return (
    <View>
      {allGroups.map((group) => (
        <View key={group.key}>
          {group.title && (
            <View style={{ padding: '8px 16px', background: '#fafafa', fontSize: '12px', color: '#999' }}>
              <Text>{group.title}</Text>
            </View>
          )}
          {group.items.map((item) => (
            <View
              key={item.key}
              style={{
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '10px',
                opacity: item.disabled ? 0.4 : 1,
                borderBottom: '1px solid #f5f5f5',
              }}
              onClick={() => { if (!item.disabled) onSelect(item); }}
            >
              {item.icon && <View style={{ fontSize: '18px' }}>{item.icon}</View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: '14px' }}>{item.label}</Text>
                {item.description && (
                  <View style={{ marginTop: '2px' }}>
                    <Text style={{ fontSize: '12px', color: '#999' }}>{item.description}</Text>
                  </View>
                )}
              </View>
              {item.hint && (
                <Text style={{ fontSize: '12px', color: '#bbb', flexShrink: 0 }}>{item.hint}</Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function Omnibox({
  mode,
  query,
  onQueryChange,
  groups,
  loading = false,
  empty,
  defaultGroup,
  open: openProp,
  onOpenChange,
  placeholder,
  loadingText,
  className,
}: OmniboxProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = openProp ?? internalOpen;

  const handleSelect = useCallback(
    (item: SearchItem) => {
      item.onSelect();
      if (openProp === undefined) setInternalOpen(false);
      onOpenChange?.(false);
    },
    [openProp, onOpenChange],
  );

  const toggleOpen = () => {
    const next = !isOpen;
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  if (mode === 'modal') {
    return (
      <View className={`ob-mp-omnibox ${className ?? ''}`}>
        {/* Trigger - a search bar or the host's custom trigger */}
        <View onClick={toggleOpen}>
          <View
            style={{
              border: '1px solid #e8e8e8',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              background: '#f5f5f5',
            }}
          >
            <Text style={{ fontSize: '16px' }}>🔍</Text>
            <Text style={{ fontSize: '14px', color: '#999' }}>{placeholder ?? '搜索…'}</Text>
          </View>
        </View>

        {/* Modal overlay */}
        {isOpen && (
          <View
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: '#fff',
              zIndex: 3000,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Search header */}
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                borderBottom: '1px solid #f0f0f0',
                flexShrink: 0,
              }}
            >
              <Text style={{ fontSize: '16px' }}>🔍</Text>
              <Input
                focus
                value={query}
                placeholder={placeholder ?? '搜索…'}
                onInput={(e) => onQueryChange(e.detail.value)}
                style={{
                  flex: 1,
                  fontSize: '15px',
                  padding: '4px 0',
                }}
              />
              <Text style={{ fontSize: '14px', color: '#999', padding: '4px 8px' }} onClick={toggleOpen}>
                取消
              </Text>
            </View>

            {/* Results */}
            <View style={{ flex: 1, overflowY: 'auto' }}>
              <OmniboxPanel
                groups={groups}
                loading={loading}
                empty={empty}
                defaultGroup={defaultGroup}
                onSelect={handleSelect}
                loadingText={loadingText}
              />
            </View>
          </View>
        )}
      </View>
    );
  }

  // Inline mode
  return (
    <View className={`ob-mp-omnibox ob-mp-omnibox--inline ${className ?? ''}`}>
      <View style={{ position: 'relative' }}>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
            padding: '6px 12px',
            background: '#fff',
          }}
          role="search"
        >
          <Text style={{ fontSize: '16px', marginRight: '8px' }}>🔍</Text>
          <Input
            value={query}
            placeholder={placeholder ?? '搜索…'}
            onInput={(e) => onQueryChange(e.detail.value)}
            onFocus={() => {
              if (openProp === undefined) setInternalOpen(true);
              onOpenChange?.(true);
            }}
            style={{ flex: 1, fontSize: '14px', padding: '2px 0' }}
            aria-label={placeholder ?? '搜索…'}
          />
        </View>

        {/* Dropdown */}
        {isOpen && (
          <View
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: '#fff',
              border: '1px solid #e8e8e8',
              borderRadius: '0 0 8px 8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 100,
            }}
          >
            <OmniboxPanel
              groups={groups}
              loading={loading}
              empty={empty}
              defaultGroup={defaultGroup}
              onSelect={handleSelect}
              loadingText={loadingText}
            />
          </View>
        )}

        {/* Backdrop for inline dropdown */}
        {isOpen && (
          <View
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
            onClick={() => {
              if (openProp === undefined) setInternalOpen(false);
              onOpenChange?.(false);
            }}
          />
        )}
      </View>
    </View>
  );
}
