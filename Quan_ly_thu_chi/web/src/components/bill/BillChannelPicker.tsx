import { Store } from 'lucide-react';
import type { BillChannel, OnlineMarketplace } from '../../lib/api';

interface BillChannelPickerProps {
  channel: BillChannel;
  onChannelChange: (c: BillChannel) => void;
  marketplace: OnlineMarketplace | null;
  onMarketplaceChange: (m: OnlineMarketplace | null) => void;
  marketplaceOther: string;
  onMarketplaceOtherChange: (s: string) => void;
  storeName: string;
  onStoreNameChange: (s: string) => void;
  disabled?: boolean;
}

const MARKETPLACE_OPTIONS: Array<{ id: OnlineMarketplace; label: string }> = [
  { id: 'shopee', label: 'Shopee' },
  { id: 'lazada', label: 'Lazada' },
  { id: 'tiktok_shop', label: 'TikTok Shop' },
  { id: 'other', label: 'Khác' },
];

export function BillChannelPicker({
  channel,
  onChannelChange,
  marketplace,
  onMarketplaceChange,
  marketplaceOther,
  onMarketplaceOtherChange,
  storeName,
  onStoreNameChange,
  disabled,
}: BillChannelPickerProps) {
  return (
    <div className="space-y-3 rounded-card border border-ink-200 bg-surface-sunken p-3 dark:border-ink-800 dark:bg-surface-dark-sunken">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-inkDark-500">
        <Store size={12} strokeWidth={1.75} />
        Kênh mua hàng
      </div>
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={channel === 'online'}
          disabled={disabled}
          onClick={() => onChannelChange('online')}
          className={
            'rounded-card border px-3 py-2 text-left text-sm transition ' +
            (channel === 'online'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700')
          }
        >
          <div className="font-medium">Online</div>
          <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">
            Sàn thương mại điện tử
          </div>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={channel === 'offline'}
          disabled={disabled}
          onClick={() => onChannelChange('offline')}
          className={
            'rounded-card border px-3 py-2 text-left text-sm transition ' +
            (channel === 'offline'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700')
          }
        >
          <div className="font-medium">Offline</div>
          <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">
            Cửa hàng trực tiếp
          </div>
        </button>
      </div>

      {channel === 'online' && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-600 dark:text-inkDark-500">
            Sàn thương mại
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MARKETPLACE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => onMarketplaceChange(opt.id)}
                className={
                  'chip border transition ' +
                  (marketplace === opt.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'border-ink-200 bg-surface-raised text-ink-600 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {marketplace === 'other' && (
            <input
              type="text"
              className="input w-full"
              placeholder="Nhập tên sàn khác (vd: Tiki, Sendo...)"
              value={marketplaceOther}
              onChange={e => onMarketplaceOtherChange(e.target.value)}
              disabled={disabled}
              aria-label="Tên sàn khác"
              autoFocus
            />
          )}
        </div>
      )}

      {channel === 'offline' && (
        <div className="space-y-2">
          <label
            htmlFor="bill-store-name"
            className="block text-xs font-medium text-ink-600 dark:text-inkDark-500"
          >
            Tên cửa hàng
          </label>
          <input
            id="bill-store-name"
            type="text"
            className="input w-full"
            placeholder="VD: Co.opmart, Bách hoá XANH..."
            value={storeName}
            onChange={e => onStoreNameChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
