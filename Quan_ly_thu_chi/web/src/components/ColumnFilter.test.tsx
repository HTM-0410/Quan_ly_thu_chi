import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnFilterTrigger } from './ColumnFilter';

describe('ColumnFilterTrigger', () => {
  it('renders default icon variant', () => {
    render(
      <ColumnFilterTrigger
        label="Danh mục"
        kind="checkbox"
        options={[{ id: 'c1', label: 'Ăn uống' }]}
        selected={[]}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        activeCount={0}
      />,
    );

    const btn = screen.getByRole('button', { name: /Lọc cột Danh mục/i });
    expect(btn).toBeInTheDocument();
  });

  it('renders chip variant with label and active count', () => {
    render(
      <ColumnFilterTrigger
        variant="chip"
        label="Tài khoản"
        chipLabel="Tài khoản: Ví tiền"
        kind="checkbox"
        options={[{ id: 'a1', label: 'Ví tiền' }]}
        selected={['a1']}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        activeCount={1}
      />,
    );

    expect(screen.getByText('Tài khoản: Ví tiền')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens dialog on click and displays options for select kind', () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <ColumnFilterTrigger
        variant="chip"
        label="Trạng thái"
        kind="select"
        value="posted"
        onChange={onChange}
        onReset={onReset}
        activeCount={0}
        options={[
          { id: 'posted', label: 'Đã ghi sổ' },
          { id: 'voided', label: 'Đã hủy' },
        ]}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Lọc Trạng thái/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Đã ghi sổ')).toBeInTheDocument();
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Đã hủy'));
    expect(onChange).toHaveBeenCalledWith('voided');
  });

  it('handles amountRange inputs and commit button', () => {
    const onChange = vi.fn();
    render(
      <ColumnFilterTrigger
        variant="chip"
        label="Số tiền"
        kind="amountRange"
        min={null}
        max={null}
        onChange={onChange}
        onReset={vi.fn()}
        activeCount={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lọc Số tiền/i }));
    const minInput = screen.getByPlaceholderText('0');
    fireEvent.change(minInput, { target: { value: '50000' } });

    const applyBtn = screen.getByRole('button', { name: 'Áp dụng' });
    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledWith(50000, null);
  });
});
