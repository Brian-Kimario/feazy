import { AuthShell } from '@/components/auth/auth-shell';
import { ProfessionalRegisterForm } from './ProfessionalRegisterForm';

export const metadata = {
  title: 'Apply as a Professional | Feazy',
  description: 'Create your professional account and start accepting jobs on Feazy',
};

export default function ProfessionalRegisterPage() {
  return (
    <AuthShell audience="professional">
      <ProfessionalRegisterForm />
    </AuthShell>
  );
}
