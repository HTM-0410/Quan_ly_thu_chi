import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Skeleton } from './EmptyState';

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-surface dark:bg-surface-dark">
        <div className="w-72 space-y-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}