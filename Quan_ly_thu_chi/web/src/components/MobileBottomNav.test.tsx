import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileBottomNav } from './MobileBottomNav';

describe('MobileBottomNav component', () => {
  const defaultProps = {
    displayName: 'Nguyễn Văn A',
    email: 'test@example.com',
    initial: 'N',
    onSignOut: vi.fn(),
  };

  it('renders primary bottom nav items and the "Thêm" button', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav {...defaultProps} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Tổng quan/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Giao dịch/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tài khoản/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Báo cáo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mở menu chức năng mở rộng/i })).toBeInTheDocument();
  });

  it('opens drawer sheet when clicking "Thêm"', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav {...defaultProps} />
      </MemoryRouter>,
    );

    const moreBtn = screen.getByRole('button', { name: /Mở menu chức năng mở rộng/i });
    fireEvent.click(moreBtn);

    expect(screen.getByRole('dialog', { name: /Danh mục chức năng mở rộng/i })).toBeInTheDocument();
    expect(screen.getByText('Dòng tiền & Công nợ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sổ công nợ/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Người quen & Đối tác/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ngân sách chi tiêu/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cài đặt tài khoản/i })).toBeInTheDocument();
  });

  it('closes drawer on Escape key', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav {...defaultProps} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mở menu chức năng mở rộng/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes drawer when clicking close button', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav {...defaultProps} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mở menu chức năng mở rộng/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Đóng menu/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('triggers onSignOut from drawer', () => {
    const handleSignOut = vi.fn();
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav {...defaultProps} onSignOut={handleSignOut} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mở menu chức năng mở rộng/i }));
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    expect(handleSignOut).toHaveBeenCalledTimes(1);
  });
});
