import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminLoginForm from './AdminLoginForm';

export const revalidate = 0;

export default async function AdminLoginPage() {
  const user = await getCurrentUser();

  if (user && user.role === 'ADMIN') {
    redirect('/settings');
  }

  return <AdminLoginForm />;
}
