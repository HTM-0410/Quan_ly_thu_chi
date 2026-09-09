import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryPicker } from './CategoryPicker';
import type { Category } from '../lib/types';

const mockCategories: Category[] = [
  {
    id: 'cat-food',
    scope: 'user',
    user_id: 'user-1',
    name: 'Ăn uống',
    kind: 'expense',
    parent_id: null,
    icon: 'utensils',
    color: '#ef4444',
    sort_order: 1,
    is_system: false,
    is_archived: false,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-lunch',
    scope: 'user',
    user_id: 'user-1',
    name: 'Cơm trưa',
    kind: 'expense',
    parent_id: 'cat-food',
    icon: 'coffee',
    color: '#ef4444',
    sort_order: 1,
    is_system: false,
    is_archived: false,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-salary',
    scope: 'user',
    user_id: 'user-1',
    name: 'Tiền lương',
    kind: 'income',
    parent_id: null,
    icon: 'briefcase',
    color: '#10b981',
    sort_order: 2,
    is_system: false,
    is_archived: false,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('CategoryPicker component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default window dimensions
    window.innerHeight = 800;
    window.innerWidth = 1024;
  });

  it('renders trigger button with placeholder when empty', () => {
    render(
      <CategoryPicker
        categories={mockCategories}
        kind="expense"
        value=""
        onChange={vi.fn()}
        placeholder="Chọn danh mục…"
      />,
    );
    expect(screen.getByRole('button', { name: 'Danh mục' })).toBeInTheDocument();
    expect(screen.getByText('Chọn danh mục…')).toBeInTheDocument();
  });

  it('opens popup when clicked and displays matching categories', () => {
    render(
      <CategoryPicker
        categories={mockCategories}
        kind="expense"
        value=""
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Danh mục' });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Danh mục' })).toBeInTheDocument();
    expect(screen.getByText('Ăn uống')).toBeInTheDocument();
    // Income category should not appear when kind="expense"
    expect(screen.queryByText('Tiền lương')).not.toBeInTheDocument();
  });

  it('selects a category on click and triggers onChange', () => {
    const handleChange = vi.fn();
    render(
      <CategoryPicker
        categories={mockCategories}
        kind="expense"
        value=""
        onChange={handleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Danh mục' }));
    fireEvent.click(screen.getByText('Ăn uống'));

    expect(handleChange).toHaveBeenCalledWith('cat-food');
  });

  it('flips to dropup (placement: top) when trigger is near the bottom of viewport', () => {
    // Mock getBoundingClientRect on HTMLButtonElement
    const originalGetBoundingClientRect = HTMLButtonElement.prototype.getBoundingClientRect;
    HTMLButtonElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 200,
      height: 36,
      top: 720,
      bottom: 756,
      left: 100,
      right: 300,
      x: 100,
      y: 720,
      toJSON: () => {},
    }));

    try {
      render(
        <CategoryPicker
          categories={mockCategories}
          kind="expense"
          value=""
          onChange={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Danh mục' }));

      const dialog = screen.getByRole('dialog', { name: 'Danh mục' });
      // When dropup is active, style.bottom should be set (e.g. window.innerHeight - top + GAP)
      // 800 - 720 + 6 = 86px
      expect(dialog.style.bottom).toBe('86px');
      expect(dialog.style.top).toBe('');
    } finally {
      HTMLButtonElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('closes popup on Escape key', () => {
    render(
      <CategoryPicker
        categories={mockCategories}
        kind="expense"
        value=""
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Danh mục' }));
    expect(screen.getByRole('dialog', { name: 'Danh mục' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Danh mục' })).not.toBeInTheDocument();
  });

  it('closes popup on clicking outside', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <CategoryPicker
          categories={mockCategories}
          kind="expense"
          value=""
          onChange={vi.fn()}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Danh mục' }));
    expect(screen.getByRole('dialog', { name: 'Danh mục' })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(screen.queryByRole('dialog', { name: 'Danh mục' })).not.toBeInTheDocument();
  });
});
